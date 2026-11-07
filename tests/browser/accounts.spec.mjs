import { test, expect, PASSWORD, prepare, seed, link, syncNow } from './helpers/accounts.mjs';
import { mkdir } from 'node:fs/promises';
import { idOf } from '../../server/services/sync.mjs';

test('guest use is optional and clearly warns about local-only data', async ({ page }) => {
  await prepare(page);
  await seed(page, 'Guest');
  await expect(page.locator('.account-warning')).toContainText('not saved in the cloud');
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.decksIndex[0]?.name)).toBe('Guest deck');
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await expect(page.locator('.account-warning')).toContainText('keep your own backups');
  await expect(page.locator('#accountSheet')).toHaveCount(0);
  expect(await page.evaluate(() => ACCOUNT_OWNER)).toBeNull();
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(2);
});

test('signup, email verification and sign-in copy guest data into a private account', async ({
  page,
  context,
  accountServer,
}, info) => {
  await prepare(page);
  await seed(page, 'Signup');
  await page.locator('[data-account-open]').click();
  await page.locator('[data-account-mode="register"]').click();
  await page.locator('#accountEmail').fill('new@example.test');
  await page.locator('#accountPassword').fill(PASSWORD);
  await page.locator('#accountConfirm').fill(PASSWORD);
  await page.locator('#accountSubmit').click();
  await expect(page.locator('#accountStatus')).toContainText('check your inbox');
  await expect.poll(() => accountServer.messages.length).toBe(1);
  expect(await page.evaluate(() => ACCOUNT_OWNER)).toBeNull();
  await page.goto(accountServer.messages[0].url);
  await expect(page.locator('#accountSubmit')).toHaveText('Verify email');
  expect(page.url()).not.toContain('account-verify');
  await page.locator('#accountSubmit').click();
  await expect(page.locator('#accountStatus')).toContainText('Email verified');
  await page.locator('#accountEmail').fill('new@example.test');
  await page.locator('#accountPassword').fill(PASSWORD);
  await page.locator('#accountSubmit').click();
  await expect.poll(() => page.evaluate(() => syncState()?.last > 0).catch(() => false)).toBe(true);
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Signup deck');
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(2);
  expect(await page.evaluate(() => lifeSavesAll()[0].id)).toBe('game-Signup');
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'deckhand_session' && cookie.httpOnly,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      (password) => Object.values(localStorage).some((value) => value.includes(password)),
      PASSWORD,
    ),
  ).toBe(false);
  const backup = await page.evaluate(() => backupPayload());
  expect(Object.keys(backup.ls).every((key) => key.startsWith('admiral_app:'))).toBe(true);
  expect(JSON.stringify(backup)).not.toContain('syncState');
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    switchPage('decks');
    openAccountSheet();
  });
  await expect(page.locator('#accountEmail')).toHaveCount(0);
  await expect(page.locator('.account-email')).toHaveText('new@example.test');
  await page.setViewportSize({ width: 320, height: 480 });
  expect(
    await page
      .locator('#accountSheet .transfer-body')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/account-profile-${info.project.name}.png` });
});

test('password recovery email changes the password and requires signing in again', async ({
  page,
  accountServer,
}) => {
  await prepare(page);
  await seed(page, 'Recovery');
  await link(page);
  await page.evaluate(() => openAccountSheet());
  await page.locator('[data-account-mode="forgot"]').click();
  await page.locator('#accountSubmit').click();
  await expect(page.locator('#accountStatus')).toContainText('check your inbox');
  await expect
    .poll(() => accountServer.messages.some((message) => message.kind === 'reset'))
    .toBe(true);
  const reset = accountServer.messages.findLast((message) => message.kind === 'reset');
  await page.goto(reset.url);
  await expect(page.locator('#accountSubmit')).toHaveText('Save new password');
  const newPassword = 'An entirely different long password!';
  await page.locator('#accountPassword').fill(newPassword);
  await page.locator('#accountConfirm').fill(newPassword);
  await page.locator('#accountSubmit').click();
  await expect(page.locator('#accountStatus')).toContainText('Password saved');
  await page.locator('#accountEmail').fill('owner@example.test');
  await page.locator('#accountPassword').fill(PASSWORD);
  await page.locator('#accountSubmit').click();
  await expect(page.locator('#accountStatus')).toContainText('incorrect');
  await page.locator('#accountPassword').fill(newPassword);
  await page.locator('#accountSubmit').click();
  await expect(page.locator('.account-email')).toHaveText('owner@example.test');
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Recovery deck');
});

test('account switching keeps separate workspaces and never uploads another user’s decks', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Guest');
  await link(page, 'a@example.test');
  await page.evaluate(async () => {
    state.decksIndex[0].name = 'A private deck';
    await persistDeck(state.decksIndex[0]);
  });
  await syncNow(page);
  await page.evaluate(() => openAccountSheet());
  await page.locator('#accountLogout').click();
  await expect.poll(() => page.evaluate(() => ACCOUNT_OWNER).catch(() => undefined)).toBeNull();
  await expect.poll(() => page.evaluate(() => state.decksIndex[0]?.name)).toBe('Guest deck');
  // Guest data is included deliberately on a first sign-in, never another
  // account's private workspace. The original guest copy remains untouched.
  await link(page, 'b@example.test');
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('Guest deck');
  await page.evaluate(async () => {
    state.decksIndex[0].name = 'B private deck';
    await persistDeck(state.decksIndex[0]);
  });
  await syncNow(page);
  expect(
    await page.evaluate(
      async () =>
        JSON.parse((await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Guest'].v).name,
    ),
  ).toBe('B private deck');
  await page.evaluate(() => openAccountSheet());
  await page.locator('#accountLogout').click();
  await expect.poll(() => page.evaluate(() => ACCOUNT_OWNER).catch(() => undefined)).toBeNull();
  await link(page, 'a@example.test');
  expect(await page.evaluate(() => state.decksIndex[0].name)).toBe('A private deck');
});

test('two devices merge independent records into the same account', async ({ page, browser }) => {
  await prepare(page);
  await seed(page, 'First');
  await link(page);
  await page.evaluate(async () => {
    state.guild = 'dimir';
    await persistSettings();
  });
  await syncNow(page);
  const second = await browser.newContext({
    viewport: page.viewportSize(),
    serviceWorkers: 'block',
  });
  try {
    const other = await second.newPage();
    await prepare(other);
    await seed(other, 'Second');
    await link(other);
    await expect.poll(() => other.evaluate(() => state.decksIndex.length)).toBe(2);
    expect(await other.evaluate(() => state.guild)).toBe('dimir');
    await syncNow(page);
    expect(
      await page.evaluate(() => state.collection.items.map((item) => item.name).sort()),
    ).toEqual(['First card', 'Second card']);
    expect(
      await page.evaluate(() =>
        lifeSavesAll()
          .map((game) => game.id)
          .sort(),
      ),
    ).toEqual(['game-First', 'game-Second']);
    await other.evaluate(() => {
      state.collection.items.find((item) => item.name === 'First card').qty = 7;
      saveCollection();
    });
    await syncNow(other);
    await syncNow(page);
    expect(
      await page.evaluate(
        () => state.collection.items.find((item) => item.name === 'First card').qty,
      ),
    ).toBe(7);
  } finally {
    await second.close();
  }
});

test('a failed initial upload is kept for retry and reports that cloud saving needs attention', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Retry');
  let fail = true;
  await page.route('**/api/sync', (route) =>
    fail ? route.fulfill({ status: 503, json: { ok: false, error: 'store' } }) : route.continue(),
  );
  // Sign-in is successful independently of the first data upload.
  const { ensureUser } = await import('./helpers/accounts.mjs');
  await ensureUser('retry@example.test');
  await page.evaluate(() => openAccountSheet('login'));
  await page.locator('#accountEmail').fill('retry@example.test');
  await page.locator('#accountPassword').fill(PASSWORD);
  await page.locator('#accountSubmit').click();
  await expect.poll(() => page.evaluate(() => syncState()?.err).catch(() => null)).toBe('store');
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await expect(page.locator('.account-warning')).toContainText('Cloud saving needs attention');
  expect(await page.evaluate(() => Object.keys(syncPending()).length)).toBeGreaterThan(0);
  fail = false;
  await page.evaluate(() => openAccountSheet());
  await page.locator('#accountSync').click();
  await expect(page.locator('#accountStatus')).toContainText('Saved to this server');
  expect(await page.evaluate(() => syncState().err)).toBeNull();
});

test('migrating a previous sync code preserves an offline deletion', async ({
  page,
  accountServer,
}) => {
  await prepare(page);
  await seed(page, 'Legacy');
  const code = 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ',
    hash = idOf(code);
  accountServer.storage.sync.create(hash);
  accountServer.storage.sync.exchange(hash, {
    since: 0,
    changes: {
      'deck:sync-Legacy': {
        t: 1,
        v: JSON.stringify({ id: 'sync-Legacy', name: 'Deleted while offline', cards: [] }),
      },
      'deck:server-only': {
        t: 1,
        v: JSON.stringify({ id: 'server-only', name: 'Still on the server', cards: [] }),
      },
    },
  });
  await page.evaluate(async (code) => {
    state._syncSt = { protocol: 2, code, rev: 0, sent: {}, last: 0 };
    syncSaveState();
    state.decksIndex = [];
    await deleteDeckStorage('sync-Legacy');
  }, code);
  await link(page);
  expect(await page.evaluate(() => state.decksIndex.map((deck) => deck.id))).toEqual([
    'server-only',
  ]);
  expect(
    await page.evaluate(
      async () => (await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Legacy'].del,
    ),
  ).toBe(1);
});

test('portable backup restoration updates the current account and excludes credentials', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Backup');
  await link(page);
  const backup = await page.evaluate(() => backupPayload());
  await page.evaluate(async () => {
    state.decksIndex[0].name = 'After the backup';
    await persistDeck(state.decksIndex[0]);
  });
  await syncNow(page);
  await page.evaluate((payload) => {
    window.restoringBackup = restoreFromFile(
      new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' }),
    );
  }, backup);
  await expect(page.locator('#inAppConfirm')).toContainText(
    'Restored records will sync to your account',
  );
  await page.locator('#iacOk').click();
  await expect
    .poll(() => page.evaluate(() => state.decksIndex[0]?.name).catch(() => null))
    .toBe('Backup deck');
  await expect.poll(() => page.evaluate(() => syncState()?.last > 0).catch(() => false)).toBe(true);
  expect(
    await page.evaluate(
      async () =>
        JSON.parse((await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Backup'].v).name,
    ),
  ).toBe('Backup deck');
});

test.describe('installed account workspace', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the account workspace opens offline without a mandatory login', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await seed(page, 'Installed');
    await link(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const owner = await page.evaluate(() => ACCOUNT_OWNER);
    await context.setOffline(true);
    await page.reload();
    await expect.poll(() => page.evaluate(() => state.decksIndex[0]?.name)).toBe('Installed deck');
    expect(await page.evaluate(() => ACCOUNT_OWNER)).toBe(owner);
    expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(2);
    await expect(page.locator('#accountSheet')).toHaveCount(0);
    await context.setOffline(false);
    await page.evaluate(() => accountRefresh());
    await syncNow(page);
  });
});

test('a changed session token refreshes automatically and resumes pending sync', async ({
  page,
}) => {
  await prepare(page);
  await seed(page, 'Session');
  await link(page);
  await page.evaluate(async () => {
    accountSession.csrf = 'obsolete-csrf';
    state.decksIndex[0].name = 'Saved after session refresh';
    await persistDeck(state.decksIndex[0]);
    await syncRun('manual');
  });
  await expect.poll(() => page.evaluate(() => syncState().err)).toBeNull();
  const saved = await page.evaluate(
    async () =>
      JSON.parse((await syncCall({ op: 'sync', since: 0 })).changes['deck:sync-Session'].v).name,
  );
  expect(saved).toBe('Saved after session refresh');
});
