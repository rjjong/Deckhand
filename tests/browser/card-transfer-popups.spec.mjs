import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.locator('.app-navigation').getByRole('button', { name: 'Decks', exact: true }).click();
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    const cards = ['Archive Adept', 'Tidal Mage'].map((name, index) => ({
      id: 'transfer-card-' + index,
      name,
      layout: 'normal',
      type_line: 'Creature — Wizard',
      colors: ['U'],
      color_identity: ['U'],
      cmc: 1,
      set: 'tst',
      collector_number: String(index + 1),
      legalities: { modern: 'legal', commander: 'legal' },
      prices: { eur: '2' },
      image_uris: { small: '/icon-192.png', normal: '/icon-192.png', large: '/icon-192.png' },
    }));
    window.transferDeck = {
      id: 'transfers',
      name: 'Archive of the Tides',
      format: 'modern',
      cards,
      maybeboard: [],
    };
    state.decksIndex = [transferDeck];
    state.activeDeckId = transferDeck.id;
    state.builderTab = 'list';
    state.collection.items = [];
    state.collection.binders = [{ id: 'binder', name: 'Trade binder' }];
    state._otagCache = Object.fromEntries(cards.map((card) => [card.name, []]));
    _bulkIdx = { cards: [], byName: new Map(), tagByOid: new Map(), rulByOid: new Map() };
    cards.forEach((card) => {
      state.priceCache[card.name] = { v: 2, t: Date.now() };
    });
    switchPage('decklist');
  });
});

async function openDeckCardAdd(page) {
  await page.evaluate(() => openCardActionSheet(transferDeck, transferDeck.cards[0], 'main', 0));
  await page.locator('#csAddOne').click();
  await expect(page.locator('#csAddSheet .card-transfer-dialog')).toBeVisible();
}

async function expectFits(page, dialog) {
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox(),
    viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(bounds.y).toBeGreaterThanOrEqual(15);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 15);
  await expect(dialog).toHaveCSS('border-radius', '22px');
  const heading = await dialog.locator('.transfer-heading').boundingBox();
  await dialog.locator('.card-transfer-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await dialog.locator('.transfer-heading').boundingBox()).toEqual(heading);
  await expect(dialog.locator('.card-transfer-actions')).toBeInViewport();
  await expect(dialog.locator('.card-transfer-close')).toBeInViewport();
}

test('deck Card Details uses a themed Add to deck popup with quantity controls and working cancellation', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDeckCardAdd(page);
  const dialog = page.getByRole('dialog', { name: 'Add to deck', exact: true });
  await expectFits(page, dialog);
  await expect(dialog.getByRole('button', { name: 'Decrease amount' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Increase amount' }).click();
  await expect(dialog.locator('#csAddQ')).toHaveText('2');
  await dialog.getByRole('button', { name: 'Decrease amount' }).click();
  await expect(dialog.locator('#csAddQ')).toHaveText('1');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/card-transfer-deck-${info.project.name}.png` });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => transferDeck.cards.length)).toBe(2);
  await page.locator('#csAddOne').click();
  await dialog.getByRole('button', { name: 'Increase amount' }).click();
  await dialog.locator('[data-addk="deck"]').click();
  await expect(page.locator('#csAddSheet, #cardSheetOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => transferDeck.cards.length)).toBe(4);
  expect(errors).toEqual([]);
});

test('collection popup retains chosen quantity, finish, condition and binder and fits a small screen', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDeckCardAdd(page);
  await page.locator('#csAddSheet [data-q="1"]').click();
  await page.locator('#csAddSheet [data-addk="coll"]').click();
  const dialog = page.getByRole('dialog', { name: 'Add to collection', exact: true });
  await expect(dialog.locator('#acQty')).toHaveValue('2');
  await expectFits(page, dialog);
  await page.screenshot({ path: `var/previews/card-transfer-collection-${info.project.name}.png` });
  await page.setViewportSize({ width: 320, height: 480 });
  await expectFits(page, dialog);
  await dialog.locator('#acQplus').click();
  await expect(dialog.locator('#acQty')).toHaveValue('3');
  await dialog.locator('#acCond + .nsel-btn').click();
  await page.locator('#nselPop').getByRole('button', { name: 'Good', exact: true }).click();
  await dialog.locator('#acFoil').check();
  await dialog.locator('#acBinder + .nsel-btn').click();
  await page.locator('#nselPop').getByRole('button', { name: 'Trade binder', exact: true }).click();
  await dialog.locator('#acAdd').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.items)).toEqual([
    expect.objectContaining({
      name: 'Archive Adept',
      qty: 3,
      foil: true,
      cond: 'GD',
      binder: 'binder',
    }),
  ]);
  expect(await page.evaluate(() => transferDeck.cards.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('selected deck cards share the collection popup and add the chosen amount per card', async ({
  page,
}) => {
  await page.evaluate(() => {
    state._dlSel = new Set(['main:0', 'main:1']);
    render();
  });
  await page.locator('#dlSelColl').click();
  const dialog = page.getByRole('dialog', { name: 'Add to collection', exact: true });
  await expect(dialog.locator('.transfer-heading')).toContainText('2 cards');
  await expectFits(page, dialog);
  await dialog.locator('#acQplus').click();
  await dialog.locator('#acAdd').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.items.map((card) => card.qty))).toEqual([2, 2]);
  expect(await page.evaluate(() => transferDeck.cards.length)).toBe(2);
});

test('both card transfer popups stay readable in every guild and light or dark mode', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const guilds = [
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
  ];
  for (const theme of ['dark', 'light'])
    for (const guild of guilds) {
      await page.evaluate(
        ({ guild, theme }) => {
          state.guild = guild;
          state.theme = theme;
          applyTheme();
        },
        { guild, theme },
      );
      for (const target of ['deck', 'collection']) {
        if (target === 'deck') await openDeckCardAdd(page);
        else await page.evaluate(() => openAddToCollection(transferDeck.cards[0]));
        const samples = await auditContrast(page, '.card-transfer-dialog');
        expect(samples.length).toBeGreaterThan(2);
        expect(
          samples.filter((sample) => sample.ratio < sample.minimum),
          `${guild} ${theme} ${target}`,
        ).toEqual([]);
        await page.locator('.card-transfer-close').click();
        await expect(page.locator('.card-transfer-dialog')).toHaveCount(0);
        if (target === 'deck') {
          await page.evaluate(() => closeTopOverlay());
          await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
        }
      }
    }
});
