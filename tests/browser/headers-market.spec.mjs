import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

const card = {
  id: 'header-market-fixture',
  name: 'Archive Adept',
  layout: 'normal',
  type_line: 'Creature — Wizard',
  colors: ['U'],
  color_identity: ['U'],
  set: 'tst',
  set_name: 'Test Set',
  collector_number: '1',
  rarity: 'rare',
  prices: { eur: '5.00' },
  legalities: { modern: 'legal', commander: 'legal' },
  image_uris: { normal: '/icon-192.png', small: '/icon-192.png' },
  purchase_uris: {
    cardmarket:
      'https://www.cardmarket.com/en/Magic/Products/Singles/Test/Archive-Adept?referrer=scryfall',
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('admiral_app:seenVersion', '1.50'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    if (url.origin === 'http://127.0.0.1:3100') return route.continue();
    return route.abort();
  });
  await page.goto('/');
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  await page.evaluate((fixture) => {
    window.headerCard = fixture;
    window.headerDeck = {
      id: 'header-deck',
      name: 'Archive deck',
      format: 'modern',
      cards: [fixture],
      maybeboard: [],
    };
    state.decksIndex = [window.headerDeck];
    state.activeDeckId = window.headerDeck.id;
    state._cr = [{ n: '100', t: 'General rules.' }];
  }, card);
});

const headerStyle = (el) => {
  const css = getComputedStyle(el);
  const title = el.querySelector('.brand-txt, h1');
  const ink = getComputedStyle(title);
  return {
    height: el.getBoundingClientRect().height,
    padding: css.padding,
    background: css.backgroundColor,
    display: css.display,
    color: ink.color,
    fill: ink.webkitTextFillColor,
    font: ink.fontFamily,
    weight: ink.fontWeight,
    spacing: ink.letterSpacing,
    border: css.borderBottom,
    shadow: css.boxShadow,
  };
};

