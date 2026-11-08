import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

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
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    const outgoing = {
      name: 'Outgoing Adept',
      set: 'tst',
      cn: '1',
      type_line: 'Creature — Wizard',
      eur: 5,
      qty: 1,
      pt: Date.now(),
      img: '/icon-192.png',
    };
    const incoming = { ...outgoing, name: 'Incoming Mage', cn: '2', eur: 3.5, qty: 2 };
    state.collection.items = [{ ...outgoing, cond: 'NM', binder: null }];
    state.collection.binders = [];
    state.trade = { a: [incoming], b: [outgoing] };
    saveCollection();
    saveTrade();
    switchPage('trade');
  });
});

async function renamePartner(page, name) {
  await page.locator('#tradePartnerName').click();
  await page.locator('#iapInput').fill(name);
  await page.locator('#iapOk').click();
  await expect(page.locator('#tradePartnerName')).toHaveText(name);
}

test('Clear sits beside Confirm, History replaces it in the header, and the You label edits the partner name', async ({
  page,
}, info) => {
  const toolbar = page.locator('.trade-toolbar');
  await expect(toolbar.locator('#tradeClear')).toBeVisible();
  await expect(page.locator('.app-header #tradeClear')).toHaveCount(0);
  await expect(page.locator('.app-header #tradeHistory')).toBeVisible();
  await expect(page.locator('#tradePartnerName')).toHaveText('You');
  await renamePartner(page, 'Riley');
  await expect(page.locator('.trade-verdict')).toHaveText('Riley adds €2.00');
  await page.reload();
  await page.evaluate(() => switchPage('trade'));
  await expect(page.locator('#tradePartnerName')).toHaveText('Riley');
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.locator('#tradeClear')).toBeInViewport();
  await expect(page.locator('#tradeConfirm')).toBeInViewport();
  expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/trade-actions-${info.project.name}.png` });
  await page.locator('#tradeClear').click();
  await page.locator('#iacOk').click();
  await expect(page.locator('.trade-row')).toHaveCount(0);
  await page.locator('#tradeHistory').click();
  await expect(page.locator('.trade-history-empty')).toContainText('No previous trades');
});

test('confirm saves a read-only trade with agreed prices, and history survives draft clearing and reload', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await renamePartner(page, 'Riley');
  await page.locator('#tradeConfirm').click();
  await page.locator('#iacOk').click();
  await expect.poll(() => page.evaluate(() => state.screen)).toBe('collection');
  expect(
    await page.evaluate(() => state.collection.items.map((card) => [card.name, card.qty])),
  ).toEqual([['Incoming Mage', 2]]);
  await page.evaluate(() => switchPage('trade'));
  await page.locator('#tradeHistory').click();
  const history = page.locator('#tradeHistoryOverlay');
  await expect(history).toHaveAttribute('role', 'dialog');
  await expect(history.locator('.trade-history-entry')).toHaveCount(1);
  await history.locator('summary').click();
  await expect(history.locator('.trade-history-details')).toContainText('Received €7.00');
  await expect(history.locator('.trade-history-details')).toContainText('Given €5.00');
  await expect(history.locator('.trade-history-details')).toContainText('Incoming Mage');
  await expect(history.locator('.trade-history-details')).toContainText('Outgoing Adept');
  await expect(history.locator('.trade-history-entry time')).toHaveAttribute('datetime', /Z$/);
  await expect(history.locator('[data-tq], [data-tdel], [data-tradeadd]')).toHaveCount(0);
  const header = await history.locator('.app-titlebar').boundingBox(),
    nav = await history.locator('.app-navigation').boundingBox();
  await history.locator('.trade-history-body').evaluate((el) => {
    const filler = document.createElement('div');
    filler.style.cssText = 'height:1400px;flex:none';
    el.append(filler);
    el.scrollTop = 400;
  });
  expect(await history.locator('.app-titlebar').boundingBox()).toEqual(header);
  expect(await history.locator('.app-navigation').boundingBox()).toEqual(nav);
  await history.locator('.trade-history-body').evaluate((el) => {
    el.scrollTop = 0;
  });
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/trade-history-${info.project.name}.png` });
  await page.locator('#tradeHistoryBack').click();
  await expect(history).toHaveCount(0);
  await expect(page.locator('#tradeHistory')).toBeFocused();
  await page.evaluate(() => {
    state.trade.a = [{ ...state.trade.history[0].a[0], eur: 999 }];
    saveTrade();
    render();
  });
  await page.locator('#tradeClear').click();
  await page.locator('#iacOk').click();
  expect(await page.evaluate(() => state.trade.history.length)).toBe(1);
  await page.reload();
  await page.evaluate(() => switchPage('trade'));
  await page.locator('#tradeHistory').click();
  await page.locator('.trade-history-entry summary').click();
  await expect(page.locator('.trade-history-entry')).toContainText('Riley');
  await expect(page.locator('.trade-history-details')).toContainText('Received €7.00');
  expect(errors).toEqual([]);
});

test('history and the compact trade toolbar remain readable in every color scheme', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await page.evaluate(() => {
    state.trade.partnerName = 'A trader with a long name '.repeat(4).slice(0, 99);
    state.trade.history = [captureTradeHistory(state.trade)];
    saveTrade();
    render();
  });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await page.locator('.trade-toolbar').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
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
        ({ theme, guild }) => {
          state.theme = theme;
          state.guild = guild;
          applyTheme();
        },
        { theme, guild },
      );
      const toolbar = await auditContrast(page, '.trade-toolbar');
      expect(
        toolbar.filter((sample) => sample.ratio < sample.minimum),
        `${guild} ${theme} toolbar`,
      ).toEqual([]);
      await page.locator('#tradeHistory').click();
      await page.locator('.trade-history-entry summary').click();
      const history = await auditContrast(page, '.trade-history-body');
      expect(
        history.filter((sample) => sample.ratio < sample.minimum),
        `${guild} ${theme} history`,
      ).toEqual([]);
      await page.locator('#tradeHistoryBack').click();
      await expect(page.locator('#tradeHistoryOverlay')).toHaveCount(0);
    }
});
