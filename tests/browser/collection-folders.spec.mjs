import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

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
  await page
    .locator('.app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    state.decksIndex = [];
    state.collection.binders = [
      { id: 'blue', name: 'Blue binder' },
      { id: 'rare', name: 'Rare binder' },
    ];
    state.collection.items = [
      {
        name: 'Loose Adept',
        qty: 1,
        eur: 2,
        set: 'tst',
        cn: '1',
        cond: 'NM',
        colors: ['U'],
        rarity: 'common',
        type_line: 'Creature',
        img: '/icon-192.png',
      },
      {
        name: 'Filed Mage',
        qty: 2,
        eur: 5,
        set: 'tst',
        cn: '2',
        cond: 'NM',
        colors: ['U'],
        rarity: 'rare',
        type_line: 'Creature',
        img: '/icon-192.png',
        binder: 'blue',
      },
      {
        name: 'Rare Sage',
        qty: 1,
        eur: 3,
        set: 'tst',
        cn: '3',
        cond: 'NM',
        colors: ['G'],
        rarity: 'rare',
        type_line: 'Creature',
        img: '/icon-192.png',
        binder: 'rare',
      },
    ];
    _bulkIdx = { cards: [], byName: new Map() };
    render();
  });
});

test('Collection headings lead their folders and Unsorted shows only unfiled cards', async ({
  page,
}, info) => {
  for (const [heading, group] of [
    ['#collectionBindersTitle', '[aria-labelledby="collectionBindersTitle"] .deck-grid'],
    ['#collectionAutomaticTitle', '[aria-labelledby="collectionAutomaticTitle"] .deck-grid'],
    ['.collection-unsorted-title', '.collection-page .col-grid'],
  ]) {
    const label = await page.locator(heading).boundingBox();
    const grid = await page.locator(group).boundingBox();
    expect(label.y + label.height).toBeLessThanOrEqual(grid.y);
  }
  await expect(page.locator('.collection-page .col-tile .l1')).toHaveText(['Loose Adept']);
  await expect(page.locator('[data-binderopen="blue"]')).toContainText('Blue binder');
  await expect(page.locator('[data-binderopen="__all__"]')).toContainText('4 cards');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/collection-folders-${info.project.name}.png` });
  const binder = page.locator('[data-binderopen="blue"]');
  await binder.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 120, clientY: 250 });
  await expect(page.locator('#binderLongPop')).toBeVisible();
  await binder.dispatchEvent('pointerup');
  await expect(page.locator('#binderLongPop button')).toHaveCount(2);
  await expect(page.locator('#binderLongPop')).not.toContainText('Choose cover art');
});

test('Collection header actions follow the folder and Trade is available from Menu', async ({
  page,
}) => {
  await expect(page.locator('.app-header #tradeBtn')).toBeVisible();
  await page.locator('[data-binderopen="__all__"]').click();
  await expect(page.locator('#tradeBtn, #binderSettingsBtn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Collection stats', exact: true })).toBeVisible();
  await page.evaluate(() => openBinderIn('blue'));
  await expect(page.locator('#tradeBtn, #collectionStatsBtn')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit binder settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Binder settings', exact: true })).toBeVisible();
  await page.locator('#brBack').click();
  await expect(page.locator('#binderRulesSheet')).toHaveCount(0);
  await page.locator('#binderFab').click();
  await expect(page.locator('#bfAddCard, #bfImport')).toHaveCount(2);
  await expect(page.locator('#bfRules')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.getElementById('fabMenu')?.remove();
    openBinderIn('__wants__');
  });
  await expect(page.locator('#tradeBtn, #collectionStatsBtn, #binderSettingsBtn')).toHaveCount(0);
  await page.locator('#homeBtn').click();
  await page.locator('#tradeRow').click();
  await expect(page.locator('#brandTitle')).toHaveText('TRADE');
});

test('All cards stats keep total value and old history when search filters hide cards', async ({
  page,
}) => {
  await page.evaluate(() => {
    const day = new Date();
    const iso = (days) => new Date(day.getTime() - days * 86400000).toISOString().slice(0, 10);
    _phist = {
      '__col:all': [[iso(2), 10]],
      '__col:__all__': [[iso(1), 12]],
      'loose adept': [
        [iso(1), 1],
        [iso(0), 2],
      ],
    };
    openBinderIn('__all__');
  });
  const query = page.locator('#colSearchQ');
  await query.fill('Loose');
  await query.press('Enter');
  await expect(page.locator('.collection-page .col-tile .l1')).toHaveText(['Loose Adept']);
  await page.locator('#collectionStatsBtn').click();
  await expect(page.locator('#phOverlay .brand-txt')).toHaveText('Collection Value');
  await expect(page.locator('.collection-stats-summary strong')).toHaveText(['€15.00', '4']);
  await expect(page.locator('#phChart polyline')).toHaveCount(1);
  expect(await page.evaluate(() => priceHistOf('__col:all').map((p) => p[1]))).toEqual([
    10, 12, 15,
  ]);
  await expect(page.locator('#phOverlay main')).toContainText('Biggest risers');
  await page.evaluate(() => closeTopOverlay());
  await expect(page.locator('#phOverlay')).toHaveCount(0);
  await expect(query).toHaveValue('Loose');
  await page.evaluate(() => {
    state.collection.items = [];
    render();
  });
  await page.locator('#collectionStatsBtn').click();
  await expect(page.locator('.collection-stats-summary strong')).toHaveText(['€0.00', '0']);
  expect(await page.evaluate(() => priceHistOf('__col:all').at(-1)[1])).toBe(0);
});

test('new binder settings fill the screen, scroll between fixed bars and save layout and auto-fill', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    state.collection.items = [];
    render();
  });
  await page.locator('#colFab').click();
  await page.locator('#fabAddBinder').click();
  await page.locator('#iapInput').fill('New archive');
  await page.locator('#iapOk').click();
  const editor = page.getByRole('dialog', { name: 'Binder settings', exact: true });
  await expect(editor).toBeVisible();
  await expect
    .poll(() => page.locator('#binderRulesSheet').evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
  const rect = await editor.boundingBox();
  expect(rect).toEqual({ x: 0, y: 0, ...page.viewportSize() });
  expect(await page.locator('.app').evaluate((el) => el.inert)).toBe(true);
  const head = editor.locator('.app-titlebar'),
    footer = editor.locator('footer');
  const fixed = { head: await head.boundingBox(), footer: await footer.boundingBox() };
  await expect(page.locator('#brSave')).toBeInViewport();
  await page.locator('#brGroup .br-dd-btn').click();
  await page.locator('#brGroup [data-v="color"]').click();
  await page.locator('#brSort .br-dd-btn').click();
  await page.locator('#brSort [data-v="price"]').click();
  await page.locator('[data-brk="rarity"][data-brv="rare"]').click();
  await expect(page.locator('[data-brk="rarity"][data-brv="rare"]')).toHaveClass(/active/);
  expect(await head.boundingBox()).toEqual(fixed.head);
  expect(await footer.boundingBox()).toEqual(fixed.footer);
  await expect(page.locator('#brSave')).toBeInViewport();
  await page.screenshot({ path: `var/previews/binder-settings-${info.project.name}.png` });
  await page.locator('#brSave').click();
  await expect(editor).toHaveCount(0);
  expect(await page.locator('.app').evaluate((el) => el.inert)).toBe(false);
  expect(await page.evaluate(() => state.collection.binders.at(-1))).toMatchObject({
    name: 'New archive',
    view: { group: 'color', sort: 'price', sortDir: 'desc' },
    rules: { rarity: ['rare'] },
  });
  await page.locator('#binderSettingsBtn').click();
  await expect(page.locator('#brSort .cs-label')).toHaveText('Price (high–low)');
  await page.locator('[data-brk="rarity"][data-brv="rare"]').click();
  await page.goBack();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.binders.at(-1).rules.rarity)).toEqual(['rare']);
  expect(errors).toEqual([]);
});

test('one selected card shows 1 and folder navigation clears every selection', async ({ page }) => {
  const select = async (tile) => {
    await tile.scrollIntoViewIfNeeded();
    await tile.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect(tile).toHaveClass(/csel/);
    await tile.dispatchEvent('pointerup');
  };
  await select(page.locator('[data-ci="0"]'));
  await expect(page.locator('#colSelFab')).toHaveText('1');
  await expect(page.locator('#colFab')).toBeHidden();
  await page.locator('[data-binderopen="__all__"]').click();
  await expect(page.locator('#colSelFab, .col-tile.csel')).toHaveCount(0);
  await expect(page.locator('#binderFab')).toBeVisible();
  expect(await page.evaluate(() => state.colSel)).toBeNull();
  await select(page.locator('[data-ci="0"]'));
  await page.locator('[data-ci="2"]').click();
  await expect(page.locator('#colSelFab')).toHaveText('2');
  await page.evaluate(() => openBinderIn('blue'));
  await expect(page.locator('#colSelFab, .col-tile.csel')).toHaveCount(0);
  await page
    .locator('.app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await select(page.locator('[data-ci="0"]'));
  await page.evaluate(() => render());
  await expect(page.locator('#colSelFab')).toHaveText('1');
  await page.locator('#colSelFab').click();
  await page
    .locator('#tileMenuPop')
    .getByRole('button', { name: 'Deselect all', exact: false })
    .click();
  await expect(page.locator('#colFab')).toBeVisible();
  await expect(page.locator('#colSelFab')).toHaveCount(0);
});