test('pages and full-screen tools share the themed header at desktop and narrow phone widths', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
  });
  const check = async (selector, expected) => {
    const header = page.locator(selector);
    await expect(header).toBeVisible();
    await expect.poll(() => header.evaluate(headerStyle), selector).toEqual(expected);
    const bounds = await header.boundingBox();
    expect(bounds.x, selector).toBeCloseTo(0, 0);
    expect(bounds.width, selector).toBeCloseTo(page.viewportSize().width, 0);
    await expect
      .poll(
        () =>
          header.evaluate((el) => ({
            width: el.scrollWidth - el.clientWidth,
            height: el.scrollHeight - el.clientHeight,
          })),
        selector,
      )
      .toEqual({ width: 0, height: 0 });
    const title = header.locator('.brand-txt, h1');
    const text = title.locator('.app-title-text');
    await expect
      .poll(() =>
        text
          .count()
          .then((n) =>
            n
              ? text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
              : title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
          ),
      )
      .toBeGreaterThanOrEqual(15);
  };
  for (const size of [page.viewportSize(), { width: 320, height: 480 }]) {
    await page.setViewportSize(size);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.evaluate(() => switchPage('menu'));
    await expect
      .poll(() =>
        page.locator('.app > .app-titlebar').evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBe(64);
    const expected = await page.locator('.app > .app-titlebar').evaluate(headerStyle);
    expect(expected.height).toBe(64);
    expect(expected.display).toBe('grid');
    expect(expected.border).toMatch(/^1px solid /);
    expect(expected.shadow).toBe('none');
    for (const screen of [
      'home',
      'decks',
      'decklist',
      'collection',
      'search',
      'browse',
      'spoilers',
      'life',
      'menu',
      'settings',
      'draft',
      'trade',
      'formatrules',
      'banlists',
    ]) {
      await page.evaluate((screen) => switchPage(screen), screen);
      await check('.app > .app-titlebar', expected);
    }
    for (const [selector, open] of [
      ['#tradeAddOverlay .app-titlebar', () => openTradeAdd('a')],
      [
        '#printOverlay .app-titlebar',
        () => {
          openPrintingGrid(headerCard, () => {}, { noCustom: true });
        },
      ],
      ['#historyOverlay .app-titlebar', () => openHistoryOverlay(headerDeck)],
      ['#phOverlay .app-titlebar', () => openPriceHistory(headerCard)],
      [
        '#showcaseOverlay .app-titlebar',
        () => {
          openShowcase({ n: 'Shared Deck', by: 'A friend', c: [] });
        },
      ],
      ['#cardSheetOverlay .app-titlebar', () => openCardInfo(headerCard)],
      [
        '#similarOverlay .app-titlebar',
        () => {
          openSimilarCards(headerCard);
        },
      ],
      ['#crOverlay .app-titlebar', () => openCROverlay('judge')],
      ['#crOverlay .app-titlebar', () => openCROverlay('rules')],
      [
        '#lifeSetupScreen .app-titlebar',
        () => {
          state.life.setupDone = false;
          openLifeOverlay();
        },
      ],
    ]) {
      await page.evaluate(open);
      await check(selector, expected);
      await page.evaluate(() => dismissAllOverlays());
      await expect(page.locator(selector)).toHaveCount(0);
    }
    await page.evaluate(() => {
      openBinderArtPicker({ id: 'header-binder', name: 'Test binder' });
    });
    await page.locator('#iapInput').fill(card.name);
    await page.locator('#iapOk').click();
    await check('#binderArtOverlay .app-titlebar', expected);
    await page.locator('#baClose').click();
    await expect(page.locator('#binderArtOverlay')).toHaveCount(0);
    await page.evaluate(async () => {
      await bulkIndexReady();
      const entry = {
        n: headerCard.name,
        id: headerCard.id,
        tl: 'Creature — Wizard',
        ly: 'normal',
      };
      _bulkIdx = { cards: [entry], byName: new Map([[headerCard.name.toLowerCase(), entry]]) };
      await openCardPeek(headerCard.name);
    });
    await check('#cardPeekOverlay .app-titlebar', expected);
    await page.locator('#peekClose').click();
    await expect(page.locator('#cardPeekOverlay')).toHaveCount(0);
    await page.evaluate(() => switchPage('search'));
    await page.getByRole('button', { name: 'Advanced search', exact: true }).click();
    await check('#advancedSearchScreen .app-titlebar', expected);
    await page.locator('#advancedSearchClose').click();
  }
  await page.evaluate(() => openCardInfo(headerCard));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/shared-header-${info.project.name}.png` });
  await page.locator('#cardSheetOverlay [data-app-menu]').click();
  await expect(page.locator('.menu-page')).toBeVisible();
  expect(errors).toEqual([]);
});

test('headers and Cardmarket links remain readable in every color scheme', async ({ page }) => {
  test.setTimeout(90000);
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
          state.trade = {
            a: [{ name: headerCard.name, eur: 5, qty: 1, pt: Date.now(), img: '/icon-192.png' }],
            b: [],
          };
          switchPage('trade');
        },
        { guild, theme },
      );
      for (const selector of ['.app > .app-titlebar', '.trade-page']) {
        const samples = await auditContrast(page, selector);
        expect(samples.length).toBeGreaterThan(0);
        for (const s of samples)
          expect(s.ratio, `${guild} ${theme} ${s.selector}: ${s.text}`).toBeGreaterThanOrEqual(
            s.minimum,
          );
      }
      await page.evaluate(() => openPrintingGrid(headerCard, () => {}, { noCustom: true }));
      const samples = await auditContrast(page, '#printOverlay .app-titlebar');
      expect(samples.length).toBeGreaterThan(0);
      for (const s of samples)
        expect(s.ratio, `${guild} ${theme} ${s.text}`).toBeGreaterThanOrEqual(s.minimum);
      await page.evaluate(() => dismissAllOverlays());
    }
});

test('trade links retain exact printing URLs, support older cards and fit small screens', async ({
  page,
}, info) => {
  await page.evaluate((fixture) => {
    state.trade = {
      a: [
        {
          name: fixture.name,
          eur: 5,
          qty: 1,
          pt: Date.now(),
          img: '/icon-192.png',
          cardmarketUrl: fixture.purchase_uris.cardmarket,
        },
      ],
      b: [
        {
          name: 'Adept "Apprentice" & Friend',
          eur: 3,
          qty: 1,
          pt: Date.now(),
          img: '/icon-192.png',
        },
      ],
    };
    switchPage('trade');
  }, card);
  const exact = page.getByRole('link', {
    name: `View ${card.name} on Cardmarket (opens in a new tab)`,
    exact: true,
  });
  const fallback = page.getByRole('link', {
    name: 'View Adept "Apprentice" & Friend on Cardmarket (opens in a new tab)',
    exact: true,
  });
  await expect(exact).toHaveAttribute('href', card.purchase_uris.cardmarket);
  const url = new URL(await fallback.getAttribute('href'));
  expect(url.origin).toBe('https://www.cardmarket.com');
  expect(url.searchParams.get('searchString')).toBe('Adept "Apprentice" & Friend');
  for (const link of [exact, fallback]) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link.locator('svg')).toHaveCount(1);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await exact.scrollIntoViewIfNeeded();
  await expect(exact).toBeInViewport();
  await fallback.scrollIntoViewIfNeeded();
  await expect(fallback).toBeInViewport();
  expect(
    await page
      .locator('.trade-page .page-content')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const popup = page.waitForEvent('popup');
  await exact.click();
  const market = await popup;
  await expect.poll(() => market.url()).toBe(card.purchase_uris.cardmarket);
  await market.close();
  expect(await page.evaluate(() => state.trade.a[0].qty)).toBe(1);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/trade-cardmarket-${info.project.name}.png` });
});

test('choosing a trade printing saves its Cardmarket link and price refresh upgrades old entries', async ({
  page,
}) => {
  await page.route('**/api/scryfall/cards/search?*', (route) =>
    route.fulfill({ json: { object: 'list', data: [card], has_more: false } }),
  );
  await page.route('**/api/scryfall/cards/collection', (route) =>
    route.fulfill({ json: { object: 'list', data: [card] } }),
  );
  await page.evaluate(() => {
    state.trade = { a: [], b: [] };
    switchPage('trade');
  });
  await page.locator('[data-tradeadd="a"]').click();
  await page.locator('#taName').fill(card.name);
  await page.locator('#taName').press('Enter');
  await page.locator('#tradeAddOverlay .ta-tile').click();
  await page.locator('#printOverlay .ta-tile').click();
  await expect(page.locator('#printOverlay, #tradeAddOverlay')).toHaveCount(0);
  await expect(page.locator('.tr-market')).toHaveAttribute('href', card.purchase_uris.cardmarket);
  expect(await page.evaluate(() => state.trade.a[0].cardmarketUrl)).toBe(
    card.purchase_uris.cardmarket,
  );
  await page.evaluate(() => {
    delete state.trade.a[0].cardmarketUrl;
    state.trade.a[0].pt = 0;
    saveTrade();
    refreshTradePrices();
  });
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem(LS_PREFIX + 'trade')).a[0].cardmarketUrl),
    )
    .toBe(card.purchase_uris.cardmarket);
  await expect(page.locator('.tr-market')).toHaveAttribute('href', card.purchase_uris.cardmarket);
  expect(await page.evaluate(() => state.trade.a[0].eur)).toBe(5);
});
