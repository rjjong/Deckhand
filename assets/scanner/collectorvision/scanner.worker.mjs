// SPDX-License-Identifier: AGPL-3.0-or-later
// Vendored CollectorVision worker; provenance and local changes are in UPSTREAM.json.
// scanner.worker.mjs
// Runs the full detect → dewarp → embed → search pipeline on a background
// thread so the camera preview's requestAnimationFrame loop is never blocked.
//
// Message protocol
// ----------------
// main → worker:
//   { type: 'init',   manifest }
//   { type: 'frame',  bitmap: ImageBitmap }   (transferred, zero-copy)
//
// worker → main:
//   { type: 'progress', stage, ratio, loaded?, total?, cached?, inferenceMode? }
//   { type: 'ready',    inferenceMode }
//   { type: 'result',   cardPresent, cornersValid, corners, sharpness,
//                       confidence, cardId, secondaryId, score,
//                       rawCorners, detectorInput,
//                       detectorBitmap?, cropBitmap? }
//   { type: 'error',    message }

import * as ort from "./vendor/onnxruntime-web/ort.webgpu.min.mjs?v=8b295ab80a99";
import { rectifyRgba, selectInferenceSession, runModel, normalizeRgba } from "./performance.mjs?v=__DECKHAND_BUILD__";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDER_SIZE = 448;
const DEWARP_W = EMBEDDER_SIZE;
const DEWARP_H = EMBEDDER_SIZE;
const DEFAULT_MIN_CORNER_CONFIDENCE = 0.02;

const ASSET_DB_NAME = "collectorvision-web-scanner";
const ASSET_STORE_NAME = "assets";

function resolveDetectorConfig(manifest) {
  const legacy = !manifest.models?.detector;
  const config = manifest.detector ?? {};
  const inputSize = Number(config.input_size ?? 384);
  if (!Number.isInteger(inputSize) || inputSize <= 0) {
    throw new Error(`Invalid detector input size: ${config.input_size}`);
  }
  if (config.preprocess && config.preprocess !== "imagenet-rgb") {
    throw new Error(`Unsupported detector preprocessing: ${config.preprocess}`);
  }
  return {
    modelKey: legacy ? "cornelius" : "detector",
    inputSize,
    outputs: config.outputs ?? {},
  };
}

// ---------------------------------------------------------------------------
// Math helpers (identical to the originals in app.js)
// ---------------------------------------------------------------------------

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function orientShortestEdgeTop(corners, width, height) {
  const edgeLengths = corners.map(([x1, y1], index) => {
    const [x2, y2] = corners[(index + 1) % corners.length];
    const dx = (x1 - x2) * width;
    const dy = (y1 - y2) * height;
    return Math.hypot(dx, dy);
  });
  let shortestEdge = 0;
  for (let i = 1; i < edgeLengths.length; i += 1) {
    if (edgeLengths[i] < edgeLengths[shortestEdge]) {
      shortestEdge = i;
    }
  }
  return corners.map((_, index) => corners[(index + shortestEdge) % corners.length]);
}

function orderCorners(points, width = null, height = null) {
  const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  const sorted = [...points].sort(
    ([ax, ay], [bx, by]) => Math.atan2(ay - cy, ax - cx) - Math.atan2(by - cy, bx - cx),
  );
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    const score = sorted[i][0] + sorted[i][1];
    if (score < best) {
      best = score;
      start = i;
    }
  }
  const ordered = [
    sorted[start],
    sorted[(start + 1) % 4],
    sorted[(start + 2) % 4],
    sorted[(start + 3) % 4],
  ];
  const signedArea = ordered.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = ordered[(i + 1) % ordered.length];
    return sum + (x1 * y2 - x2 * y1);
  }, 0);
  const canonical = signedArea < 0
    ? [ordered[0], ordered[3], ordered[2], ordered[1]]
    : ordered;
  return width && height ? orientShortestEdgeTop(canonical, width, height) : canonical;
}

function quadArea(corners) {
  let area = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % corners.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) * 0.5;
}

