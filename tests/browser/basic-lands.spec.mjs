import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

const forest = {
  id: '7286819f-6c57-4503-898c-528786ad86e9',
  oracle_id: 'ca16b32c-3f1e-4f8d-821a-064f922c45d8',
  name: 'Forest',
  type_line: 'Basic Land — Forest',
  set: 'tst',
  collector_number: '1',
  layout: 'normal',
  colors: [],
  color_identity: ['G'],
  prices: { eur: '50' },
  legalities: { modern: 'legal', commander: 'legal' },
  image_uris: { small: '/icon-192.png', normal: '/icon-192.png', large: '/icon-192.png' },
};
const fountain = {
  ...forest,
  id: 'f9bf0b6b-5cb1-4fc7-93b2-2c09e60144ed',
  name: 'Hallowed Fountain',
  type_line: 'Land — Plains Island',
  collector_number: '2',
  prices: { eur: '3' },
  color_identity: ['W', 'U'],
};
const watery = {
  ...fountain,
  id: 'b7c747a3-452a-4b8e-bd4a-18b3334721ed',
  name: 'Watery Grave',
  type_line: 'Land — Island Swamp',
};

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/scryfall/cards/' + forest.id) return route.fulfill({ json: forest });
    if (url.pathname === '/api/scryfall/cards/' + fountain.id)
      return route.fulfill({ json: fountain });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await page.evaluate(
    ({ forest, fountain, watery }) => {
      window.basicFixture = forest;
      window.nonbasicFixture = fountain;
      state.collection.binders = [{ id: 'lands', name: 'Land binder' }];
      state.collection.items = [
        { ...slimForCollection(forest), qty: 20, cond: 'NM', binder: 'lands' },
        { name: 'Snow-Covered Island', qty: 5, eur: 5, binder: 'lands' },
        { name: 'Wastes', qty: 6, eur: 1, binder: null },
        { ...slimForCollection(fountain), qty: 2, cond: 'NM', binder: 'lands' },
        {
          name: 'Wasteland',
          type_line: 'Land',
          qty: 1,
          eur: 4,
          binder: null,
          img: '/icon-192.png',
        },
      ];
      state.collection.wantsManual = [{ name: 'Snow-Covered Forest' }, { name: 'Wastes' }];
      state.collection.wantsExclude = [];
      state.decksIndex = [
        {
          id: 'lands-deck',
          name: 'Land deck',
          format: 'modern',
          cards: [
            { ...forest, proxy: true, _playingMissing: true },
            {
              ...forest,
              name: 'Snow-Covered Island',
              type_line: 'Basic Snow Land — Island',
              proxy: true,
            },
            { ...forest, name: 'Wastes', proxy: false },
            { ...fountain, proxy: false },
            { ...watery, proxy: true },
          ],
          maybeboard: [],
        },
      ];
      state._otagCache = { [forest.name]: [], [fountain.name]: [] };
      _bulkIdx = { cards: [], byName: new Map(), tagByOid: new Map(), rulByOid: new Map() };
      saveCollection();
      render();
    },
    { forest, fountain, watery },
  );
});

test('collection folders, binders, values, CSV export and Wants exclude legacy basics and keep nonbasic lands', async ({
  page,
}) => {
  await expect(page.locator('[data-binderopen="__all__"]')).toContainText('3 cards');
  await expect(page.locator('[data-binderopen="lands"]')).toContainText('2 cards');
  await expect(page.locator('[data-binderopen="__playing__"]')).toContainText('1 card');
  await expect(page.locator('[data-binderopen="__wants__"]')).toContainText('1 card');
  expect(await page.evaluate(() => collectionTotalValue(state.collection.items))).toBe(10);
  await page.locator('[data-binderopen="__all__"]').click();
  await expect(page.locator('.col-tile .l1')).toHaveText(['Hallowed Fountain', 'Wasteland']);
  await page.locator('#collectionStatsBtn').click();
  await expect(page.locator('.collection-stats-summary')).toContainText('3');
  await expect(page.locator('.collection-stats-summary')).toContainText('10');
  await page.evaluate(() => closeTopOverlay());
  await expect(page.locator('#phOverlay')).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.evaluate(() => downloadCollectionCsv());
  const csv = await readFile(await (await downloading).path(), 'utf8');
  expect(csv).toContain('Hallowed Fountain');
  expect(csv).toContain('Wasteland');
  expect(csv).not.toContain('Forest');
  expect(csv).not.toContain('Snow-Covered Island');
  expect(csv).not.toContain('Wastes');
  await page.evaluate(() => openBinderIn('__wants__'));
  await expect(page.locator('.want-tile .l1')).toHaveText('Watery Grave');
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(20);
});

