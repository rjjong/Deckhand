import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

const cards = ['Alpha Adept', 'Beta Mage', 'Gamma Sage'].map((name, index) => ({
  id: 'details-control-' + index,
  name,
  set: 'tst',
  set_name: 'Test set',
  collector_number: String(index + 1),
  type_line: 'Creature — Wizard',
  colors: ['U'],
  color_identity: ['U'],
  cmc: index + 1,
  layout: 'normal',
  oracle_text: 'Draw a card.',
  _salt: 0.1,
  prices: { eur: String(index + 1) },
  legalities: { commander: 'legal', modern: 'legal' },
  image_uris: { small: '/icon-192.png', normal: '/icon-192.png', large: '/icon-192.png' },
}));

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (/\/api\/scryfall\/cards\/tst\/\d+$/.test(url.pathname))
      return route.fulfill({ json: cards[Number(url.pathname.split('/').at(-1)) - 1] });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate((cards) => {
    state.guild = 'dimir';
    applyTheme();
    window.controlCards = cards;
    state._otagCache = Object.fromEntries(cards.map((card) => [card.name, []]));
    _bulkIdx = { cards: [], byName: new Map(), tagByOid: new Map(), rulByOid: new Map() };
    state.collection.items = [];
    switchPage('search');
  }, cards);
  await page.locator('#searchName').click();
});

const names = (page) => page.locator('.collection-page .col-tile .l1');

