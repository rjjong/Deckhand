import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = vm.createContext({});
vm.runInContext(
  await readFile(new URL('../src/features/scanner/engine.js', import.meta.url), 'utf8'),
  context,
);
vm.runInContext(
  await readFile(new URL('../src/features/scanner/tracking.js', import.meta.url), 'utf8'),
  context,
);
vm.runInContext(
  await readFile(new URL('../src/features/scanner/preview.js', import.meta.url), 'utf8'),
  context,
);
vm.runInContext(
  await readFile(new URL('../src/core/preferences.js', import.meta.url), 'utf8'),
  context,
);

test('removed debounce preferences never suppress repeat scans', () => {
  const filter = context.scannerCreateRepeatFilter({ debounceMs: 60000 });
  const card = { id: 'printing-a', name: 'Sol Ring' };
  assert.equal(filter.accept(card, 0), true);
  assert.equal(filter.accept(card, 1), true);
  assert.equal(filter.reason(card, 2), null);
});

test('scanner haptics use one short pulse and unsupported browsers do not interrupt scanning', () => {
  const calls = [];
  context.navigator = { vibrate: (pattern) => { calls.push(pattern); return true; } };
  assert.equal(context.scannerScanFeedback().status, 'requested');
  assert.deepEqual(calls, [70]);
  context.navigator = {};
  assert.equal(context.scannerScanFeedback().status, 'unsupported');
  context.navigator = { vibrate: () => { throw new Error('Blocked by browser'); } };
  assert.equal(context.scannerScanFeedback().status, 'rejected');
  delete context.navigator;
});

test('vibration diagnostics distinguish missing activation, background pages and rejected requests', () => {
  const calls = [];
  context.document = { visibilityState: 'visible' };
  context.navigator = { userActivation: { hasBeenActive: false }, vibrate: (pattern) => { calls.push(pattern); return true; } };
  assert.equal(context.scannerScanFeedback().status, 'needs-tap');
  assert.equal(calls.length, 0);
  context.navigator.userActivation.hasBeenActive = true;
  context.document.visibilityState = 'hidden';
  assert.equal(context.scannerScanFeedback().status, 'hidden');
  assert.equal(calls.length, 0);
  context.document.visibilityState = 'visible';
  assert.equal(context.scannerRequestVibration([180, 100, 180], 'test').source, 'test');
  assert.equal(calls.length, 1);
  context.navigator.vibrate = () => false;
  const rejected = context.scannerScanFeedback();
  assert.equal(rejected.status, 'rejected');
  assert.match(context.scannerVibrationMessage(rejected), /rejected/);
  assert.match(context.scannerVibrationMessage({ status: 'requested' }), /may be suppressing/);
  delete context.navigator;
  delete context.document;
});

test('independent corners reserve extra memory only on capable isolated devices', () => {
  context.crossOriginIsolated = true;
  const android = { userAgent: 'Android', hardwareConcurrency: 8, deviceMemory: 8 };
  assert.equal(context.scannerCanRunCornerWorker(android), true);
  assert.equal(context.scannerCanRunCornerWorker({ ...android, hardwareConcurrency: 2 }), false);
  assert.equal(context.scannerCanRunCornerWorker({ ...android, deviceMemory: 2 }), false);
  assert.equal(context.scannerCanRunCornerWorker({ ...android, userAgent: 'iPhone' }), false);
  context.crossOriginIsolated = false;
  assert.equal(context.scannerCanRunCornerWorker(android), false);
});

test('session filtering ignores exact printing IDs, while sets, artwork and similar names remain separate', () => {
  const filter = context.scannerCreateRepeatFilter({ ignoreSession: true });
  const first = { id: 'printing-a', name: 'Sol Ring', oracle_id: 'same-oracle', set: 'c21', illustration_id: 'art-a' };
  const other = { ...first, id: 'printing-b', set: 'm3c', illustration_id: 'art-b' };
  assert.equal(filter.accept(first), true);
  assert.equal(filter.accept(other), true);
  assert.equal(filter.accept({ ...other, id: 'printing-c', name: 'Sol Ring Variant' }), true);
  assert.equal(filter.accept({ ...first, name: 'Renamed card' }), false);
  assert.equal(filter.reason({ cardId: 'PRINTING-A', secondaryId: 'different-oracle' }), 'session');
  assert.equal(filter.reason({ name: 'Sol Ring', oracle_id: 'same-oracle' }), null);
  assert.equal(
    context.scannerCreateRepeatFilter({ ignoreSession: true }).accept(first),
    true,
  );
});

