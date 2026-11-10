import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { scannerBundleDirectory } from '../../scripts/scanner-assets.mjs';
import { makeScannerPerspectiveScenes } from './helpers/scanner-perspective.mjs';

const sample = resolve(scannerBundleDirectory, 'assets/samples/mtg-sample.jpg');
const card = {
  id: '7286819f-6c57-4503-898c-528786ad86e9',
  oracle_id: 'ca16b32c-3f1e-4f8d-821a-064f922c45d8',
  name: 'Scrying Glass',
  set: 'uds',
  set_name: "Urza's Destiny",
  collector_number: '137',
  type_line: 'Artifact',
  prices: {},
};

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    window.scannerWorkerCreates = 0;
    window.scannerWorkerStops = 0;
    window.scannerCameraRequests = 0;
    window.scannerFramesSent = 0;
    window.scannerCornerFrames = 0;
    window.scannerScanPulses = [];
    navigator.vibrate = (pattern) => { if (pattern === 70) scannerScanPulses.push(pattern); return true; };
    window.scannerFramesCleared = 0;
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url, options) {
        super(url, options);
        this.isScanner = String(url).includes('/collectorvision/scanner.worker.mjs');
        this.isCorner = String(url).includes('/collectorvision/corner.worker.mjs');
        if (this.isScanner) {
          scannerWorkerCreates++;
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'framesCleared') scannerFramesCleared++;
          });
        }
      }
      postMessage(message, ...args) {
        if (this.isScanner && message.type === 'frame') scannerFramesSent++;
        if (this.isCorner && message.type === 'frame') scannerCornerFrames++;
        return super.postMessage(message, ...args);
      }
      terminate() {
        if (this.isScanner) scannerWorkerStops++;
        return super.terminate();
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      scannerCameraRequests++;
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/scryfall/cards/' + card.id) return route.fulfill({ json: card });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate(() => {
    // Recognition-only fixtures test log/settings behaviour independently from
    // the real corner model. Dedicated tests below exercise both live workers.
    window.scannerMockEngine = async () => {
      const engine = await scannerGetEngine();
      Object.defineProperty(engine, 'canPreviewCorners', { value: false, configurable: true });
      return engine;
    };
    state.guild = 'dimir';
    applyTheme();
    state.collection.items = [];
    switchPage('menu');
  });
});

async function openCollectionScanner(page) {
  await page.evaluate(() => switchPage('collection'));
  await page.locator('#colFab').click();
  await page.locator('#fabScanCards').click();
}

async function mockCamera(page, { width, height, source } = {}) {
  await page.route('**/scanner-test-photo.jpg', (route) =>
    route.fulfill({ path: sample, contentType: 'image/jpeg' }),
  );
  await page.evaluate(
    ({ width, height, source }) => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        scannerCameraRequests++;
        window.scannerTestConstraints = constraints;
        const stage = document.querySelector('.scanner-camera-stage');
        const canvas = document.createElement('canvas');
        canvas.width = width || stage.clientWidth * 2;
        canvas.height = height || stage.clientHeight * 2;
        const photo = new Image();
        photo.src = source || '/scanner-test-photo.jpg';
        await photo.decode();
        const context = canvas.getContext('2d');
        const scale = Math.min(canvas.width / photo.width, canvas.height / photo.height);
        window.scannerTestShowCard = true;
        const draw = () => {
          context.fillStyle = '#25282a';
          context.fillRect(0, 0, canvas.width, canvas.height);
          if (scannerTestShowCard)
            context.drawImage(
              photo,
              (canvas.width - photo.width * scale) / 2 + (window.scannerTestOffset || 0),
              (canvas.height - photo.height * scale) / 2,
              photo.width * scale,
              photo.height * scale,
            );
        };
        draw();
        window.scannerTestStream = canvas.captureStream(4);
        clearInterval(window.scannerTestTimer);
        window.scannerTestTimer = setInterval(draw, 200);
        return scannerTestStream;
      };
    },
    { width, height, source },
  );
}

