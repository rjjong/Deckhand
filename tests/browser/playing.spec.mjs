import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

const card = {
  id: '7286819f-6c57-4503-898c-528786ad86e9',
  oracle_id: 'ca16b32c-3f1e-4f8d-821a-064f922c45d8',
  name: 'Playing Adept',
  set: 'tst',
  set_name: 'Test Set',
  collector_number: '1',
  type_line: 'Creature — Wizard',
  layout: 'normal',
  colors: ['U'],
  color_identity: ['U'],
  cmc: 1,
  oracle_text: 'Draw a card.',
  prices: { eur: '2' },
  legalities: { modern: 'legal', commander: 'legal' },
  image_uris: { small: '/icon-192.png', normal: '/icon-192.png', large: '/icon-192.png' },
};

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (
      url.pathname === '/api/scryfall/cards/' + card.id ||
      url.pathname === '/api/scryfall/cards/tst/1'
    )
      return route.fulfill({ json: card });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await page
    .locator('.app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await page.evaluate((card) => {
    window.playingCard = card;
    state.guild = 'dimir';
    applyTheme();
    state.decksIndex = ['a', 'b'].map((id) => ({
      id,
      name: 'Deck ' + id.toUpperCase(),
      format: 'modern',
      cards: [],
      maybeboard: [],
      tags: {},
    }));
    state.collection.binders = [{ id: 'owned', name: 'Owned binder' }];
    state.collection.items = [
      {
        name: card.name,
        set: 'tst',
        cn: '1',
        qty: 1,
        cond: 'NM',
        binder: 'owned',
        img: '/icon-192.png',
        colors: ['U'],
        type_line: card.type_line,
        eur: 2,
      },
    ];
    state.collection.wantsManual = [];
    state.collection.wantsExclude = [];
    state._otagCache = { [card.name]: [] };
    _bulkIdx = { cards: [], byName: new Map(), tagByOid: new Map(), rulByOid: new Map() };
    saveCollection();
    render();
  }, card);
});

const totalOwned = (page) =>
  page.evaluate(() => state.collection.items.reduce((sum, item) => sum + item.qty, 0));