function isUsableQuad(corners) {
  if (!corners || corners.length !== 4) {
    return false;
  }
  const area = quadArea(corners);
  if (!Number.isFinite(area) || area < 0.01) {
    return false;
  }
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      const dx = corners[i][0] - corners[j][0];
      const dy = corners[i][1] - corners[j][1];
      if ((dx * dx + dy * dy) < 0.0004) {
        return false;
      }
    }
  }
  // Reject non-convex quads.  When the model misses a corner (e.g. on a
  // portrait camera where one corner is out of frame), it often returns 3
  // nearly-collinear points on one edge and one outlier.  That produces a
  // concave quad where one interior angle is reflex — the cross product at
  // that vertex has the opposite sign to the other three.
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < 4; i += 1) {
    const prev = corners[(i + 3) % 4];
    const curr = corners[i];
    const next = corners[(i + 1) % 4];
    const cross = (curr[0] - prev[0]) * (next[1] - curr[1])
                - (curr[1] - prev[1]) * (next[0] - curr[0]);
    if (cross > 0) pos += 1;
    if (cross < 0) neg += 1;
  }
  if (pos > 0 && neg > 0) {
    return false;
  }
  return true;
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);

  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot][col]) < 1e-10) {
      throw new Error("Could not solve dewarp transform.");
    }
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
    }
    const scale = a[col][col];
    for (let k = col; k <= size; k += 1) {
      a[col][k] /= scale;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = a[row][col];
      for (let k = col; k <= size; k += 1) {
        a[row][k] -= factor * a[col][k];
      }
    }
  }

  return a.map((row) => row[size]);
}

function computeHomography(srcPoints, dstPoints) {
  const matrix = [];
  const vector = [];

  for (let i = 0; i < 4; i += 1) {
    const [x, y] = srcPoints[i];
    const [u, v] = dstPoints[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const [h11, h12, h13, h21, h22, h23, h31, h32] = solveLinearSystem(matrix, vector);
  return [h11, h12, h13, h21, h22, h23, h31, h32, 1];
}

function applyHomography(matrix, x, y) {
  const denom = matrix[6] * x + matrix[7] * y + matrix[8];
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / denom,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / denom,
  ];
}

function sampleBilinear(data, width, height, x, y, channel) {
  const clampedX = Math.min(Math.max(x, 0), width - 1);
  const clampedY = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;

  const i00 = (y0 * width + x0) * 4 + channel;
  const i10 = (y0 * width + x1) * 4 + channel;
  const i01 = (y1 * width + x0) * 4 + channel;
  const i11 = (y1 * width + x1) * 4 + channel;

  const top = data[i00] * (1 - tx) + data[i10] * tx;
  const bottom = data[i01] * (1 - tx) + data[i11] * tx;
  return top * (1 - ty) + bottom * ty;
}

function normalizeEmbedding(embedding) {
  let norm = 0;
  for (let i = 0; i < embedding.length; i += 1) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-8) {
    for (let i = 0; i < embedding.length; i += 1) {
      embedding[i] /= norm;
    }
  }
  return embedding;
}

function chooseBetterMatch(current, candidate) {
  return candidate.score > current.score ? candidate : current;
}