test('scanner exposes the full catalog, threaded backend and live processing timings', async ({ page }, info) => {
  test.setTimeout(90000);
  const diagnostics = await page.evaluate(async () => ({
    isolated: crossOriginIsolated,
    ...(await scannerGetEngine()).diagnostics,
  }));
  expect(diagnostics.isolated).toBe(true);
  expect(diagnostics.numThreads).toBe(info.project.name === 'mobile' ? 2 : 4);
  expect(diagnostics.catalogRows).toBe(109711);
  expect(diagnostics.catalogRows).toBe(diagnostics.catalogTotalRows);
  expect(diagnostics.inferenceMode).toMatch(/WASM|WebGPU/);
  await page.evaluate(() => { state.scannerShowFramerate = true; });
  await mockCamera(page);
  await openCollectionScanner(page);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass'], { timeout: 15000 });
  await expect(page.locator('#scannerBackend')).toContainText('CPU threads');
  await expect(page.locator('#scannerProcessing')).toContainText('Frame');
  await expect(page.locator('#scannerTimings')).toContainText('Lookup');
  await expect(page.locator('#scannerTimings')).toContainText('Warp');
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('thread isolation still loads external images without requiring cross-origin headers', async ({ page, context }) => {
  const cookies = [];
  const imageServer = createServer((req, res) => {
    cookies.push(req.headers.cookie || '');
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB6kAAAAASUVORK5CYII=', 'base64'));
  });
  await new Promise((resolve) => imageServer.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${imageServer.address().port}/pixel.png`;
    await context.addCookies([{ name: 'image-test', value: 'private', domain: '127.0.0.1', path: '/' }]);
    await page.route(url, (route) => route.continue());
    const width = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image.naturalWidth;
    }, url);
    expect(width).toBe(1);
    expect(cookies).toEqual(['']);
  } finally { await new Promise((resolve) => imageServer.close(resolve)); }
});

test('corners follow a moving card while identification is blocked, then success vibrates once', async ({ page }) => {
  test.setTimeout(90000);
  await page.evaluate(async () => {
    const engine = await scannerGetEngine();
    if (!engine.canPreviewCorners) throw new Error('Expected independent corner worker');
    state.scannerShowFramerate = true;
    window.scanMainCalls = 0;
    window.scanMainInFlight = 0;
    window.scanMainMax = 0;
    const recognize = engine.recognize.bind(engine);
    engine.recognize = async (...args) => {
      scanMainMax = Math.max(scanMainMax, ++scanMainInFlight);
      try {
        if (++scanMainCalls === 1) await new Promise(resolve => { window.releaseScanRecognition = resolve; });
        return await recognize(...args);
      } finally { scanMainInFlight--; }
    };
  });
  await mockCamera(page);
  await openCollectionScanner(page);
  await expect.poll(() => page.evaluate(() => !!window.releaseScanRecognition)).toBe(true);
  const before = await page.evaluate(() => scannerCornerFrames);
  const points = await page.locator('#scannerDetectedBorder polygon').getAttribute('points');
  await page.evaluate(() => { window.scannerTestOffset = 18; });
  await expect.poll(() => page.evaluate(() => scannerCornerFrames)).toBeGreaterThanOrEqual(before + 4);
  await expect.poll(() => page.locator('#scannerDetectedBorder polygon').getAttribute('points')).not.toBe(points);
  expect(await page.evaluate(() => scanMainCalls)).toBe(1);
  expect(await page.evaluate(() => scannerScanPulses.length)).toBe(0);
  await expect(page.locator('#scannerCornerRate')).toContainText('Corners');
  await page.evaluate(() => releaseScanRecognition());
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass'], { timeout: 15000 });
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70]);
  expect(await page.evaluate(() => scanMainMax)).toBe(1);
  await expect(page.locator('#scannerCameraVibrationStatus')).toContainText('browser accepted request');
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('corner-worker failure keeps ordinary card scanning available', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/collectorvision/corner.worker.mjs*', route => route.abort());
  await page.evaluate(() => scannerReleaseSession());
  expect(await page.evaluate(async () => (await scannerGetEngine()).canPreviewCorners)).toBe(false);
  await mockCamera(page);
  await openCollectionScanner(page);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass'], { timeout: 15000 });
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70]);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('startup warms recognition without opening the camera; collection and binders reuse it', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.waitForFunction(() => scannerIsReady(), null, { timeout: 75000 });
  expect(await page.evaluate(() => scannerCameraRequests)).toBe(0);
  expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  await expect(page.locator('#cardScannerCamera, #cardScannerOverlay')).toHaveCount(0);
  await mockCamera(page);
  const modelRequests = [];
  page.on('request', (r) => {
    if (/\.(onnx|wasm|bin)(\?|$)/.test(r.url())) modelRequests.push(r.url());
  });
  for (const entry of ['collection', 'binder']) {
    if (entry === 'binder') {
      await page.evaluate(() => {
        state.collection.binders = [{ id: 'warm-scanner', name: 'Scan binder' }];
        openBinderIn('warm-scanner');
      });
      await page.locator('#binderFab').click();
      await expect(page.locator('#bfScanCards')).toHaveText('Scan cards');
      await page.locator('#bfScanCards').click();
    } else await openCollectionScanner(page);
    await expect(page.getByRole('dialog', { name: 'Scan card camera', exact: true })).toBeVisible();
    await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-scanning', 'true');
    expect(await page.evaluate(() => scannerTestConstraints.video.width.ideal)).toBe(
      info.project.name === 'mobile' ? 1080 : 1920,
    );
    expect(await page.evaluate(() => scannerTestConstraints.video.height.ideal)).toBe(
      info.project.name === 'mobile' ? 1920 : 1080,
    );
    expect(await page.evaluate(() => scannerTestConstraints.video.resizeMode.ideal)).toBe('none');
    expect(await page.evaluate(() => scannerTestConstraints.video.frameRate.max)).toBe(30);
    await expect(page.locator('#scannerFile, #scannerPhoto, #scannerCamera')).toHaveCount(0);
    await page.locator('#scannerCameraBack').click();
    await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        scannerTestStream.getTracks().every((t) => t.readyState === 'ended'),
      ),
    ).toBe(true);
    await page.evaluate(() => clearInterval(scannerTestTimer));
    expect(await page.evaluate(() => scannerIsReady())).toBe(true);
  }
  expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  expect(await page.evaluate(() => scannerWorkerStops)).toBe(0);
  expect(modelRequests).toEqual([]);
});

test('live camera logs stable cards once, rearms after removal and keeps the log through review', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors = [],
    uploads = [],
    lookups = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'GET') uploads.push({
      path: new URL(request.url()).pathname,
      body: request.postData(),
      contentType: request.headers()['content-type'],
    });
    if (new URL(request.url()).pathname === '/api/scryfall/cards/' + card.id)
      lookups.push(request.url());
  });
  await mockCamera(page);
  await openCollectionScanner(page);
  const camera = page.getByRole('dialog', { name: 'Scan card camera', exact: true });
  await expect(camera).toBeVisible();
  await expect(page.locator('#scannerCapture')).toHaveCount(0);
  await expect(camera.getByText('Experimental', { exact: true })).toBeVisible();
  const names = page.locator('.scanner-detection-name');
  await expect(names).toHaveText(['Scrying Glass'], { timeout: 75000 });
  await expect(page.locator('#cardScannerOverlay')).toHaveCount(0);
  expect(
    await page.evaluate(() => scannerTestStream.getTracks().every((t) => t.readyState === 'live')),
  ).toBe(true);
  const before = await page.evaluate(() => scannerFramesSent);
  await expect
    .poll(() => page.evaluate(() => scannerFramesSent), { timeout: 8000 })
    .toBeGreaterThanOrEqual(before + 3);
  await expect(names).toHaveCount(1);
  expect(await page.evaluate(() => scannerScanPulses.length)).toBe(1);
  const blank = await page.evaluate(() => {
    scannerTestShowCard = false;
    window.scannerBlankStarted = performance.now();
    return scannerFramesSent + scannerCornerFrames;
  });
  await expect
    .poll(() => page.evaluate(() => scannerFramesSent + scannerCornerFrames), { timeout: 10000 })
    .toBeGreaterThanOrEqual(blank + 4);
  // Removal is a time-based guard, independent of the now faster scan cadence.
  await expect.poll(() => page.evaluate(() => performance.now() - scannerBlankStarted))
    .toBeGreaterThanOrEqual(1800);
  await page.evaluate(() => {
    scannerTestShowCard = true;
  });
  await expect(names).toHaveText(['Scrying Glass', 'Scrying Glass'], { timeout: 10000 });
  expect(await page.evaluate(() => scannerScanPulses.length)).toBe(2);
  const stage = await camera.locator('.scanner-camera-stage').boundingBox();
  const log = await camera.locator('.scanner-log-scroll').boundingBox();
  expect(log.y).toBeGreaterThanOrEqual(stage.y + stage.height);
  const rows = camera.locator('.scanner-detection');
  expect((await rows.first().boundingBox()).y).toBeLessThan((await rows.last().boundingBox()).y);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-live-${info.project.name}.png` });
  expect(await page.evaluate(() => state.collection.items)).toEqual([]);
  expect(lookups).toHaveLength(1);
  await rows.first().getByRole('button', { name: 'Review Scrying Glass', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review scanned card', exact: true });
  await expect(review.locator('.scanner-result h2')).toHaveText('Scrying Glass');
  await expect(review.locator('#scannerAgain, #scannerAdd')).toHaveCount(0);
  await expect(review.locator('.scanner-intro .scanner-badge')).toHaveCount(0);
  await expect(review.locator('.scanner-credits .scanner-badge')).toHaveText('Experimental');
  await expect(review.locator('#acCond')).toHaveValue('NM');
  await expect(review.locator('#acQty')).toHaveValue('1');
  await expect(camera).toHaveAttribute('data-scanning', 'false');
  const reviewing = await page.evaluate(() => scannerFramesSent);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => scannerFramesSent)).toBe(reviewing);
  await review.locator('#scannerClose').click();
  await expect(review).toHaveCount(0);
  await expect(camera).toHaveAttribute('data-scanning', 'true');
  await expect(names).toHaveCount(2);
  expect(await page.evaluate(() => state.collection.items)).toEqual([]);
  await rows.first().getByRole('button', { name: 'Review Scrying Glass', exact: true }).click();
  await review.locator('#acCond + .nsel-btn').click();
  await page.locator('#nselPop').getByRole('button', { name: 'Excellent', exact: true }).click();
  await review.locator('#acFoil').check();
  await review.locator('#acQplus').click();
  await expect(review.locator('#acQty')).toHaveValue('2');
  await page.screenshot({ path: `var/previews/scanner-review-${info.project.name}.png` });
  await expect(page.locator('#addCollOverlay')).toHaveCount(0);
  await review.locator('#acAdd').click();
  await expect(review).toHaveCount(0);
  await expect(page.locator('#addCollOverlay')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => state.collection.items.map((item) => item.name)))
    .toEqual(['Scrying Glass']);
  expect(await page.evaluate(() => state.collection.items[0])).toMatchObject({
    qty: 2,
    cond: 'EX',
    foil: true,
  });
  await expect(camera).toHaveAttribute('data-scanning', 'true');
  await expect(names).toHaveCount(1);
  await expect(page.locator('.scanner-detection-owned')).toHaveText('✓ In collection: 2');
  await camera.locator('#scannerCameraBack').click();
  await expect(camera).toHaveCount(0);
  const closed = await page.evaluate(() => scannerFramesSent);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => scannerFramesSent)).toBe(closed);
  expect(
    await page.evaluate(() => scannerTestStream.getTracks().every((t) => t.readyState === 'ended')),
  ).toBe(true);
  expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  expect(await page.evaluate(() => scannerIsReady())).toBe(true);
  await page.evaluate(() => clearInterval(scannerTestTimer));
  // Collection repricing may POST card identifiers after adding a scan; camera
  // pixels must never be sent. Check the payload rather than banning metadata.
  for (const request of uploads) {
    expect(request.path).toBe('/api/scryfall/cards/collection');
    expect(request.contentType).toContain('application/json');
    const body = JSON.parse(request.body);
    expect(Object.keys(body)).toEqual(['identifiers']);
    for (const identifier of body.identifiers) {
      expect(Object.keys(identifier).every((key) => ['name', 'set', 'id', 'collector_number'].includes(key))).toBe(true);
      expect(JSON.stringify(identifier)).not.toMatch(/data:|base64|blob:/);
    }
  }
  expect(errors).toEqual([]);
});

