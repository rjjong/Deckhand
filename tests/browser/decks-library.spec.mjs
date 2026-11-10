import { test, expect } from '@playwright/test';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: { items: [], data: [], object: 'list', has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate(async () => {
    state.theme = 'dark';
    state.guild = 'dimir';
    applyTheme();
    state.priceCache = {};
    const make = (id, name, format, updatedAt, price) => {
      const card = {
        id: id + '-card',
        name: name + ' card',
        type_line: 'Artifact',
        image_uris: { normal: '/icon-192.png' },
        legalities: { commander: 'legal', modern: 'legal' },
      };
      state.priceCache[card.name] = { v: price, t: Date.now() };
      return { id, name, format, updatedAt, cards: [card], maybeboard: [] };
    };
    state.decksIndex = [
      make('alpha', 'Alpha archive', 'commander', 100, 2),
      { ...make('zulu', 'Zulu archive', 'commander', 300, 8), fav: true, folderId: 'legacy' },
      { ...make('beta', 'Beta modern', 'modern', 200, 5), collected: true },
      make('modern', 'Alpha modern', 'modern', 400, 0),
    ];
    state.folders = [
      { id: 'legacy', name: 'Projects', parentId: fmtFolderId('commander'), format: 'commander' },
    ];
    for (const deck of state.decksIndex) await persistDeck(deck);
    saveFolders();
    localStorage.setItem(LS_PREFIX + 'decksView', 'list');
    switchPage('decks');
  });
});

async function ids(page, format) {
  return page
    .locator(`[data-deckformat="${format}"] .deck-tile`)
    .evaluateAll((tiles) => tiles.map((tile) => tile.dataset.id));
}

async function sort(page, label) {
  await page.getByRole('button', { name: 'Sort decks', exact: true }).click();
  await page.locator('#tileMenuPop').getByRole('button', { name: label, exact: false }).click();
}

test('overview shows every deck exactly once in expandable format groups and always uses tiles', async ({
  page,
}) => {
  await expect(page.locator('.deck-tile')).toHaveCount(4);
  await expect(page.locator('[data-deckformat]')).toHaveCount(2);
  await expect(
    page.locator(
      '[data-fmtfolder], [data-folder^="__fmt__:"], #folderViewToggle, .deck-grid.as-list',
    ),
  ).toHaveCount(0);
  await expect(page.locator('[data-folder="legacy"]')).toContainText('Projects');
  expect(await ids(page, 'commander')).toEqual(['zulu', 'alpha']);
  expect(await ids(page, 'modern')).toEqual(['modern', 'beta']);
  const toggle = page.locator('[data-deckformat="commander"] [data-deckgroup]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#deckFormat-commander')).toBeHidden();
  await expect(page.locator('#deckFormat-modern')).toBeVisible();
  await toggle.click();
  await page.locator('#deckFilter').fill('Zulu');
  await expect(page.locator('.deck-tile')).toHaveCount(1);
  await expect(page.locator('[data-deckformat]')).toHaveCount(1);
  await expect(page.locator('[data-id="zulu"]')).toBeVisible();
});

test('deck sorting orders each format, updates with cached prices and survives reload', async ({
  page,
}) => {
  await sort(page, 'Name A → Z');
  expect(await ids(page, 'commander')).toEqual(['alpha', 'zulu']);
  await sort(page, 'Last changed: oldest first');
  expect(await ids(page, 'modern')).toEqual(['beta', 'modern']);
  await sort(page, 'Price: low → high');
  expect(await ids(page, 'commander')).toEqual(['alpha', 'zulu']);
  expect(await ids(page, 'modern')).toEqual(['modern', 'beta']);
  await sort(page, 'Price: high → low');
  expect(await ids(page, 'commander')).toEqual(['zulu', 'alpha']);
  expect(await ids(page, 'modern')).toEqual(['beta', 'modern']);
  await page.evaluate(() => {
    state.priceCache['Alpha archive card'] = { v: 20, t: Date.now() };
    paintDeckPrice(getDeck('alpha'));
  });
  await expect.poll(() => ids(page, 'commander')).toEqual(['alpha', 'zulu']);
  await sort(page, 'Name Z → A');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem(LS_PREFIX + 'deckSort'))),
  ).toEqual({ sort: 'name', sortDir: 'desc' });
  expect(await page.evaluate(() => SYNC_SOURCES.includes('deckSort'))).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate(() => switchPage('decks'));
  expect(await ids(page, 'commander')).toEqual(['zulu', 'alpha']);
  await expect(page.locator('.deck-grid.as-list, #folderViewToggle')).toHaveCount(0);
});

test('custom folders from legacy format folders remain accessible without virtual folder choices', async ({
  page,
}) => {
  await page.locator('[data-folder="legacy"]').click();
  await expect(page.locator('.deck-tile')).toHaveCount(1);
  await expect(page.locator('[data-id="zulu"]')).toBeVisible();
  await page.evaluate(() => switchPage('decks'));
  await page.evaluate(() => openFolderPicker(getDeck('beta')));
  await expect(page.locator('#folderPicker')).toBeVisible();
  await expect(page.locator('[data-fpinto^="__fmt__:"]')).toHaveCount(0);
  await expect(page.locator('[data-fpinto="legacy"]')).toBeVisible();
  await page.locator('#fpCancel').click();
  await expect(page.locator('#folderPicker')).toHaveCount(0);
  await expect(page.locator('.deck-tile')).toHaveCount(4);
});
