import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

const prints = Array.from({ length: 18 }, (_, index) => ({
  id: 'printing-' + index,
  name: 'Archive Sentinel',
  layout: 'normal',
  type_line: 'Artifact Creature — Golem',
  set: 'ed' + index,
  set_name: 'Edition ' + String(index).padStart(2, '0'),
  collector_number: String(index + 1),
  released_at: String(2000 + index) + '-01-01',
  rarity: 'rare',
  finishes: index === 17 ? ['foil'] : ['nonfoil', 'foil'],
  prices: { eur: String(index + 1), eur_foil: String(index + 6) },
  image_uris: { normal: '/icon-192.png', small: '/icon-192.png' },
}));

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/')) {
      const data = url.searchParams.get('q')?.includes('Archive Sentinel') ? prints : [];
      return route.fulfill({ json: { object: 'list', data, has_more: false } });
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
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  await page.evaluate((cards) => {
    window.printingFixture = cards[0];
    window.printingPicks = [];
    state.collection.items = [2, 7].map((index) => ({
      name: cards[index].name,
      set: cards[index].set,
      cn: cards[index].collector_number,
      qty: 2,
    }));
  }, prints);
});

async function openPicker(page, options) {
  await page.evaluate((options) => {
    openPrintingGrid(printingFixture, (card) => printingPicks.push(card), options);
  }, options);
  await expect(page.locator('#printOverlay .ta-tile')).toHaveCount(18);
}

test('printing choices read downward between the shared header and navigation without a hint', async ({
  page,
}, info) => {
  await page.locator('.app > .app-navigation button').first().focus();
  await openPicker(page);
  const picker = page.getByRole('dialog', { name: 'Change printing', exact: true });
  const main = picker.locator('main');
  const header = picker.locator('.app-titlebar');
  const nav = picker.locator('.app-navigation');
  const subtitle = picker.locator('.app-page-subtitle');
  await expect(subtitle).toHaveText('Archive Sentinel');
  await expect(picker.locator('.hint, .info-btn')).toHaveCount(0);
  await expect(picker.locator('#ppCustom')).toBeVisible();
  await expect(picker.locator('#ppCustomFile')).toBeHidden();
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await main.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');
  expect(await picker.locator('.pp-grid').evaluate((el) => getComputedStyle(el).display)).toBe(
    'grid',
  );
  const names = await picker.locator('.tp-set').allTextContents();
  expect(names.slice(0, 4)).toEqual([
    expect.stringContaining('Edition 07'),
    expect.stringContaining('Edition 02'),
    expect.stringContaining('Edition 17'),
    expect.stringContaining('Edition 16'),
  ]);
  const custom = await picker.locator('#ppCustom').boundingBox();
  const first = await picker.locator('.pp-wrap').first().boundingBox();
  const second = await picker.locator('.pp-wrap').nth(1).boundingBox();
  const all = await picker.getByRole('heading', { name: 'All printings' }).boundingBox();
  expect(first.y).toBeGreaterThan(custom.y + custom.height);
  expect(second.y).toBeCloseTo(first.y, 0);
  expect(second.x).toBeGreaterThan(first.x);
  expect(all.y).toBeGreaterThan(first.y + first.height);
  const headerBounds = await header.boundingBox(),
    navBounds = await nav.boundingBox();
  const mainBounds = await main.boundingBox(),
    subtitleBounds = await subtitle.boundingBox();
  expect(mainBounds.y).toBeCloseTo(subtitleBounds.y + subtitleBounds.height, 0);
  expect(mainBounds.y + mainBounds.height).toBeCloseTo(navBounds.y, 0);
  await picker.locator('.pp-wrap').last().scrollIntoViewIfNeeded();
  expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await header.boundingBox()).toEqual(headerBounds);
  expect(await nav.boundingBox()).toEqual(navBounds);
  expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await main.evaluate((el) => {
    el.scrollTop = 0;
  });
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: 'var/previews/printing-picker-' + info.project.name + '.png' });
  await picker.getByRole('button', { name: 'Close printing picker' }).click();
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  await expect(page.locator('.app > .app-navigation button').first()).toBeFocused();
});

test('regular, foil and foil-only choices retain their printing and price', async ({ page }) => {
  await openPicker(page);
  await page
    .getByRole('button', { name: 'Choose Edition 07 printing, number 8', exact: true })
    .click();
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  await openPicker(page);
  await page
    .getByRole('button', { name: 'Choose foil Edition 07 printing, number 8', exact: true })
    .click();
  await openPicker(page);
  await page.locator('#printOverlay .ta-tile[data-foilonly="1"]').click();
  expect(
    await page.evaluate(() =>
      printingPicks.map((card) => ({
        id: card.id,
        foil: !!card._foilPick,
        price: card.prices.eur,
      })),
    ),
  ).toEqual([
    { id: 'printing-7', foil: false, price: '8' },
    { id: 'printing-7', foil: true, price: '13' },
    { id: 'printing-17', foil: true, price: '23' },
  ]);
});

test('trade options omit custom images and owned badges and navigation still works', async ({
  page,
}) => {
  await openPicker(page, { noCustom: true, noOwned: true });
  await expect(
    page.locator('#ppCustom, #printOverlay .pp-own, #printOverlay .pp-section'),
  ).toHaveCount(0);
  await expect(page.locator('#printOverlay .ta-tile').first()).toHaveAttribute(
    'data-foilonly',
    '1',
  );
  await page
    .locator('#printOverlay')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
});

test('an empty printing search offers a themed manual retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/scryfall/cards/search*', (route) => {
    requests++;
    return route.fulfill({ json: { data: requests > 1 ? prints : [], has_more: false } });
  });
  await page.evaluate(() => openPrintingGrid(printingFixture, () => {}));
  await expect(page.locator('#ppList')).toContainText('No printings with art found.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#printOverlay .ta-tile')).toHaveCount(18);
  expect(requests).toBe(2);
});

test('the custom image action still accepts an image file', async ({ page }) => {
  await page.evaluate(() =>
    openPrintingGrid(printingFixture, () => {}, {
      onCustom: (card) => {
        window.customPrinting = card;
      },
    }),
  );
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#ppCustom').click();
  await (
    await chooser
  ).setFiles({ name: 'custom.png', mimeType: 'image/png', buffer: await readFile('icon-192.png') });
  await expect(page.locator('#printOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => customPrinting.image_uris.normal)).toMatch(
    /^data:image\/jpeg;base64,/,
  );
});

test('printing controls and metadata stay readable in all light and dark color schemes', async ({
  page,
}) => {
  test.setTimeout(90000);
  await openPicker(page);
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
      for (const selector of [
        '#ppCustom',
        '#printOverlay .pp-wrap >> nth=0',
        '#printOverlay .pp-wrap >> nth=2',
      ]) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        const samples = await auditContrast(page, selector);
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples)
          expect(
            sample.ratio,
            `${guild} ${theme} ${JSON.stringify(sample)}`,
          ).toBeGreaterThanOrEqual(sample.minimum);
      }
    }
});
