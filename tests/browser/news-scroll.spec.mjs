import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/news-thumb.png')
      return route.fulfill({ path: new URL('../../icon-192.png', import.meta.url).pathname });
    if (url.pathname === '/api/news')
      return route.fulfill({
        json: {
          items: Array.from({ length: 20 }, (_, i) => ({
            t: `News article ${i + 1}: new cards and deck ideas`,
            u: `https://example.com/news/${i}`,
            src: 'Deckhand news',
            img: 'https://example.com/news-thumb.png',
            d: '2026-11-09',
          })),
        },
      });
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: { object: 'list', data: [], items: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect(page.locator('#homeNews .news-item')).toHaveCount(20);
  await page.evaluate(() => {
    window.scrollFeedbackEvents = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!node.classList?.contains('scroll-boundary-feedback')) continue;
          const rect = node.getBoundingClientRect();
          scrollFeedbackEvents.push({
            edge: node.dataset.edge,
            top: rect.top,
            bottom: rect.bottom,
            animation: getComputedStyle(node, '::before').animationName,
          });
        }
    }).observe(document.body, { childList: true });
  });
});

test('news scrolls with the page and the logo leaves while title and tabs stay fixed', async ({
  page,
}, info) => {
  const viewport = page.locator('.home-page .tab-viewport');
  const news = page.locator('#homeNews');
  const header = await page.locator('.app-header').boundingBox();
  const nav = await page.locator('.app-navigation').boundingBox();
  const style = await news.evaluate((el) => ({
    overflow: getComputedStyle(el).overflowY,
    border: getComputedStyle(el).borderTopWidth,
    scrollbar: getComputedStyle(el.closest('.tab-viewport')).scrollbarWidth,
  }));
  expect(style).toEqual({ overflow: 'visible', border: '0px', scrollbar: 'none' });
  await viewport.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator('.home-branding').evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(0);
  expect(await news.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.locator('.app-header').boundingBox()).toEqual(header);
  expect(await page.locator('.app-navigation').boundingBox()).toEqual(nav);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/news-page-scroll-${info.project.name}.png` });
  await viewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect
    .poll(() =>
      page.locator('.home-branding').evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(1);
});

test('scroll boundary feedback stays in the viewport and never moves title or tabs', async ({
  page,
}) => {
  const viewport = page.locator('.home-page .tab-viewport');
  const bounds = await viewport.boundingBox();
  const header = await page.locator('.app-header').boundingBox();
  const nav = await page.locator('.app-navigation').boundingBox();
  await viewport.hover();
  await page.mouse.wheel(0, -200);
  await expect
    .poll(() => page.evaluate(() => scrollFeedbackEvents.some((event) => event.edge === 'top')))
    .toBe(true);
  await page.mouse.wheel(0, 5000);
  await expect
    .poll(() => page.evaluate(() => scrollFeedbackEvents.some((event) => event.edge === 'bottom')))
    .toBe(true);
  const events = await page.evaluate(() => scrollFeedbackEvents);
  for (const event of events) {
    expect(event.top).toBeGreaterThanOrEqual(bounds.y);
    expect(event.bottom).toBeLessThanOrEqual(bounds.y + bounds.height);
    expect(event.animation).toBe('scroll-boundary-pulse');
  }
  expect(await page.locator('.app-header').boundingBox()).toEqual(header);
  expect(await page.locator('.app-navigation').boundingBox()).toEqual(nav);
  await expect(page.locator('.scroll-boundary-feedback')).toHaveCount(0);
});

test('dialog scrolling gets its own feedback without moving the page behind it', async ({
  page,
}) => {
  const viewport = page.locator('.home-page .tab-viewport');
  await page.evaluate(() =>
    openLibraryCoverPicker({
      title: 'Cover choices',
      cards: Array.from({ length: 90 }, (_, i) => ({
        id: 'cover-' + i,
        name: 'Cover card ' + i,
        img: '/icon-192.png',
      })),
      onSelect() {},
    }),
  );
  const dialog = page.locator('.library-cover-results');
  const bounds = await dialog.boundingBox();
  expect(await dialog.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
  await dialog.hover();
  await page.mouse.wheel(0, 50000);
  await expect
    .poll(() => page.evaluate(() => scrollFeedbackEvents.some((event) => event.edge === 'bottom')))
    .toBe(true);
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(0);
  const event = await page.evaluate(() => scrollFeedbackEvents.at(-1));
  expect(event.top).toBeGreaterThanOrEqual(bounds.y);
  expect(event.bottom).toBeLessThanOrEqual(bounds.y + bounds.height);
  await expect(page.locator('#tileCoverAutomatic')).toBeInViewport();
});

test('reduced motion, horizontal gestures and programmatic page restoration do not pulse', async ({
  page,
}) => {
  const viewport = page.locator('.home-page .tab-viewport');
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => scrollFeedbackEvents)).toEqual([]);
  await viewport.hover();
  await page.mouse.wheel(200, 0);
  expect(await page.evaluate(() => scrollFeedbackEvents)).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.wheel(0, 200);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => scrollFeedbackEvents)).toEqual([]);
});

test('native touch scrolling can reach an edge and keeps page scrolling enabled', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Touchscreen behavior');
  const viewport = page.locator('.home-page .tab-viewport');
  const box = await viewport.boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 160, y: box.y + 80 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 160, y: box.y + 150 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(() => page.evaluate(() => scrollFeedbackEvents.some((event) => event.edge === 'top')))
    .toBe(true);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 160, y: box.y + box.height - 70 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 160, y: box.y + 100 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await session.detach();
});
