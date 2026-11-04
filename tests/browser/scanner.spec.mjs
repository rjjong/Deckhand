import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const cards = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    n: 'Sol Ring',
    st: 'tst',
    cn: '1',
    tl: 'Artifact',
    eur: 2,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    n: 'Arcane Signet',
    st: 'tst',
    cn: '2',
    tl: 'Artifact',
    eur: 1,
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('admiral_app:seenVersion', '1.50'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate((cards) => {
    _bulkIdx = {
      cards,
      byName: new Map(cards.map((card) => [card.n.toLowerCase(), card])),
      rulByOid: new Map(),
    };
    state.guild = 'dimir';
    applyTheme();
    state.collection.items = [];
    switchPage('collection');
  }, cards);
});

test('experimental scanner reads multiple cards with real OpenCV and OCR, then requires review before collection import', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const externalRequests = [],
    errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:3100')
      externalRequests.push(url.hostname);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('#colFab').click();
  await page.locator('#fabScanCards').click();
  const scanner = page.getByRole('dialog', { name: 'Scan cards', exact: true });
  await expect(scanner.getByText('Experimental', { exact: true })).toBeVisible();
  const picture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 650;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17323d';
    ctx.fillRect(0, 0, 1000, 650);
    for (const [i, name] of ['Sol Ring', 'Arcane Signet'].entries()) {
      const x = 80 + i * 460,
        y = 100;
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, 300, 420);
      ctx.fillStyle = '#eee6d4';
      ctx.fillRect(x + 8, y + 8, 284, 404);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 25px Georgia';
      ctx.fillText(name, x + 18, y + 43);
      ctx.fillStyle = i ? '#bc7851' : '#638b83';
      ctx.fillRect(x + 18, y + 65, 264, 180);
      ctx.fillStyle = '#111';
      ctx.font = '19px Georgia';
      ctx.fillText('Artifact', x + 18, y + 278);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await scanner.locator('#scannerFile').setInputFiles({
    name: 'two-cards.png',
    mimeType: 'image/png',
    buffer: Buffer.from(picture, 'base64'),
  });
  await expect(scanner.locator('#scannerStatus')).toContainText('2 cards scanned', {
    timeout: 75000,
  });
  await expect(scanner.locator('.scanner-result')).toHaveCount(2);
  const names = await scanner.locator('[data-scan-match] option:checked').allTextContents();
  expect(names.sort()).toEqual(['Arcane Signet', 'Sol Ring']);
  expect(await page.evaluate(() => state.collection.items)).toEqual([]);
  const firstName = await scanner.locator('[data-scan-query]').first().inputValue();
  await scanner
    .locator('[data-scan-query]')
    .first()
    .fill(firstName + 'x');
  await expect(scanner.locator('[data-scan-match]').first()).toHaveValue('');
  await scanner.locator('.scanner-result .nsel-btn').first().click();
  await page.locator('#nselPop').getByRole('button', { name: firstName, exact: true }).click();
  await expect(scanner.locator('#scannerAdd')).toHaveText('Add 2 selected to collection');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-batch-${info.project.name}.png` });
  expect(externalRequests).toEqual([]);
  await scanner.locator('#scannerAdd').click();
  await expect(scanner).toHaveCount(0);
  await expect(page.locator('#addCollOverlay')).toBeVisible();
  await page.locator('#acAdd').click();
  await expect
    .poll(() => page.evaluate(() => state.collection.items.map((item) => item.name).sort()))
    .toEqual(['Arcane Signet', 'Sol Ring']);
  expect(externalRequests.every((host) => host === 'cards.scryfall.io')).toBe(true);
  expect(errors).toEqual([]);
});

test('camera denial is explained, pending permission is cleaned up, and menu entry stays experimental', async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      writable: true,
      value: async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      },
    });
    switchPage('menu');
  });
  await expect(page.locator('#menuScanCards')).toContainText('Experimental');
  await page.locator('#menuScanCards').click();
  await page.locator('#scannerCamera').click();
  await expect(page.locator('#scannerStatus')).toContainText('Camera permission was declined');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => (window.finishScannerPermission = resolve));
  });
  await page.locator('#scannerCamera').click();
  await page.locator('#scannerClose').click();
  await expect(page.locator('#cardScannerOverlay')).toHaveCount(0);
  await page.evaluate(() => {
    window.scannerTrackStopped = false;
    finishScannerPermission({ getTracks: () => [{ stop: () => (scannerTrackStopped = true) }] });
  });
  await expect.poll(() => page.evaluate(() => scannerTrackStopped)).toBe(true);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    window.scannerCameraStream = canvas.captureStream(1);
    navigator.mediaDevices.getUserMedia = async () => {
      setTimeout(() => canvas.getContext('2d').fillRect(0, 0, 640, 480), 50);
      return scannerCameraStream;
    };
  });
  await page.locator('#menuScanCards').click();
  await page.locator('#scannerCamera').click();
  await expect(page.locator('#scannerCapture')).toBeVisible();
  await page.locator('#cardScannerOverlay [data-app-menu]').click();
  await expect(page.locator('#cardScannerOverlay')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      scannerCameraStream.getTracks().every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
});
