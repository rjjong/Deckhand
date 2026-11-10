import { test, expect, prepare, seed, syncNow, link } from './helpers/accounts.mjs';

test('collection price visibility and pending data sync across account devices with true and false values', async ({
  page,
  browser,
}) => {
  await prepare(page);
  await seed(page, 'PricePreference');
  await link(page);
  await page.evaluate(async () => {
    state.hideCollectionFolderPrices = true;
    state.startupPage = 'scan-collection';
    await persistSettings();
  });
  await syncNow(page);
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await prepare(second);
    await link(second);
    expect(await second.evaluate(() => state.hideCollectionFolderPrices)).toBe(true);
    expect(await second.evaluate(() => state.startupPage)).toBe('scan-collection');
    expect(await second.evaluate(() => state.decksIndex[0].name)).toBe('PricePreference deck');
    expect(await second.evaluate(() => state.collection.items[0].qty)).toBe(2);
    await second.evaluate(async () => {
      state.hideCollectionFolderPrices = false;
      await persistSettings();
    });
    await syncNow(second);
    await syncNow(page);
    expect(await page.evaluate(() => state.hideCollectionFolderPrices)).toBe(false);
    const saved = await page.evaluate(
      async () => (await syncCall({ op: 'sync', since: 0 })).changes,
    );
    expect(saved['setting:hideCollectionFolderPrices'].v).toBe('false');
    expect(JSON.parse(saved['deck:sync-PricePreference'].v).name).toBe('PricePreference deck');
  } finally {
    await other.close();
  }
});

test('a rejected sync explains the server validation error and retries the same pending local data', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'RetryPreference');
  await link(page);
  await expect(page.locator('#accountSheet')).toHaveCount(0);
  await page.evaluate(() => openAccountSheet('profile'));
  let rejected = true;
  await page.route('**/api/sync', (route) =>
    rejected
      ? route.fulfill({ status: 400, json: { ok: false, error: 'change' } })
      : route.continue(),
  );
  await page.evaluate(async () => {
    state.decksIndex[0].name = 'Pending retry deck';
    await persistDeck(state.decksIndex[0]);
    state.collection.items[0].qty = 9;
    saveCollection();
    state.hideCollectionFolderPrices = true;
    await persistSettings();
    clearTimeout(_syncTimer);
  });
  await page.locator('#accountSync').click();
  await expect(page.locator('#accountStatus')).toContainText(
    'could not accept part of your saved data',
  );
  await expect(page.locator('#accountStatus')).not.toContainText('Could not connect');
  await expect(page.locator('#syncLastLine')).toContainText('could not accept part');
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Pending retry deck');
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(9);
  expect(await page.evaluate(() => syncState().err)).toBe('change');
  expect(await page.evaluate(() => Object.keys(syncPending()).length)).toBeGreaterThan(0);
  rejected = false;
  await page.locator('#accountSync').click();
  await expect(page.locator('#accountStatus')).toHaveText('Saved to this server.');
  expect(await page.evaluate(() => syncState().err)).toBeNull();
  const saved = await page.evaluate(async () => (await syncCall({ op: 'sync', since: 0 })).changes);
  expect(saved['setting:hideCollectionFolderPrices'].v).toBe('true');
  expect(JSON.parse(saved['deck:sync-RetryPreference'].v).name).toBe('Pending retry deck');
  expect(Object.values(saved).some((entry) => entry.v?.includes('"qty":9'))).toBe(true);
});

test('offline changes remain pending and are sent to SQLite when the device reconnects', async ({
  page,
  context,
}) => {
  await prepare(page);
  await seed(page, 'Offline');
  await link(page);
  await context.setOffline(true);
  await page.evaluate(async () => {
    const deck = state.decksIndex[0];
    deck.name = 'Edited offline';
    await persistDeck(deck);
    state.collection.items[0].qty = 9;
    saveCollection();
    state.guild = 'boros';
    state.scannerDebounceMs = 2500; // An obsolete value must never be persisted or uploaded.
    state.scannerIgnoreSession = true;
    state.scannerIdThreshold = 0.72;
    state.scannerCornerThreshold = 0.08;
    state.scannerIntervalMs = 950;
    state.scannerShowFramerate = true;
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
  expect(stored['setting:scannerDebounceMs']).toBeUndefined();
  expect(stored['setting:scannerIgnoreSession'].v).toBe('true');
  expect(stored['setting:scannerIdThreshold'].v).toBe('0.72');
  expect(stored['setting:scannerCornerThreshold'].v).toBe('0.08');
  expect(stored['setting:scannerIntervalMs'].v).toBe('950');
  expect(stored['setting:scannerShowFramerate'].v).toBe('true');
  expect(Object.values(stored).some((record) => record.v?.includes('"qty":9'))).toBe(true);
});

test('collection edits made while saved decks are being read retain their new values', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Snapshot');
  await link(page);
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
  await link(page);
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
  await link(page);
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
  await link(page);
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
  await link(page);
  const originalGuild = await page.evaluate(() => state.guild);
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
  expect(await page.evaluate(() => state.guild)).toBe(originalGuild);
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
  await link(page);
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
  await link(page);
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

test('deck ownership waits for collection sync pages and restores automatically missing proxies when inventory arrives', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Ownership');
  await link(page);
  const result = await page.evaluate(async () => {
    clearTimeout(_syncTimer);
    const card = {
      id: 'sync-owned-card',
      name: 'Sync Owned Adept',
      set: 'tst',
      collector_number: '1',
      type_line: 'Creature',
      colors: [],
      color_identity: [],
    };
    const deck = {
      id: 'sync-owned',
      name: 'Synced ownership',
      format: 'modern',
      cards: [card],
      maybeboard: [],
    };
    const t = Date.now() + 1000;
    const inventory = {
      binders: [],
      items: [{ name: card.name, set: 'tst', cn: '1', qty: 1, cond: 'NM' }],
      wantsManual: [],
      wantsExclude: [],
    };
    const records = Object.fromEntries(
      Object.entries(syncProjectStorage('collection', JSON.stringify(inventory))).map(
        ([key, v]) => [key, { t, v }],
      ),
    );
    _syncBusy = true;
    await syncApply({ ['deck:' + deck.id]: { t, v: JSON.stringify(deck) } });
    const betweenPages = getDeck(deck.id).cards[0].proxy;
    await syncApply(records);
    _syncBusy = false;
    reconcilePlayingOwnership();
    const afterSync = getDeck(deck.id).cards[0].proxy;
    state.collection.items = state.collection.items.filter((item) => item.name !== card.name);
    saveCollection();
    const missing = getDeck(deck.id).cards[0].proxy;
    _syncBusy = true;
    await syncApply(
      Object.fromEntries(
        Object.entries(records).map(([key, change]) => [key, { ...change, t: t + 1000 }]),
      ),
    );
    _syncBusy = false;
    reconcilePlayingOwnership();
    return {
      betweenPages,
      afterSync,
      missing,
      recovered: getDeck(deck.id).cards[0].proxy,
      owned: playingOwnedCounts().get(playingNameKey(card.name)),
    };
  });
  expect(result).toEqual({
    betweenPages: undefined,
    afterSync: false,
    missing: true,
    recovered: false,
    owned: 1,
  });
});
