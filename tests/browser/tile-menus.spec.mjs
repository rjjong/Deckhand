import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;}',
  });
  await page.evaluate(() => {
    state.decksIndex = Array.from({ length: 30 }, (_, index) => ({
      id: 'menu-deck-' + index,
      name: 'Menu fixture deck ' + String(index).padStart(2, '0'),
      format: 'modern',
      cards: [],
      updatedAt: index,
    }));
    state.deckFilter = 'Menu fixture';
    render();
  });
});

async function holdDeck(page, tile) {
  await tile.scrollIntoViewIfNeeded();
  await tile.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, isPrimary: true });
  await expect(page.locator('#tileMenuPop')).toBeVisible();
  await tile.dispatchEvent('pointercancel', {
    pointerType: 'touch',
    pointerId: 1,
    isPrimary: true,
  });
}

async function expectWithinBars(page) {
  const menu = await page.locator('#tileMenuPop').boundingBox();
  const header = await page.locator('.app > .app-titlebar').boundingBox();
  const nav = await page.locator('.app > .app-navigation').boundingBox();
  expect(menu.y).toBeGreaterThanOrEqual(header.y + header.height + 7);
  expect(menu.y + menu.height).toBeLessThanOrEqual(nav.y - 7);
  expect(menu.x).toBeGreaterThanOrEqual(7);
  expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize().width - 7);
}

for (const view of ['list', 'tiles']) {
  test(`long-press menus keep every option visible at both ends of the ${view} view`, async ({
    page,
  }, info) => {
    await page.evaluate((view) => {
      setFolderView('decks', view);
      render();
    }, view);
    for (const index of [0, 29]) {
      const tile = page.locator('.deck-tile').nth(index);
      await holdDeck(page, tile);
      const menu = page.locator('#tileMenuPop');
      await expectWithinBars(page);
      await expect(menu.locator('button')).toHaveCount(6);
      expect(await menu.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      const bounds = await menu.boundingBox();
      expect(bounds.height).toBeGreaterThan(240);
      for (const button of await menu.locator('button').all()) {
        const box = await button.boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
      if (index === 29) {
        await mkdir('var/previews', { recursive: true });
        await page.screenshot({
          path: `var/previews/deck-menu-bottom-${view}-${info.project.name}.png`,
        });
      }
      await page.mouse.click(4, 4);
      await expect(menu).toHaveCount(0);
    }
  });
}

test('a short viewport gives the menu all available height and keeps its actions working', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 380 });
  await page.evaluate(() => {
    setFolderView('decks', 'list');
    render();
  });
  await holdDeck(page, page.locator('.deck-tile').last());
  await expectWithinBars(page);
  const menu = page.locator('#tileMenuPop');
  expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const header = await page.locator('.app > .app-titlebar').boundingBox();
  const nav = await page.locator('.app > .app-navigation').boundingBox();
  expect((await menu.boundingBox()).height).toBeCloseTo(nav.y - header.y - header.height - 16, 0);
  await menu.getByRole('button', { name: 'Delete deck' }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole('button', { name: 'Delete deck' })).toBeInViewport();
  await menu.getByRole('button', { name: 'Set format…' }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('#fmtpCancel')).toBeVisible();
  await page.locator('#fmtpCancel').click();
  expect(await page.evaluate(() => state.decksIndex.length)).toBe(30);
});

test('long shared menus scroll internally and keep the last choice reachable', async ({ page }) => {
  await page.evaluate(() => {
    openTileMenu(
      document.getElementById('deckFilter'),
      Array.from({ length: 30 }, (_, index) => ({
        label: 'Option ' + index,
        fn: () => {
          window.chosenTileOption = index;
        },
      })),
    );
  });
  await expectWithinBars(page);
  const menu = page.locator('#tileMenuPop');
  expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await menu.getByRole('button', { name: 'Option 29', exact: true }).click();
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => chosenTileOption)).toBe(29);
});