test('pinned search reuses inventory, adds missing copies and sends explicit proxies to Wants', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    state.searchPinnedDeckId = 'a';
    state._pinArm = true;
    switchPage('search');
    state.searchResults = [playingCard];
    state.searchRan = true;
    render();
  });
  const add = page.locator('.search-page .add-btn[data-name]:not([data-mb]):not([data-admiral])');
  await expect(page.locator('#pinnedDeckProxy')).not.toBeChecked();
  await add.click();
  expect(await totalOwned(page)).toBe(1);
  await add.click();
  expect(await totalOwned(page)).toBe(2);
  await page.locator('#pinnedDeckProxy').check();
  await add.click();
  expect(await totalOwned(page)).toBe(2);
  expect(await page.evaluate(() => getDeck('a').cards.map((card) => !!card.proxy))).toEqual([
    false,
    false,
    true,
  ]);
  await page
    .locator('.app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await expect(page.locator('[data-binderopen="__playing__"]')).toContainText('2 cards');
  await expect(page.locator('[data-binderopen="__wants__"]')).toContainText('1 card');
  await page.locator('[data-binderopen="__playing__"]').click();
  await expect(page.locator('#brandTitle')).toHaveText('Playing');
  await expect(page.locator('.playing-decks')).toContainText(['Deck A', 'Deck A']);
  await expect(page.locator('.playing-decks').first()).toHaveText('In Deck A');
  expect(await page.evaluate(() => computePlaying().reduce((sum, item) => sum + item.qty, 0))).toBe(
    2,
  );
  await page.locator('#colSearchQ').fill('Missing');
  await page.locator('#colSearchQ').press('Enter');
  await expect(page.locator('[data-playing-ci]')).toHaveCount(0);
  await page.locator('#colSearchQ').fill('Playing');
  await page.locator('#colSearchQ').press('Enter');
  await expect(page.locator('[data-playing-ci]')).toHaveCount(2);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/playing-${info.project.name}.png` });
  await page.evaluate(async () => {
    await persistDeck(getDeck('a'));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => getDeck('a')?.cards[2]?.proxy)).toBe(true);
  expect(await totalOwned(page)).toBe(2);
  expect(errors).toEqual([]);
});

test('search deck picker and Card Details switch proxies without duplicating or deleting reused cards', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    switchPage('search');
    openCardInfo(playingCard);
  });
  const sheet = page.locator('#cardSheetOverlay');
  await sheet.locator('#ciAdd').click();
  await page.locator('#deckPickScrim [data-deck="a"]').click();
  expect(await totalOwned(page)).toBe(1);
  await sheet.locator('#ciAdd').click();
  await page.locator('#dpProxy').check();
  await page.locator('#deckPickScrim [data-deck="b"]').click();
  expect(await totalOwned(page)).toBe(1);
  expect(await page.evaluate(() => computeWants()[0].qty)).toBe(1);
  await page.evaluate(() => closeTopOverlay());
  await expect(sheet).toHaveCount(0);
  await page.evaluate(() => {
    openDeck('b');
    openCardActionSheet(getDeck('b'), getDeck('b').cards[0], 'main', 0);
  });
  await expect(sheet.locator('#csProxy')).toBeChecked();
  await sheet.locator('#csProxy').uncheck();
  expect(await totalOwned(page)).toBe(2);
  expect(await page.evaluate(() => computeWants().length)).toBe(0);
  await sheet.locator('#csProxy').check();
  expect(await totalOwned(page)).toBe(1);
  expect(await page.evaluate(() => state.collection.items[0].binder)).toBe('owned');
  await page.evaluate(() => closeTopOverlay());
  await expect(sheet).toHaveCount(0);
  await page.evaluate(() => {
    switchPage('collection');
    openBinderIn('__wants__');
  });
  // Shift-click opens details on desktop instead of the image-only preview.
  await page.locator('.want-tile').click({ modifiers: ['Shift'] });
  await sheet.locator('[data-collection-increase]').click();
  expect(await page.evaluate(() => getDeck('b').cards[0].proxy)).toBe(false);
  expect(await page.evaluate(() => computeWants().length)).toBe(0);
  expect(await totalOwned(page)).toBe(2);
  expect(errors).toEqual([]);
});

test('deck scanner defaults to physical copies, reuses owned cards and supports proxy batches', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test camera unavailable', 'NotAllowedError');
    };
    const createLog = scannerCreateLog;
    scannerCreateLog = (...args) => (window.playingLog = createLog(...args));
    window.playingDetection = {
      cardId: playingCard.id,
      secondaryId: playingCard.oracle_id,
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 1,
      thumb: '/icon-192.png',
    };
    switchPage('decks');
  });
  await page.locator('#deckFab').click();
  await page.locator('#fabScanDeck').click();
  await page.evaluate(() => {
    playingLog.append({ ...playingDetection });
    playingLog.append({ ...playingDetection });
  });
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(2);
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  await expect(page.locator('#scannerDeckProxy')).not.toBeChecked();
  await page.locator('#scannerDeckPicker [data-scanner-deck="a"]').click();
  await expect(page.locator('#scannerDeckPicker')).toHaveCount(0);
  expect(await totalOwned(page)).toBe(2);
  expect(await page.evaluate(() => computePlaying().reduce((sum, item) => sum + item.qty, 0))).toBe(
    2,
  );
  await page.evaluate(() => playingLog.append({ ...playingDetection }));
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(3);
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  await page.locator('#scannerDeckProxy').check();
  await page.locator('#scannerDeckPicker [data-scanner-deck="b"]').click();
  await expect(page.locator('#scannerDeckPicker')).toHaveCount(0);
  expect(await totalOwned(page)).toBe(2);
  expect(await page.evaluate(() => getDeck('b').cards[0].proxy)).toBe(true);
  expect(await page.evaluate(() => computeWants()[0].qty)).toBe(1);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Wants plus opens the binder dialog first and its large image edits the pending printing', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const alternate = {
    ...card,
    id: 'f9bf0b6b-5cb1-4fc7-93b2-2c09e60144ed',
    set: 'new',
    set_name: 'Alternate Set',
    collector_number: '42',
    image_uris: { ...card.image_uris, normal: '/badge-d.png' },
  };
  await page.route('**/api/scryfall/cards/search?**', (route) =>
    route.fulfill({ json: { object: 'list', data: [card, alternate], has_more: false } }),
  );
  await page.evaluate(() => {
    getDeck('a').cards = [playingDeckCopy(playingCard, true)];
    state.collection.items = [];
    state.collection.binders = [
      { id: 'first', name: 'First binder' },
      { id: 'second', name: 'Second binder' },
    ];
    saveCollection();
    switchPage('collection');
    openBinderIn('__wants__');
  });
  await page.locator('.want-have').click();
  const dialog = page.getByRole('dialog', { name: 'Choose binder', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  expect(
    (await dialog.locator('.binder-printing-preview img').boundingBox()).width,
  ).toBeGreaterThanOrEqual(130);
  await page.screenshot({ path: `var/previews/wants-binder-${info.project.name}.png` });
  await dialog.locator('#bcCancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await totalOwned(page)).toBe(0);
  await page.locator('.want-have').click();
  await dialog.locator('.binder-printing-preview').click();
  await page.locator('#ppClose').click();
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.locator('.binder-printing-preview').click();
  await page
    .getByRole('button', { name: 'Choose Alternate Set printing, number 42', exact: true })
    .click();
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  await expect(dialog.locator('.binder-printing-preview')).toContainText('Alternate Set · #42');
  expect(await totalOwned(page)).toBe(0);
  await dialog.locator('[data-bc="second"]').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => totalOwned(page)).toBe(1);
  expect(await page.evaluate(() => state.collection.items[0])).toMatchObject({
    set: 'new',
    cn: '42',
    binder: 'second',
    qty: 1,
  });
  expect(await page.evaluate(() => getDeck('a').cards[0].proxy)).toBe(false);
  expect(await page.evaluate(() => computeWants().length)).toBe(0);
  expect(await page.evaluate(() => state.screen)).toBe('collection');
  expect(errors).toEqual([]);
});

test('Wants binder dialog works with no binders and stays readable in every color scheme', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await page.evaluate(() => {
    getDeck('a').cards = [playingDeckCopy(playingCard, true)];
    state.collection.items = [];
    state.collection.binders = [];
    saveCollection();
    openBinderIn('__wants__');
  });
  await page.locator('.want-have').click();
  const dialog = page.getByRole('dialog', { name: 'Choose binder', exact: true });
  await expect(dialog).toBeVisible();
  for (const theme of ['dark', 'light'])
    for (const guild of [
      'azorius',
      'dimir',
      'rakdos',
      'gruul',
      'selesnya',
      'orzhov',
      'izzet',
      'golgari',
      'boros',
      'simic',
    ]) {
      await page.evaluate(
        ({ guild, theme }) => {
          state.guild = guild;
          state.theme = theme;
          applyTheme();
        },
        { guild, theme },
      );
      const samples = await auditContrast(page, '#binderConflict .card-transfer-dialog');
      expect(
        samples.filter((sample) => sample.ratio < sample.minimum),
        `${guild} ${theme}`,
      ).toEqual([]);
    }
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(dialog.locator('.card-transfer-actions')).toBeInViewport();
  const heading = await dialog.locator('.transfer-heading').boundingBox();
  await dialog.locator('.card-transfer-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await dialog.locator('.transfer-heading').boundingBox()).toEqual(heading);
  await dialog.getByRole('button', { name: 'No binder', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => totalOwned(page)).toBe(1);
  expect(await page.evaluate(() => state.collection.items[0].binder)).toBe(null);
});

test('missing deck copies are proxies, collection removals update Card Details, and new physical adds remain owned after reload', async ({
  page,
}) => {
  await page.evaluate(() => {
    getDeck('a').cards = [
      { ...playingCard, proxy: false },
      { ...playingCard, proxy: false },
    ];
    getDeck('b').cards = [{ ...playingCard, proxy: true }];
    saveCollection();
    openDeck('a');
    openCardActionSheet(getDeck('a'), getDeck('a').cards[0], 'main', 0);
  });
  await expect(page.locator('#csProxy')).not.toBeChecked();
  expect(await page.evaluate(() => getDeck('a').cards.map((card) => card.proxy))).toEqual([
    false,
    true,
  ]);
  await page.locator('#cardSheetOverlay [data-collection-decrease]').click();
  await expect(page.locator('#csProxy')).toBeChecked();
  expect(await totalOwned(page)).toBe(0);
  expect(await page.evaluate(() => computeWants()[0].qty)).toBe(3);
  await page.evaluate(() => closeTopOverlay());
  await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
  await page.evaluate(() => {
    openAddCardsFor(getDeck('a'));
    state.searchResults = [playingCard];
    state.searchRan = true;
    render();
  });
  await page.locator('.search-page .add-btn[data-name]:not([data-mb]):not([data-admiral])').click();
  expect(await totalOwned(page)).toBe(1);
  expect(await page.evaluate(() => getDeck('a').cards.map((card) => card.proxy))).toEqual([
    true,
    true,
    false,
  ]);
  await page.evaluate(async () => {
    await Promise.all(state.decksIndex.map((deck) => persistDeck(deck)));
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => getDeck('a')?.cards.map((card) => card.proxy)))
    .toEqual([true, true, false]);
  expect(await page.evaluate(() => getDeck('b').cards[0].proxy)).toBe(true);
  expect(await page.evaluate(() => computeWants()[0].qty)).toBe(3);
});

test('loading an older stored deck assigns available inventory and marks only the missing copies as proxies', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const legacy = {
      id: 'legacy-owned',
      name: 'Legacy deck',
      format: 'modern',
      cards: [{ ...playingCard }, { ...playingCard }],
      maybeboard: [],
    };
    await deckDbPutMany([[LS_PREFIX + 'deck:' + legacy.id, JSON.stringify(legacy)]]);
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => getDeck('legacy-owned')?.cards.map((card) => card.proxy)))
    .toEqual([false, true]);
  expect(await totalOwned(page)).toBe(1);
  expect(await page.evaluate(() => getDeck('legacy-owned').cards[1]._playingMissing)).toBe(true);
  expect(await page.evaluate(() => computeWants()[0].qty)).toBe(1);
});
