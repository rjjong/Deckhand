import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    window.scannerStartupRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.scannerStartupRequests++;
      throw new DOMException('Test permission denied', 'NotAllowedError');
    };
  });
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
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  await page.evaluate(async () => {
    state.guild = 'dimir';
    applyTheme();
    const filed = {
      name: 'Settings Adept',
      qty: 2,
      eur: 2.5,
      set: 'tst',
      cn: '1',
      cond: 'NM',
      type_line: 'Artifact',
      binder: 'settings-binder',
      img: '/icon-192.png',
    };
    state.collection.binders = [{ id: 'settings-binder', name: 'Settings binder' }];
    state.collection.items = [
      filed,
      { ...filed, name: 'Loose Relic', qty: 1, eur: 3, cn: '2', binder: null },
    ];
    state.collection.wantsManual = [
      { ...filed, name: 'Wanted Relic', qty: 2, eur: 4, binder: null },
    ];
    state.collection.wantsExclude = [];
    state.decksIndex = [
      {
        id: 'settings-deck',
        name: 'Settings deck',
        format: 'modern',
        cards: [{ ...filed }],
        maybeboard: [],
        tags: {},
      },
    ];
    await persistDeck(state.decksIndex[0]);
    saveCollection();
    state.trade = {
      a: [{ ...filed, name: 'Pending incoming', qty: 1 }],
      b: [{ ...filed, name: 'Pending outgoing', qty: 1 }],
      partnerName: 'Riley',
      history: [
        {
          id: 'settings-history',
          at: Date.now(),
          partnerName: 'Previous trader',
          a: [{ ...filed }],
          b: [],
        },
      ],
    };
    saveTrade();
    render();
  });
});

async function settings(page) {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.locator('#menuSettings').click();
  await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
}

test('clearing trade history requires confirmation and preserves the active trade and collection after reload', async ({
  page,
}) => {
  const before = await page.evaluate(() => ({
    a: state.trade.a,
    b: state.trade.b,
    partner: state.trade.partnerName,
    collection: JSON.stringify(state.collection),
  }));
  await settings(page);
  const clear = page.locator('#clearTradeHistoryRow');
  await expect(clear).toContainText('1 completed trade saved');
  await clear.click();
  await expect(page.locator('#inAppConfirm')).toContainText(
    'current trade and collection will be kept',
  );
  await page.locator('#iacCancel').click();
  expect(await page.evaluate(() => loadTrade().history.length)).toBe(1);
  await clear.click();
  await page.locator('#iacOk').click();
  await expect(clear).toBeDisabled();
  await expect(clear).toContainText('No completed trades saved');
  expect(
    await page.evaluate(() => ({
      a: state.trade.a,
      b: state.trade.b,
      partner: state.trade.partnerName,
      collection: JSON.stringify(state.collection),
    })),
  ).toEqual(before);
  await page.reload();
  await settings(page);
  await expect(clear).toBeDisabled();
  expect(await page.evaluate(() => loadTrade().history.length)).toBe(0);
  expect(await page.evaluate(() => loadTrade().partnerName)).toBe('Riley');
  await page.evaluate(() => {
    switchPage('trade');
    openTradeHistory();
  });
  await expect(page.locator('.trade-history-empty')).toContainText('No previous trades');
});

test('the collection preference hides every binder and automatic-folder total while retaining card prices and counts', async ({
  page,
}) => {
  await expect(page.locator('.folder-tile')).toHaveCount(4);
  for (const tile of await page.locator('.folder-sub').all()) await expect(tile).toContainText('€');
  const counts = (await page.locator('.folder-sub').allTextContents()).map((text) =>
    text.split('·')[0].trim(),
  );
  await settings(page);
  await page.locator('#collectionSettingsRow').click();
  await page.getByRole('checkbox', { name: 'Hide binder and folder prices' }).check();
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  const hidden = await page.locator('.folder-sub').allTextContents();
  expect(hidden.map((text) => text.trim())).toEqual(counts);
  expect(hidden.every((text) => !text.includes('€'))).toBe(true);
  await page.locator('[data-binderopen="settings-binder"]').click();
  await expect(page.locator('.col-tile')).toContainText('€5.00');
  await page.reload();
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  expect(await page.evaluate(() => state.hideCollectionFolderPrices)).toBe(true);
  expect(
    (await page.locator('.folder-sub').allTextContents()).every((text) => !text.includes('€')),
  ).toBe(true);
  await settings(page);
  await page.locator('#collectionSettingsRow').click();
  await page.getByRole('checkbox', { name: 'Hide binder and folder prices' }).uncheck();
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Collection', exact: true })
    .click();
  for (const tile of await page.locator('.folder-sub').all()) await expect(tile).toContainText('€');
});

