import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const capture = vm.createContext({});
vm.runInContext(
  await readFile(new URL('../src/features/scanner/capture.js', import.meta.url), 'utf8'),
  capture,
);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('capture prefers native 1080p in the phone orientation without requiring it', () => {
  for (const portrait of [false, true]) {
    const { video, audio } = plain(capture.scannerCameraConstraints({ portrait }));
    assert.equal(audio, false);
    assert.deepEqual(video.width, { ideal: portrait ? 1080 : 1920 });
    assert.deepEqual(video.height, { ideal: portrait ? 1920 : 1080 });
    assert.deepEqual(video.facingMode, { ideal: 'environment' });
    assert.deepEqual(video.frameRate, { ideal: 30, max: 30 });
    assert.deepEqual(video.resizeMode, { ideal: 'none' });
  }
});

test('undersized capture is upgraded once in its actual orientation, with focus and other settings preserved', async () => {
  for (const portrait of [false, true]) {
    const changes = [];
    let current = {
      ...plain(capture.scannerCameraConstraints()).video,
      deviceId: { exact: 'chosen-camera' },
      focusMode: 'manual',
      advanced: [{ torch: true, focusMode: 'manual', pointsOfInterest: [{ x: 0, y: 0 }] }],
    };
    const track = {
      getSettings: () => ({ width: portrait ? 720 : 1280, height: portrait ? 1280 : 720 }),
      getCapabilities: () => ({ focusMode: ['manual', 'continuous'] }),
      getConstraints: () => current,
      applyConstraints: async (next) => {
        current = plain(next);
        changes.push(current);
      },
    };
    const control = capture.scannerConfigureCamera(track, {
      isCurrent: () => true,
      pointsOfInterest: true,
    });
    await control.ready;
    assert.equal(control.canFocus, true);
    assert.equal(changes.length, 2);
    assert.deepEqual(changes[0].width, { ideal: portrait ? 1080 : 1920 });
    assert.deepEqual(changes[0].height, { ideal: portrait ? 1920 : 1080 });
    assert.deepEqual(changes[1].advanced, [{ torch: true }, { focusMode: 'continuous' }]);
    assert.equal(changes[1].focusMode, undefined);
    assert.deepEqual(changes[1].deviceId, { exact: 'chosen-camera' });
    await control.focus({ x: 0.4, y: 0.7 });
    assert.equal(changes.length, 3);
    assert.deepEqual(changes[2].advanced, [
      { torch: true },
      { focusMode: 'continuous', pointsOfInterest: [{ x: 0.4, y: 0.7 }] },
    ]);
    assert.deepEqual(changes[2].frameRate, { ideal: 30, max: 30 });
  }
});

test('focus never reduces a good stream, stays within hardware limits, and tolerates unsupported controls', async () => {
  for (const [width, height, modes, expected] of [
    [1920, 1080, ['continuous'], 'continuous'],
    [1600, 1200, ['continuous'], 'continuous'],
    [3840, 2160, ['single-shot'], 'single-shot'],
    [640, 480, [], null],
  ]) {
    const changes = [];
    const control = capture.scannerConfigureCamera(
      {
        getSettings: () => ({ width, height }),
        getCapabilities: () => ({
          width: { max: width },
          height: { max: height },
          focusMode: modes,
        }),
        applyConstraints: async (next) => changes.push(plain(next)),
      },
      { isCurrent: () => true },
    );
    await control.ready;
    await control.focus({ x: 0.4, y: 0.7 });
    assert.equal(control.canFocus, !!expected);
    assert.equal(changes.length, expected ? 2 : 0);
    for (const change of changes) {
      assert.equal(change.width, undefined);
      assert.equal(change.height, undefined);
      assert.deepEqual(change.advanced, [{ focusMode: expected }]);
    }
  }
  const unavailable = capture.scannerConfigureCamera(
    {
      getCapabilities: () => {
        throw new Error('Unavailable');
      },
      getSettings: () => ({}),
    },
    { isCurrent: () => true },
  );
  await unavailable.ready;
  await unavailable.focus({ x: 0, y: 0 });
  assert.equal(unavailable.canFocus, false);
});

