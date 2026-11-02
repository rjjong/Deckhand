import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem('admiral_app:seenVersion', '1.50'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('http://127.0.0.1:3100');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
}

async function seed(page, name) {
  await page.evaluate(async (name) => {
    const deck = {
      id: 'sync-' + name,
      name: name + ' deck',
      format: 'modern',
      cards: [],
      maybeboard: [],
    };
    state.decksIndex = [deck];
    await persistDeck(deck);
    state.collection = {
      items: [{ name: name + ' card', set: 'tst', cn: '1', qty: 2, cond: 'NM' }],
      binders: [],
      wantsManual: [],
      wantsExclude: [],
    };
    saveCollection();
    localStorage.setItem(
      LS_PREFIX + 'lifeSaves',
      JSON.stringify([
        {
          id: 'game-' + name,
          t: name === 'First' ? 1000 : 2000,
          d: { players: [{ name, life: 20 }], count: 1, history: [], settings: {} },
        },
      ]),
    );
  }, name);
}

async function syncNow(page) {
  const result = await page.evaluate(async () => {
    clearTimeout(_syncTimer);
    for (let i = 0; _syncBusy && i < 200; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    return syncRun('manual');
  });
  expect(result, await page.evaluate(() => syncState()?.err)).not.toBeNull();
  return result;
}

async function openSync(page) {
  await page.locator('#homeBtn').click();
  await page.locator('#menuSettings').click();
  await page.locator('#syncRow').click();
  await expect(page.getByRole('dialog', { name: 'Sync devices', exact: true })).toBeVisible();
}

test('code-only sync merges two devices and propagates decks, collection, settings and saved games', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60000);
  await prepare(page);
  await seed(page, 'First');
  await page.evaluate(async () => {
    state.guild = 'dimir';
    state.theme = 'light';
    state.startupPage = 'life';
    await persistSettings();
  });
  await openSync(page);
  await page.locator('#syncNew').click();
  await expect(page.locator('#syncCodeTxt')).toBeVisible();
  const code = await page.locator('#syncCodeTxt').textContent();
  expect(code).toMatch(/^(?:[A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
  await expect(page.locator('#syncLastLine')).toContainText('Last synced:');
  const second = await browser.newContext({
    viewport: page.viewportSize(),
    serviceWorkers: 'block',
  });
  try {
    const other = await second.newPage();
    await prepare(other);
    await seed(other, 'Second');
    await openSync(other);
    await other.locator('#syncJoin').click();
    await other.locator('#iapInput').fill(code.toLowerCase());
    await other.locator('#iapOk').click();
    await expect(other.locator('#syncCodeTxt')).toHaveText(code);
    await expect
      .poll(() => other.evaluate(() => state.decksIndex.map((d) => d.id).sort()))
      .toEqual(['sync-First', 'sync-Second']);
    expect(await other.evaluate(() => state.collection.items.map((i) => i.name).sort())).toEqual([
      'First card',
      'Second card',
    ]);
    expect(await other.evaluate(() => [state.theme, state.guild, state.startupPage])).toEqual([
      'light',
      'dimir',
      'life',
    ]);
    expect(
      await other.evaluate(() =>
        lifeSavesAll()
          .map((g) => g.id)
          .sort(),
      ),
    ).toEqual(['game-First', 'game-Second']);
    await syncNow(page);
    expect(await page.evaluate(() => state.decksIndex.length)).toBe(2);
    // Concurrent edits affect separate records, including independent preferences.
    await page.evaluate(async () => {
      state.guild = 'simic';
      await persistSettings();
    });
    await other.evaluate(async () => {
      state.startupPage = 'collection';
      await persistSettings();
      state.collection.items.find((i) => i.name === 'First card').qty = 5;
      state.collection.items.push({ name: 'New printing', qty: 1, cond: 'EX', foil: true });
      saveCollection();
      const games = lifeSavesAll();
      games.find((g) => g.id === 'game-First').d.players[0].life = 17;
      localStorage.setItem(LS_PREFIX + 'lifeSaves', JSON.stringify(games));
    });
    await syncNow(other);
    await syncNow(page);
    await syncNow(other);
    expect(await page.evaluate(() => [state.guild, state.startupPage])).toEqual([
      'simic',
      'collection',
    ]);
    expect(await other.evaluate(() => [state.guild, state.startupPage])).toEqual([
      'simic',
      'collection',
    ]);
    expect(
      await page.evaluate(() => state.collection.items.find((i) => i.name === 'First card').qty),
    ).toBe(5);
    expect(
      await page.evaluate(
        () => lifeSavesAll().find((g) => g.id === 'game-First').d.players[0].life,
      ),
    ).toBe(17);
    await other.evaluate(async () => {
      state.decksIndex = state.decksIndex.filter((d) => d.id !== 'sync-Second');
      await deleteDeckStorage('sync-Second');
      state.collection.items = state.collection.items.filter((i) => i.name !== 'Second card');
      saveCollection();
      localStorage.setItem(
        LS_PREFIX + 'lifeSaves',
        JSON.stringify(lifeSavesAll().filter((g) => g.id !== 'game-Second')),
      );
    });
    await syncNow(other);
    await syncNow(page);
    expect(await page.evaluate(() => state.decksIndex.map((d) => d.id))).toEqual(['sync-First']);
    expect(await page.evaluate(() => state.collection.items.map((i) => i.name).sort())).toEqual([
      'First card',
      'New printing',
    ]);
    expect(await page.evaluate(() => lifeSavesAll().map((g) => g.id))).toEqual(['game-First']);
    await other.evaluate(async () => {
      state.decksIndex[0].name = 'Updated before startup';
      await persistDeck(state.decksIndex[0]);
    });
    await syncNow(other);
    await page.setViewportSize({ width: 320, height: 480 });
    expect(
      await page
        .locator('#syncSheet .transfer-body')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await mkdir('var/previews', { recursive: true });
    await page.screenshot({ path: `var/previews/sync-linked-${info.project.name}.png` });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => state.decksIndex.find((d) => d.id === 'sync-First')?.name))
      .toBe('Updated before startup');
    await expect
      .poll(() => page.evaluate(() => state.homeLoaded && syncState()?.last > 0))
      .toBe(true);
    expect(
      await page.evaluate(() => state.collection.items.find((i) => i.name === 'First card').qty),
    ).toBe(5);
    expect(await page.evaluate(() => lifeSavesAll()[0].d.players[0].life)).toBe(17);
  } finally {
    await second.close();
  }
});

test('offline changes remain pending and are sent to SQLite when the device reconnects', async ({
  page,
  context,
}) => {
  await prepare(page);
  await seed(page, 'Offline');
  await page.evaluate(() => syncLink(null, true));
  await context.setOffline(true);
  await page.evaluate(async () => {
    const deck = state.decksIndex[0];
    deck.name = 'Edited offline';
    await persistDeck(deck);
    state.collection.items[0].qty = 9;
    saveCollection();
    state.guild = 'boros';
    await persistSettings();
    const games = lifeSavesAll();
    games[0].d.players[0].life = 11;
    localStorage.setItem(LS_PREFIX + 'lifeSaves', JSON.stringify(games));
  });
  expect(await page.evaluate(() => Object.keys(syncPending()).length)).toBeGreaterThan(3);
  expect(await page.evaluate(() => syncRun('manual'))).toBeNull();
  await context.setOffline(false);
  await syncNow(page);
  const stored = await page.evaluate(
    async () => (await syncCall({ op: 'sync', since: 0 })).changes,
  );
  expect(JSON.parse(stored['deck:sync-Offline'].v).name).toBe('Edited offline');
  expect(JSON.parse(stored['saved-game:game-Offline'].v).d.players[0].life).toBe(11);
  expect(stored['setting:guild'].v).toBe('"boros"');
  expect(Object.values(stored).some((record) => record.v?.includes('"qty":9'))).toBe(true);
});

test('an unknown sync code does not link or change local data', async ({ page }) => {
  await prepare(page);
  await seed(page, 'Unlinked');
  await openSync(page);
  await page.locator('#syncJoin').click();
  await page.locator('#iapInput').fill('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ');
  await page.locator('#iapOk').click();
  await expect(page.locator('#syncActionStatus')).toContainText('Code not found.');
  expect(await page.evaluate(() => syncState())).toBeNull();
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Unlinked deck');
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(2);
  expect(await page.locator('#syncSheet input[type="password"]')).toHaveCount(0);
});

test('a code stays available when its first upload fails and Sync now retries it', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Retry');
  let fail = true;
  await page.route('**/api/sync', (route) => {
    if (route.request().postDataJSON().op === 'sync' && fail)
      return route.fulfill({ status: 503, json: { ok: false, error: 'store' } });
    return route.continue();
  });
  await openSync(page);
  await page.locator('#syncNew').click();
  await expect(page.locator('#syncCodeTxt')).toBeVisible();
  const code = await page.locator('#syncCodeTxt').textContent();
  await expect(page.locator('#syncLastLine')).toContainText('could not connect');
  expect(await page.evaluate(() => Object.keys(syncPending()).length)).toBeGreaterThan(0);
  fail = false;
  await page.locator('#syncNow').click();
  await expect(page.locator('#syncActionStatus')).toContainText('Synced with this server.');
  await expect(page.locator('#syncCodeTxt')).toHaveText(code);
  expect(await page.evaluate(() => syncState().err)).toBeNull();
});

