import { test as base, expect } from '@playwright/test';
import { createApp } from '../../../server/app.mjs';
import { createHash } from 'node:crypto';

export { expect };
export const PASSWORD = 'A sufficiently long test password!';
export let accountServer;
export const test = base.extend({
  accountServer: [
    async ({}, use) => {
      const messages = [];
      const app = createApp({
        databasePath: ':memory:',
        dataDirectory: './var/data-sample',
        env: { PUBLIC_URL: 'http://127.0.0.1:3183' },
        fetchImpl: async () => Response.json({ object: 'list', data: [], has_more: false }),
        mailer: {
          ready: true,
          send: async (message) => {
            messages.push(message);
          },
        },
      });
      await new Promise((done) => app.server.listen(3183, '127.0.0.1', done));
      accountServer = { ...app, messages, base: 'http://127.0.0.1:3183' };
      try {
        await use(accountServer);
      } finally {
        await app.close();
        accountServer = null;
      }
    },
    { auto: true },
  ],
});

export async function prepare(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === accountServer.base ? route.continue() : route.abort();
  });
  await page.goto(accountServer.base);
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
}

export async function ensureUser(email) {
  if (accountServer.storage.accounts.byEmail(email)) return;
  const response = await fetch(accountServer.base + '/api/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'register', email, password: PASSWORD }),
  });
  expect(response.status).toBe(202);
  await expect
    .poll(() => accountServer.messages.some((message) => message.to === email))
    .toBe(true);
  const token = new URL(accountServer.messages.findLast((message) => message.to === email).url).hash
    .split('=')
    .at(-1);
  const hash = createHash('sha256').update(token).digest('hex');
  expect(accountServer.storage.accounts.consumeToken(hash, 'verify', Date.now())).toBe(true);
}

export async function link(page, email = 'owner@example.test', password = PASSWORD) {
  await ensureUser(email);
  await page.evaluate(() => openAccountSheet('login'));
  await page.locator('#accountEmail').fill(email);
  await page.locator('#accountPassword').fill(password);
  await page.locator('#accountSubmit').click();
  await expect
    .poll(() => page.evaluate(() => ACCOUNT_OWNER).catch(() => null))
    .toBe(accountServer.storage.accounts.byEmail(email).id);
  await expect.poll(() => page.evaluate(() => syncState()?.last > 0).catch(() => false)).toBe(true);
}

export async function seed(page, name) {
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

export async function syncNow(page) {
  const result = await page.evaluate(async () => {
    clearTimeout(_syncTimer);
    for (let i = 0; _syncBusy && i < 200; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    return syncRun('manual');
  });
  expect(result, await page.evaluate(() => syncState()?.err)).not.toBeNull();
  return result;
}
