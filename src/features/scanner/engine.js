// SPDX-License-Identifier: AGPL-3.0-or-later
// CollectorVision runs in a worker; camera frames never leave the device.
const SCANNER_ASSET_BASE = '/assets/scanner/collectorvision';

// Blank Card is a real catalog entry that can match a covered camera.
const SCANNER_BLANK_CARD_ORACLE = 'd3e7bc24-c2b0-4be3-b9d9-8a8d23b93bc7';
const SCANNER_BLANK_CARD_IDS = new Set([
  '0af68815-ffe6-4640-9500-b98a6cb757c7',
  '0e590dad-570d-4784-9aae-d85d2980c22b',
  '1582329f-75ab-41c5-ade1-223a6786bf33',
  '22ab5069-672a-44c8-935e-f9c3a1f5e3c0',
  '8625b50d-474d-46dd-af84-0b267ed5fab3',
  '8d7f421e-6947-4509-a179-8522fa4a29f8',
  'd7e00b12-ffb5-458b-8f32-4a320e5fe888',
  'effd421c-f791-41de-8272-955f7f963f9d',
  'f0e15aed-71c7-466a-a21d-7f10631a2f6e',
  'f4d03811-0a1e-40f1-9f0b-a5bced7cdceb',
]);

function scannerIsIgnoredCard(card) {
  const id = String(card?.cardId || card?.id || '')
    .toLowerCase()
    .replace(/_back$/, '');
  const oracle = String(card?.secondaryId || card?.oracle_id || '').toLowerCase();
  const name = String(card?.cardName || card?.name || '')
    .trim()
    .toLowerCase();
  return (
    SCANNER_BLANK_CARD_IDS.has(id) || oracle === SCANNER_BLANK_CARD_ORACLE || name === 'blank card'
  );
}

function scannerRecognitionError(result, { idThreshold = 0.6, cornerThreshold = 0.02 } = {}) {
  if (
    scannerIsIgnoredCard(result) ||
    !result?.cardPresent ||
    !result.cornersValid ||
    !Number.isFinite(result.confidence) ||
    result.confidence < cornerThreshold
  )
    return 'No clear card found. Show all four corners and try again.';
  if (
    !Number.isFinite(result.score) ||
    result.score < idThreshold ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.cardId || '')
  )
    return 'No confident match. Move closer, avoid glare and try again.';
  return '';
}

/** Match the visible object-fit: cover crop without stretching the camera. */
function scannerFrameRect(width, height, viewWidth = width, viewHeight = height) {
  const scale = Math.max(viewWidth / width, viewHeight / height);
  const cropWidth = viewWidth / scale,
    cropHeight = viewHeight / scale;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

function scannerImageCanvas(source, viewport, target) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height || width * height > 40000000)
    throw new Error('Unable to read this camera frame. Try again.');
  const crop = viewport
    ? scannerFrameRect(width, height, viewport.clientWidth, viewport.clientHeight)
    : scannerFrameRect(width, height);
  // A higher-resolution preview must not multiply the pixels processed by AI.
  // Camera analysis keeps the same effective 1280×720 source budget in either orientation.
  const scale = viewport
    ? Math.min(1, 1280 / Math.max(width, height), 720 / Math.min(width, height))
    : Math.min(1, 1280 / Math.max(crop.width, crop.height));
  const canvas = target || document.createElement('canvas');
  canvas.scannerSource = {
    width,
    height,
    x: crop.x,
    y: crop.y,
    cropWidth: crop.width,
    cropHeight: crop.height,
  };
  const outputWidth = Math.max(1, Math.round(crop.width * scale));
  const outputHeight = Math.max(1, Math.round(crop.height * scale));
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
  canvas
    .getContext('2d')
    .drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function scannerLoadMessage(progress) {
  const label = {
    detector: 'Loading card detector',
    embedder: 'Loading card recognition',
    catalog: 'Loading card reference data',
  }[progress.stage];
  return label
    ? label + (progress.ratio > 0 ? `… ${Math.round(progress.ratio * 100)}%` : '…')
    : 'Preparing recognition…';
}

