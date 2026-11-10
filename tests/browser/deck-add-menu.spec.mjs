import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

const card = {
  id: '7286819f-6c57-4503-898c-528786ad86e9',
  oracle_id: 'ca16b32c-3f1e-4f8d-821a-064f922c45d8',
  name: 'Scanned Adept',
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
    if (url.pathname === '/api/scryfall/cards/' + card.id) return route.fulfill({ json: card });
    if (url.pathname === '/api/scryfall/cards/named') return route.fulfill({ json: card });
    if (url.pathname === '/api/scryfall/cards/search')
      return route.fulfill({
        json: {
          object: 'list',
          data: /(?:banned|restricted):/.test(url.searchParams.get('q') || '') ? [] : [card],
          has_more: false,
        },
      });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate((card) => {
    window.addMenuCard = card;
    state.guild = 'dimir';
    applyTheme();
    state.decksIndex = ['a', 'b'].map((id) => ({
      id,
      name: 'Deck ' + id.toUpperCase(),
      format: 'modern',
      cards: [{ ...card, id: 'existing-main', name: 'Existing card', proxy: true, pin: true }],
      maybeboard: [{ ...card, id: 'existing-side', name: 'Existing sideboard', pin: true }],
      tags: {},
    }));
    state.collection.items = [{ name: card.name, set: 'tst', cn: '1', qty: 1, cond: 'NM' }];
    state.collection.binders = [];
    state.collection.wantsManual = [];
    state.collection.wantsExclude = [];
    state._otagCache = { [card.name]: [] };
    _bulkIdx = { cards: [], byName: new Map(), tagByOid: new Map(), rulByOid: new Map() };
    saveCollection();
    state.activeDeckId = 'a';
    state.builderTab = 'list';
    switchPage('decklist');
  }, card);
});

async function openAddMenu(page, option, trigger = '#dockAddCards') {
  await page.locator(trigger).click();
  await expect(page.locator('#fabMenu .fab-action')).toHaveText([
    'Scan cards',
    'Import cards',
    'Search cards',
  ]);
  if (option)
    await page.locator('#fabMenu').getByRole('button', { name: option, exact: true }).click();
}

async function expectAlignedActionCircles(page, anchor) {
  const bounds = await anchor.boundingBox();
  const close = page.locator('#fabMenu .fab-menu-close');
  await expect(close).toHaveCSS('border-radius', '50%');
  expect(await close.boundingBox()).toEqual(bounds);
  const icons = page.locator('#fabMenu .fab-action-icon');
  // End the entrance animations so geometry checks measure the resting layout.
  await page.locator('#fabMenu').evaluate(menu => Promise.all(
    menu.getAnimations({ subtree: true }).map(animation => animation.finished),
  ));
  for (const icon of await icons.all()) {
    const circle = await icon.boundingBox();
    await expect(icon).toHaveCSS('border-radius', '50%');
    expect(circle.width).toBe(44);
    expect(circle.height).toBe(44);
    expect(circle.x + circle.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 1);
    expect(circle.width).toBeLessThan(bounds.width);
  }
}

test('add actions animate separately, close cleanly, and match the other floating buttons', async ({
  page,
}) => {
  const deckStyle = await page.locator('#dockAddCards').evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      width: style.width,
      height: style.height,
      radius: style.borderRadius,
      background: style.backgroundColor,
    };
  });
  await openAddMenu(page);
  await expectAlignedActionCircles(page, page.locator('#dockAddCards'));
  await expect(page.locator('.fab-action-icon')).toHaveCount(3);
  expect(
    await page
      .locator('.fab-action')
      .first()
      .evaluate((button) => getComputedStyle(button).animationName),
  ).toBe('fab-action-in');
  await page.getByRole('button', { name: 'Close add menu', exact: true }).click();
  await expect(page.locator('#fabMenu')).toHaveCount(0);
  await expect(page.locator('#dockAddCards')).toBeVisible();
  await openAddMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#fabMenu')).toHaveCount(0);
  await expect(page.locator('#dockAddCards')).toBeFocused();
  await page.evaluate(() => switchPage('decks'));
  expect(
    await page.locator('#deckFab').evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        width: style.width,
        height: style.height,
        radius: style.borderRadius,
        background: style.backgroundColor,
      };
    }),
  ).toEqual(deckStyle);
  await page.locator('#deckFab').click();
  await expectAlignedActionCircles(page, page.locator('#deckFab'));
  await page.getByRole('button', { name: 'Close add menu', exact: true }).click();
  await page.evaluate(() => switchPage('collection'));
  await page.locator('#colFab').click();
  await expectAlignedActionCircles(page, page.locator('#colFab'));
});