test('Collection search sorts both directions with the Search-style control and respects binder groups', async ({
  page,
}, info) => {
  await page.evaluate(() => {
    state.collection.binders = [
      { id: 'sort-binder', name: 'Sort binder', view: { group: 'color', sort: 'mv' } },
    ];
    state.collection.items = [
      { name: 'Gamma Sage', qty: 1, mv: null, eur: null, colors: ['U'], img: '/icon-192.png' },
      {
        name: 'Beta Mage',
        qty: 1,
        mv: 5,
        eur: 0,
        colors: ['U'],
        img: '/icon-192.png',
        binder: 'sort-binder',
      },
      {
        name: 'Alpha Adept',
        qty: 1,
        mv: 1,
        eur: 3,
        colors: ['U'],
        img: '/icon-192.png',
        binder: 'sort-binder',
      },
    ];
    switchPage('collection');
    state.colFilter.binder = '__all__';
    render();
  });
  const sort = page.getByRole('button', { name: 'Sort collection', exact: true });
  const search = page.locator('#colSearchQ');
  await expect(sort).toBeVisible();
  await expect(names(page)).toHaveText(['Alpha Adept', 'Beta Mage', 'Gamma Sage']);
  const bounds = await sort.boundingBox(),
    filter = await page.locator('#colChev').boundingBox();
  expect(bounds.y).toBeCloseTo(filter.y, 0);
  expect(bounds.height).toBeCloseTo(filter.height, 0);
  await sort.click();
  await expect(page.locator('#tileMenuPop')).toBeVisible();
  expect((await page.locator('#tileMenuPop').boundingBox()).y).toBeGreaterThanOrEqual(
    bounds.y + bounds.height,
  );
  await page
    .locator('#tileMenuPop')
    .getByRole('button', { name: 'Name Z → A', exact: false })
    .click();
  await expect(names(page)).toHaveText(['Gamma Sage', 'Beta Mage', 'Alpha Adept']);
  await sort.click();
  await page
    .locator('#tileMenuPop')
    .getByRole('button', { name: 'Price: low → high', exact: false })
    .click();
  await expect(names(page)).toHaveText(['Beta Mage', 'Alpha Adept', 'Gamma Sage']);
  await search.fill('Mage');
  await search.press('Enter');
  await expect(names(page)).toHaveText(['Beta Mage']);
  expect(await page.evaluate(() => state.searchSort)).toBe('name');
  await page.evaluate(() => {
    state.colFilter.q = '';
    state.colFilter.binder = 'sort-binder';
    render();
  });
  await expect(names(page)).toHaveText(['Alpha Adept', 'Beta Mage']);
  await sort.click();
  await page
    .locator('#tileMenuPop')
    .getByRole('button', { name: 'Mana value: high → low', exact: false })
    .click();
  await expect(names(page)).toHaveText(['Beta Mage', 'Alpha Adept']);
  expect(await page.locator('.col-group').count()).toBe(1);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem(LS_PREFIX + 'collection')).binders[0].view.sortDir,
    ),
  ).toBe('desc');
  await page.evaluate(() => openBinderRules(state.collection.binders[0]));
  await expect(page.locator('#brSort .cs-label')).toHaveText('Mana value (high–low)');
  await page.locator('#brSave').click();
  await expect(page.locator('#binderRulesSheet')).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.binders[0].view.sortDir)).toBe('desc');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/collection-sort-${info.project.name}.png` });
});

test('collection quantities reach zero without closing details, restore the printing and keep card navigation valid', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    state.collection.items = [
      {
        name: controlCards[0].name,
        set: 'tst',
        cn: '1',
        qty: 2,
        cond: 'EX',
        foil: true,
        binder: 'saved-binder',
        img: '/icon-192.png',
      },
      { name: controlCards[0].name, set: 'old', cn: '9', qty: 1, cond: 'NM', img: '/icon-192.png' },
      { name: controlCards[1].name, set: 'tst', cn: '2', qty: 1, cond: 'NM', img: '/icon-192.png' },
    ];
    openCardInfo({ ...controlCards[0], _foilPick: true }, { colIdx: 0, colPool: [0, 1, 2] });
  });
  const sheet = page.locator('#cardSheetOverlay');
  const amount = sheet.locator('[data-collection-count]');
  const minus = sheet.getByRole('button', { name: 'Remove one from collection', exact: true });
  const plus = sheet.getByRole('button', { name: 'Add one to collection', exact: true });
  for (const button of [plus, minus]) {
    const bounds = await button.boundingBox();
    const icon = await button.locator('svg').boundingBox();
    expect(icon.y + icon.height / 2).toBeCloseTo(bounds.y + bounds.height / 2, 0);
  }
  await expect(amount).toHaveText('3');
  await expect(sheet.locator('#ciAddOne, #ciRemOne, [data-cmbbtn]')).toHaveCount(0);
  for (const count of ['2', '1', '0']) {
    await minus.click();
    await expect(amount).toHaveText(count);
  }
  await expect(sheet).toBeVisible();
  await expect(minus).toBeDisabled();
  expect(await page.evaluate(() => state.collection.items.map((item) => item.name))).toEqual([
    cards[1].name,
  ]);
  await plus.click();
  await expect(amount).toHaveText('1');
  expect(await page.evaluate(() => state.collection.items[0])).toMatchObject({
    cond: 'EX',
    foil: true,
    binder: 'saved-binder',
    cn: '1',
    qty: 1,
  });
  await sheet.getByRole('button', { name: 'Next card', exact: true }).click();
  await expect(sheet.locator('.sheet-title')).toHaveText(cards[1].name);
  await expect(amount).toHaveText('1');
  expect(errors).toEqual([]);
});

test('discovery actions are grouped and the themed tag popup saves and removes tags outside a deck', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => openCardInfo(controlCards[0]));
  const sheet = page.locator('#cardSheetOverlay');
  const group = sheet.getByRole('group', { name: 'Discover cards', exact: true });
  await expect(group.getByRole('button')).toHaveCount(2);
  await expect(group.getByRole('button', { name: 'Inspiration', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Recommendations', exact: true })).toHaveCount(0);
  await expect(sheet.locator('[data-cmbbtn]')).toHaveCount(0);
  await sheet.locator('#ciTags').click();
  const popup = page.getByRole('dialog', { name: 'Tags', exact: true });
  await expect(popup).toBeVisible();
  expect(await sheet.evaluate((el) => el.inert)).toBe(true);
  await popup.locator('#tagInput').fill('Favorite');
  await popup.locator('#tagAddBtn').click();
  await expect(popup.locator('.tag-chips')).toContainText('Favorite');
  await popup.locator('[data-rmtag="Favorite"]').click();
  await expect(popup.locator('.tag-chips')).toContainText('No tags yet');
  await page.setViewportSize({ width: 320, height: 480 });
  await expect
    .poll(async () => {
      const rect = await popup.boundingBox();
      return rect.y + rect.height;
    })
    .toBeLessThanOrEqual(464);
  const bounds = await popup.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(16);
  expect(bounds.y).toBeGreaterThanOrEqual(16);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(464);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/card-tags-${info.project.name}.png` });
  await popup.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(popup).toHaveCount(0);
  expect(await sheet.evaluate((el) => el.inert)).toBe(false);
  await page.evaluate(() => {
    const deck = {
      id: 'tag-deck',
      name: 'Tag deck',
      format: 'modern',
      cards: [controlCards[0]],
      maybeboard: [],
      tags: {},
    };
    state.decksIndex = [deck];
    state.activeDeckId = deck.id;
    closeTopOverlay();
  });
  await expect(sheet).toHaveCount(0);
  await page.evaluate(() => openCardActionSheet(state.decksIndex[0], controlCards[0], 'main', 0));
  await expect(
    sheet.getByRole('group', { name: 'Discover cards', exact: true }).getByRole('button'),
  ).toHaveCount(2);
  await expect(sheet.locator('[data-cmbbtn]')).toHaveCount(0);
  await expect(sheet.locator('#csReco')).toHaveText('Inspiration');
  await sheet.locator('#csTags').click();
  await popup.locator('#tagInput').fill('Deck tag');
  await popup.locator('#tagAddBtn').click();
  await expect(popup.locator('.tag-chips')).toContainText('Deck tag');
  await page.goBack();
  await expect(popup).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('card swipes move only content while both bars and in-bounds arrows remain fixed', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => openCardInfo(controlCards[1], { pool: controlCards, poolIdx: 1 }));
  const sheet = page.locator('#cardSheetOverlay');
  const header = sheet.locator('.card-details-header'),
    nav = sheet.locator('.app-navigation');
  const fixed = { header: await header.boundingBox(), nav: await nav.boundingBox() };
  for (const arrow of [
    sheet.getByRole('button', { name: 'Previous card', exact: true }),
    sheet.getByRole('button', { name: 'Next card', exact: true }),
  ]) {
    const rect = await arrow.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(
      await arrow.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
  }
  await page.evaluate(() => {
    const image = document.querySelector('#ciImg');
    window.swipeTarget = image;
    window.swipeTouch = (type, x) => {
      const point = new Touch({ identifier: 1, target: image, clientX: x, clientY: 220 });
      image.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : [point],
          changedTouches: [point],
        }),
      );
    };
    swipeTouch('touchstart', 250);
    swipeTouch('touchmove', 125);
  });
  await expect(sheet.locator('.sheet-title')).toHaveText(cards[2].name);
  expect(await header.boundingBox()).toEqual(fixed.header);
  expect(await nav.boundingBox()).toEqual(fixed.nav);
  expect(
    await page.locator('.swipe-clip .app-navigation, .swipe-clip .card-details-header').count(),
  ).toBe(0);
  expect(
    await sheet.locator('main.card-detail').evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe('none');
  await page.screenshot({ path: `var/previews/card-swipe-${info.project.name}.png` });
  await page.evaluate(() => swipeTouch('touchend', 125));
  await page.waitForTimeout(450);
  await expect(page.locator('.swipe-clip')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Previous card', exact: true }).click();
  await expect(sheet.locator('.sheet-title')).toHaveText(cards[1].name);
  await page.waitForTimeout(450);
  expect(await header.boundingBox()).toEqual(fixed.header);
  expect(await nav.boundingBox()).toEqual(fixed.nav);
  expect(errors).toEqual([]);
});