test('Scan cards can launch directly into the collection camera and Back returns to Collection', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await settings(page);
  await page.locator('#startupRow').click();
  await expect(page.locator('#startupBody input')).toHaveCount(7);
  await page.getByRole('radio', { name: 'Scan cards', exact: true }).check();
  await expect(page.locator('#startupRow .l2')).toHaveText('Scan cards');
  await page.reload();
  const scanner = page.getByRole('dialog', { name: 'Scan card camera', exact: true });
  await expect(scanner).toBeVisible();
  await expect(scanner).toHaveAttribute('data-mode', 'collection');
  await expect.poll(() => page.evaluate(() => window.scannerStartupRequests)).toBe(1);
  expect(await page.evaluate(() => state.startupPage)).toBe('scan-collection');
  expect(await page.evaluate(() => state.screen)).toBe('collection');
  await scanner.getByRole('button', { name: 'Close scanner', exact: true }).click();
  await expect(scanner).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
  await expect(page.locator('#colSearchQ')).toBeVisible();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.locator('#menuSettings').click();
  await page.locator('#startupRow').click();
  await expect(page.getByRole('radio', { name: 'Scan cards', exact: true })).toBeChecked();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await page.locator('#startupBody').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-startup-option-${info.project.name}.png` });
  await page.reload();
  await expect(scanner).toBeVisible();
  expect(await page.evaluate(() => window.androidBack())).toBe(1);
  await expect(scanner).toHaveCount(0);
  await expect(page.locator('#inAppConfirm')).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
  expect(errors).toEqual([]);
});

test('explicit shortcuts override scanner startup without requesting camera access', async ({
  page,
}) => {
  await page.evaluate(async () => {
    state.startupPage = 'scan-collection';
    await persistSettings();
  });
  await page.goto('/?go=search');
  await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  expect(await page.evaluate(() => window.scannerStartupRequests)).toBe(0);
  expect(await page.evaluate(() => state.startupPage)).toBe('scan-collection');
  await page.reload();
  await expect(page.locator('#cardScannerCamera')).toBeVisible();
});

test('Settings displays the current major changelog and keeps older history out of the view', async ({
  page,
}) => {
  await settings(page);
  await page.locator('#settingsChangelogRow').click();
  const versions = await page
    .locator('#settingsChangelogBody [data-clv]')
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.clv));
  const all = await page.evaluate(() => ({
    current: APP_VERSION,
    versions: changelogAll().map((entry) => entry.v),
  }));
  expect(versions).toEqual(
    all.versions.filter((version) => version.split('.')[0] === all.current.split('.')[0]),
  );
  expect(versions.length).toBeLessThan(all.versions.length);
  await expect(
    page.locator('#settingsChangelogBody .cl-entry').first().locator('.cl-notes'),
  ).toBeVisible();
});

test('new settings controls remain readable across themes on small screens', async ({ page }) => {
  await settings(page);
  await page.locator('#collectionSettingsRow').click();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
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
      if (!(await page.locator('#collectionSettingsBody').isVisible()))
        await page.locator('#collectionSettingsRow').click();
      await page.locator('#collectionSettingsBody').scrollIntoViewIfNeeded();
      const display = await auditContrast(page, '#collectionSettingsBody');
      expect(
        display.filter((sample) => sample.ratio < sample.minimum),
        `${theme} ${guild} collection`,
      ).toEqual([]);
      await page.locator('#clearTradeHistoryRow').scrollIntoViewIfNeeded();
      const clear = await auditContrast(page, '#clearTradeHistoryRow');
      expect(
        clear.filter((sample) => sample.ratio < sample.minimum),
        `${theme} ${guild} trade`,
      ).toEqual([]);
    }
});