test('scanner settings normalize missing, malformed and out-of-range saved values', () => {
  const normalize = (value) => JSON.parse(JSON.stringify(context.normalizeScannerSettings(value)));
  const defaults = {
    scannerIgnoreSession: false,
    scannerIdThreshold: 0.6,
    scannerCornerThreshold: 0.02,
    scannerIntervalMs: 200,
    scannerShowFramerate: false,
  };
  assert.deepEqual(normalize({}), defaults);
  assert.deepEqual(normalize(null), defaults);
  assert.deepEqual(normalize({ scannerDebounceMs: 2500, scannerIgnoreSession: true }), {
    ...defaults,
    scannerIgnoreSession: true,
  });
  assert.equal(Object.hasOwn(normalize({ scannerDebounceMs: 60000 }), 'scannerDebounceMs'), false);
  assert.equal(
    normalize({ scannerDebounceMs: '3000', scannerIgnoreSession: 'true' }).scannerIgnoreSession,
    false,
  );
  assert.equal(normalize({ scannerIdThreshold: 2 }).scannerIdThreshold, 1);
  assert.equal(normalize({ scannerCornerThreshold: -1 }).scannerCornerThreshold, 0);
  assert.equal(normalize({ scannerIdThreshold: NaN }).scannerIdThreshold, 0.6);
  assert.equal(normalize({ scannerCornerThreshold: '0.1' }).scannerCornerThreshold, 0.02);
  assert.equal(normalize({ scannerIntervalMs: 0 }).scannerIntervalMs, 100);
  assert.equal(normalize({ scannerIntervalMs: 20000 }).scannerIntervalMs, 10000);
  assert.equal(normalize({ scannerIntervalMs: 750.7 }).scannerIntervalMs, 751);
  assert.equal(normalize({ scannerShowFramerate: 'true' }).scannerShowFramerate, false);
  assert.equal(normalize({ scannerShowFramerate: true }).scannerShowFramerate, true);
});

test('scanner rejects absent cards, uncertain matches and invalid catalog identifiers', () => {
  const valid = {
    cardPresent: true,
    cornersValid: true,
    confidence: 0.2,
    score: 0.92,
    cardId: '7286819f-6c57-4503-898c-528786ad86e9',
  };
  assert.equal(context.scannerRecognitionError(valid), '');
  assert.match(context.scannerRecognitionError({ ...valid, cardPresent: false }), /corners/);
  assert.match(context.scannerRecognitionError({ ...valid, cornersValid: false }), /corners/);
  for (const score of [0.59, null, NaN])
    assert.match(context.scannerRecognitionError({ ...valid, score }), /confident/);
  assert.match(context.scannerRecognitionError({ ...valid, cardId: '../sets' }), /confident/);
});

test('scanner thresholds filter both identity score and corner confidence before stable confirmation', () => {
  const result = {
    cardPresent: true,
    cornersValid: true,
    confidence: 0.08,
    score: 0.55,
    cardId: '7286819f-6c57-4503-898c-528786ad86e9',
  };
  const thresholds = { idThreshold: 0.5, cornerThreshold: 0.08 };
  assert.equal(context.scannerRecognitionError(result, thresholds), '');
  assert.match(
    context.scannerRecognitionError(result, { ...thresholds, idThreshold: 0.56 }),
    /confident/,
  );
  assert.match(
    context.scannerRecognitionError(result, { ...thresholds, cornerThreshold: 0.09 }),
    /corners/,
  );
  assert.match(
    context.scannerRecognitionError({ ...result, confidence: NaN }, thresholds),
    /corners/,
  );
  const tracker = context.scannerCreateTracker(thresholds);
  assert.equal(tracker.observe(result, 0), null);
  assert.equal(tracker.observe({ ...result, confidence: 0.07 }, 100), null);
  assert.equal(tracker.observe(result, 200), null);
  assert.equal(tracker.observe(result, 300), result);
});

test('scan framerate includes the scan interval and resets after a pause', () => {
  const rate = context.scannerCreateFramerate();
  assert.equal(rate.record(0), null);
  assert.equal(rate.record(500), 2);
  assert.equal(rate.record(1500), 1000 / 750);
  rate.reset();
  assert.equal(rate.record(10000), null);
  assert.equal(rate.record(20000), 0.1);
  for (let at = 20500; at <= 23500; at += 500) rate.record(at);
  assert.equal(rate.record(24000), 2);
});

test('camera recognition sees the same center crop as portrait and landscape previews', () => {
  const portrait = context.scannerFrameRect(1920, 1080, 390, 650);
  assert.equal(portrait.width, 648);
  assert.equal(portrait.height, 1080);
  assert.equal(portrait.x, 636);
  assert.equal(portrait.y, 0);
  const landscape = context.scannerFrameRect(720, 1280, 1280, 720);
  assert.equal(landscape.width, 720);
  assert.equal(landscape.x, 0);
  assert.equal(landscape.height, 405);
  assert.equal(landscape.y, 437.5);
  assert.deepEqual(JSON.parse(JSON.stringify(context.scannerFrameRect(1280, 960))), {
    x: 0,
    y: 0,
    width: 1280,
    height: 960,
  });
});

