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
      { id: 'blue', name: 'Blue binder', face: '/icon-192.png' },
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
  await expect(binder.locator('.library-tile-art')).toHaveAttribute('src', '/icon-192.png');
  await expect(binder.locator('.binder-glyph-row')).toBeVisible();
  await expect(binder).toContainText('2 cards');
  await binder.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 120, clientY: 250 });
  await expect(page.locator('#binderLongPop')).toBeVisible();
  await binder.dispatchEvent('pointerup');
  await expect(page.locator('#binderLongPop button')).toHaveCount(3);
  await expect(page.locator('#binderLongPop')).toContainText('Cover art');
});

test('Unsorted shows spare copies and removing them leaves Playing copies intact', async ({
  page,
}) => {
  await page.evaluate(() => {
    const card = {
      name: 'Shared adept',
      set: 'tst',
      collector_number: '1',
      type_line: 'Creature',
      image_uris: { normal: '/icon-192.png' },
    };
    state.collection.items = [
      {
        name: card.name,
        set: 'tst',
        cn: '1',
        type_line: 'Creature',
        img: '/icon-192.png',
        qty: 4,
        cond: 'NM',
      },
      {
        name: 'Wanted proxy',
        set: 'tst',
        cn: '2',
        type_line: 'Artifact',
        img: '/icon-192.png',
        qty: 1,
        cond: 'NM',
      },
    ];
    state.decksIndex = [
      {
        id: 'playing',
        name: 'Playing deck',
        format: 'modern',
        cards: [
          { ...card, proxy: false },
          { ...card, proxy: false },
          { ...card, name: 'Wanted proxy', proxy: true },
        ],
        maybeboard: [],
      },
    ];
    render();
  });
  await expect(page.locator('.col-tile .l1')).toHaveText(['Shared adept']);
  await expect(page.locator('.col-tile .vg-qty')).toHaveText('×2');
  const tile = page.locator('.col-tile');
  await tile.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 80, clientY: 400 });
  await expect(page.locator('#colSelFab')).toHaveText('2');
  await tile.dispatchEvent('pointerup');
  await page.locator('#colSelFab').click();
  await page
    .locator('#fabMenu')
    .getByRole('button', { name: /Remove from collection/ })
    .click();
  await expect(page.locator('#inAppConfirm')).toContainText('Remove 2 cards');
  await page.locator('#iacOk').click();
  await expect(page.locator('.col-tile')).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.items[0].qty)).toBe(2);
  expect(await page.evaluate(() => computePlaying()[0].qty)).toBe(2);
  expect(
    await page.evaluate(() =>
      getDeck('playing')
        .cards.slice(0, 2)
        .some((card) => card.proxy),
    ),
  ).toBe(false);
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
  await expect(page.locator('#bfAddCard, #bfScanCards, #bfImport')).toHaveCount(3);
  await expect(page.locator('#bfScanCards')).toHaveText('Scan cards');
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

test('Scan cards from a binder adds selected scans and reviewed cards to that binder', async ({
  page,
}) => {
  const card = {
    id: '7286819f-6c57-4503-898c-528786ad86e9',
    oracle_id: 'ca16b32c-3f1e-4f8d-821a-064f922c45d8',
    name: 'Binder scan fixture',
    set: 'tst',
    set_name: 'Test set',
    collector_number: '1',
    type_line: 'Artifact',
    colors: [],
    image_uris: { normal: '/icon-192.png', small: '/icon-192.png' },
    prices: {},
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/scryfall/cards/' + card.id, (route) => route.fulfill({ json: card }));
  await page.evaluate((card) => {
    state.scannerIgnoreSession = false;
    state.collection.items = [
      {
        name: card.name,
        set: 'tst',
        cn: '1',
        cond: 'NM',
        qty: 1,
        binder: 'blue',
        img: '/icon-192.png',
      },
      {
        name: card.name,
        set: 'tst',
        cn: '1',
        cond: 'NM',
        qty: 2,
        binder: null,
        img: '/icon-192.png',
      },
    ];
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test camera unavailable', 'NotAllowedError');
    };
    const createLog = scannerCreateLog;
    scannerCreateLog = (...args) => (window.binderScanLog = createLog(...args));
    window.binderScanDetection = {
      cardId: card.id,
      secondaryId: card.oracle_id,
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 1,
      thumb: '/icon-192.png',
    };
    openBinderIn('blue');
  }, card);
  await page.locator('#binderFab').click();
  await page.locator('#bfScanCards').click();
  const camera = page.getByRole('dialog', { name: 'Scan card camera', exact: true });
  await expect(camera).toBeVisible();
  await page.evaluate(() => {
    binderScanLog.append({ ...binderScanDetection });
    binderScanLog.append({ ...binderScanDetection });
  });
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(2);
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  await expect(page.locator('.scanner-detection')).toHaveCount(0);
  expect(
    await page.evaluate(() => state.collection.items.find((item) => item.binder === 'blue').qty),
  ).toBe(3);
  expect(await page.evaluate(() => state.collection.items.find((item) => !item.binder).qty)).toBe(
    2,
  );
  await page.evaluate(() => binderScanLog.append({ ...binderScanDetection }));
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(1);
  await page.locator('.scanner-detection-button').click();
  const review = page.getByRole('dialog', { name: 'Review scanned card', exact: true });
  await expect(review.locator('#acBinder')).toHaveValue('blue');
  await review.locator('#acAdd').click();
  await expect(review).toHaveCount(0);
  await expect(page.locator('.scanner-detection')).toHaveCount(0);
  expect(
    await page.evaluate(() => state.collection.items.find((item) => item.binder === 'blue').qty),
  ).toBe(4);
  expect(await page.evaluate(() => state.collection.items.find((item) => !item.binder).qty)).toBe(
    2,
  );
  await page.locator('#scannerCameraBack').click();
  await expect(camera).toHaveCount(0);
  expect(errors).toEqual([]);
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
  const riser = page.locator('#phOverlay .ph-movers [data-phcard]').first().locator('span').last();
  await expect(riser).toContainText('+€');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      state.theme = theme;
      applyTheme();
    }, theme);
    const green = await riser.evaluate((el) => {
      const [r, g, b] = getComputedStyle(el).color.match(/\d+/g).map(Number);
      return g > r && g > b;
    });
    expect(green, `${theme} collection riser is green`).toBe(true);
  }
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