test('collection edits made while saved decks are being read retain their new values', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Snapshot');
  await page.evaluate(() => syncLink(null, true));
  await page.evaluate(() => {
    const original = deckDbAll;
    window.snapshotReading = false;
    window.releaseSnapshot = null;
    deckDbAll = async () => {
      const saved = await original();
      window.snapshotReading = true;
      await new Promise((resolve) => {
        window.releaseSnapshot = resolve;
      });
      deckDbAll = original;
      return saved;
    };
    clearTimeout(_syncTimer);
    window.snapshotSync = syncRun('manual');
  });
  await expect.poll(() => page.evaluate(() => snapshotReading)).toBe(true);
  await page.evaluate(() => {
    state.collection.items[0].qty = 12;
    saveCollection();
    releaseSnapshot();
  });
  await page.evaluate(() => snapshotSync);
  await syncNow(page);
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(12);
  const saved = await page.evaluate(
    async () =>
      (await syncCall({ op: 'sync', since: 0 })).changes[syncItemKey(state.collection.items[0])],
  );
  expect(JSON.parse(saved.v).qty).toBe(12);
});

test('a local edit made during a request stays pending until it is uploaded', async ({ page }) => {
  await prepare(page);
  await seed(page, 'Concurrent');
  await page.evaluate(() => syncLink(null, true));
  await page.evaluate(async () => {
    const remote = { ...state.decksIndex[0], name: 'Other device edit' };
    await syncCall({
      op: 'sync',
      changes: {
        ['deck:' + remote.id]: { t: Date.now() - 100, v: JSON.stringify(slimDeckForSave(remote)) },
      },
    });
  });
  let release, arrived;
  const wait = new Promise((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let held = false;
  await page.route('**/api/sync', async (route) => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => {
    clearTimeout(_syncTimer);
    window.concurrentSync = syncRun('manual');
  });
  await wait;
  await page.evaluate(async () => {
    state.decksIndex[0].name = 'Newer local edit';
    await persistDeck(state.decksIndex[0]);
  });
  release();
  await page.evaluate(() => concurrentSync);
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Newer local edit');
  await syncNow(page);
  const name = await page.evaluate(
    async () =>
      JSON.parse((await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Concurrent'].v).name,
  );
  expect(name).toBe('Newer local edit');
});

test('aging a game out of the local ten-game list does not delete its server record', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() => {
    localStorage.setItem(
      LS_PREFIX + 'lifeSaves',
      JSON.stringify(
        Array.from({ length: 10 }, (_, i) => ({ id: 'slot-' + i, t: i, d: { players: [] } })),
      ),
    );
  });
  await page.evaluate(() => syncLink(null, true));
  const evicted = await page.evaluate(() => {
    const games = lifeSavesAll();
    const evicted = games.at(-1).id;
    games.unshift({ id: 'new-slot', t: 100, d: { players: [] } });
    localStorage.setItem(LS_PREFIX + 'lifeSaves', JSON.stringify(games.slice(0, 10)));
    return evicted;
  });
  await syncNow(page);
  const records = await page.evaluate(
    async () => (await syncCall({ op: 'sync', since: 0 })).changes,
  );
  expect(records['saved-game:' + evicted].del).toBeUndefined();
  expect(records['saved-game:new-slot'].del).toBeUndefined();
  expect(Object.keys(records).filter((key) => key.startsWith('saved-game:')).length).toBe(11);
});

test('an edit waiting for the deck autosave timer is preserved when a remote deck arrives', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Autosave');
  await page.evaluate(() => syncLink(null, true));
  const result = await page.evaluate(async () => {
    const deck = state.decksIndex[0];
    const old = { ...deck, name: 'Older remote copy' };
    deck.name = 'Still being edited';
    scheduleSave(deck);
    clearTimeout(saveTimers[deck.id]);
    await syncApply({
      ['deck:' + deck.id]: { t: Date.now() - 100, v: JSON.stringify(slimDeckForSave(old)) },
    });
    return { name: state.decksIndex[0].name, pending: Object.keys(syncPending()) };
  });
  expect(result.name).toBe('Still being edited');
  expect(result.pending).toContain('deck:sync-Autosave');
  await syncNow(page);
  const remote = await page.evaluate(async () =>
    JSON.parse((await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Autosave'].v),
  );
  expect(remote.name).toBe('Still being edited');
});

test('unlinking during an in-flight response prevents remote data from being applied', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Cancel');
  await page.evaluate(() => syncLink(null, true));
  const remote = await page.evaluate(async () =>
    syncCall({ op: 'sync', changes: { 'setting:guild': { t: Date.now() + 50, v: '"simic"' } } }),
  );
  expect(remote.ok).toBe(true);
  let release, arrived;
  const wait = new Promise((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/sync', async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {}
  });
  await page.evaluate(() => {
    clearTimeout(_syncTimer);
    window.cancelledSync = syncRun('manual');
  });
  await wait;
  await page.evaluate(() => syncUnlink());
  release();
  await page.evaluate(() => window.cancelledSync);
  expect(await page.evaluate(() => syncState())).toBeNull();
  expect(await page.evaluate(() => state.guild)).toBe('izzet');
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Cancel deck');
});

test('a deck saved during an IndexedDB read is captured with its new value and timestamp', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Reading');
  const result = await page.evaluate(async () => {
    const read = deckDbAll;
    let release,
      arrived,
      reads = 0;
    const ready = new Promise((resolve) => {
      arrived = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    deckDbAll = async () => {
      const values = await read();
      if (++reads === 1) {
        arrived();
        await gate;
      }
      return values;
    };
    try {
      const reading = syncReadSnapshot();
      await ready;
      state.decksIndex[0].name = 'Saved during the read';
      await persistDeck(state.decksIndex[0]);
      release();
      const captured = await reading;
      return {
        reads,
        name: JSON.parse(captured.values['deck:sync-Reading']).name,
        sameTimestamp: captured.meta['deck:sync-Reading'].t === syncMeta()['deck:sync-Reading'].t,
      };
    } finally {
      deckDbAll = read;
      release();
    }
  });
  expect(result).toEqual({ reads: 2, name: 'Saved during the read', sameTimestamp: true });
});

test('a deck edit made during a remote database write remains local and pending', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Writing');
  await page.evaluate(() => syncLink(null, true));
  const result = await page.evaluate(async () => {
    const write = deckDbPutMany;
    let release,
      arrived,
      writes = 0;
    const ready = new Promise((resolve) => {
      arrived = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    deckDbPutMany = async (values) => {
      const result = await write(values);
      if (++writes === 1) {
        arrived();
        await gate;
      }
      return result;
    };
    try {
      const deck = state.decksIndex[0];
      const applying = syncApply({
        ['deck:' + deck.id]: {
          t: Date.now() - 100,
          v: JSON.stringify(slimDeckForSave({ ...deck, name: 'Remote copy' })),
        },
      });
      await ready;
      deck.name = 'Edited during the write';
      scheduleSave(deck);
      clearTimeout(saveTimers[deck.id]);
      release();
      await applying;
      clearTimeout(_syncTimer);
      return { name: state.decksIndex[0].name, pending: Object.keys(syncPending()) };
    } finally {
      deckDbPutMany = write;
      release();
    }
  });
  expect(result.name).toBe('Edited during the write');
  expect(result.pending).toContain('deck:sync-Writing');
  await syncNow(page);
  const remote = await page.evaluate(async () =>
    JSON.parse((await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Writing'].v),
  );
  expect(remote.name).toBe('Edited during the write');
});

test('upgrading an existing link preserves an offline deck deletion', async ({ page }) => {
  await prepare(page);
  await seed(page, 'Legacy');
  await page.evaluate(() => syncLink(null, true));
  await page.evaluate(async () => {
    state.decksIndex = [];
    await deleteDeckStorage('sync-Legacy');
    delete state._syncSt.protocol;
    syncSaveState();
  });
  await syncNow(page);
  const result = await page.evaluate(async () => ({
    decks: state.decksIndex.map((deck) => deck.id),
    remote: (await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Legacy'],
    protocol: syncState().protocol,
  }));
  expect(result.decks).toEqual([]);
  expect(result.remote.del).toBe(1);
  expect(result.protocol).toBe(2);
});
