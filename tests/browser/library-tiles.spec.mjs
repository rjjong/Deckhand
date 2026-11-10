import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/tile-art/')) {
      const color = url.pathname.includes('second') ? '#864c9b' : '#197b96';
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="440"><defs><linearGradient id="a"><stop stop-color="${color}"/><stop offset="1" stop-color="#152439"/></linearGradient></defs><path fill="url(#a)" d="M0 0h600v440H0z"/><circle cx="390" cy="210" r="150" fill="#71b7be" opacity=".4"/><path d="M50 440 190 100 360 440" fill="#161a36" opacity=".6"/></svg>`,
      });
    }
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: { items: [], data: [], object: 'list', has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate(async () => {
    state.guild = 'dimir';
    applyTheme();
    const first = {
      id: 'first',
      name: 'Tides of the Deep',
      set: 'one',
      collector_number: '1',
      type_line: 'Legendary Creature — Wizard',
      color_identity: ['U', 'B'],
      cmc: 3,
      image_uris: { normal: '/tile-art/first.svg', art_crop: '/tile-art/first.svg' },
    };
    const second = {
      ...first,
      id: 'second',
      name: 'Stormbound Mage',
      set: 'two',
      image_uris: { normal: '/tile-art/second.svg', art_crop: '/tile-art/second.svg' },
    };
    state.decksIndex = [
      {
        id: 'display',
        name: 'Explorers of the Deep',
        format: 'commander',
        admiral: first,
        cards: [second],
        maybeboard: [],
        collected: true,
      },
      {
        id: 'filed',
        name: 'Dimir Control',
        format: 'commander',
        admiral: first,
        cards: [second],
        maybeboard: [],
        folderId: 'projects',
      },
      {
        id: 'automatic',
        name: 'Wild Bounty',
        format: 'modern',
        cards: [first, second],
        maybeboard: [],
      },
    ];
    state.folders = [
      { id: 'projects', name: 'Projects', parentId: null, format: 'commander' },
      { id: 'empty', name: 'Future decks', parentId: null, format: 'commander' },
    ];
    state.collection = {
      items: [first, second].map((card) => ({
        name: card.name,
        set: card.set,
        cn: '1',
        img: card.image_uris.normal,
        qty: 2,
        cond: 'NM',
        binder: 'blue',
        colors: ['U'],
        type_line: card.type_line,
      })),
      binders: [{ id: 'blue', name: 'Blue binder' }],
      wantsManual: [],
      wantsExclude: [],
    };
    state.priceCache[first.name] = { v: 2, t: Date.now() };
    state.priceCache[second.name] = { v: 3, t: Date.now() };
    for (const deck of state.decksIndex) await persistDeck(deck);
    saveFolders();
    saveCollection();
    state.folderNav = null;
    setFolderView('decks', 'tiles');
    setFolderView('col', 'tiles');
    switchPage('decks');
  });
});

async function hold(page, selector, menu) {
  const tile = page.locator(selector);
  await tile.scrollIntoViewIfNeeded();
  await tile.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 250 });
  await expect(page.locator(menu)).toBeVisible();
  await tile.dispatchEvent('pointerup');
  await page.locator(menu).getByRole('button', { name: 'Cover art…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cover art', exact: true })).toBeVisible();
}

test('decks, folders and binders share full-cover tile dimensions and readable overlays', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dimensions = await page.locator('.decks-page .library-tile').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const box = tile.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  expect(dimensions.length).toBeGreaterThanOrEqual(4);
  for (const box of dimensions) {
    expect(box.height).toBeGreaterThan(box.width / 1.2);
    expect(Math.abs(box.width - dimensions[0].width)).toBeLessThan(1);
    expect(Math.abs(box.height - dimensions[0].height)).toBeLessThan(1);
  }
  await expect(page.locator('[data-id="display"] .library-tile-art')).toHaveAttribute(
    'src',
    '/tile-art/first.svg',
  );
  await expect(page.locator('[data-folder="projects"] .library-tile-art')).toHaveAttribute(
    'src',
    '/tile-art/first.svg',
  );
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/library-decks-${info.project.name}.png` });
  await page.evaluate(() => switchPage('collection'));
  await expect(page.locator('.library-folder-kind')).toHaveCount(0);
  for (const id of ['__all__', '__playing__', '__wants__']) {
    await expect(page.locator(`[data-binderopen="${id}"] .library-tile-details`)).toHaveCount(0);
    await expect(page.locator(`[data-binderopen="${id}"]`)).not.toContainText('Automatic');
  }
  const symbolStyle = await page
    .locator('[data-binderopen="blue"] .library-binder-symbols')
    .evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      blur: getComputedStyle(el).backdropFilter,
      align: getComputedStyle(el.querySelector('.binder-glyph-row')).justifyContent,
    }));
  expect(symbolStyle).toEqual({ background: 'rgba(0, 0, 0, 0)', blur: 'none', align: 'flex-end' });
  const collection = await page.locator('.collection-page .library-tile').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const box = tile.getBoundingClientRect();
      const image = tile.querySelector('img')?.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        imageWidth: image?.width,
        imageHeight: image?.height,
      };
    }),
  );
  for (const box of collection) {
    expect(Math.abs(box.width - dimensions[0].width)).toBeLessThan(1);
    expect(Math.abs(box.height - dimensions[0].height)).toBeLessThan(1);
    if (box.imageWidth) {
      expect(Math.abs(box.imageWidth - box.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.imageHeight - box.height)).toBeLessThanOrEqual(2);
    }
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      state.theme = theme;
      applyTheme();
    }, theme);
    expect(
      await page
        .locator('[data-binderopen="blue"] .folder-name')
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe('rgb(255, 255, 255)');
  }
  await page.evaluate(() => {
    state.theme = 'dark';
    applyTheme();
  });
  await page.screenshot({ path: `var/previews/library-collection-${info.project.name}.png` });
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => switchPage('decks'));
    const overlap = await page
      .locator('[data-id="display"]')
      .evaluate(
        (tile) =>
          tile.querySelector('.library-tile-heading').getBoundingClientRect().bottom >
          tile.querySelector('.library-tile-details').getBoundingClientRect().top,
      );
    expect(overlap).toBe(false);
    await page.screenshot({ path: 'var/previews/library-decks-narrow.png' });
    await hold(page, '[data-id="display"]', '#tileMenuPop');
    const dialog = await page.locator('.library-cover-dialog').boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
    await expect(page.locator('#tileCoverAutomatic')).toBeInViewport();
    await page.screenshot({ path: 'var/previews/library-cover-narrow.png' });
  }
  expect(errors).toEqual([]);
});