test('binder groups collapse independently and expand with touch or keyboard in every mode', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const mode of ['color', 'rarity', 'finish', 'type']) {
    await page.evaluate((mode) => {
      state.collection.binders[0].view = { group: mode, sort: 'name' };
      state.collection.items.forEach((item, index) => {
        item.binder = 'blue';
        item.foil = index === 0;
        if (index === 2) item.type_line = 'Artifact';
      });
      openBinderIn('blue');
      state.colSel = new Set([0]);
      render();
    }, mode);
    const toggle = page.locator('.col-group-toggle').first();
    const count = await toggle.locator('.cg-n').textContent();
    const controlled = page.locator('#' + (await toggle.getAttribute('aria-controls')));
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(controlled).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(controlled).toBeHidden();
    await expect(page.locator('.col-group').nth(1)).toBeVisible();
    await expect(toggle.locator('.cg-n')).toHaveText(count.trim());
    expect(await page.evaluate(() => Array.from(state.colSel))).toEqual([0]);
    await expect(page.locator('#colSelFab')).toHaveText('1');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(controlled).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(controlled).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(controlled).toBeVisible();
    await expect(page.locator('.col-tile.csel')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('collapsed groups survive filtering and sorting and stay separate per binder and grouping mode', async ({
  page,
}, info) => {
  await page.evaluate(() => {
    state.collection.binders.forEach((binder) => (binder.view = { group: 'color', sort: 'name' }));
    state.collection.items[2].colors = ['U'];
    openBinderIn('blue');
  });
  const toggle = page.locator('.col-group-toggle');
  await toggle.click();
  await expect(page.locator('[data-colgroup="U"]')).toBeHidden();
  await page.locator('#colSortBtn').click();
  await page
    .locator('#tileMenuPop')
    .getByRole('button', { name: 'Name Z → A', exact: false })
    .click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const query = page.locator('#colSearchQ');
  await query.fill('Filed');
  await query.press('Enter');
  await expect(page.locator('[data-colgroup="U"]')).toBeHidden();
  await toggle.click();
  await expect(page.locator('[data-colgroup="U"] .l1')).toHaveText(['Filed Mage']);
  await toggle.click();
  await page.evaluate(() => {
    clearCollectionFilters(false);
    openBinderIn('rare');
  });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-colgroup="U"]')).toBeVisible();
  await page.evaluate(() => openBinderIn('blue'));
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => {
    state.collection.binders[0].view.group = 'rarity';
    render();
  });
  await expect(page.locator('[data-colgroup="rare"]')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => {
    state.collection.binders[0].view.group = 'color';
    render();
  });
  await expect(page.locator('[data-colgroup="U"]')).toBeHidden();
  await page.screenshot({ path: `var/previews/binder-collapsed-${info.project.name}.png` });
  await toggle.click();
  await expect(page.locator('[data-colgroup="U"]')).toBeVisible();
  await page.evaluate(() => {
    state.collection.binders[0].view.group = 'none';
    render();
  });
  await expect(page.locator('.col-group-toggle')).toHaveCount(0);
  await expect(page.locator('.collection-page .col-tile')).toHaveCount(1);
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
    .locator('#fabMenu')
    .getByRole('button', { name: 'Deselect all', exact: false })
    .click();
  await expect(page.locator('#colFab')).toBeVisible();
  await expect(page.locator('#colSelFab')).toHaveCount(0);
});