test('queued camera changes stop on close; failed negotiation leaves autofocus and scanning available', async () => {
  let complete;
  const changes = [],
    updates = [];
  const track = {
    getSettings: () => ({ width: 640, height: 480 }),
    getCapabilities: () => ({ focusMode: ['continuous'] }),
    applyConstraints: (next) => {
      changes.push(plain(next));
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  };
  const control = capture.scannerConfigureCamera(track, {
    isCurrent: () => true,
    onChange: () => updates.push(true),
  });
  await Promise.resolve();
  assert.equal(changes.length, 1);
  const tapped = control.focus({ x: 0.5, y: 0.5 });
  control.stop();
  complete();
  await Promise.all([control.ready, tapped]);
  assert.equal(changes.length, 1);
  assert.equal(updates.length, 0);

  const failed = [];
  const optional = capture.scannerConfigureCamera(
    {
      ...track,
      applyConstraints: async (next) => {
        failed.push(plain(next));
        throw new Error('Browser rejected optional camera setting');
      },
    },
    { isCurrent: () => true },
  );
  await optional.ready;
  await optional.focus({ x: 0.5, y: 0.5 });
  assert.equal(failed.length, 3);
  assert.deepEqual(failed[1].advanced, [{ focusMode: 'continuous' }]);
});

test('tap focus accounts for the visible cover crop and keyboard focus targets the center', async () => {
  const context = vm.createContext({});
  for (const name of ['engine', 'capture'])
    vm.runInContext(
      await readFile(new URL(`../src/features/scanner/${name}.js`, import.meta.url), 'utf8'),
      context,
    );
  const stage = { getBoundingClientRect: () => ({ left: 20, top: 100, width: 400, height: 400 }) };
  const landscape = { videoWidth: 1920, videoHeight: 1080 };
  assert.deepEqual(
    plain(context.scannerFocusPoint(landscape, stage, { detail: 1, clientX: 20, clientY: 100 })),
    { x: 0.21875, y: 0 },
  );
  assert.deepEqual(
    plain(context.scannerFocusPoint(landscape, stage, { detail: 1, clientX: 420, clientY: 500 })),
    { x: 0.78125, y: 1 },
  );
  const portrait = { videoWidth: 1080, videoHeight: 1920 };
  assert.deepEqual(
    plain(context.scannerFocusPoint(portrait, stage, { detail: 1, clientX: 20, clientY: 100 })),
    { x: 0, y: 0.21875 },
  );
  assert.deepEqual(plain(context.scannerFocusPoint(portrait, stage, { detail: 0 })), {
    x: 0.5,
    y: 0.5,
  });
  assert.deepEqual(
    plain(context.scannerFocusPoint(portrait, stage, { detail: 1, clientX: -999, clientY: 9999 })),
    { x: 0, y: 0.78125 },
  );
});

test('1080p preview keeps 720p analysis dimensions and reuses the capture canvas', async () => {
  let allocations = 0;
  const context = vm.createContext({
    document: {
      createElement: () => {
        allocations++;
        return { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
      },
    },
  });
  vm.runInContext(
    await readFile(new URL('../src/features/scanner/engine.js', import.meta.url), 'utf8'),
    context,
  );
  for (const portrait of [false, true]) {
    const viewport = { clientWidth: 390, clientHeight: 371 };
    const standard = { videoWidth: portrait ? 720 : 1280, videoHeight: portrait ? 1280 : 720 };
    const high = { videoWidth: portrait ? 1080 : 1920, videoHeight: portrait ? 1920 : 1080 };
    const baseline = context.scannerImageCanvas(standard, viewport);
    const highFrame = context.scannerImageCanvas(high, viewport, baseline);
    assert.equal(highFrame, baseline);
    assert.ok(highFrame.width * highFrame.height <= 1280 * 720);
    const dimensions = [highFrame.width, highFrame.height];
    context.scannerImageCanvas(standard, viewport, highFrame);
    assert.deepEqual([highFrame.width, highFrame.height], dimensions);
    assert.equal(context.scannerImageCanvas(high, viewport, highFrame), highFrame);
  }
  assert.equal(allocations, 2);
});
