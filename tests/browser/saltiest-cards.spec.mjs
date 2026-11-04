import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

const icon = await readFile('icon-192.png');
const cards = Array.from({ length: 24 }, (_, index) => ({
  n: 'Salt card ' + String(index + 1).padStart(2, '0'),
  id: 'salt-card-' + index,
  tl: 'Artifact',
  ly: 'normal',
  st: 'tst',
  cn: String(index + 1),
  eur: 2,
}));
const rankings = (names) => ({
  container: {
    json_dict: {
      cardlists: [{ cardviews: names.map((name, index) => ({ name, salt: 5 - index * 0.01 })) }],
    },
  },
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.hostname === 'cards.scryfall.io')
      return route.fulfill({ contentType: 'image/png', body: icon });
    if (url.pathname.startsWith('/api/scryfall/')) {
      if (url.pathname.endsWith('/cards/named'))
        return route.fulfill({
          json: {
            name: url.searchParams.get('exact'),
            id: 'salt-api-card',
            type_line: 'Artifact',
            layout: 'normal',
            image_uris: { normal: '/icon-192.png', small: '/icon-192.png' },
            prices: { eur: '2.00' },
          },
        });
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    }
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await page.addStyleTag({
    content: '*,*::before,*::after { animation:none!important; transition:none!important; }',
  });
  await page.evaluate(
    async ({ cards, data }) => {
      await bulkIndexReady();
      _bulkIdx = { cards, byName: new Map(cards.map((card) => [card.n.toLowerCase(), card])) };
      await qdbSet('edh|/pages/top/salt.json', data);
      cards.forEach((card, index) => cardSaltPut(card.n, 5 - index * 0.01));
    },
    { cards, data: rankings(cards.map((card) => card.n)) },
  );
});

async function openRankings(page, count = 24) {
  await page.evaluate(() => openSaltiestOverlay());
  await expect(page.locator('#saltOverlay .salt-tile')).toHaveCount(count);
}

test('salt rankings start at rank one and scroll downward between the pinned bars', async ({
  page,
}, info) => {
  await openRankings(page);
  const pageDialog = page.getByRole('dialog', { name: 'Saltiest Cards', exact: true });
  const main = pageDialog.locator('main'),
    header = pageDialog.locator('.app-titlebar'),
    nav = pageDialog.locator('.app-navigation');
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(pageDialog.locator('.salt-rank').first()).toHaveText('#1');
  await expect(pageDialog.locator('.salt-name').first()).toHaveText('Salt card 01');
  await expect(pageDialog.locator('.salt-score').first()).toHaveText('Salt 5.00');
  const first = await pageDialog.locator('.salt-tile').first().boundingBox();
  const second = await pageDialog.locator('.salt-tile').nth(1).boundingBox();
  const columns = await pageDialog
    .locator('.salt-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  const next = await pageDialog.locator('.salt-tile').nth(columns).boundingBox();
  expect(second.y).toBeCloseTo(first.y, 0);
  expect(second.x).toBeGreaterThan(first.x);
  expect(next.y).toBeGreaterThan(first.y + first.height);
  const top = await header.boundingBox(),
    bottom = await nav.boundingBox(),
    content = await main.boundingBox();
  expect(content.y).toBeCloseTo(top.y + top.height, 0);
  expect(content.y + content.height).toBeCloseTo(bottom.y, 0);
  await main.evaluate((el) => {
    el.scrollTop = 150;
    el.querySelectorAll('img').forEach((img) => img.dispatchEvent(new Event('load')));
  });
  expect(await main.evaluate((el) => el.scrollTop)).toBe(150);
  await pageDialog.locator('.salt-tile').last().scrollIntoViewIfNeeded();
  expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(150);
  expect(await header.boundingBox()).toEqual(top);
  expect(await nav.boundingBox()).toEqual(bottom);
  expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await main.evaluate((el) => {
    el.scrollTop = 0;
  });
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: 'var/previews/saltiest-cards-' + info.project.name + '.png' });
});

test('keyboard selection opens card details and Back preserves the rankings position', async ({
  page,
}) => {
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .focus();
  await openRankings(page);
  const tile = page.locator('#saltOverlay .salt-tile').nth(10);
  await tile.scrollIntoViewIfNeeded();
  await tile.focus();
  const scroll = await page.locator('.salt-content').evaluate((el) => el.scrollTop);
  await page.keyboard.press('Enter');
  await expect(page.locator('#cardSheetOverlay .sheet-title')).toHaveText('Salt card 11');
  await page.goBack();
  await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
  expect(await page.locator('.salt-content').evaluate((el) => el.scrollTop)).toBe(scroll);
  await page.getByRole('button', { name: 'Close saltiest cards' }).click();
  await expect(page.locator('#saltOverlay')).toHaveCount(0);
  await expect(
    page.locator('.app > .app-navigation').getByRole('button', { name: 'Decks', exact: true }),
  ).toBeFocused();
});

test('unavailable rankings offer a themed manual retry', async ({ page }) => {
  await page.evaluate(() =>
    qdbSet('edh|/pages/top/salt.json', { container: { json_dict: { cardlists: [] } } }),
  );
  await page.evaluate(() => openSaltiestOverlay());
  await expect(page.locator('#saltOverlay .salt-empty')).toContainText('Couldn’t load');
  await page.evaluate(
    (data) => qdbSet('edh|/pages/top/salt.json', data),
    rankings(cards.map((card) => card.n)),
  );
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#saltOverlay .salt-tile')).toHaveCount(24);
  expect(await page.locator('.salt-content').evaluate((el) => el.scrollTop)).toBe(0);
});

test('missing images load near the viewport without fetching all one hundred cards', async ({
  page,
}) => {
  const calls = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/scryfall/cards/named?')) calls.push(request.url());
  });
  await page.evaluate(
    async (data) => {
      _bulkIdx = { cards: [], byName: new Map() };
      await qdbSet('edh|/pages/top/salt.json', data);
    },
    rankings(Array.from({ length: 100 }, (_, index) => 'Uncached salt card ' + index)),
  );
  await openRankings(page, 100);
  await expect(page.locator('#saltOverlay .salt-tile').first().locator('img')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => _sfWorking), { timeout: 15000 }).toBe(false);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.length).toBeLessThan(20);
  await expect(page.locator('#saltOverlay .salt-tile').last().locator('img')).toHaveCount(0);
  expect(await page.locator('.salt-content').evaluate((el) => el.scrollTop)).toBe(0);
});

test('salt names, ranks and scores stay readable in every light and dark scheme', async ({
  page,
}) => {
  test.setTimeout(90000);
  await openRankings(page);
  const guilds = await page.evaluate(() => GUILDS.map((guild) => guild.k));
  for (const theme of ['dark', 'light'])
    for (const guild of guilds) {
      await page.evaluate(
        ({ theme, guild }) => {
          state.theme = theme;
          state.guild = guild;
          applyTheme();
        },
        { theme, guild },
      );
      const samples = await auditContrast(page, '#saltOverlay');
      expect(samples.some((sample) => sample.text.includes('Salt 5.00'))).toBe(true);
      for (const sample of samples)
        expect(sample.ratio, `${guild} ${theme} ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(
          sample.minimum,
        );
    }
});