async function scannerCreateEngine({ signal, onProgress = () => {} } = {}) {
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap)
    throw new Error(
      'This browser cannot run the scanner. Try a current Chrome, Safari or Firefox.',
    );
  signal?.throwIfAborted();
  // A new URL prevents a cached Cornelius manifest from selecting the old model.
  const response = await fetch(
    SCANNER_ASSET_BASE + '/assets/manifest.json?detector=fastweb-single-1.39-05d2b90b928a',
    { signal },
  );
  if (!response.ok)
    throw new Error('Card recognition could not load. Check your connection and try again.');
  const manifest = await response.json();
  signal?.throwIfAborted();
  const worker = new Worker(SCANNER_ASSET_BASE + '/scanner.worker.mjs?v=' + DECKHAND_BUILD, {
    type: 'module',
  });
  let disposed = false,
    pending = null,
    frameQueue = Promise.resolve(),
    readyResolve,
    readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const startupTimeout = setTimeout(
    () =>
      dispose(new Error('Recognition took too long to load. Check your connection and try again.')),
    120000,
  );
  const aborted = () => dispose(new DOMException('Scanner closed', 'AbortError'));
  function dispose(error = new DOMException('Scanner closed', 'AbortError')) {
    if (disposed) return;
    disposed = true;
    clearTimeout(startupTimeout);
    clearTimeout(pending?.timeout);
    signal?.removeEventListener('abort', aborted);
    readyReject(error);
    pending?.reject(error);
    pending = null;
    worker.terminate();
  }
  signal?.addEventListener('abort', aborted, { once: true });
  worker.onerror = () =>
    dispose(new Error('Card recognition could not start. Close the scanner and try again.'));
  worker.onmessageerror = worker.onerror;
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      if (!disposed) onProgress(data);
      return;
    }
    if (data.type === 'ready') {
      clearTimeout(startupTimeout);
      readyResolve();
      return;
    }
    if (data.type === 'error') {
      dispose(new Error('Card recognition failed. Close the scanner and try again.'));
      return;
    }
    if (data.type !== 'result') return;
    try {
      if (disposed || !pending) return;
      const result = {
        ...data,
        frameWidth: pending.frameWidth,
        frameHeight: pending.frameHeight,
        sourceFrame: pending.sourceFrame,
        thumb: null,
      };
      if (data.cropBitmap) {
        const thumb = document.createElement('canvas');
        thumb.width = 200;
        thumb.height = 280;
        const context = thumb.getContext('2d');
        if (data.orientation === 'rotated_180') {
          context.translate(200, 280);
          context.rotate(Math.PI);
        }
        context.drawImage(data.cropBitmap, 0, 0, 200, 280);
        result.thumb = thumb.toDataURL('image/jpeg', 0.85);
      }
      clearTimeout(pending.timeout);
      pending.resolve(result);
      pending = null;
    } catch (error) {
      dispose(error);
    } finally {
      data.cropBitmap?.close();
      data.detectorBitmap?.close();
    }
  };
  worker.postMessage({
    type: 'init',
    manifest,
    assetBasePath: SCANNER_ASSET_BASE + '/assets',
    catalogMode: 'v1',
    enableWebGpu: false,
    rotationInvariant: true,
    minCornerConfidence: 0.02,
  });
  if (signal?.aborted) aborted();
  await ready;
  return {
    dispose,
    get disposed() {
      return disposed;
    },
    recognize(canvas, { signal, thumbnail = true, cornerThreshold = 0.02 } = {}) {
      const operation = frameQueue.then(() =>
        scanFrame(canvas, signal, thumbnail, cornerThreshold),
      );
      frameQueue = operation.then(
        () => {},
        () => {},
      );
      return scannerWaitFor(operation, signal);
    },
  };
  async function scanFrame(canvas, signal, thumbnail, cornerThreshold) {
    signal?.throwIfAborted();
    if (disposed) throw new DOMException('Scanner closed', 'AbortError');
    const bitmap = await createImageBitmap(canvas);
    if (disposed || signal?.aborted) {
      bitmap.close();
      throw new DOMException('Scanner closed', 'AbortError');
    }
    return new Promise((resolve, reject) => {
      pending = {
        resolve,
        reject,
        frameWidth: canvas.width,
        frameHeight: canvas.height,
        sourceFrame: canvas.scannerSource,
        timeout: setTimeout(
          () => dispose(new Error('This scan took too long. Close the scanner and try again.')),
          30000,
        ),
      };
      try {
        // Configure inside the frame queue so each request uses its own threshold
        // while the cached worker and loaded models stay ready between sessions.
        worker.postMessage({ type: 'config', minCornerConfidence: cornerThreshold });
        worker.postMessage({ type: 'frame', bitmap, includeDebugBitmaps: thumbnail }, [bitmap]);
      } catch (error) {
        bitmap.close();
        dispose(error);
      }
    });
  }
}

async function scannerResolveCard(result, thresholds) {
  const error = scannerRecognitionError(result, thresholds);
  if (error) throw new Error(error);
  const local = _bulkIdx?.cards?.find((card) => card.id === result.cardId);
  if (local) return bulkToCardish(local);
  const response = await sfFetch(SF_BASE + '/cards/' + result.cardId);
  if (response.ok) {
    const card = await response.json();
    if (card.id === result.cardId && card.name) return card;
  }
  const fallback = _bulkIdx?.cards?.find((card) => card.o && card.o === result.secondaryId);
  if (fallback) return bulkToCardish(fallback);
  throw new Error(
    'Card found, but its details could not load. Check your connection and try again.',
  );
}