test('Collection multiselect shares the circular animated actions and preserves selection on close', async ({ page }, info) => {
  await page.evaluate(() => {
    state.collection.items.push({ ...state.collection.items[0], name: 'Second Adept', qty: 2 });
    switchPage('collection');
    openBinderIn('__all__');
  });
  const tile = page.locator('.col-tile').first();
  await tile.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await expect(page.locator('#colSelFab')).toHaveText('1');
  await tile.dispatchEvent('pointerup');
  await page.locator('#colSelFab').click();
  await expect(page.getByRole('dialog', { name: 'Selected cards', exact: true })).toBeVisible();
  await expect(page.locator('#fabMenu .fab-action')).toHaveCount(4);
  expect(await page.locator('#fabMenu .fab-action').first().evaluate(button => getComputedStyle(button).animationName))
    .toBe('fab-action-in');
  await expectAlignedActionCircles(page, page.locator('#colSelFab'));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/collection-selection-actions-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('#fabMenu')).toHaveCount(0);
  await expect(page.locator('#colSelFab')).toBeFocused();
  await expect(page.locator('#colSelFab')).toHaveText('1');
  await page.locator('#colSelFab').click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.locator('#colSelFab')).toHaveText('3');
  await page.locator('#colSelFab').click();
  await page.getByRole('button', { name: 'Close selection menu', exact: true }).click();
  await expect(page.locator('#fabMenu')).toHaveCount(0);
  await expect(page.locator('#colSelFab')).toHaveText('3');
  await page.locator('#colSelFab').click();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await expect(page.locator('#colSelFab, #fabMenu')).toHaveCount(0);
  await expect(page.locator('#binderFab')).toBeVisible();
});

