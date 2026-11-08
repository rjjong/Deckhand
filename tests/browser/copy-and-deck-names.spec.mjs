import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
});

test('sync opens optional account controls without creating bearer codes', async ({ page }) => {
  await page.locator('#homeBtn').click();
  await page.locator('#menuAccount').click();
  await expect(page.locator('#accountSheet')).toBeVisible();
  await expect(page.locator('#accountEmail')).toHaveAttribute('type', 'email');
  await expect(page.locator('#accountPassword')).toHaveAttribute('type', 'password');
  await expect(page.locator('#syncNew, #syncShare, #syncCodeTxt')).toHaveCount(0);
});

test('deck creation and renaming limit names to 99 characters and save them durably', async ({
  page,
}) => {
  await page.evaluate(() => openModal('newdeck'));
  const name = page.locator('#newDeckName');
  await expect(name).toHaveAttribute('maxlength', '99');
  await name.fill('A'.repeat(120));
  await expect(name).toHaveValue('A'.repeat(99));
  await page.locator('#createBtn').click();
  await expect(page.locator('#brandTitle')).toHaveText('A'.repeat(99));
  await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.locator('#renameDeckBtn').click();
  await expect(page.locator('#iapInput')).toHaveAttribute('maxlength', '99');
  await page.locator('#iapInput').fill('B'.repeat(120));
  await expect(page.locator('#iapInput')).toHaveValue('B'.repeat(99));
  await page.locator('#iapOk').click();
  await expect(page.locator('#brandTitle')).toHaveText('B'.repeat(99));
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const all = await deckDbAll();
        return Object.values(all || {}).map((raw) => JSON.parse(raw).name);
      }),
    )
    .toEqual(['B'.repeat(99)]);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => state.decksIndex.map((deck) => deck.name)))
    .toEqual(['B'.repeat(99)]);
});

test('imports, copies and legacy deck names respect the limit without splitting emoji', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const imported = { id: 'imported-long-name', name: 'C'.repeat(140), cards: [] };
    state.decksIndex = [imported];
    await persistDeck(imported);
    await duplicateDeck(imported);
    const beforeReload = state.decksIndex.map((deck) => deck.name);
    await deckDbPutMany([
      [
        LS_PREFIX + 'deck:legacy-long-name',
        JSON.stringify({
          id: 'legacy-long-name',
          name: 'D'.repeat(140),
          cards: [],
        }),
      ],
    ]);
    return {
      beforeReload,
      allowedEmoji: normalizeDeckName('E'.repeat(97) + '🃏'),
      cutEmoji: normalizeDeckName('E'.repeat(98) + '🃏'),
    };
  });
  expect(result.beforeReload.every((name) => name.length === 99)).toBe(true);
  expect(result.allowedEmoji).toBe('E'.repeat(97) + '🃏');
  expect(result.cutEmoji).toBe('E'.repeat(98));
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.decksIndex.length)).toBe(3);
  expect(await page.evaluate(() => state.decksIndex.every((deck) => deck.name.length <= 99))).toBe(
    true,
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const all = await deckDbAll();
        return JSON.parse(all[LS_PREFIX + 'deck:legacy-long-name']).name;
      }),
    )
    .toBe('D'.repeat(99));
});

test('a legacy long name received through sync is shortened in memory and browser storage', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    state._syncSt = { code: 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ', sent: {} };
    await syncApply({
      'deck:remote-long-name': {
        t: Date.now(),
        v: JSON.stringify({ id: 'remote-long-name', name: 'F'.repeat(140), cards: [] }),
      },
    });
    const all = await deckDbAll();
    return {
      name: state.decksIndex.find((deck) => deck.id === 'remote-long-name').name,
      stored: JSON.parse(all[LS_PREFIX + 'deck:remote-long-name']).name,
    };
  });
  expect(result).toEqual({ name: 'F'.repeat(99), stored: 'F'.repeat(99) });
});