function snakeToCamel(value) {
  return String(value).replace(/_([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
}

// ---------------------------------------------------------------------------
// IndexedDB asset cache (same DB as the main thread — shared origin storage)
// ---------------------------------------------------------------------------

function openAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedAsset(key) {
  const db = await openAssetDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, "readonly");
    const store = tx.objectStore(ASSET_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeCachedAsset(key, value) {
  const db = await openAssetDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, "readwrite");
    const store = tx.objectStore(ASSET_STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers with progress reporting + IndexedDB caching
// ---------------------------------------------------------------------------

async function fetchWithProgress(url, responseType, expectedTotal, onProgress) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const declaredTotal = Number.isSafeInteger(expectedTotal) && expectedTotal > 0
    ? expectedTotal
    : 0;
  let total = declaredTotal
    || Number.parseInt(response.headers.get("content-length") ?? "0", 10)
    || 0;
  if (!response.body || total === 0) {
    const payload = responseType === "json" ? await response.json() : await response.arrayBuffer();
    onProgress?.(1, total || 1, total || 1);
    return payload;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.length;
    // Fetch streams expose decoded bytes, while Content-Length can describe a
    // compressed HTTP response. Do not present an invalid total to the UI.
    if (declaredTotal === 0 && total > 0 && loaded > total) {
      total = 0;
    }
    onProgress?.(total > 0 ? loaded / total : 0, loaded, total);
  }

  onProgress?.(1, loaded, total);
  const blob = new Blob(chunks);
  if (responseType === "json") {
    return JSON.parse(await blob.text());
  }
  return await blob.arrayBuffer();
}

async function clearObsoleteCatalogCache() {
  try {
    const db = await openAssetDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE_NAME, 'readwrite');
      const request = transaction.objectStore(ASSET_STORE_NAME).openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).includes('/assets/catalog/')) transaction.objectStore(ASSET_STORE_NAME).delete(cursor.key);
        cursor.continue();
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch { /* Cache cleanup can retry the next time the worker starts. */ }
}

async function fetchBufferCached(url, version, expectedTotal, onProgress) {
  const key = `${version}:${url}:buffer`;
  const cached = await readCachedAsset(key);
  if (cached) {
    onProgress?.(1, cached.byteLength ?? 1, cached.byteLength ?? 1, true);
    return cached;
  }
  const buffer = await fetchWithProgress(url, "buffer", expectedTotal, (ratio, loaded, total) => {
    onProgress?.(ratio, loaded, total, false);
  });
  await writeCachedAsset(key, buffer);
  return buffer;
}

// ---------------------------------------------------------------------------
// WebGPU configuration
// ---------------------------------------------------------------------------

/**
 * Attempts to configure the WebGPU adapter for ort-web.
 * Returns true if WebGPU was configured, false if unavailable.
 * Never throws — a false return means ort-web will fall back to WASM.
 */
async function configureWebGpu() {
  if (!("gpu" in navigator)) {
    return false;
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    return false;
  }
  // Software adapters do not accelerate the scanner and can exhaust a browser
  // GPU process while compiling these models. Keep them on threaded WASM.
  const info = adapter.info || {};
  if (adapter.isFallbackAdapter || info.isFallbackAdapter ||
      /swiftshader|llvmpipe|lavapipe|software/i.test(`${info.vendor} ${info.device} ${info.description}`)) {
    return false;
  }

  const requestedStorageBuffers = Math.min(
    10,
    adapter.limits.maxStorageBuffersPerShaderStage ?? 8,
  );
  const originalRequestDevice = adapter.requestDevice.bind(adapter);
  Object.defineProperty(adapter, "requestDevice", {
    configurable: true,
    value: async (descriptor = {}) => originalRequestDevice({
      ...descriptor,
      requiredLimits: {
        ...(descriptor.requiredLimits ?? {}),
        maxStorageBuffersPerShaderStage: requestedStorageBuffers,
      },
    }),
  });

  ort.env.webgpu.adapter = adapter;
  // ort.webgpu.min.mjs (new WebGPU EP) — the legacy ort.all.min.mjs JSEP backend
  // silently returned all-zeros for Conv ops on Android (ort-web 1.20–1.24.3).
  // The new EP fixes that, but cornelius.onnx still produces numerically wrong
  // (coherent but incorrect) corner outputs on Android ARM GPUs even with the new EP.
  // See ARCHITECTURE.md “Lessons Learned” for the full history.
  ort.env.webgpu.forceFp16 = false;

  return true;
}

// ---------------------------------------------------------------------------
// Tensor preparation (uses OffscreenCanvas instead of HTMLCanvasElement)
// ---------------------------------------------------------------------------

function fillInputTensorFromContext(ctx, size, tensor) {
  const { data } = ctx.getImageData(0, 0, size, size);
  return normalizeRgba(data, size * size, tensor);
}

function createInputTensor(size) {
  return new Float32Array(1 * 3 * size * size);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function webGpuDisableReason() {
  const ua = navigator.userAgent || "";
  if (/\bFirefox\/\d+/.test(ua)) {
    return "Firefox WebGPU disabled: onnxruntime-web 1.24.3 can generate invalid Metal shaders for the scanner model.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// WorkerRuntime — BrowserRuntime ported to run inside a web worker.
// All canvas operations use OffscreenCanvas.
// ---------------------------------------------------------------------------

class WorkerRuntime {
  constructor(
    manifest,
    assetBasePath,
    useWebGpu = false,
    rotationInvariant = true,
    minCornerConfidence = DEFAULT_MIN_CORNER_CONFIDENCE,
  ) {
    this.manifest = manifest;
    this.assetBasePath = assetBasePath ?? "./assets";
    this.detectorConfig = resolveDetectorConfig(manifest);
    this.useWebGpu = useWebGpu;
    this.rotationInvariant = rotationInvariant;
    this.minCornerConfidence = clamp01(minCornerConfidence);
    this.catalogMode = "server-v2";
    this.catalogVersion = null;
    this.catalogKey = "milo1/scryfall/mtg";
    this.catalogRows = 0;
    this.catalogTotalRows = 0;
    this.detector = null;
    this.embedder = null;
    this.inputNames = {};
    this.secondaryIdField = null;
    this.dewarpCanvas = new OffscreenCanvas(DEWARP_W, DEWARP_H);
    this.dewarpCtx = this.dewarpCanvas.getContext("2d", { willReadFrequently: true });
    this.dewarpImageData = this.dewarpCtx.createImageData(DEWARP_W, DEWARP_H);
    // Reusable detector-size scratch canvas — what was fed to the detector.
    // Transferred to the main thread as a debug bitmap on each result.
    this.detectorScratchCanvas = new OffscreenCanvas(
      this.detectorConfig.inputSize,
      this.detectorConfig.inputSize,
    );
    this.detectorScratchCtx = this.detectorScratchCanvas.getContext("2d", { willReadFrequently: true });
    this.detectorInputTensor = createInputTensor(this.detectorConfig.inputSize);
    this.embedderScratchCanvas = new OffscreenCanvas(EMBEDDER_SIZE, EMBEDDER_SIZE);
    this.embedderScratchCtx = this.embedderScratchCanvas.getContext("2d", { willReadFrequently: true });
    this.embedderInputTensor = createInputTensor(EMBEDDER_SIZE);
    this._lastRawCorners = null;
    this._lastDetectorInput = null;
  }

  updateConfig({ minCornerConfidence, idThreshold } = {}) {
    if (minCornerConfidence !== undefined) {
      this.minCornerConfidence = clamp01(minCornerConfidence);
    }
    if (idThreshold !== undefined) this.idThreshold = clamp01(idThreshold);
  }

  get inferenceMode() {
    const detector = this.detector?.provider || 'WASM';
    if (this.detectorOnly) return detector;
    const embedder = this.embedder?.provider || 'WASM';
    return detector === embedder ? detector : `${detector} detector / ${embedder} recognition`;
  }

  async load(onStage) {
    const version = this.manifest.version;
    // Use per-model content hashes as cache keys when available so that a new
    // model weight file (same filename, different content) always busts the
    // IndexedDB entry, even if the bundle version string hasn't changed.
    const hashes = this.manifest.model_hashes ?? {};
    const modelSizes = this.manifest.model_sizes ?? {};
    const detectorVersion = hashes[this.detectorConfig.modelKey] ?? version;
    const embedderVersion = hashes.milo       ?? version;
    const detectorBuffer = await fetchBufferCached(
      `${this.assetBasePath}/${this.manifest.models[this.detectorConfig.modelKey]}`,
      detectorVersion,
      modelSizes[this.detectorConfig.modelKey],
      (ratio, loaded, total, cached) => onStage?.("detector", ratio, loaded, total, cached),
    );
    const embedderBuffer = this.detectorOnly ? null : await fetchBufferCached(
      `${this.assetBasePath}/${this.manifest.models.milo}`,
      embedderVersion,
      modelSizes.milo,
      (ratio, loaded, total, cached) => onStage?.("embedder", ratio, loaded, total, cached),
    );

    // Use as many threads as the device has cores, capped at 4.
    // NOTE: multi-threaded WASM requires SharedArrayBuffer / COOP+COEP headers.
    // Without them ort-web silently falls back to 1 thread.  The COI service
    // worker (coi-serviceworker.js) injects these headers on GitHub Pages so
    // that crossOriginIsolated becomes true and all threads are available.
    // iOS WebKit is prone to killing memory-heavy WASM pages.  Keep the iOS
    // path single-threaded to avoid the extra worker/SAB overhead; other
    // platforms keep the capped multi-threaded fast path.
    const mobile = /Android/i.test(navigator.userAgent);
    const numThreads = this.detectorOnly || isIOS() || !self.crossOriginIsolated ? 1 : Math.min(navigator.hardwareConcurrency || 1, mobile ? 2 : 4);
    ort.env.wasm.numThreads = numThreads;
    this.numThreads = numThreads;
    // Compare real model outputs against WASM before trusting an Android GPU.
    // This public sample is bundled with CollectorVision; no camera is opened.
    let sample = null;
    try {
      const response = await fetch(`${this.assetBasePath}/samples/mtg-sample.jpg`);
      if (response.ok) sample = await createImageBitmap(await response.blob());
    } catch { /* Procedural calibration also works offline without the sample. */ }
    const inputs = (size) => {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const gradient = context.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#1d4c91'); gradient.addColorStop(1, '#e9b651');
      context.fillStyle = gradient; context.fillRect(0, 0, size, size);
      const pattern = fillInputTensorFromContext(context, size, createInputTensor(size));
      if (sample) context.drawImage(sample, 0, 0, size, size);
      else { context.fillStyle = '#ddd'; context.fillRect(size / 4, size / 8, size / 2, size * 3 / 4); }
      return [pattern, fillInputTensorFromContext(context, size, createInputTensor(size))];
    };
    try {
      this.detector = await selectInferenceSession({ ort, buffer: detectorBuffer,
        inputs: inputs(this.detectorConfig.inputSize), size: this.detectorConfig.inputSize, webgpu: this.useWebGpu });
      if (!this.detectorOnly) this.embedder = await selectInferenceSession({ ort, buffer: embedderBuffer,
        inputs: inputs(EMBEDDER_SIZE), size: EMBEDDER_SIZE, webgpu: this.useWebGpu });
    } finally { sample?.close(); }

    this.inputNames.detector = this.detector.inputNames[0];
    if (this.detectorOnly) {
      this.catalogRows = this.catalogTotalRows = 0;
      return;
    }
    this.inputNames.embedder = this.embedder.inputNames[0];

    // Models remain warm on the device; the reference catalog lives on Deckhand.
    // Warming inference is useful even while offline or the server is updating.
    onStage?.("catalog", 0, 0, 0, false);
    await this.refreshCatalogStatus();
    onStage?.("catalog", 1, 0, 0, false);
    void clearObsoleteCatalogCache();
  }

  async refreshCatalogStatus() {
    try {
      const response = await fetch('/api/scanner/status', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.ok) this.setCatalogStatus(await response.json());
    } catch { /* An offline warm-up must not discard cached inference models. */ }
  }

  setCatalogStatus(status) {
    if (!status) return;
    this.catalogRows = this.catalogTotalRows = status.rows || 0;
    this.catalogVersion = status.version;
    this.catalogKey = status.catalog || this.catalogKey;
  }

  async detect(frameCanvas) {
    const t0 = performance.now();
    const vw = frameCanvas.width;
    const vh = frameCanvas.height;

    // Save a copy of what we fed the model for the debug preview bitmap.
    const detectorSize = this.detectorConfig.inputSize;
    this.detectorScratchCtx.drawImage(frameCanvas, 0, 0, detectorSize, detectorSize);
    this._lastDetectorInput = `${vw}×${vh} → squash ${detectorSize}×${detectorSize}`;
    const t1 = performance.now();

    const input = fillInputTensorFromContext(
      this.detectorScratchCtx,
      detectorSize,
      this.detectorInputTensor,
    );
    const t2 = performance.now();
    const outputs = await runModel(ort, this.detector, input, detectorSize);
    const t3 = performance.now();
    const outputNames = this.detectorConfig.outputs;
    const cornersName = outputNames.corners ?? this.detector.outputNames[0];
    const presenceName = outputNames.presence ?? this.detector.outputNames[1];
    const sharpnessName = outputNames.sharpness ?? this.detector.outputNames[2];
    const cornersRaw = Array.from(outputs[cornersName]).slice(0, 8);
    const presenceLogit = outputs[presenceName][0];
    const sharpness = sharpnessName && outputs[sharpnessName]
      ? outputs[sharpnessName][0]
      : null;

    const points = [];
    for (let i = 0; i < 8; i += 2) {
      points.push([
        Math.min(Math.max(cornersRaw[i], 0), 1),
        Math.min(Math.max(cornersRaw[i + 1], 0), 1),
      ]);
    }

    this._lastRawCorners = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("  ");
    const t4 = performance.now();

    const confidence = sharpness ?? sigmoid(presenceLogit);
    return {
      corners: orderCorners(points, vw, vh),
      sharpness,
      confidence,
      cardPresent: confidence >= this.minCornerConfidence,
      timing: {
        detectorDrawMs: t1 - t0,
        detectorInputMs: t2 - t1,
        detectorRunMs: t3 - t2,
        detectorPostMs: t4 - t3,
        detectMs: t4 - t0,
      },
    };
  }

  dewarp(frameCanvas, corners) {
    const t0 = performance.now();
    const width = frameCanvas.width;
    const height = frameCanvas.height;
    const srcPts = [
      corners[0][0] * width, corners[0][1] * height,
      corners[1][0] * width, corners[1][1] * height,
      corners[2][0] * width, corners[2][1] * height,
      corners[3][0] * width, corners[3][1] * height,
    ];
    const dstPts = [
      0, 0,
      DEWARP_W - 1, 0,
      DEWARP_W - 1, DEWARP_H - 1,
      0, DEWARP_H - 1,
    ];
    const sourcePoints = [
      [srcPts[0], srcPts[1]],
      [srcPts[2], srcPts[3]],
      [srcPts[4], srcPts[5]],
      [srcPts[6], srcPts[7]],
    ];
    const targetPoints = [
      [dstPts[0], dstPts[1]],
      [dstPts[2], dstPts[3]],
      [dstPts[4], dstPts[5]],
      [dstPts[6], dstPts[7]],
    ];
    const inverse = computeHomography(targetPoints, sourcePoints);
    const t1 = performance.now();
    const srcData = frameCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
    const dstData = this.dewarpImageData;
    const t2 = performance.now();

    rectifyRgba(srcData.data, width, height, dstData.data, DEWARP_W, DEWARP_H, inverse);

    const t3 = performance.now();
    this.dewarpCtx.putImageData(dstData, 0, 0);
    const t4 = performance.now();
    this._lastDewarpTiming = {
      dewarpSetupMs: t1 - t0,
      dewarpReadMs: t2 - t1,
      dewarpWarpMs: t3 - t2,
      dewarpWriteMs: t4 - t3,
      dewarpMs: t4 - t0,
    };
    return this.dewarpCanvas;
  }

  async embed(cropCanvas, rotate180 = false) {
    const t0 = performance.now();
    this.embedderScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.embedderScratchCtx.clearRect(0, 0, EMBEDDER_SIZE, EMBEDDER_SIZE);
    if (rotate180) {
      this.embedderScratchCtx.translate(EMBEDDER_SIZE, EMBEDDER_SIZE);
      this.embedderScratchCtx.rotate(Math.PI);
    }
    this.embedderScratchCtx.drawImage(cropCanvas, 0, 0, EMBEDDER_SIZE, EMBEDDER_SIZE);
    this.embedderScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    const t1 = performance.now();
    const input = fillInputTensorFromContext(
      this.embedderScratchCtx,
      EMBEDDER_SIZE,
      this.embedderInputTensor,
    );
    const t2 = performance.now();
    const outputs = await runModel(ort, this.embedder, input, EMBEDDER_SIZE);
    const t3 = performance.now();
    const embedding = normalizeEmbedding(outputs[this.embedder.outputNames[0]]);
    const t4 = performance.now();
    return {
      embedding,
      timing: {
        embedDrawMs: t1 - t0,
        embedInputMs: t2 - t1,
        embedRunMs: t3 - t2,
        embedPostMs: t4 - t3,
        embedMs: t4 - t0,
      },
    };
  }

  async identify(cropCanvas) {
    // Try the most recently successful orientation first. Strong matches need
    // one embedding; uncertain matches still check both orientations.
    const rotateFirst = this.preferredOrientation === 'rotated_180';
    const upright = await this.embed(cropCanvas, rotateFirst);
    const tSearchStart = performance.now();
    let best = { ...await this.search(upright.embedding), orientation: rotateFirst ? 'rotated_180' : 'upright' };
    let searchMs = performance.now() - tSearchStart;
    let timing = upright.timing;

    let orientationPasses = 1;
    if (this.rotationInvariant && best.score < Math.max(0.85, this.idThreshold || 0)) {
      const rotated = await this.embed(cropCanvas, !rotateFirst);
      const tRotatedSearchStart = performance.now();
      const rotatedBest = { ...await this.search(rotated.embedding), orientation: rotateFirst ? 'upright' : 'rotated_180' };
      searchMs += performance.now() - tRotatedSearchStart;
      timing = sumTiming(timing, rotated.timing);
      best = chooseBetterMatch(best, rotatedBest);
      orientationPasses++;
    }
    if (best.score >= 0.85) this.preferredOrientation = best.orientation;
    return { best, timing: { ...timing, orientationPasses }, searchMs };
  }

  async search(query) {
    const unavailable = 'Card lookup needs a connection to Deckhand. Reconnecting…';
    if (this.lookupRetryAt > Date.now())
      throw Object.assign(new Error(this.lookupError || unavailable), { recoverable: true });
    try {
      this.lookupController = new AbortController();
      const response = await fetch('/api/scanner/lookup', {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        signal: AbortSignal.any([this.lookupController.signal, AbortSignal.timeout(7000)]),
        body: JSON.stringify({ model: this.manifest.model_hashes.milo, embedding: Array.from(query) }),
      });
      if (!response.ok) {
        const message = response.status === 429 ? 'Card lookup is busy. Retrying…'
          : response.status === 503 ? 'The card catalog is warming up. Retrying…' : unavailable;
        throw new Error(message);
      }
      const result = await response.json();
      if (!result.match || !Number.isFinite(result.match.score)) throw new Error(unavailable);
      this.setCatalogStatus(result.catalog);
      this.lookupRetryAt = 0;
      return result.match;
    } catch (error) {
      const message = error.message?.includes('Retrying') ? error.message : unavailable;
      this.lookupRetryAt = Date.now() + 2000;
      this.lookupError = message;
      throw Object.assign(new Error(message), { recoverable: true });
    } finally {
      this.lookupController = null;
    }
  }

}

// ---------------------------------------------------------------------------
// Frame pipeline
// ---------------------------------------------------------------------------

let runtime = null;
// Reusable OffscreenCanvas sized to the incoming frame — resized as needed.
let frameCanvas = null;
let frameCtx = null;

async function processFrame(bitmap, captureRequested = false, includeDebugBitmaps = false, priorDetection = null) {
  const tFrameStart = performance.now();
  if (!frameCanvas || frameCanvas.width !== bitmap.width || frameCanvas.height !== bitmap.height) {
    frameCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
  }
  frameCtx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const tFrameReady = performance.now();

  // Snapshot the frame for the capture bundle (zero-copy, worker → main).
  let captureFrameBitmap = null;
  if (captureRequested) {
    const snap = new OffscreenCanvas(frameCanvas.width, frameCanvas.height);
    snap.getContext("2d").drawImage(frameCanvas, 0, 0);
    captureFrameBitmap = snap.transferToImageBitmap();
  }
  const tCaptureReady = performance.now();

  const detection = priorDetection || await runtime.detect(frameCanvas);
  const baseTiming = {
    frameDrawMs: tFrameReady - tFrameStart,
    captureMs: tCaptureReady - tFrameReady,
    ...detection.timing,
  };

  if (runtime.detectorOnly) {
    self.postMessage({ type: 'result', ...detection,
      cornersValid: detection.cardPresent && isUsableQuad(detection.corners),
      inferenceMode: runtime.detector.provider,
      timing: roundTiming({ ...baseTiming, totalMs: performance.now() - tFrameStart }),
    });
    return;
  }

  if (!detection.cardPresent) {
    const transfer0 = captureFrameBitmap ? [captureFrameBitmap] : [];
    self.postMessage({
      type: "result",
      inferenceMode: runtime.inferenceMode,
      captureRequested,
      captureFrameBitmap,
      cardPresent: false,
      cornersValid: false,
      corners: detection.corners,
      sharpness: detection.sharpness,
      confidence: detection.confidence,
      cardId: null,
      secondaryId: null,
      secondaryIdField: runtime?.secondaryIdField ?? null,
      score: null,
      rawCorners: runtime._lastRawCorners,
      detectorInput: runtime._lastDetectorInput,
      detectorBitmap: null,
      cropBitmap: null,
      timing: roundTiming({ ...baseTiming, dewarpMs: 0, embedMs: 0, searchMs: 0, totalMs: performance.now() - tFrameStart }),
    }, transfer0);
    return;
  }

  // Transfer debug bitmaps only when the settings preview is open or an
  // explicit capture is requested.  On mobile Safari, transferring ImageBitmap
  // objects every successful frame can put enough pressure on WebKit's GPU
  // process to reload the page.
  const detectorBitmap = includeDebugBitmaps
    ? runtime.detectorScratchCanvas.transferToImageBitmap()
    : null;
  const cornersValid = isUsableQuad(detection.corners);

  if (!cornersValid) {
    const transfer1 = detectorBitmap ? [detectorBitmap] : [];
    if (captureFrameBitmap) transfer1.push(captureFrameBitmap);
    self.postMessage({
      type: "result",
      inferenceMode: runtime.inferenceMode,
      captureRequested,
      captureFrameBitmap,
      cardPresent: true,
      cornersValid: false,
      corners: detection.corners,
      sharpness: detection.sharpness,
      confidence: detection.confidence,
      cardId: null,
      secondaryId: null,
      secondaryIdField: runtime?.secondaryIdField ?? null,
      score: null,
      rawCorners: runtime._lastRawCorners,
      detectorInput: runtime._lastDetectorInput,
      detectorBitmap,
      cropBitmap: null,
      timing: roundTiming({ ...baseTiming, dewarpMs: 0, embedMs: 0, searchMs: 0, totalMs: performance.now() - tFrameStart }),
    }, transfer1);
    return;
  }

  const cropCanvas = runtime.dewarp(frameCanvas, detection.corners);
  const { best, timing: embedTiming, searchMs } = await runtime.identify(cropCanvas);

  // Transfer the dewarp canvas bitmap (zero-copy) then it gets a fresh blank.
  const cropBitmap = includeDebugBitmaps ? cropCanvas.transferToImageBitmap() : null;

  const transfer2 = [];
  if (detectorBitmap) transfer2.push(detectorBitmap);
  if (cropBitmap) transfer2.push(cropBitmap);
  if (captureFrameBitmap) transfer2.push(captureFrameBitmap);
  const resultMessage = {
    type: "result",
    captureRequested,
    captureFrameBitmap,
    cardPresent: true,
    cornersValid: true,
    corners: detection.corners,
    sharpness: detection.sharpness,
    confidence: detection.confidence,
    cardId: best.cardId,
    cardName: best.cardName,
    secondaryId: best.secondaryId,
    secondaryIdField: best.secondaryIdField,
    score: best.score,
    catalogRows: runtime.catalogRows,
    catalogVersion: runtime.catalogVersion,
    orientation: best.orientation,
    inferenceMode: runtime.inferenceMode,
    rawCorners: runtime._lastRawCorners,
    detectorInput: runtime._lastDetectorInput,
    detectorBitmap,
    cropBitmap,
    timing: roundTiming({
      ...baseTiming,
      ...runtime._lastDewarpTiming,
      ...embedTiming,
      searchMs,
      totalMs: performance.now() - tFrameStart,
    }),
  };
  if (best.secondaryIdField && best.secondaryId !== null && best.secondaryId !== undefined) {
    resultMessage[best.secondaryIdField] = best.secondaryId;
  }
  self.postMessage(resultMessage, transfer2);
}

function sumTiming(first, second) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return Object.fromEntries(
    [...keys].map((key) => [key, (first[key] ?? 0) + (second[key] ?? 0)]),
  );
}

function roundTiming(timing) {
  return Object.fromEntries(Object.entries(timing).map(([key, value]) => [
    key,
    Math.round((Number(value) || 0) * 10) / 10,
  ]));
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function clearFrameData() {
  runtime?.lookupController?.abort();
  if (frameCanvas) {
    frameCanvas.width = frameCanvas.height = 0;
    frameCanvas = null;
    frameCtx = null;
  }
  if (!runtime) return;
  for (const canvas of [runtime.dewarpCanvas, runtime.detectorScratchCanvas, runtime.embedderScratchCanvas]) {
    const context = canvas.getContext("2d");
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
  runtime.dewarpImageData.data.fill(0);
  runtime.detectorInputTensor.fill(0);
  runtime.embedderInputTensor.fill(0);
  runtime._lastRawCorners = null;
  runtime._lastDetectorInput = null;
  runtime._lastDewarpTiming = null;
  runtime.preferredOrientation = 'upright';
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const enableWebGpu = data.enableWebGpu === true;
      const disableReason = enableWebGpu ? webGpuDisableReason() : null;
      let webgpuReady = false;
      if (enableWebGpu && !disableReason) {
        try { webgpuReady = await configureWebGpu(); } catch { /* CPU remains available. */ }
      }
      const useWebGpu = webgpuReady; // only true if both requested and available
      const inferenceMode = useWebGpu
        ? "WebGPU"
        : (disableReason ? "WASM (Firefox WebGPU disabled)" : "WASM");
      self.postMessage({ type: "progress", stage: "webgpu", inferenceMode });
      self.postMessage({ type: "progress", stage: "dewarp", ratio: 1 });

      runtime = new WorkerRuntime(
        data.manifest,
        data.assetBasePath,
        useWebGpu,
        data.rotationInvariant !== false,
        data.minCornerConfidence,
      );
      runtime.detectorOnly = data.detectorOnly === true;
      await runtime.load((stage, ratio, loaded, total, cached) => {
        self.postMessage({ type: "progress", stage, ratio, loaded, total, cached });
      });

      self.postMessage({
        type: "ready",
        inferenceMode: runtime.inferenceMode,
        numThreads: runtime.numThreads ?? 1,
        backendTimings: { detector: runtime.detector.timings, embedder: runtime.embedder?.timings },
        catalogRows: runtime.catalogRows,
        catalogTotalRows: runtime.catalogTotalRows,
        catalogMode: runtime.catalogMode,
        catalogVersion: runtime.catalogVersion,
        catalogKey: runtime.catalogKey,
      });

    } else if (data.type === "frame") {
      await processFrame(
        data.bitmap,
        data.captureRequested ?? false,
        data.includeDebugBitmaps ?? false,
        data.detection ?? null,
      );
    } else if (data.type === "clearFrames") {
      clearFrameData();
      self.postMessage({ type: "framesCleared" });
    } else if (data.type === "config") {
      runtime?.updateConfig({
        minCornerConfidence: data.minCornerConfidence,
        idThreshold: data.idThreshold,
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message ?? String(error), recoverable: error?.recoverable === true });
  }
};
