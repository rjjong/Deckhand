// SPDX-License-Identifier: AGPL-3.0-or-later
// One recognition worker per app session. Camera views only borrow it.
let scannerSessionEngine = null;
let scannerSessionPromise = null;
let scannerSessionController = null;
let scannerSessionGeneration = 0;
let scannerSessionProgress = null;
const scannerProgressListeners = new Set();

function scannerWaitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Scanner closed', 'AbortError'));
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, new DOMException('Scanner closed', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function scannerIsReady() {
  return !!scannerSessionEngine && !scannerSessionEngine.disposed;
}

async function scannerGetEngine({ signal, onProgress } = {}) {
  signal?.throwIfAborted();
  if (onProgress) {
    scannerProgressListeners.add(onProgress);
    if (scannerSessionProgress) onProgress(scannerSessionProgress);
  }
  try {
    if (!scannerSessionPromise || scannerSessionEngine?.disposed) {
      const generation = ++scannerSessionGeneration;
      scannerSessionController = new AbortController();
      scannerSessionEngine = null;
      scannerSessionProgress = null;
      scannerSessionPromise = scannerCreateEngine({
        signal: scannerSessionController.signal,
        onProgress: (progress) => {
          if (generation !== scannerSessionGeneration) return;
          scannerSessionProgress = progress;
          for (const listener of scannerProgressListeners) {
            try {
              listener(progress);
            } catch (error) {
              /* A closed view cannot break warm-up. */
            }
          }
        },
      })
        .then((engine) => {
          if (generation !== scannerSessionGeneration) {
            engine.dispose();
            throw new DOMException('Scanner closed', 'AbortError');
          }
          scannerSessionEngine = engine;
          return engine;
        })
        .catch((error) => {
          if (generation === scannerSessionGeneration) {
            scannerSessionPromise = null;
            scannerSessionEngine = null;
          }
          throw error;
        });
    }
    // Leaving the camera cancels its wait, not the shared initialization.
    return await scannerWaitFor(scannerSessionPromise, signal);
  } finally {
    if (onProgress) scannerProgressListeners.delete(onProgress);
  }
}

function scannerReleaseSession() {
  scannerSessionGeneration++;
  scannerSessionController?.abort();
  scannerSessionEngine?.dispose();
  scannerSessionEngine = null;
  scannerSessionPromise = null;
  scannerSessionController = null;
  scannerSessionProgress = null;
}

function scheduleScannerWarmup() {
  let scheduled = false;
  const warm = () => {
    if (scheduled || scannerIsReady() || document.visibilityState !== 'visible') return;
    scheduled = true;
    const run = async () => {
      // Let the app's worker take control so its runtime cache also receives
      // the first WASM download. Unsupported/private modes can still warm up.
      if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('controllerchange', finish);
            resolve();
          };
          const timer = setTimeout(finish, 1500);
          navigator.serviceWorker.addEventListener('controllerchange', finish);
        });
      }
      scheduled = false;
      if (document.visibilityState !== 'visible') return;
      // Keep failures quiet during normal app use; opening the camera can retry.
      scannerGetEngine().catch(() => {});
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 500);
  };
  if (document.readyState === 'complete') warm();
  else window.addEventListener('load', warm, { once: true });
  window.addEventListener('online', warm);
  window.addEventListener('pageshow', warm);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') warm();
  });
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) scannerReleaseSession();
  });
}