test('detected outlines follow the aspect-preserving preview crop and captured region', () => {
  const rect = context.scannerPreviewRect(1920, 1080, 390, 650);
  assert.equal(rect.height, 650);
  assert.ok(Math.abs(rect.width - 1155.5555555555557) < 1e-6);
  assert.ok(rect.x < 0);
  assert.equal(rect.y, 0);
  const result = {
    cardPresent: true,
    cornersValid: true,
    confidence: 0.08,
    corners: [
      [0.2, 0.1],
      [0.8, 0.2],
      [0.7, 0.9],
      [0.1, 0.8],
    ],
  };
  const points = context.scannerOutlinePoints(result, rect, 0.08);
  assert.ok(Math.abs(points[0][0] - -151.66666666666669) < 1e-6);
  assert.equal(points[0][1], 65);
  const cropped = {
    ...result,
    sourceFrame: { width: 1920, height: 1080, x: 636, y: 0, cropWidth: 648, cropHeight: 1080 },
  };
  const cropPoints = context.scannerOutlinePoints(cropped, rect);
  assert.ok(Math.abs(cropPoints[0][0] - 78) < 1e-6);
  assert.equal(cropPoints[0][1], 65);
  const resized = context.scannerOutlinePoints(
    cropped,
    context.scannerPreviewRect(1920, 1080, 1280, 720),
  );
  assert.ok(Math.abs(resized[0][0] - 510.4) < 1e-6);
  assert.equal(resized[0][1], 72);
  assert.equal(context.scannerOutlinePoints(result, rect, 0.09), null);
  assert.equal(context.scannerOutlinePoints({ ...result, cornersValid: false }, rect), null);
  assert.equal(
    context.scannerOutlinePoints(
      { ...result, corners: [[NaN, 0], ...result.corners.slice(1)] },
      rect,
    ),
    null,
  );
  assert.equal(
    context.scannerOutlinePoints(
      { ...result, corners: [[-0.1, 0], ...result.corners.slice(1)] },
      rect,
    ),
    null,
  );
  const wide = context.scannerPreviewRect(720, 1280, 1280, 720);
  assert.equal(wide.x, 0);
  assert.equal(wide.width, 1280);
  assert.ok(wide.y < 0);
  assert.ok(wide.height > 720);
  assert.equal(context.scannerPreviewRect(0, 0, 390, 650), null);
});

