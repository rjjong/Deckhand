import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

const cards = ['Alpha Adept', 'Beta Mage', 'Gamma Sage'].map((name, index) => ({
  id: 'wants-selection-' + index,
  name,
  set: 'tst',
  collector_number: String(index + 1),
  layout: 'normal',
  type_line: 'Creature — Wizard',
  oracle_text: 'Draw a card.',
  colors: ['U'],
  color_identity: ['U'],
  cmc: 1,
  prices: { eur: '2' },
  legalities: { modern: 'legal', commander: 'legal' },
  image_uris: { small: '/icon-192.png', normal: '/icon-192.png', large: '/icon-192.png' },
}));

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/scryfall/cards/named') {
      const card = cards.find(
        (card) => card.name === (url.searchParams.get('exact') || url.searchParams.get('fuzzy')),
      );
      if (card) return route.fulfill({ json: card });
    }
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
  await page.evaluate((cards) => {
    window.wantedFixtures = cards;
    state.guild = 'dimir';
    applyTheme();
    state.decksIndex = [
      {
        id: 'wanted-deck',
        name: 'Wanted deck',
        format: 'modern',
        cards: [
          { ...cards[0], proxy: true },
          { ...cards[0], proxy: true },
        ],
        maybeboard: [],
      },
    ];
    state.collection.items = [
      { name: 'Kept owned card', set: 'tst', cn: '9', qty: 4, cond: 'NM', binder: 'old' },
    ];
    state.collection.binders = [
      { id: 'old', name: 'Old binder' },
      { id: 'target', name: 'Target binder' },
    ];
    state.collection.wantsManual = [
      { ...cards[1], qty: 3 },
      { name: cards[2].name, qty: 1, type_line: cards[2].type_line, img: '/icon-192.png' },
    ];
    state.collection.wantsExclude = [];
    state._otagCache = Object.fromEntries(cards.map((card) => [card.name, []]));
    _bulkIdx = { cards: [], byName: new Map(), tagByOid: new Map(), rulByOid: new Map() };
    saveCollection();
    openBinderIn('__wants__');
  }, cards);
});

test('long-press selects Wants, taps toggle more, Select all counts copies and Back or navigation clears selection', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const first = page.locator('[data-wn="Alpha Adept"]');
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await expect(first).toHaveClass(/csel/);
  await page.mouse.up();
  await expect(page.locator('#wantSelectionCount')).toHaveText('2 selected');
  await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
  await page.locator('[data-wn="Beta Mage"]').click();
  await expect(page.locator('#wantSelectionCount')).toHaveText('5 selected');
  await expect(page.locator('#binderFab')).toBeHidden();
  await expect(page.locator('.want-have').first()).toBeHidden();
  await page.locator('#wantSelectionAll').click();
  await expect(page.locator('#wantSelectionCount')).toHaveText('6 selected');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/wants-selection-${info.project.name}.png` });
  await page.goBack();
  await expect(page.locator('#wantSelectionBar')).toBeHidden();
  await expect(page.locator('#brandTitle')).toHaveText('Wants');
  await page.locator('#wantSelectAll').click();
  await page.evaluate(() => openBinderIn('__all__'));
  expect(await page.evaluate(() => state.wantSel)).toBe(null);
  await page.evaluate(() => openBinderIn('__wants__'));
  await expect(page.locator('#wantSelectionBar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('bulk removal confirms, dismisses selected Wants and survives reload without removing owned or deck copies', async ({
  page,
}) => {
  await page.locator('#wantSelectAll').click();
  await page.locator('#wantSelectionRemove').click();
  await expect(page.locator('#inAppConfirm')).toContainText(
    'deck contents and owned cards will stay unchanged',
  );
  await page.locator('#iacCancel').click();
  await expect(page.locator('.want-tile')).toHaveCount(3);
  await page.locator('#wantSelectionRemove').click();
  await page.locator('#iacOk').click();
  await expect(page.locator('.want-tile')).toHaveCount(0);
  expect(await page.evaluate(() => getDeck('wanted-deck').cards.length)).toBe(2);
  expect(await page.evaluate(() => getDeck('wanted-deck').cards.every((card) => card.proxy))).toBe(
    true,
  );
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(4);
  await page.evaluate(async () => {
    await persistDeck(getDeck('wanted-deck'));
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => getDeck('wanted-deck')?.cards[0]._wantsDismissed))
    .toBe(true);
  expect(await page.evaluate(() => computeWants().length)).toBe(0);
  await page.evaluate(() =>
    addCardToDeckValidated(getDeck('wanted-deck'), getDeck('wanted-deck').cards[0]),
  );
  expect(await page.evaluate(() => computeWants()[0].qty)).toBe(1);
});

test('bulk binder addition uses the displayed quantities and Cancel does not acquire cards', async ({
  page,
}) => {
  await page.locator('#wantSelectAll').click();
  await page.locator('#wantSelectionAdd').click();
  const dialog = page.getByRole('dialog', { name: 'Choose binder', exact: true });
  await expect(dialog).toContainText('6 cards');
  await dialog.locator('#bcCancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.items.length)).toBe(1);
  await page.locator('#wantSelectionAdd').click();
  await dialog.locator('[data-bc="target"]').click();
  await expect(page.locator('.want-tile')).toHaveCount(0);
  const inventory = await page.evaluate(() =>
    state.collection.items
      .filter((card) => card.binder === 'target')
      .map((card) => [card.name, card.qty])
      .sort(),
  );
  expect(inventory).toEqual([
    ['Alpha Adept', 2],
    ['Beta Mage', 3],
    ['Gamma Sage', 1],
  ]);
  expect(await page.evaluate(() => getDeck('wanted-deck').cards.length)).toBe(2);
  expect(
    await page.evaluate(() => getDeck('wanted-deck').cards.every((card) => card.proxy === false)),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => state.collection.items.find((card) => card.name === 'Kept owned card').qty,
    ),
  ).toBe(4);
});

test('failed bulk lookups remain selected and the selection bar fits small screens and every color scheme', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.route('**/api/scryfall/cards/named?exact=Gamma%20Sage', (route) =>
    route.fulfill({ status: 404, json: { object: 'error', details: 'Not found' } }),
  );
  await page.locator('#wantSelectAll').click();
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
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
      const samples = await auditContrast(page, '#wantSelectionBar');
      expect(
        samples.filter((sample) => sample.ratio < sample.minimum),
        `${guild} ${theme}`,
      ).toEqual([]);
    }
  await page.setViewportSize({ width: 320, height: 480 });
  const box = await page.locator('#wantSelectionBar').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(305);
  await expect(page.locator('#wantSelectionRemove')).toBeInViewport();
  await page.locator('#wantSelectionAdd').click();
  await page.locator('#binderConflict [data-bc="target"]').click();
  await expect(page.locator('.want-tile')).toHaveCount(1);
  await expect(page.locator('#wantSelectionCount')).toHaveText('1 selected');
  await expect(page.locator('[data-wn="Gamma Sage"]')).toHaveClass(/csel/);
  await page.locator('#wantSelectionClear').click();
  await expect(page.locator('#wantSelectionBar')).toBeHidden();
});