test('basic lands remain addable to decks without collection controls, proxies or inventory creation', async ({
  page,
}) => {
  await page.evaluate(() => {
    openDeck('lands-deck');
    openCardActionSheet(getDeck('lands-deck'), getDeck('lands-deck').cards[0], 'main', 0);
  });
  await expect(page.locator('#cardSheetOverlay .card-collection-quantity, #csProxy')).toHaveCount(
    0,
  );
  await page.locator('#csAddOne').click();
  await expect(page.locator('#csAddSheet')).toHaveCount(0);
  await expect(page.locator('#cardSheetOverlay')).toBeVisible();
  await expect(page.locator('[data-deck-count]')).toHaveText('2');
  expect(await page.evaluate(() => getDeck('lands-deck').cards.length)).toBe(6);
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(20);
  expect(await page.evaluate(() => computeWants().map((card) => card.name))).toEqual([
    'Watery Grave',
  ]);
  await page.evaluate(() => {
    switchPage('search');
    openCardInfo(basicFixture);
  });
  await page.locator('#ciAdd').click();
  await expect(page.locator('#deckPickScrim [data-tocollection]')).toHaveCount(0);
  await page.locator('#deckPickScrim [data-deck="lands-deck"]').click();
  expect(await page.evaluate(() => getDeck('lands-deck').cards.length)).toBe(7);
  expect(
    await page.evaluate(() => collectionTrackedItems().reduce((sum, item) => sum + item.qty, 0)),
  ).toBe(3);
});

test('collection scans skip basic lands while deck scans retain them without registering ownership', async ({
  page,
}) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test camera unavailable', 'NotAllowedError');
    };
    const createLog = scannerCreateLog;
    scannerCreateLog = (...args) => (window.basicScanLog = createLog(...args));
    window.basicDetection = {
      cardId: basicFixture.id,
      secondaryId: basicFixture.oracle_id,
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 1,
      thumb: '/icon-192.png',
    };
  });
  await page.locator('#colFab').click();
  await page.locator('#fabScanCards').click();
  await page.evaluate(() => basicScanLog.append({ ...basicDetection }));
  await expect(page.locator('.scanner-detection')).toHaveCount(0);
  await expect(page.locator('#scannerSelectAll')).toBeDisabled();
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => {
    openDeck('lands-deck');
  });
  await page.locator('#dockAddCards').click();
  await page.locator('#deckAddScan').click();
  await page.evaluate(() => basicScanLog.append({ ...basicDetection }));
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(1);
  await expect(page.locator('.scanner-detection-owned')).toBeHidden();
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  await page.locator('#scannerDeckPicker [data-scanner-deck="lands-deck"]').click();
  await expect(page.locator('#scannerDeckPicker')).toHaveCount(0);
  expect(await page.evaluate(() => getDeck('lands-deck').cards.length)).toBe(6);
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(20);
  expect(await page.evaluate(() => computeWants().map((card) => card.name))).toEqual([
    'Watery Grave',
  ]);
});

test('basic-only inventory displays as empty and CSV imports skip basics without changing archived records', async ({
  page,
}) => {
  await page.route('**/api/scryfall/cards/collection', (route) =>
    route.fulfill({ json: { object: 'list', data: [forest, fountain], has_more: false } }),
  );
  await page.evaluate(() => {
    state.collection.items = state.collection.items.filter(isCollectionBasicLand);
    saveCollection();
    openBinderIn('__all__');
  });
  await expect(page.locator('.col-tile')).toHaveCount(0);
  await expect(page.locator('.empty-note')).toContainText('Your collection is empty');
  await page.evaluate(() => openCollectionImport('lands'));
  await page.locator('#ciText').fill('Name,Quantity\nForest,4\nHallowed Fountain,1');
  await page.locator('#ciGo').click();
  await expect(page.locator('#ciReport')).toContainText('Imported 1 card');
  await expect(page.locator('#ciReport')).toContainText('4 basic lands excluded');
  expect(
    await page.evaluate(() => state.collection.items.find((item) => item.name === 'Forest').qty),
  ).toBe(20);
  expect(
    await page.evaluate(() => collectionTrackedItems().map((item) => [item.name, item.qty])),
  ).toEqual([['Hallowed Fountain', 1]]);
});
