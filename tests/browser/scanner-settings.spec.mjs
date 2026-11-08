import { test, expect } from '@playwright/test';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: { object: 'list', data: [], items: [], has_more: false } });
    if (url.pathname.endsWith('/collectorvision/scanner.worker.mjs')) return route.abort();
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.app > .app-navigation')).toBeVisible();
});

async function openSettings(page) {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.locator('#menuSettings').click();
  await page.locator('#scannerSettingsRow').click();
  await expect(page.locator('#scannerSettingsBody')).toBeVisible();
}

test('scanner preferences save, survive reload and keep other app preferences', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(async () => {
    state.guild = 'dimir';
    state.startupPage = 'collection';
    await persistSettings();
  });
  await openSettings(page);
  const delay = page.locator('#scannerDebounceSeconds');
  const ignore = page.locator('#scannerIgnoreSession');
  await expect(delay).toHaveValue('0');
  await expect(ignore).not.toBeChecked();
  await delay.fill('2.5');
  await delay.press('Tab');
  await ignore.check();
  for (const [id, value] of [
    ['scannerIdThreshold', '0.75'],
    ['scannerCornerThreshold', '0.08'],
    ['scannerIntervalMs', '1000'],
  ]) {
    await page.locator('#' + id).fill(value);
    await page.locator('#' + id).press('Tab');
  }
  await page.locator('#scannerShowFramerate').check();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem(LS_PREFIX + 'settings:app'))),
  ).toEqual({
    theme: 'dark',
    guild: 'dimir',
    startupPage: 'collection',
    hideCollectionFolderPrices: false,
    scannerDebounceMs: 2500,
    scannerIgnoreSession: true,
    scannerIdThreshold: 0.75,
    scannerCornerThreshold: 0.08,
    scannerIntervalMs: 1000,
    scannerShowFramerate: true,
  });
  await page.reload();
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
  await openSettings(page);
  await expect(delay).toHaveValue('2.5');
  await expect(ignore).toBeChecked();
  await expect(page.locator('#scannerIdThreshold')).toHaveValue('0.75');
  await expect(page.locator('#scannerCornerThreshold')).toHaveValue('0.08');
  await expect(page.locator('#scannerIntervalMs')).toHaveValue('1000');
  await expect(page.locator('#scannerShowFramerate')).toBeChecked();
  await page.locator('#scannerSettingsBody').scrollIntoViewIfNeeded();
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-settings-${info.project.name}.png` });
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 640 });
    expect(
      await page
        .locator('#scannerSettingsBody')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  await delay.fill('0');
  await delay.press('Tab');
  await ignore.uncheck();
  expect(
    await page.evaluate(() => ({
      delay: state.scannerDebounceMs,
      ignore: state.scannerIgnoreSession,
    })),
  ).toEqual({ delay: 0, ignore: false });
  expect(errors).toEqual([]);
});

test('older settings use defaults and invalid delay input is bounded', async ({ page }) => {
  await page.evaluate(async () => {
    localStorage.setItem(
      LS_PREFIX + 'settings:app',
      JSON.stringify({ theme: 'dark', guild: 'dimir', startupPage: 'home' }),
    );
    await loadSettings();
  });
  await openSettings(page);
  const delay = page.locator('#scannerDebounceSeconds');
  await expect(delay).toHaveValue('0');
  await expect(page.locator('#scannerIgnoreSession')).not.toBeChecked();
  await expect(page.locator('#scannerIdThreshold')).toHaveValue('0.6');
  await expect(page.locator('#scannerCornerThreshold')).toHaveValue('0.02');
  await expect(page.locator('#scannerIntervalMs')).toHaveValue('650');
  await expect(page.locator('#scannerShowFramerate')).not.toBeChecked();
  for (const [id, input, expected] of [
    ['scannerIdThreshold', '5', '1'],
    ['scannerCornerThreshold', '-1', '0'],
    ['scannerIntervalMs', '0', '100'],
    ['scannerIntervalMs', '10001', '10000'],
  ]) {
    await page.locator('#' + id).fill(input);
    await page.locator('#' + id).press('Tab');
    await expect(page.locator('#' + id)).toHaveValue(expected);
  }
  await delay.fill('100');
  await delay.press('Tab');
  await expect(delay).toHaveValue('60');
  expect(await page.evaluate(() => state.scannerDebounceMs)).toBe(60000);
  await delay.fill('-5');
  await delay.press('Tab');
  await expect(delay).toHaveValue('0');
});

test('scanner cooldown keeps detection order when matching names resolve out of order', async ({
  page,
}) => {
  const start = Date.parse('2026-11-07T12:00:00Z');
  await page.clock.setFixedTime(start);
  await page.evaluate(() => {
    const root = document.createElement('section');
    root.id = 'testScannerLog';
    root.innerHTML =
      '<span id="scannerLogCount"></span><p id="scannerLogEmpty">Empty</p><ul id="scannerDetections"></ul>';
    document.body.append(root);
    window.pendingCards = {};
    scannerResolveCard = (result) =>
      new Promise((resolve) => {
        pendingCards[result.cardId] = resolve;
      });
    window.testLog = scannerCreateLog(root, {
      signal: new AbortController().signal,
      settings: { scannerDebounceMs: 3000, scannerIgnoreSession: false },
      onReview() {},
    });
    testLog.append({ cardId: 'first-printing', secondaryId: 'first-identity' });
    testLog.append({ cardId: 'other-printing', secondaryId: 'other-identity' });
    testLog.append({ cardId: 'opt', secondaryId: 'opt' });
  });
  await expect.poll(() => page.evaluate(() => Object.keys(pendingCards).length)).toBe(3);
  await page.evaluate(() => {
    pendingCards['other-printing']({ name: 'SOL RING' });
    pendingCards.opt({ name: 'Opt' });
  });
  await expect(page.locator('#testScannerLog [data-state="ready"]')).toHaveCount(2);
  await page.evaluate(() => pendingCards['first-printing']({ name: 'Sol Ring' }));
  const visibleNames = page.locator(
    '#testScannerLog .scanner-detection:not([hidden]) .scanner-detection-name',
  );
  await expect(visibleNames).toHaveText(['Opt', 'Sol Ring']);
  await expect(page.locator('#testScannerLog #scannerLogCount')).toHaveText('2 cards');
  await page.clock.setFixedTime(start + 2500);
  await page.evaluate(() =>
    testLog.append({ cardId: 'other-printing', secondaryId: 'other-identity' }),
  );
  await expect(page.locator('#testScannerLog .scanner-detection')).toHaveCount(3);
  await page.clock.setFixedTime(start + 3000);
  await page.evaluate(() =>
    testLog.append({ cardId: 'other-printing', secondaryId: 'other-identity' }),
  );
  await expect(visibleNames).toHaveText(['SOL RING', 'Opt', 'Sol Ring']);
  await expect(page.locator('#testScannerLog #scannerLogCount')).toHaveText('3 cards');
});
