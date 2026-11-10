import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import {
  outputsAgree,
  rectifyRgba,
  searchPackedCatalog,
  selectInferenceSession,
  runModel,
  normalizeRgba,
} from '../assets/scanner/collectorvision/performance.mjs';

test('lookup-based ImageNet preparation exactly preserves all RGB byte values', () => {
  const bytes = Uint8ClampedArray.from({ length: 256 * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : Math.floor(i / 4),
  );
  const actual = normalizeRgba(bytes, 256, new Float32Array(256 * 3));
  const expected = new Float32Array(actual.length);
  for (let channel = 0; channel < 3; channel++)
    for (let value = 0; value < 256; value++)
      expected[channel * 256 + value] =
        (value / 255 - [0.485, 0.456, 0.406][channel]) / [0.229, 0.224, 0.225][channel];
  assert.deepEqual(actual, expected);
});

function fakeRuntime({ gpuMs = 5, wrong = false, failCreate = false, failGpuRun = false } = {}) {
  let clock = 0,
    disposed = 0,
    inputsDisposed = 0;
  const sessions = [];
  class Tensor {
    dispose() {
      inputsDisposed++;
    }
  }
  const ort = {
    Tensor,
    InferenceSession: {
      async create(buffer, { executionProviders: [provider] }) {
        if (provider === 'webgpu' && failCreate) throw new Error('Unsupported operator');
        const session = {
          provider,
          released: 0,
          calls: 0,
          inputNames: ['image'],
          outputNames: ['result'],
          async run() {
            this.calls++;
            if (provider === 'webgpu' && failGpuRun) throw new Error('GPU failed');
            clock += provider === 'wasm' ? 20 : gpuMs;
            return {
              result: {
                data: new Float32Array(provider === 'webgpu' && wrong ? [0, 0] : [0.2, 1.2]),
                dispose() {
                  disposed++;
                },
              },
            };
          },
          async release() {
            this.released++;
          },
        };
        sessions.push(session);
        return session;
      },
    },
  };
  return { ort, sessions, now: () => clock, counts: () => ({ disposed, inputsDisposed }) };
}
const select = (runtime, options = {}) =>
  selectInferenceSession({
    ...runtime,
    buffer: new ArrayBuffer(0),
    inputs: [new Float32Array(3), new Float32Array(3)],
    size: 1,
    webgpu: true,
    ...options,
  });

test('GPU selection requires accurate outputs and a measured improvement; failures keep CPU scanning', async () => {
  for (const options of [
    {},
    { wrong: true },
    { gpuMs: 30 },
    { failCreate: true },
    { failGpuRun: true },
  ]) {
    const runtime = fakeRuntime(options);
    const session = await select(runtime);
    assert.equal(session.provider, Object.keys(options).length ? 'WASM' : 'WebGPU');
    const result = await runModel(runtime.ort, session, new Float32Array(3), 1);
    assert.ok(Math.abs(result.result[0] - 0.2) < 1e-6);
    const { disposed, inputsDisposed } = runtime.counts();
    assert.equal(inputsDisposed, disposed + (options.failGpuRun ? 1 : 0));
    await session.release();
    assert.ok(runtime.sessions.every((item) => item.released === 1));
  }
  for (const bad of [
    { result: [0, 0] },
    { result: [NaN, 1.2] },
    { other: [0.2, 1.2] },
    { result: [0.2] },
  ])
    assert.equal(outputsAgree({ result: [0.2, 1.2] }, bad), false);
});

test('a GPU device failure after selection retries that frame on CPU', async () => {
  const runtime = fakeRuntime();
  const session = await select(runtime);
  runtime.sessions.find((item) => item.provider === 'webgpu').run = async () => {
    throw new Error('Device lost');
  };
  const result = await runModel(runtime.ort, session, new Float32Array(3), 1);
  assert.ok(Math.abs(result.result[0] - 0.2) < 1e-6);
  assert.equal(session.provider, 'WASM');
  assert.equal(session.timings.reason, 'runtime-fallback');
  await session.release();
  assert.ok(runtime.sessions.every((item) => item.released === 1));
});

test('a stalled GPU probe times out and releases a session that finishes loading later', async () => {
  const runtime = fakeRuntime();
  const create = runtime.ort.InferenceSession.create;
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  runtime.ort.InferenceSession.create = async (...args) => {
    if (args[1].executionProviders[0] === 'webgpu') await gate;
    return create(...args);
  };
  const session = await select(runtime, { timeoutMs: 5 });
  assert.equal(session.provider, 'WASM');
  assert.equal(session.timings.reason, 'timeout');
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.sessions.at(-1).released, 1);
  await session.release();
});