test('deck and folder cover choices survive reload and can return to Automatic', async ({
  page,
}) => {
  await hold(page, '[data-id="display"]', '#tileMenuPop');
  await page.getByRole('button', { name: 'Stormbound Mage · TWO', exact: true }).click();
  await expect(page.locator('#tileCoverPicker')).toHaveCount(0);
  await expect(page.locator('[data-id="display"] .library-tile-art')).toHaveAttribute(
    'src',
    '/tile-art/second.svg',
  );
  await hold(page, '[data-folder="projects"]', '#tileMenuPop');
  await page.getByRole('button', { name: 'Stormbound Mage · TWO', exact: true }).click();
  await page.reload();
  await page.evaluate(() => switchPage('decks'));
  await expect(page.locator('[data-id="display"] .library-tile-art')).toHaveAttribute(
    'src',
    '/tile-art/second.svg',
  );
  await expect(page.locator('[data-folder="projects"] .library-tile-art')).toHaveAttribute(
    'src',
    '/tile-art/second.svg',
  );
  await hold(page, '[data-id="display"]', '#tileMenuPop');
  await page.getByRole('button', { name: 'Automatic', exact: true }).click();
  await expect(page.locator('[data-id="display"] .library-tile-art')).toHaveAttribute(
    'src',
    '/tile-art/first.svg',
  );
});

test('binder and automatic folder cover choices persist without changing their cards', async ({
  page,
}) => {
  await page.evaluate(() => switchPage('collection'));
  const owned = await page.evaluate(() => JSON.stringify(state.collection.items));
  for (const id of ['blue', '__all__']) {
    await hold(page, `[data-binderopen="${id}"]`, '#binderLongPop');
    await page.getByRole('button', { name: 'Stormbound Mage · TWO', exact: true }).click();
    await expect(page.locator(`[data-binderopen="${id}"] .library-tile-art`)).toHaveAttribute(
      'src',
      '/tile-art/second.svg',
    );
  }
  expect(await page.evaluate(() => JSON.stringify(state.collection.items))).toBe(owned);
  await page.reload();
  await page.evaluate(() => switchPage('collection'));
  for (const id of ['blue', '__all__'])
    await expect(page.locator(`[data-binderopen="${id}"] .library-tile-art`)).toHaveAttribute(
      'src',
      '/tile-art/second.svg',
    );
  await hold(page, '[data-binderopen="__all__"]', '#binderLongPop');
  await page.getByRole('button', { name: 'Automatic', exact: true }).click();
  expect(await page.evaluate(() => libraryFolderCovers()['collection:__all__'])).toBeUndefined();
});