test('review applies printing and binder choices directly and merges matching collection entries', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const alternate = {
    ...card,
    id: 'scanner-alternate-printing',
    set: 'tst',
    set_name: 'Test printing',
    collector_number: '42',
    prices: { eur: '1.00', eur_foil: '3.00' },
  };
  await page.route('**/api/scryfall/cards/search*', (route) =>
    route.fulfill({ json: { object: 'list', data: [alternate], has_more: false } }),
  );
  // Enter review after a real gesture, as a tap on the scan log does.
  await page.locator('.menu-page .hub-intro h1').click();
  await page.evaluate((card) => {
    state.collection.binders = [
      { id: 'scanner-binder-a', name: 'First foil binder', rules: { finish: ['foil'] } },
      { id: 'scanner-binder-b', name: 'Second foil binder', rules: { finish: ['foil'] } },
    ];
    state.colFilter.binder = '';
    openScannerReview(
      { thumb: '/icon-192.png' },
      { ...card, prints_search_uri: 'https://api.scryfall.com/cards/search?q=scanner-printings' },
    );
  }, card);
  const review = page.getByRole('dialog', { name: 'Review scanned card', exact: true });
  const selectOption = async (id, label) => {
    await review.locator(`#${id} + .nsel-btn`).click();
    await page.locator('#nselPop').getByRole('button', { name: label, exact: true }).click();
  };
  // The original printing remains the default even if the alternatives omit it.
  await expect(review.locator('#acPd .pd-opt')).toHaveCount(2);
  await expect(review.locator('#acPd .pd-btn')).toContainText('UDS');
  await review.locator('#acPd .pd-btn').click();
  await review.locator('#acPd .pd-opt').last().click();
  await expect(review.locator('.scanner-result p')).toHaveText('Test printing · #42');
  await selectOption('acCond', 'Good');
  await review.locator('#acFoil').check();
  await review.locator('#acQty').fill('3');
  await expect(review.locator('#acBinder')).toHaveValue('__auto__');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-review-options-${info.project.name}.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 480 });
  const footer = await review.locator('.scanner-footer').boundingBox();
  expect(footer.y + footer.height).toBeCloseTo(480, 0);
  expect(
    await review.locator('.scanner-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await review.locator('.scanner-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(review.locator('.scanner-credits .scanner-badge')).toBeVisible();
  expect(await review.locator('.scanner-footer').boundingBox()).toEqual(footer);
  await page.setViewportSize(viewport);
  await review.locator('#acAdd').click();
  const conflict = page.locator('#binderConflict');
  await expect(conflict).toBeVisible();
  expect(await conflict.evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(230);
  await conflict.locator('[data-bc="scanner-binder-b"]').click();
  await expect(review).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.items)).toEqual([
    expect.objectContaining({
      name: card.name,
      set: 'tst',
      cn: '42',
      qty: 3,
      cond: 'GD',
      foil: true,
      binder: 'scanner-binder-b',
      eur: 3,
    }),
  ]);
  await page.evaluate((card) => openScannerReview({ thumb: '/icon-192.png' }, card), alternate);
  await selectOption('acCond', 'Good');
  await review.locator('#acFoil').check();
  await review.locator('#acQty').fill('2');
  await selectOption('acBinder', 'Second foil binder');
  await review.locator('#acAdd').click();
  await expect(review).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.items.map((item) => item.qty))).toEqual([5]);
  await page.evaluate((card) => openScannerReview({ thumb: '/icon-192.png' }, card), card);
  await selectOption('acBinder', '＋ New binder…');
  await review.locator('#acAdd').click();
  await expect(page.locator('#inAppPrompt')).toBeVisible();
  await page.locator('#iapCancel').click();
  await expect(review).toBeVisible();
  expect(await page.evaluate(() => state.collection.items.length)).toBe(1);
  await review.locator('#acAdd').click();
  await page.locator('#iapInput').fill('Scanned cards');
  await page.locator('#iapOk').click();
  await expect(review).toHaveCount(0);
  expect(await page.evaluate(() => state.collection.binders.at(-1).name)).toBe('Scanned cards');
  expect(
    await page.evaluate(
      () => state.collection.items[0].binder === state.collection.binders.at(-1).id,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('log order follows detection time even when earlier card details arrive later', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.waitForFunction(() => scannerIsReady(), null, { timeout: 75000 });
  await page.evaluate(async (card) => {
    window.liveResult = {
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 0.99,
      cardId: card.id,
      secondaryId: card.oracle_id,
    };
    window.detailLookups = 0;
    (await scannerMockEngine()).recognize = async () => ({ ...liveResult });
    scannerResolveCard = (result) => {
      detailLookups++;
      if (result.cardId === card.id)
        return new Promise((resolve) => {
          window.finishFirstDetails = () => resolve(card);
        });
      return Promise.resolve({
        id: result.cardId,
        name: 'Sol Ring',
        set_name: 'Test set',
        collector_number: '2',
      });
    };
  }, card);
  await mockCamera(page);
  await openCollectionScanner(page);
  const names = page.locator('.scanner-detection-name');
  await expect(names).toHaveText(['Identifying card…'], { timeout: 10000 });
  await page.evaluate(() => {
    liveResult = {
      ...liveResult,
      cardId: '11111111-1111-4111-8111-111111111111',
      secondaryId: '22222222-2222-4222-8222-222222222222',
    };
  });
  await expect(names).toHaveText(['Sol Ring', 'Identifying card…'], { timeout: 10000 });
  await page.evaluate(() => finishFirstDetails());
  await expect(names).toHaveText(['Sol Ring', 'Scrying Glass']);
  expect(await page.evaluate(() => detailLookups)).toBe(2);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('a failed card lookup stays in the log and retries only when tapped', async ({ page }) => {
  test.setTimeout(90000);
  await page.waitForFunction(() => scannerIsReady(), null, { timeout: 75000 });
  await page.evaluate(async (card) => {
    window.fakeFrames = 0;
    window.detailLookups = 0;
    (await scannerMockEngine()).recognize = async () => {
      fakeFrames++;
      return {
        cardPresent: true,
        cornersValid: true,
        confidence: 1,
        score: 0.99,
        cardId: card.id,
        secondaryId: card.oracle_id,
      };
    };
    scannerResolveCard = async () => {
      if (++detailLookups === 1) throw new Error('Offline');
      return card;
    };
  }, card);
  await mockCamera(page);
  await openCollectionScanner(page);
  const names = page.locator('.scanner-detection-name');
  await expect(names).toHaveText(['Card details unavailable'], { timeout: 10000 });
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([]);
  const frames = await page.evaluate(() => fakeFrames);
  await expect
    .poll(() => page.evaluate(() => fakeFrames), { timeout: 8000 })
    .toBeGreaterThanOrEqual(frames + 3);
  expect(await page.evaluate(() => detailLookups)).toBe(1);
  await page.getByRole('button', { name: 'Retry card details', exact: true }).click();
  await expect(names).toHaveText(['Scrying Glass']);
  expect(await page.evaluate(() => detailLookups)).toBe(2);
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70]);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('session setting distinguishes sets and artwork with the same name and Oracle ID, then ignores only repeat printings', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.waitForFunction(() => scannerIsReady(), null, { timeout: 75000 });
  await page.evaluate(async (card) => {
    state.scannerIgnoreSession = true;
    await persistSettings();
    window.liveResult = {
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 0.99,
      cardId: card.id,
      secondaryId: card.oracle_id,
    };
    window.fakeFrames = 0;
    (await scannerMockEngine()).recognize = async () => {
      fakeFrames++;
      return { ...liveResult };
    };
    scannerResolveCard = async (result) => ({
      ...card,
      id: result.cardId,
      set: result.cardId === '11111111-1111-4111-8111-111111111111' ? 'm3c' : card.set,
      set_name: result.cardId === '11111111-1111-4111-8111-111111111111' ? 'Commander variant' : card.set_name,
      collector_number: result.cardId === '11111111-1111-4111-8111-111111111111' ? '300' : card.collector_number,
      illustration_id: result.cardId === card.id ? 'art-a' : 'art-b',
      name: result.cardId === '33333333-3333-4333-8333-333333333333' ? 'Sol Ring' : card.name,
    });
  }, card);
  await mockCamera(page);
  await openCollectionScanner(page);
  const visibleNames = page.locator('.scanner-detection:not([hidden]) .scanner-detection-name');
  await expect(visibleNames).toHaveText(['Scrying Glass'], { timeout: 10000 });
  await expect(page.locator('#scannerIgnored')).toContainText('Already scanned this printing');
  await expect(page.locator('#scannerIgnored')).toBeHidden({ timeout: 4500 });
  const changed = await page.evaluate(() => {
    liveResult = {
      ...liveResult,
      cardId: '11111111-1111-4111-8111-111111111111',
    };
    return fakeFrames;
  });
  await expect
    .poll(() => page.evaluate(() => fakeFrames), { timeout: 10000 })
    .toBeGreaterThanOrEqual(changed + 3);
  await expect(visibleNames).toHaveText(['Scrying Glass', 'Scrying Glass']);
  await expect(page.locator('#scannerLogCount')).toHaveText('2 cards');
  await expect(page.locator('.scanner-detection-set')).toHaveText(['Commander variant · #300', "Urza's Destiny · #137"]);
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70, 70]);
  await page.evaluate(() => {
    liveResult = {
      ...liveResult,
      cardId: '33333333-3333-4333-8333-333333333333',
      secondaryId: '44444444-4444-4444-8444-444444444444',
    };
  });
  await expect(visibleNames).toHaveText(['Sol Ring', 'Scrying Glass', 'Scrying Glass'], { timeout: 10000 });
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70, 70, 70]);
  await page.evaluate((card) => { liveResult = { ...liveResult, cardId: card.id, secondaryId: card.oracle_id }; }, card);
  await expect(page.locator('#scannerIgnored')).toContainText('Already scanned this printing');
  await expect(visibleNames).toHaveCount(3);
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70, 70, 70]);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
  await openCollectionScanner(page);
  await expect(visibleNames).toHaveText(['Scrying Glass'], { timeout: 10000 });
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([70, 70, 70, 70]);
  expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('live scanning applies thresholds, interval and optional framerate using the same warm engine', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.evaluate(async (card) => {
    const engine = await scannerMockEngine();
    Object.assign(state, {
      scannerIdThreshold: 0.5,
      scannerCornerThreshold: 0.08,
      scannerIntervalMs: 900,
      scannerShowFramerate: true,
    });
    await persistSettings();
    window.scanSettingsFrames = [];
    window.scanSettingsInFlight = 0;
    window.scanSettingsMaxInFlight = 0;
    window.scanSettingsResult = {
      cardPresent: true,
      cornersValid: true,
      confidence: 0.09,
      corners: [
        [0.2, 0.1],
        [0.7, 0.2],
        [0.8, 0.8],
        [0.3, 0.9],
      ],
      score: 0.55,
      cardId: card.id,
      secondaryId: card.oracle_id,
    };
    engine.recognize = async (canvas, options) => {
      scanSettingsFrames.push({
        at: performance.now(),
        cornerThreshold: options.cornerThreshold,
        width: canvas.width,
        height: canvas.height,
      });
      scanSettingsMaxInFlight = Math.max(scanSettingsMaxInFlight, ++scanSettingsInFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return { ...scanSettingsResult, sourceFrame: canvas.scannerSource };
      } finally {
        scanSettingsInFlight--;
      }
    };
  }, card);
  await mockCamera(page, { width: 1280, height: 720 });
  await openCollectionScanner(page);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass'], {
    timeout: 10000,
  });
  const fps = page.locator('#scannerFramerate');
  await expect(fps).toBeVisible();
  await expect(fps).toHaveText(/^\d+\.\d FPS$/);
  await expect(page.locator('#scannerDetectedBorder')).toBeVisible();
  await expect(page.locator('#scannerIgnored')).toBeHidden();
  await expect.poll(() => page.evaluate(() => scanSettingsFrames.length)).toBeGreaterThanOrEqual(3);
  const firstSession = await page.evaluate(() => ({
    frames: scanSettingsFrames,
    maxInFlight: scanSettingsMaxInFlight,
  }));
  expect(firstSession.maxInFlight).toBe(1);
  const stageSize = await page.locator('.scanner-camera-stage').boundingBox();
  expect(firstSession.frames[0].width / firstSession.frames[0].height).toBeCloseTo(
    stageSize.width / stageSize.height,
    2,
  );
  expect(firstSession.frames.every((frame) => frame.cornerThreshold === 0.08)).toBe(true);
  expect(
    firstSession.frames
      .slice(1)
      .every((frame, index) => frame.at - firstSession.frames[index].at >= 850),
  ).toBe(true);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-framerate-${info.project.name}.png` });
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(async () => {
    clearInterval(scannerTestTimer);
    Object.assign(state, {
      scannerIdThreshold: 0.9,
      scannerCornerThreshold: 0.2,
      scannerIntervalMs: 100,
      scannerShowFramerate: false,
    });
    Object.assign(scanSettingsResult, { confidence: 0.3, score: 0.55 });
    scanSettingsFrames = [];
    await persistSettings();
  });
  await mockCamera(page);
  await openCollectionScanner(page);
  await expect.poll(() => page.evaluate(() => scanSettingsFrames.length)).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.scanner-detection-name')).toHaveCount(0);
  await expect(fps).toBeHidden();
  const changedAt = await page.evaluate(() => {
    Object.assign(scanSettingsResult, { confidence: 0.1, score: 0.95 });
    return scanSettingsFrames.length;
  });
  await expect
    .poll(() => page.evaluate(() => scanSettingsFrames.length))
    .toBeGreaterThanOrEqual(changedAt + 3);
  await expect(page.locator('.scanner-detection-name')).toHaveCount(0);
  await page.evaluate(() => {
    scanSettingsResult.confidence = 0.3;
  });
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass']);
  expect(
    await page.evaluate(() => scanSettingsFrames.every((frame) => frame.cornerThreshold === 0.2)),
  ).toBe(true);
  expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('scan log scroll releases and reopens the camera; multiple scans can be selected, added and deleted', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const other = {
    ...card,
    id: '11111111-1111-4111-8111-111111111111',
    oracle_id: '22222222-2222-4222-8222-222222222222',
    name: 'Sol Ring',
  };
  await page.route('**/api/scryfall/cards/' + other.id, (route) => route.fulfill({ json: other }));
  await mockCamera(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(
    async ({ card, other }) => {
      state.scannerIntervalMs = 100;
      state.collection.items = [
        {
          name: card.name,
          set: card.set,
          cn: card.collector_number,
          cond: 'NM',
          qty: 2,
          binder: null,
        },
        {
          name: card.name,
          set: 'other',
          cn: '1',
          cond: 'EX',
          qty: 1,
          foil: true,
          binder: 'binder-a',
        },
      ];
      window.scanLogStep = 0;
      const engine = await scannerMockEngine();
      engine.recognize = async (canvas) => {
        const step = scanLogStep++;
        const found =
          step < 16 ? (Math.floor(step / 2) % 2 ? other : card) : window.scanLogExtra?.shift();
        if (!found) return { cardPresent: false };
        return {
          cardPresent: true,
          cornersValid: true,
          confidence: 1,
          score: 0.99,
          cardId: found.id,
          secondaryId: found.oracle_id,
          thumb: canvas.toDataURL('image/jpeg'),
          sourceFrame: canvas.scannerSource,
        };
      };
      const originalCanvas = scannerImageCanvas;
      scannerImageCanvas = (...args) => (window.scanLogBuffer = originalCanvas(...args));
    },
    { card, other },
  );
  await openCollectionScanner(page);
  await expect(page.locator('.scanner-detection')).toHaveCount(8, { timeout: 15000 });
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(8);
  await expect(page.locator('#scannerCameraStatus')).toBeHidden();
  await expect(page.locator('#cardScannerCamera')).not.toContainText('Move a detected card away');
  await expect(page.locator('.scanner-detection-owned').first()).toHaveText('In collection: 0');
  await expect(page.locator('.scanner-detection-owned').nth(1)).toHaveText('✓ In collection: 3');
  const add = page.locator('#scannerAddAll');
  const selectAll = page.locator('#scannerSelectAll');
  await expect(add).toBeDisabled();
  await expect(selectAll).toBeEnabled();
  // The action itself is safe even if a caller bypasses the disabled button.
  await add.dispatchEvent('click');
  expect(
    await page.evaluate(() => state.collection.items.reduce((n, item) => n + item.qty, 0)),
  ).toBe(3);
  const disabledBackground = await add.evaluate((el) => getComputedStyle(el).backgroundColor);
  const first = page.locator('.scanner-detection-button').first();
  // Moving a finger during a hold cancels selection so a scroll is safe.
  await first.dispatchEvent('pointerdown', {
    button: 0,
    isPrimary: true,
    clientX: 30,
    clientY: 30,
  });
  await first.dispatchEvent('pointermove', { clientX: 30, clientY: 60 });
  await page.waitForTimeout(520);
  await first.dispatchEvent('pointercancel');
  await expect(page.locator('.scanner-detection.selected')).toHaveCount(0);
  await first.dispatchEvent('pointerdown', {
    button: 0,
    isPrimary: true,
    clientX: 30,
    clientY: 30,
  });
  await page.waitForTimeout(520);
  await first.dispatchEvent('pointerup');
  await first.dispatchEvent('click', { detail: 1 });
  await expect(page.locator('.scanner-detection.selected')).toHaveCount(1);
  await expect(add).toBeEnabled();
  expect(await add.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    disabledBackground,
  );
  await expect(page.locator('#cardScannerOverlay')).toHaveCount(0);
  await page.locator('.scanner-detection-button').nth(1).click();
  await expect(page.locator('#scannerClearSelection')).toHaveText('2 selected');
  await page.screenshot({ path: `var/previews/scanner-log-selection-${info.project.name}.png` });
  await page.evaluate(() => {
    window.addedScanPhotos = [...document.querySelectorAll('.scanner-detection.selected img')];
  });
  await add.click();
  await expect(page.locator('.scanner-detection')).toHaveCount(6);
  await expect(page.locator('.scanner-detection.selected')).toHaveCount(0);
  await expect(add).toBeDisabled();
  expect(
    await page.evaluate(() => addedScanPhotos.every((image) => !image.hasAttribute('src'))),
  ).toBe(true);
  await expect(page.locator('.scanner-detection-owned').first()).toHaveText('✓ In collection: 1');
  await expect(page.locator('.scanner-detection-owned').nth(1)).toHaveText('✓ In collection: 4');
  expect(await page.evaluate(() => JSON.stringify(state.collection).includes('data:image'))).toBe(
    false,
  );
  // A keyboard can also select a scan without opening review.
  await first.focus();
  await first.press('Space');
  await page.locator('.scanner-detection-button').nth(1).click();
  await page.locator('#scannerDeleteSelected').click();
  await expect(page.locator('.scanner-detection')).toHaveCount(4);
  expect(
    await page.evaluate(() => state.collection.items.reduce((n, item) => n + item.qty, 0)),
  ).toBe(5);
  const stream = await page.evaluate(() => {
    window.scanLogFirstStream = scannerTestStream;
    window.scanLogFirstBuffer = scanLogBuffer;
    const root = document.querySelector('.scanner-camera-scroll');
    root.scrollTop = root.scrollHeight;
    return scannerCameraRequests;
  });
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-camera-visible', 'false');
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-scanning', 'false');
  expect(
    await page.evaluate(() =>
      scanLogFirstStream.getTracks().every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => scanLogFirstBuffer.width * scanLogFirstBuffer.height)).toBe(0);
  const pinned = await page.evaluate(() => {
    const root = document.querySelector('.scanner-camera-scroll').getBoundingClientRect();
    const toolbar = document.querySelector('.scanner-camera-statusbar').getBoundingClientRect();
    const title = document.querySelector('.scanner-camera-header').getBoundingClientRect();
    return { root: root.top, toolbar: toolbar.top, title: title.bottom };
  });
  expect(pinned.toolbar).toBeCloseTo(pinned.title, 0);
  await page.screenshot({ path: `var/previews/scanner-log-expanded-${info.project.name}.png` });
  await page.evaluate(() => {
    document.querySelector('.scanner-camera-scroll').scrollTop = 0;
  });
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-camera-visible', 'true');
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-scanning', 'true');
  expect(await page.evaluate(() => scannerCameraRequests)).toBe(stream + 1);
  expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  await selectAll.click();
  await expect(page.locator('.scanner-detection.selected')).toHaveCount(4);
  await expect(selectAll).toBeDisabled();
  // New scans require a new selection; Select all is a snapshot of the log.
  await page.evaluate((card) => {
    scanLogExtra = [card, card];
  }, card);
  await expect(page.locator('.scanner-detection')).toHaveCount(5);
  await expect(page.locator('.scanner-detection.selected')).toHaveCount(4);
  await expect(selectAll).toBeEnabled();
  await selectAll.click();
  await expect(page.locator('#scannerClearSelection')).toHaveText('5 selected');
  await page.evaluate(() => {
    window.retainedAddedPhotos = [...document.querySelectorAll('.scanner-detection img')];
  });
  await add.click();
  await expect(page.locator('.scanner-detection')).toHaveCount(0);
  await expect(page.locator('#scannerLogEmpty')).toBeVisible();
  await expect(selectAll).toBeDisabled();
  await expect(add).toBeDisabled();
  expect(
    await page.evaluate(() => retainedAddedPhotos.every((image) => !image.hasAttribute('src'))),
  ).toBe(true);
  expect(
    await page.evaluate(() => state.collection.items.reduce((n, item) => n + item.qty, 0)),
  ).toBe(10);
  await page.evaluate(() => {
    window.retainedScanRoot = document.querySelector('#cardScannerCamera');
    window.retainedScanImages = Array.from(retainedScanRoot.querySelectorAll('img'));
    window.retainedScanBuffer = scanLogBuffer;
  });
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scannerFramesCleared)).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => retainedScanRoot.querySelectorAll('.scanner-detection').length),
  ).toBe(0);
  expect(
    await page.evaluate(() => retainedScanImages.every((image) => !image.hasAttribute('src'))),
  ).toBe(true);
  expect(await page.evaluate(() => retainedScanBuffer.width * retainedScanBuffer.height)).toBe(0);
  expect(
    await page.evaluate(() =>
      scannerTestStream.getTracks().every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => scannerIsReady())).toBe(true);
  expect(errors).toEqual([]);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('Scan deck preserves every physical copy and registers ownership for existing and new decks', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const other = {
    ...card,
    id: '11111111-1111-4111-8111-111111111111',
    oracle_id: '22222222-2222-4222-8222-222222222222',
    name: 'Sol Ring',
  };
  await page.route('**/api/scryfall/cards/' + other.id, (route) => route.fulfill({ json: other }));
  await mockCamera(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(
    async ({ card, other }) => {
      state.guild = 'dimir';
      applyTheme();
      state.scannerIgnoreSession = true;
      state.scannerIntervalMs = 100;
      window.deckScanQueue = [card, card, other, other, card, card];
      (await scannerMockEngine()).recognize = async (canvas) => {
        const found = deckScanQueue.shift();
        return found
          ? {
              cardPresent: true,
              cornersValid: true,
              confidence: 1,
              score: 0.99,
              cardId: found.id,
              secondaryId: found.oracle_id,
              sourceFrame: canvas.scannerSource,
            }
          : { cardPresent: false };
      };
      window.deckScanOriginal = createNewDeck('Existing deck', 'modern', null, null, {
        open: false,
      });
      deckScanOriginal.cards.push({ ...other, id: 'already-in-deck' });
      await persistDeck(deckScanOriginal);
      switchPage('decks');
    },
    { card, other },
  );
  await page.locator('#deckFab').click();
  await page.locator('#fabScanDeck').click();
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-mode', 'deck');
  await expect(page.locator('.scanner-camera-header .brand-txt')).toHaveText('Scan deck');
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(3);
  expect(
    await page.evaluate(() => state.scannerIgnoreSession),
  ).toBe(true);
  await expect(page.locator('#scannerAddAll')).toBeDisabled();
  await page.locator('#scannerAddAll').dispatchEvent('click');
  await expect(page.locator('#scannerDeckPicker')).toHaveCount(0);
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  const picker = page.locator('#scannerDeckPicker');
  await expect(picker.getByRole('dialog', { name: 'Add to deck', exact: true })).toBeVisible();
  await picker.locator('#scannerDeckCancel').click();
  await expect(picker).toHaveCount(0);
  expect(await page.evaluate(() => deckScanOriginal.cards.length)).toBe(1);
  await page.locator('#scannerAddAll').click();
  await picker.locator('#scannerCreateDeck').click();
  await expect(page.getByRole('dialog', { name: 'New Deck', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.nd-sheet')).toHaveCount(0);
  await expect(picker).toBeVisible();
  expect(await picker.evaluate((el) => el.inert)).toBe(false);
  await picker.getByRole('button', { name: 'Add to Existing deck', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('#scannerAddAll')).toBeDisabled();
  expect(await page.evaluate(() => deckScanOriginal.cards.map((card) => card.id))).toEqual([
    'already-in-deck',
    card.id,
    other.id,
    card.id,
  ]);
  expect(
    await page.evaluate(() => state.collection.items.reduce((total, item) => total + item.qty, 0)),
  ).toBe(3);
  await expect(page.locator('.scanner-detection-owned').first()).toContainText(
    'Added to Existing deck',
  );
  await page.evaluate(
    ({ card, other }) => {
      deckScanQueue = [other, other, card, card];
    },
    { card, other },
  );
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(5);
  await expect(page.locator('#scannerAddAll')).toBeDisabled();
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  await picker.locator('#scannerCreateDeck').click();
  await page.locator('#newDeckName').fill('Scanned deck');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/new-deck-themed-${info.project.name}.png` });
  await page.locator('#newDeckFmtBtn').click();
  await page.locator('[data-ndfmt="modern"]').click();
  await page.locator('#createBtn').click();
  await expect(page.locator('.nd-sheet')).toHaveCount(0);
  await expect(picker).toHaveCount(0);
  await expect(page.locator('#cardScannerCamera')).toBeVisible();
  await expect(page.locator('#scannerAddAll')).toBeDisabled();
  const created = await page.evaluate(() => {
    const deck = state.decksIndex.find((deck) => deck.name === 'Scanned deck');
    return {
      id: deck.id,
      format: deck.format,
      cards: deck.cards.map((card) => ({ id: card.id, pin: card.pin })),
    };
  });
  expect(created.format).toBe('modern');
  expect(created.cards).toEqual([
    { id: other.id, pin: true },
    { id: card.id, pin: true },
  ]);
  expect(
    await page.evaluate(() => state.collection.items.reduce((total, item) => total + item.qty, 0)),
  ).toBe(5);
  // Single-card review in deck mode also offers a deck destination.
  await page.evaluate((other) => {
    deckScanQueue = [other, other];
  }, other);
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(6);
  await page.locator('.scanner-detection-button').first().click();
  const review = page.locator('#cardScannerOverlay');
  await expect(review.locator('#acAdd, .scanner-collection')).toHaveCount(0);
  await review.locator('#scannerReviewDeckAdd').click();
  await picker.getByRole('button', { name: 'Add to Existing deck', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(review).toHaveCount(0);
  expect(await page.evaluate(() => deckScanOriginal.cards.length)).toBe(5);
  await expect(page.locator('#scannerAddAll')).toBeDisabled();
  // Navigating away while the nested creation dialog is open cancels it too.
  await page.evaluate((card) => {
    deckScanQueue = [card, card];
  }, card);
  await expect(page.locator('.scanner-detection[data-state="ready"]')).toHaveCount(7);
  await expect(page.locator('#scannerAddAll')).toBeDisabled();
  await page.locator('#scannerSelectAll').click();
  await page.locator('#scannerAddAll').click();
  await picker.locator('#scannerCreateDeck').click();
  await page.locator('#newDeckName').fill('Cancelled scan deck');
  await page.evaluate(() => dismissAllOverlays());
  await expect(page.locator('#cardScannerCamera, #scannerDeckPicker, .nd-sheet')).toHaveCount(0);
  expect(await page.evaluate(() => state.overlayStack.length)).toBe(0);
  expect(
    await page.evaluate(() => state.decksIndex.some((deck) => deck.name === 'Cancelled scan deck')),
  ).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const all = await deckDbAll();
        return Object.values(all)
          .map((raw) => JSON.parse(raw))
          .filter((deck) => deck.name === 'Scanned deck' || deck.name === 'Existing deck')
          .map((deck) => ({ name: deck.name, cards: deck.cards.length }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }),
    )
    .toEqual([
      { name: 'Existing deck', cards: 5 },
      { name: 'Scanned deck', cards: 2 },
    ]);
  await page.evaluate(() => clearInterval(scannerTestTimer));
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          state.decksIndex.filter(
            (deck) => deck.name === 'Scanned deck' || deck.name === 'Existing deck',
          ).length,
      ),
    )
    .toBe(2);
  expect(errors).toEqual([]);
});

