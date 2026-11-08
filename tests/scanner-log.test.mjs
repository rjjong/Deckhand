import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = async (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('scan ownership totals all printings and finishes, excluding wants and zero quantities', async () => {
  const context = vm.createContext({
    state: {
      collection: {
        items: [
          { name: 'Scrying Glass', qty: 2 },
          { name: 'SCRYING GLASS', qty: 3, foil: true },
          { name: 'Other Card', qty: 0 },
        ],
        wantsManual: [{ name: 'Wanted Card', qty: 10 }],
      },
    },
  });
  vm.runInContext(await source('src/services/collection-storage.js'), context);
  vm.runInContext(await source('src/features/scanner/collection.js'), context);
  const counts = context.scannerCollectionCounts();
  assert.equal(counts.get('scrying glass'), 5);
  assert.equal(counts.get('other card'), 0);
  assert.equal(counts.has('wanted card'), false);
});

test('collection scans skip basics and do not count older basic records as owned', async () => {
  const context = vm.createContext({
    state: { collection: { items: [{ name: 'Forest', qty: 100 }], wantsManual: [] } },
    cardImageMed: () => '/reference-card.jpg',
  });
  vm.runInContext(await source('src/services/collection-storage.js'), context);
  context.saveCollection = () => {};
  vm.runInContext(await source('src/features/scanner/collection.js'), context);
  const added = context.scannerAddToCollection([
    { name: 'Snow-Covered Island', type_line: 'Basic Snow Land — Island' },
    { name: 'Wastes' },
    {
      name: 'Hallowed Fountain',
      type_line: 'Land — Plains Island',
      set: 'tst',
      collector_number: '1',
    },
  ]);
  assert.equal(added, 1);
  assert.equal(context.scannerCollectionCounts().has('forest'), false);
  assert.equal(context.scannerCollectionCounts().get('hallowed fountain'), 1);
  assert.equal(context.state.collection.items.length, 2);
});

test('quick add counts every scan copy, merges only matching regular stacks and saves no camera photos', async () => {
  const items = [
    { name: 'Scrying Glass', set: 'uds', cn: '137', qty: 2, cond: 'NM', binder: null },
    { name: 'Scrying Glass', set: 'uds', cn: '137', qty: 1, cond: 'NM', foil: true },
    { name: 'Scrying Glass', set: 'uds', cn: '137', qty: 1, cond: 'NM', binder: 'binder-a' },
  ];
  let saves = 0;
  const context = vm.createContext({
    state: {
      collection: { items, wantsManual: [{ name: 'Scrying Glass' }, { name: 'Other Card' }] },
    },
    cardImageMed: () => '/reference-card.jpg',
  });
  vm.runInContext(await source('src/services/collection-storage.js'), context);
  context.saveCollection = () => saves++;
  vm.runInContext(await source('src/features/scanner/collection.js'), context);
  const card = {
    name: 'Scrying Glass',
    set: 'uds',
    collector_number: '137',
    _foilPick: true,
    thumb: 'private-camera-photo',
  };
  context.scannerAddToCollection([card, card, { ...card, set: 'another-set' }]);
  assert.equal(saves, 1);
  assert.equal(items.find((item) => item.set === 'uds' && !item.foil && !item.binder).qty, 4);
  assert.equal(items.find((item) => item.foil).qty, 1);
  assert.equal(items.find((item) => item.binder).qty, 1);
  assert.equal(items.find((item) => item.set === 'another-set').qty, 1);
  assert.equal(JSON.stringify(items).includes('private-camera-photo'), false);
  assert.deepEqual(
    Array.from(context.state.collection.wantsManual, (item) => item.name),
    ['Other Card'],
  );
  context.scannerAddToCollection([]);
  assert.equal(saves, 1);
});

test('binder scanning merges only matching stacks in its destination binder', async () => {
  const card = { name: 'Scrying Glass', set: 'uds', collector_number: '137' };
  const items = [
    { name: card.name, set: 'uds', cn: '137', qty: 2, cond: 'NM', binder: null },
    { name: card.name, set: 'uds', cn: '137', qty: 1, cond: 'NM', binder: 'binder-a' },
    { name: card.name, set: 'uds', cn: '137', qty: 3, cond: 'NM', binder: 'binder-b' },
    { name: card.name, set: 'uds', cn: '137', qty: 1, cond: 'NM', foil: true, binder: 'binder-a' },
  ];
  let saves = 0;
  const context = vm.createContext({
    state: { collection: { items, wantsManual: [] } },
    cardImageMed: () => '/reference-card.jpg',
  });
  vm.runInContext(await source('src/services/collection-storage.js'), context);
  context.saveCollection = () => saves++;
  vm.runInContext(await source('src/features/scanner/collection.js'), context);
  context.scannerAddToCollection([card, card, { ...card, set: 'another-set' }], 'binder-a');
  assert.equal(
    items.find((item) => item.set === 'uds' && item.binder === 'binder-a' && !item.foil).qty,
    3,
  );
  assert.equal(items.find((item) => !item.binder).qty, 2);
  assert.equal(items.find((item) => item.binder === 'binder-b').qty, 3);
  assert.equal(items.find((item) => item.foil).qty, 1);
  assert.equal(items.find((item) => item.set === 'another-set').binder, 'binder-a');
  assert.equal(saves, 1);
});

test('worker clears every retained camera pixel buffer while retaining the warm models and catalog', async () => {
  const worker = await source('assets/scanner/collectorvision/scanner.worker.mjs');
  const cleared = [];
  const canvas = () => ({
    width: 448,
    height: 448,
    getContext: () => ({
      save() {},
      setTransform() {},
      restore() {},
      clearRect: (...rect) => cleared.push(rect),
    }),
  });
  const runtime = {
    dewarpCanvas: canvas(),
    detectorScratchCanvas: canvas(),
    embedderScratchCanvas: canvas(),
    dewarpImageData: { data: new Uint8Array([200, 201, 202]) },
    detectorInputTensor: new Float32Array([1, 2, 3]),
    embedderInputTensor: new Float32Array([4, 5, 6]),
    detector: {},
    embedder: {},
    embeddings: new Float32Array([7, 8, 9]),
    _lastRawCorners: [1],
    _lastDetectorInput: {},
  };
  const context = vm.createContext({ runtime, frameCanvas: canvas(), frameCtx: {} });
  vm.runInContext(
    worker.slice(worker.indexOf('function clearFrameData()'), worker.indexOf('self.onmessage =')),
    context,
  );
  context.clearFrameData();
  assert.equal(context.frameCanvas, null);
  assert.equal(context.frameCtx, null);
  assert.equal(cleared.length, 3);
  assert.deepEqual(Array.from(runtime.dewarpImageData.data), [0, 0, 0]);
  assert.deepEqual(Array.from(runtime.detectorInputTensor), [0, 0, 0]);
  assert.deepEqual(Array.from(runtime.embedderInputTensor), [0, 0, 0]);
  assert.deepEqual(Array.from(runtime.embeddings), [7, 8, 9]);
  assert.equal(context.runtime.detector, runtime.detector);
});

test('closing during inference skips thumbnails and clears frames before a later session without terminating the worker', async () => {
  let worker,
    thumbs = 0,
    closedBitmaps = 0;
  const sent = [];
  class Worker {
    constructor() {
      worker = this;
    }
    postMessage(message) {
      sent.push(message.type);
      if (message.type === 'init')
        queueMicrotask(() => this.onmessage({ data: { type: 'ready' } }));
    }
    terminate() {
      sent.push('terminate');
    }
    finish() {
      this.onmessage({
        data: {
          type: 'result',
          cropBitmap: {
            close() {
              closedBitmaps++;
            },
          },
        },
      });
    }
  }
  const bitmap = async () => ({ close() {} });
  const context = vm.createContext({
    window: { Worker, OffscreenCanvas: true, createImageBitmap: bitmap },
    Worker,
    createImageBitmap: bitmap,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    DECKHAND_BUILD: 'test',
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    document: {
      createElement: () => ({
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => {
          thumbs++;
          return 'photo';
        },
      }),
    },
  });
  vm.runInContext(await source('src/features/scanner/engine.js'), context);
  vm.runInContext(await source('src/features/scanner/session.js'), context);
  const engine = await context.scannerCreateEngine({});
  try {
    const controller = new AbortController();
    const first = engine.recognize({ width: 200, height: 200 }, { signal: controller.signal });
    const rejection = assert.rejects(first, { name: 'AbortError' });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await rejection;
    const clearing = engine.clearFrames();
    const second = engine.recognize({ width: 200, height: 200 }, {});
    assert.equal(sent.includes('clearFrames'), false);
    worker.finish();
    await clearing;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      sent.filter((type) => ['frame', 'clearFrames'].includes(type)),
      ['frame', 'clearFrames', 'frame'],
    );
    assert.equal(thumbs, 0);
    worker.finish();
    await second;
    assert.equal(thumbs, 1);
    assert.equal(closedBitmaps, 2);
    assert.equal(sent.includes('terminate'), false);
  } finally {
    engine.dispose();
  }
});