test('Blank Card is silently excluded by printing ID, shared oracle ID and name', () => {
  for (const card of [
    { cardId: '8625b50d-474d-46dd-af84-0b267ed5fab3' },
    { cardId: '0af68815-ffe6-4640-9500-b98a6cb757c7_back' },
    { secondaryId: 'd3e7bc24-c2b0-4be3-b9d9-8a8d23b93bc7' },
    { oracle_id: 'd3e7bc24-c2b0-4be3-b9d9-8a8d23b93bc7' },
    { cardName: 'Blank Card' },
    { name: '  blank card  ' },
  ])
    assert.equal(context.scannerIsIgnoredCard(card), true);
  assert.equal(context.scannerIsIgnoredCard({ name: 'Black Lotus' }), false);
  const blank = {
    cardId: '8625b50d-474d-46dd-af84-0b267ed5fab3',
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
  const tracker = context.scannerCreateTracker();
  assert.equal(tracker.observe(blank, 0), null);
  assert.equal(tracker.observe(blank, 1000), null);
  assert.equal(
    context.scannerOutlinePoints(blank, context.scannerPreviewRect(1280, 720, 390, 400)),
    null,
  );
});

test('the recognition worker rectifies a tilted quadrilateral to the embedding input', async () => {
  const worker = await readFile(
    new URL('../assets/scanner/collectorvision/scanner.worker.mjs', import.meta.url),
    'utf8',
  );
  const math = vm.createContext({});
  vm.runInContext(
    worker.slice(
      worker.indexOf('function solveLinearSystem('),
      worker.indexOf('function sampleBilinear('),
    ),
    math,
  );
  const source = [
      [50, 40],
      [350, 80],
      [300, 600],
      [20, 540],
    ],
    target = [
      [0, 0],
      [447, 0],
      [447, 447],
      [0, 447],
    ];
  const transform = math.computeHomography(source, target);
  source.forEach(([x, y], index) => {
    const point = math.applyHomography(transform, x, y);
    assert.ok(Math.abs(point[0] - target[index][0]) < 1e-6);
    assert.ok(Math.abs(point[1] - target[index][1]) < 1e-6);
  });
});

const trackedCard = (id = '7286819f-6c57-4503-898c-528786ad86e9', oracle = id, score = 0.92) => ({
  cardPresent: true,
  cornersValid: true,
  confidence: 1,
  score,
  cardId: id,
  secondaryId: oracle,
});

test('live tracking confirms stable cards once and allows another copy after removal', () => {
  const tracker = context.scannerCreateTracker();
  const card = trackedCard();
  assert.equal(tracker.observe(card, 0), null);
  assert.equal(tracker.observe(card, 650), card);
  for (let now = 1300; now < 8000; now += 650) assert.equal(tracker.observe(card, now), null);
  assert.equal(tracker.observe({}, 8000), null);
  assert.equal(
    tracker.observe(card, 8650),
    null,
    'One missed frame must not duplicate a held card',
  );
  tracker.observe({}, 9300);
  tracker.observe({}, 9950);
  tracker.observe({}, 10600);
  assert.equal(tracker.observe(card, 11250), null);
  assert.equal(tracker.observe(card, 11900), card);
});

test('live tracking confirms each printing independently even when Oracle IDs are identical', () => {
  const tracker = context.scannerCreateTracker();
  const a = trackedCard();
  const otherPrinting = trackedCard('11111111-1111-4111-8111-111111111111', a.secondaryId, 0.8);
  const b = trackedCard('22222222-2222-4222-8222-222222222222');
  tracker.observe(a, 0);
  assert.equal(tracker.observe(otherPrinting, 650), null, 'Two different printings must not combine into confirmation');
  assert.equal(tracker.observe(otherPrinting, 1300), otherPrinting);
  assert.equal(tracker.heldKey, otherPrinting.cardId);
  assert.equal(tracker.observe(otherPrinting, 1400), null);
  tracker.observe(b, 1950);
  assert.equal(tracker.observe(b, 2600), b);
  tracker.observe(a, 3250);
  assert.equal(tracker.observe(a, 3900), a);
  tracker.observe({}, 4550);
  tracker.pause();
  tracker.observe({}, 50000);
  assert.equal(tracker.observe(a, 50650), null, 'A review/pause must not count as card removal');
});

test('stable printing tracking keeps the strongest match across confirmations', () => {
  const tracker = context.scannerCreateTracker();
  const first = trackedCard(), stronger = { ...first, score: 0.99 };
  tracker.observe(first, 0);
  assert.equal(tracker.observe(stronger, 200), stronger);
});

async function sessionContext(factory) {
  const ctx = vm.createContext({ AbortController, DOMException, scannerCreateEngine: factory });
  vm.runInContext(
    await readFile(new URL('../src/features/scanner/session.js', import.meta.url), 'utf8'),
    ctx,
  );
  return ctx;
}

test('warm-up and camera views share one worker; closing a waiting view leaves it initializing', async () => {
  let createCount = 0,
    finish,
    initializationSignal;
  const engine = {
    disposed: false,
    dispose() {
      this.disposed = true;
    },
  };
  const ctx = await sessionContext(({ signal }) => {
    createCount++;
    initializationSignal = signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const background = ctx.scannerGetEngine();
  const camera = new AbortController();
  const view = ctx.scannerGetEngine({ signal: camera.signal, onProgress() {} });
  camera.abort();
  await assert.rejects(view, { name: 'AbortError' });
  assert.equal(initializationSignal.aborted, false);
  finish(engine);
  assert.equal(await background, engine);
  assert.equal(await ctx.scannerGetEngine(), engine);
  assert.equal(createCount, 1);
  assert.equal(ctx.scannerIsReady(), true);
  assert.equal(vm.runInContext('scannerProgressListeners.size', ctx), 0);
  ctx.scannerReleaseSession();
  assert.equal(engine.disposed, true);
});

test('failed warm-up can retry, and a dead worker is replaced instead of reused', async () => {
  let calls = 0;
  const ctx = await sessionContext(async () => {
    calls++;
    if (calls === 1) throw new Error('Offline');
    return {
      disposed: false,
      dispose() {
        this.disposed = true;
      },
    };
  });
  await assert.rejects(ctx.scannerGetEngine(), /Offline/);
  const first = await ctx.scannerGetEngine();
  first.dispose();
  const replacement = await ctx.scannerGetEngine();
  assert.notEqual(first, replacement);
  assert.equal(calls, 3);
  assert.equal(ctx.scannerIsReady(), true);
  ctx.scannerReleaseSession();
});