test('slow inference preserves preview quality; refocus and resolution reporting use the live camera', async ({
  page,
}) => {
  test.setTimeout(90000);
  await mockCamera(page, { width: 1920, height: 1080 });
  await page.evaluate(async (card) => {
    state.scannerIntervalMs = 100;
    state.scannerShowFramerate = true;
    window.captureChanges = [];
    window.analysisSizes = [];
    window.analysisReused = true;
    window.captureSettings = { width: 1920, height: 1080 };
    window.captureCurrent = {};
    const originalGetMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      captureCurrent = constraints.video;
      const stream = await originalGetMedia(constraints);
      const track = stream.getVideoTracks()[0];
      navigator.mediaDevices.getSupportedConstraints = () => ({ pointsOfInterest: true });
      track.getCapabilities = () => ({ focusMode: ['manual', 'continuous'] });
      track.getSettings = () => ({ ...captureSettings });
      track.getConstraints = () => captureCurrent;
      track.applyConstraints = async (value) => {
        captureCurrent = JSON.parse(JSON.stringify(value));
        captureChanges.push(captureCurrent);
        if (value.width?.max) {
          captureSettings.width = value.width.max;
          captureSettings.height = value.height.max;
        }
      };
      return stream;
    };
    (await scannerMockEngine()).recognize = async (canvas) => {
      analysisReused = analysisReused && (!window.analysisFirst || analysisFirst === canvas);
      window.analysisFirst = canvas;
      analysisSizes.push({ width: canvas.width, height: canvas.height });
      await new Promise((resolve) => setTimeout(resolve, 160));
      return {
        cardPresent: true,
        cornersValid: true,
        confidence: 1,
        score: 0.99,
        cardId: card.id,
        secondaryId: card.oracle_id,
        sourceFrame: canvas.scannerSource,
      };
    };
  }, card);
  await openCollectionScanner(page);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass']);
  // The old downgrade triggered after seven over-budget frames. Let twelve finish.
  await expect
    .poll(() => page.evaluate(() => analysisSizes.length), { timeout: 10000 })
    .toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => captureChanges.length)).toBe(1);
  await expect(page.locator('#scannerCameraResolution')).toHaveText('1920 × 1080');
  const focusButton = page.locator('#scannerFocus');
  await expect(focusButton).toBeVisible();
  const stage = await focusButton.boundingBox();
  await focusButton.click({ position: { x: stage.width / 4, y: stage.height / 2 } });
  await expect.poll(() => page.evaluate(() => captureChanges.length)).toBe(2);
  const result = await page.evaluate(() => ({
    changes: captureChanges,
    sizes: analysisSizes,
    reused: analysisReused,
    requests: scannerCameraRequests,
    workers: scannerWorkerCreates,
    interval: state.scannerIntervalMs,
  }));
  expect(result.changes[0].advanced).toEqual([{ focusMode: 'continuous' }]);
  expect(result.changes.every((change) => !change.width?.max && !change.height?.max)).toBe(true);
  const focused = result.changes[1].advanced.at(-1);
  expect(focused.focusMode).toBe('continuous');
  expect(focused.pointsOfInterest[0].x).toBeLessThan(0.5);
  expect(focused.pointsOfInterest[0].y).toBeCloseTo(0.5, 2);
  expect(result.sizes.every((size) => size.width * size.height <= 1280 * 720)).toBe(true);
  expect(result.reused).toBe(true);
  expect(result.requests).toBe(1);
  expect(result.workers).toBe(1);
  expect(result.interval).toBe(100);
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-scanning', 'true');
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      scannerTestStream.getTracks().every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('Blank Card predictions never create rows, lookups, borders or ignore notices', async ({
  page,
}) => {
  test.setTimeout(90000);
  const lookups = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/scryfall\/cards\/[a-f0-9-]{36}$/i.test(path)) lookups.push(path);
  });
  await page.evaluate(async () => {
    Object.assign(state, {
      scannerIgnoreSession: true,
      scannerIntervalMs: 100,
    });
    window.blankTestFrames = 0;
    window.blankTestResult = {
      cardId: '8625b50d-474d-46dd-af84-0b267ed5fab3',
      secondaryId: 'd3e7bc24-c2b0-4be3-b9d9-8a8d23b93bc7',
      cardPresent: true,
      cornersValid: true,
      confidence: 1,
      score: 1,
      corners: [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
        [0.1, 0.9],
      ],
    };
    (await scannerMockEngine()).recognize = async (canvas) => {
      blankTestFrames++;
      return { ...blankTestResult, sourceFrame: canvas.scannerSource };
    };
  });
  await mockCamera(page, { width: 1280, height: 720 });
  await openCollectionScanner(page);
  await expect.poll(() => page.evaluate(() => blankTestFrames)).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.scanner-detection')).toHaveCount(0);
  expect(await page.evaluate(() => scannerScanPulses)).toEqual([]);
  await expect(page.locator('#scannerIgnored')).toBeHidden();
  await expect(page.locator('#scannerDetectedBorder')).toBeHidden();
  await expect(page.locator('.scanner-camera-hint')).toHaveCount(0);
  expect(lookups).toEqual([]);
  await page.evaluate((card) => {
    blankTestResult = { ...blankTestResult, cardId: card.id, secondaryId: card.oracle_id };
  }, card);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass']);
  await expect(page.locator('#scannerDetectedBorder')).toBeVisible();
  await expect(page.locator('#scannerIgnored')).toContainText('Already scanned this printing');
  const changed = await page.evaluate(() => {
    blankTestResult = {
      ...blankTestResult,
      cardId: '0e590dad-570d-4784-9aae-d85d2980c22b',
      secondaryId: null,
    };
    return blankTestFrames;
  });
  await expect.poll(() => page.evaluate(() => blankTestFrames)).toBeGreaterThanOrEqual(changed + 3);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass']);
  await expect(page.locator('#scannerIgnored')).toBeHidden();
  await expect(page.locator('#scannerDetectedBorder')).toBeHidden();
  expect(lookups).toEqual(['/api/scryfall/cards/' + card.id]);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('Fastweb recognizes smaller off-center cards in perspective and draws their detected border', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const scenes = await makeScannerPerspectiveScenes(page);
  const results = await page.evaluate(async (scenes) => {
    const engine = await scannerGetEngine();
    const results = [];
    for (const scene of scenes) {
      const photo = new Image();
      photo.src = scene;
      await photo.decode();
      const found = await engine.recognize(scannerImageCanvas(photo));
      results.push({
        id: found.cardId,
        score: found.score,
        confidence: found.confidence,
        error: scannerRecognitionError(found),
        corners: found.corners,
        frameWidth: found.frameWidth,
        frameHeight: found.frameHeight,
      });
    }
    return results;
  }, scenes);
  for (const result of results) {
    expect(result).toMatchObject({ id: card.id, error: '', frameWidth: 960, frameHeight: 720 });
    expect(result.corners).toHaveLength(4);
  }
  const balanced = await page.evaluate(async (scene) => {
    const image = new Image();
    image.src = scene;
    await image.decode();
    const sources = [720, 1080].map((height) => {
      const canvas = document.createElement('canvas');
      canvas.width = (height * 16) / 9;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#303236';
      context.fillRect(0, 0, canvas.width, height);
      const scale = height / image.height;
      context.drawImage(
        image,
        (canvas.width - image.width * scale) / 2,
        0,
        image.width * scale,
        height,
      );
      return canvas;
    });
    const engine = await scannerGetEngine(),
      runs = [];
    let analysis;
    for (let round = 0; round < 4; round++)
      for (const source of sources) {
        const started = performance.now();
        analysis = scannerImageCanvas(source, { clientWidth: 390, clientHeight: 371 }, analysis);
        const result = await engine.recognize(analysis, { thumbnail: false });
        runs.push({
          sourceHeight: source.height,
          width: analysis.width,
          height: analysis.height,
          id: result.cardId,
          ms: performance.now() - started,
        });
      }
    return runs;
  }, scenes[0]);
  expect(new Set(balanced.map((run) => run.width + 'x' + run.height)).size).toBe(1);
  expect(balanced.every((run) => run.id === card.id && run.width * run.height <= 1280 * 720)).toBe(
    true,
  );
  await info.attach('balanced-capture-measurements', {
    body: JSON.stringify(balanced),
    contentType: 'application/json',
  });
  await mockCamera(page, { source: scenes[0] });
  await openCollectionScanner(page);
  await expect(page.locator('.scanner-detection-name')).toHaveText(['Scrying Glass'], {
    timeout: 10000,
  });
  const border = page.locator('#scannerDetectedBorder');
  await expect(border).toBeVisible();
  expect((await border.locator('polygon').getAttribute('points')).split(' ')).toHaveLength(4);
  await expect(page.locator('.scanner-camera-guide')).toHaveCount(0);
  await expect(page.locator('#scannerVideo')).toHaveCSS('object-fit', 'cover');
  await expect(page.locator('.scanner-camera-hint')).toHaveCount(0);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/scanner-perspective-${info.project.name}.png` });
  const before = await border.getAttribute('viewBox');
  await page.setViewportSize({ width: 640, height: 390 });
  await expect.poll(() => border.getAttribute('viewBox')).not.toBe(before);
  await page.evaluate(() => {
    scannerTestShowCard = false;
  });
  await expect(border).toBeHidden({ timeout: 10000 });
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test('shared recognition handles rotated cards and canceled scans without replacing the worker', async ({
  page,
}) => {
  test.setTimeout(90000);
  const result = await page.evaluate(async () => {
    const engine = await scannerGetEngine();
    const photo = new Image();
    photo.src = SCANNER_ASSET_BASE + '/assets/samples/mtg-sample.jpg';
    await photo.decode();
    const canvas = scannerImageCanvas(photo);
    const rotated = document.createElement('canvas');
    rotated.width = canvas.width;
    rotated.height = canvas.height;
    const context = rotated.getContext('2d');
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
    context.drawImage(canvas, 0, 0);
    const controller = new AbortController();
    const before = scannerFramesSent;
    const canceled = engine.recognize(rotated, { signal: controller.signal }).catch((e) => e.name);
    while (scannerFramesSent === before) await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    const canceledName = await canceled;
    const found = await engine.recognize(rotated);
    const strict = await engine.recognize(rotated, { cornerThreshold: 1 });
    const restored = await engine.recognize(rotated, { cornerThreshold: 0 });
    context.resetTransform();
    context.fillStyle = '#888';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const empty = await engine.recognize(rotated);
    return {
      canceledName,
      id: found.cardId,
      error: scannerRecognitionError(found),
      confidence: found.confidence,
      strictPresent: strict.cardPresent,
      restoredId: restored.cardId,
      emptyError: scannerRecognitionError(empty),
      ready: scannerIsReady(),
      creates: scannerWorkerCreates,
    };
  });
  expect(result.canceledName).toBe('AbortError');
  expect(result.id).toBe(card.id);
  expect(result.error).toBe('');
  expect(result.strictPresent).toBe(result.confidence >= 1);
  expect(result.restoredId).toBe(card.id);
  expect(result.emptyError).not.toBe('');
  expect(result.ready).toBe(true);
  expect(result.creates).toBe(1);
});

test('denial, back, backgrounding and late permission replies close only the camera', async ({
  page,
}) => {
  await openCollectionScanner(page);
  await expect(page.locator('#scannerCameraStatus')).toContainText(
    'Camera permission was declined',
  );
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera, #cardScannerOverlay')).toHaveCount(0);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => (window.finishScannerPermission = resolve));
  });
  await openCollectionScanner(page);
  await expect.poll(() => page.evaluate(() => typeof finishScannerPermission)).toBe('function');
  await page.goBack();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => {
    window.scannerTrackStopped = false;
    finishScannerPermission({ getTracks: () => [{ stop: () => (scannerTrackStopped = true) }] });
  });
  await expect.poll(() => page.evaluate(() => scannerTrackStopped)).toBe(true);
  await mockCamera(page);
  await openCollectionScanner(page);
  await expect(page.locator('#cardScannerCamera')).toHaveAttribute('data-scanning', 'true', {
    timeout: 75000,
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#scannerCameraStatus')).toHaveText('Camera paused.');
  expect(
    await page.evaluate(() => scannerTestStream.getTracks().every((t) => t.readyState === 'ended')),
  ).toBe(true);
  expect(await page.evaluate(() => scannerIsReady())).toBe(true);
  await page.locator('#scannerCameraBack').click();
  await expect(page.locator('#cardScannerCamera')).toHaveCount(0);
  await page.evaluate(() => clearInterval(scannerTestTimer));
});

test.describe('recognition cache across launches', () => {
  test.use({ serviceWorkers: 'allow' });
  test('a new offline launch warms from cached models and runtime without camera permission', async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 15000,
    });
    await page.waitForFunction(() => scannerIsReady(), null, { timeout: 75000 });
    const cached = await page.evaluate(async () => {
      const name = (await caches.keys()).find((name) => name.startsWith('deckhand-scanner-'));
      return name ? (await (await caches.open(name)).keys()).map((r) => r.url) : [];
    });
    expect(cached.some((url) => url.endsWith('.wasm'))).toBe(true);
    expect(
      cached.some((url) => {
        const parsed = new URL(url);
        return (
          parsed.pathname.endsWith('/assets/manifest.json') &&
          parsed.searchParams.get('detector') === 'fastweb-single-1.39-05d2b90b928a'
        );
      }),
    ).toBe(true);
    const data = 'data:image/jpeg;base64,' + (await readFile(sample)).toString('base64');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => scannerIsReady(), null, { timeout: 30000 });
    const id = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const engine = await scannerGetEngine();
      return (await engine.recognize(scannerImageCanvas(image))).cardId;
    }, data);
    expect(id).toBe(card.id);
    expect(await page.evaluate(() => scannerCameraRequests)).toBe(0);
    expect(await page.evaluate(() => scannerWorkerCreates)).toBe(1);
  });
});