test('every binder grouping places its heading before its cards', async ({ page }) => {
  for (const mode of ['color', 'rarity', 'finish', 'type']) {
    await page.evaluate((mode) => {
      state.collection.binders[0].view = { group: mode, sort: 'name' };
      state.collection.items.forEach((item, index) => {
        item.binder = 'blue';
        item.foil = index === 0;
        if (index === 2) item.type_line = 'Artifact';
      });
      openBinderIn('blue');
    }, mode);
    await expect(page.locator('.col-group')).not.toHaveCount(0);
    const groups = await page.locator('.col-group').evaluateAll((grids) =>
      grids.map((grid) => {
        const heading = grid.previousElementSibling;
        return {
          heading: heading?.matches('h2.col-group-label'),
          above: heading?.getBoundingClientRect().bottom <= grid.getBoundingClientRect().top,
          copies: heading?.querySelector('.cg-n')?.textContent.trim(),
          expectedCopies:
            '· ' +
            [...grid.querySelectorAll('[data-ci]')].reduce(
              (n, tile) => n + state.collection.items[Number(tile.dataset.ci)].qty,
              0,
            ),
        };
      }),
    );
    for (const group of groups) {
      expect(group.heading, mode).toBe(true);
      expect(group.above, mode).toBe(true);
      expect(group.copies, mode).toBe(group.expectedCopies);
    }
    await expect(page.locator('.col-tile')).toHaveCount(3);
  }
});

test('binder color groups cover every exact combination, normalize color order and fit narrow screens', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    state.collection.binders[0].view = { group: 'color', sort: 'name' };
    const make = (name, cc, qty = 1) => ({
      name,
      cc,
      qty,
      binder: 'blue',
      colors: ['W', 'U', 'B', 'R', 'G'],
      type_line: 'Creature',
      rarity: 'common',
      set: 'tst',
      cn: '1',
      cond: 'NM',
      eur: 1,
      img: '/icon-192.png',
    });
    state.collection.items = Array.from({ length: 32 }, (_, mask) => {
      const colors = Array.from('WUBRG').filter((_, index) => mask & (1 << index));
      return make('Combination ' + (colors.join('') || 'C'), colors.reverse());
    });
    state.collection.items.push(make('Reversed pair', ['U', 'W', 'U'], 2));
    state.collection.items.push({ ...make('Colorless land', undefined), type_line: 'Land' });
    openBinderIn('blue');
  });
  const groups = page.locator('.col-group');
  await expect(groups).toHaveCount(32);
  await expect(page.locator('.col-tile')).toHaveCount(34);
  const keys = await groups.evaluateAll((grids) => grids.map((grid) => grid.dataset.colgroup));
  expect(new Set(keys).size).toBe(32);
  expect(keys.slice(0, 5)).toEqual(['W', 'U', 'B', 'R', 'G']);
  expect(keys.at(-1)).toBe('C');
  expect(keys.slice(0, -1).map((key) => key.length)).toEqual([
    ...Array(5).fill(1),
    ...Array(10).fill(2),
    ...Array(10).fill(3),
    ...Array(5).fill(4),
    5,
  ]);
  const pair = page.locator('[data-colgroup="WU"]');
  await expect(pair.locator('.l1')).toHaveText(['Combination WU', 'Reversed pair']);
  await expect(pair.locator('xpath=preceding-sibling::*[1]')).toContainText('White / Blue');
  await expect(pair.locator('xpath=preceding-sibling::*[1]').locator('.cg-n')).toHaveText('· 3');
  await expect(page.locator('[data-colgroup="C"] .l1')).toHaveText([
    'Colorless land',
    'Combination C',
  ]);
  await expect(page.locator('[data-colgroup="UB"] .l1')).toHaveText(['Combination UB']);
  for (const key of keys) {
    const heading = page
      .locator(`[data-colgroup="${key}"]`)
      .locator('xpath=preceding-sibling::*[1]');
    await expect(heading.locator('.col-group-colors svg')).toHaveCount(
      key === 'C' ? 1 : key.length,
    );
    expect(
      (await heading.boundingBox()).y + (await heading.boundingBox()).height,
    ).toBeLessThanOrEqual((await page.locator(`[data-colgroup="${key}"]`).boundingBox()).y);
  }
  const viewport = page.locator('.tab-viewport[data-screen="collection"]');
  expect(await viewport.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page
    .locator('[data-colgroup="WUBRG"]')
    .locator('xpath=preceding-sibling::*[1]')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `var/previews/binder-color-groups-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