test('packed lookup checks every entry, including the last, with no catalog truncation', () => {
  for (const dims of [3, 128, 129]) {
    const rows = 111;
    const lookup = Float32Array.from({ length: 256 }, (_, i) => (i - 128) / 128);
    const packed = Uint16Array.from({ length: rows * dims }, (_, i) => (i * 73 + 91) % 256);
    const query = Float32Array.from({ length: dims }, (_, i) => Math.cos(i));
    let bestScore = -Infinity,
      bestIndex = -1;
    for (let row = 0; row < rows; row++) {
      let score = 0;
      for (let col = 0; col < dims; col++) score += lookup[packed[row * dims + col]] * query[col];
      if (score > bestScore) {
        bestScore = score;
        bestIndex = row;
      }
    }
    const actual = searchPackedCatalog(packed, query, rows, dims, lookup);
    assert.equal(actual.bestIndex, bestIndex);
    assert.ok(Math.abs(actual.bestScore - bestScore) < 1e-10);
  }
  assert.equal(searchPackedCatalog(new Uint16Array([0, 0, 0, 1]), [1], 4, 1, [0, 1]).bestIndex, 3);
});

const worker = await readFile(
  new URL('../assets/scanner/collectorvision/scanner.worker.mjs', import.meta.url),
  'utf8',
);

test('software WebGPU adapters stay on the CPU path before model compilation', async () => {
  const context = vm.createContext({
    navigator: {
      gpu: {
        requestAdapter: async () => ({
          info: { vendor: 'google', description: 'SwiftShader Device (Subzero)' },
        }),
      },
    },
  });
  vm.runInContext(
    worker.slice(
      worker.indexOf('async function configureWebGpu('),
      worker.indexOf('// Tensor preparation'),
    ),
    context,
  );
  assert.equal(await context.configureWebGpu(), false);
});
test('faster perspective sampling matches the original bilinear sampler for tilted and rotated cards', () => {
  const original = vm.createContext({});
  vm.runInContext(
    worker.slice(
      worker.indexOf('function applyHomography('),
      worker.indexOf('function normalizeEmbedding('),
    ),
    original,
  );
  const width = 23,
    height = 41,
    outWidth = 37,
    outHeight = 43;
  const source = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 37) % 256);
  for (const matrix of [
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [-0.5, 0.1, 20, 0.05, -0.8, 40, 0.002, -0.001, 1],
  ]) {
    const actual = new Uint8ClampedArray(outWidth * outHeight * 4);
    const expected = new Uint8ClampedArray(actual.length);
    rectifyRgba(source, width, height, actual, outWidth, outHeight, matrix);
    for (let y = 0; y < outHeight; y++)
      for (let x = 0; x < outWidth; x++) {
        const [sx, sy] = original.applyHomography(matrix, x, y);
        for (let c = 0; c < 3; c++)
          expected[(y * outWidth + x) * 4 + c] = original.sampleBilinear(
            source,
            width,
            height,
            sx,
            sy,
            c,
          );
        expected[(y * outWidth + x) * 4 + 3] = 255;
      }
    assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) <= 1));
  }
});

test('strong matches skip the second orientation, while uncertain and upside-down cards retain fallback', async () => {
  const context = vm.createContext({
    performance,
    chooseBetterMatch: (a, b) => (b.score > a.score ? b : a),
    sumTiming: (a, b) => ({ embedMs: a.embedMs + b.embedMs }),
  });
  vm.runInContext(
    'this.Runtime = class { ' +
      worker.slice(worker.indexOf('  async identify('), worker.indexOf('  async search(query)')) +
      ' }',
    context,
  );
  const runtime = new context.Runtime();
  runtime.rotationInvariant = true;
  let calls = [];
  runtime.embed = async (_, rotated) => {
    calls.push(rotated);
    return { embedding: rotated, timing: { embedMs: 10 } };
  };
  runtime.search = () => ({ score: 0.95, cardId: 'upright' });
  let found = await runtime.identify({});
  assert.equal(found.timing.orientationPasses, 1);
  assert.deepEqual(calls, [false]);
  runtime.search = (rotated) => ({
    score: rotated ? 0.95 : 0.7,
    cardId: rotated ? 'inverted' : 'weak',
  });
  calls = [];
  found = await runtime.identify({});
  assert.equal(found.best.cardId, 'inverted');
  assert.equal(found.best.orientation, 'rotated_180');
  assert.equal(found.timing.orientationPasses, 2);
  calls = [];
  found = await runtime.identify({});
  assert.deepEqual(calls, [true]);
  assert.equal(found.timing.orientationPasses, 1);
  runtime.idThreshold = 0.99;
  assert.equal((await runtime.identify({})).timing.orientationPasses, 2);
});