test('deck plus menu and empty-state plus offer the same choices and pin Search to the deck', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openAddMenu(page);
  const box = await page.locator('#fabMenu').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-add-menu-${info.project.name}.png` });
  await page.locator('#deckAddSearch').click();
  await expect(page.locator('.pin-pill')).toContainText('Deck A');
  expect(await page.evaluate(() => state.searchPinnedDeckId)).toBe('a');
  await page.evaluate(() => {
    getDeck('a').cards = [];
    getDeck('a').maybeboard = [];
    switchPage('decklist');
  });
  await openAddMenu(page, 'Import cards', '#dlEmptyAdd');
  await expect(page.getByRole('dialog', { name: 'Import cards', exact: true })).toBeVisible();
  await expect(page.locator('#applyImportBtn')).toHaveText('Add cards');
  expect(errors).toEqual([]);
});

test('Import cards appends files and proxies, keeps existing cards and sideboard, and enforces copy limits', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openAddMenu(page, 'Import cards');
  await page.locator('#importFile').setInputFiles({
    name: 'cards.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('2 Scanned Adept'),
  });
  await expect(page.locator('#importText')).toHaveValue('2 Scanned Adept');
  await page.locator('#applyImportBtn').click();
  await expect(page.getByRole('dialog', { name: 'Import cards', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => getDeck('a').cards.map((card) => card.name))).toEqual([
    'Existing card',
    card.name,
    card.name,
  ]);
  expect(await page.evaluate(() => getDeck('a').cards[0])).toMatchObject({
    proxy: true,
    pin: true,
  });
  expect(await page.evaluate(() => getDeck('a').maybeboard.map((card) => card.name))).toEqual([
    'Existing sideboard',
  ]);
  expect(
    await page.evaluate(() => state.collection.items.reduce((sum, item) => sum + item.qty, 0)),
  ).toBe(2);
  await openAddMenu(page, 'Import cards');
  await page.locator('#importText').fill('1 Scanned Adept');
  await page.locator('#importCardsProxy').check();
  await page.locator('#applyImportBtn').click();
  await expect(page.getByRole('dialog', { name: 'Import cards', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => getDeck('a').cards.at(-1).proxy)).toBe(true);
  expect(
    await page.evaluate(() => state.collection.items.reduce((sum, item) => sum + item.qty, 0)),
  ).toBe(2);
  await openAddMenu(page, 'Import cards');
  await page.locator('#importText').fill('3 Scanned Adept');
  await page.locator('#applyImportBtn').click();
  await expect(page.locator('#importReport')).toContainText('Over the copy limit');
  expect(
    await page.evaluate(
      () => getDeck('a').cards.filter((card) => card.name === addMenuCard.name).length,
    ),
  ).toBe(4);
  expect(await page.evaluate(() => getDeck('b').cards.length)).toBe(1);
  await expect(page.locator('#inAppConfirm')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('deck scan bulk and review transfers stay on the opened deck and refresh the editor', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test camera unavailable', 'NotAllowedError');
    };
    const createLog = scannerCreateLog;
    scannerCreateLog = (...args) => (window.addMenuLog = createLog(...args));
    window.addMenuDetection = {
      cardId: addMenuCard.id,
      secondaryId: addMenuCard.oracle_id,
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 1,
      thumb: '/icon-192.png',
    };
  });
  await openAddMenu(page, 'Scan cards');
  await expect(page.getByRole('dialog', { name: 'Scan deck camera', exact: true })).toBeVisible();
  await page.evaluate(() => addMenuLog.append({ ...addMenuDetection }));
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(1);
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  const picker = page.locator('#scannerDeckPicker');
  await expect(picker.locator('[data-scanner-deck]')).toHaveCount(1);
  await expect(picker.locator('#scannerCreateDeck, [data-scanner-deck="b"]')).toHaveCount(0);
  await page.locator('#scannerDeckCancel').click();
  expect(await page.evaluate(() => getDeck('a').cards.length)).toBe(1);
  await page.locator('#scannerAddAll').click();
  await picker.getByRole('button', { name: 'Add to Deck A', exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(await page.evaluate(() => getDeck('a').cards.length)).toBe(2);
  await page.evaluate(() => addMenuLog.append({ ...addMenuDetection }));
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(2);
  await page.locator('.scanner-detection-button').first().click();
  await page.locator('#scannerReviewDeckAdd').click();
  await page.locator('#scannerDeckProxy').check();
  await picker.getByRole('button', { name: 'Add to Deck A', exact: true }).click();
  await expect(page.locator('#cardScannerOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => getDeck('a').cards.at(-1).proxy)).toBe(true);
  expect(await page.evaluate(() => getDeck('b').cards.length)).toBe(1);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await expect(page.locator('#capDeckCount')).toContainText('3');
  expect(errors).toEqual([]);
});

test('Import cards from Stats preserves commanders and adds to the existing maybeboard', async ({
  page,
}) => {
  await page.evaluate(() => {
    const deck = getDeck('a');
    deck.format = 'commander';
    deck.admiral = {
      ...addMenuCard,
      id: 'commander',
      name: 'Existing commander',
      type_line: 'Legendary Creature — Wizard',
      oracle_text: 'Partner',
    };
    deck.partner = { ...deck.admiral, id: 'partner', name: 'Existing partner' };
    state.builderTab = 'stats';
    render();
  });
  await openAddMenu(page, 'Import cards');
  await page.setViewportSize({ width: 320, height: 480 });
  const dialog = page.getByRole('dialog', { name: 'Import cards', exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page
    .locator('#importText')
    .fill('Commander\n1 Scanned Adept\n\nMaybeboard\n1 Scanned Adept');
  await page.locator('#applyImportBtn').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => state.builderTab)).toBe('list');
  expect(await page.evaluate(() => getDeck('a').admiral.id)).toBe('commander');
  expect(await page.evaluate(() => getDeck('a').partner.id)).toBe('partner');
  expect(await page.evaluate(() => getDeck('a').cards.map((card) => card.name))).toEqual([
    'Existing card',
    card.name,
  ]);
  expect(await page.evaluate(() => getDeck('a').maybeboard.map((card) => card.name))).toEqual([
    'Existing sideboard',
    card.name,
  ]);
  expect(
    await page.evaluate(() => state.collection.items.reduce((sum, item) => sum + item.qty, 0)),
  ).toBe(1);
});
