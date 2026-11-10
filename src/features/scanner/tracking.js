// SPDX-License-Identifier: AGPL-3.0-or-later
let scannerLastVibration = null;

function scannerRequestVibration(pattern, source = 'scan') {
  const device = globalThis.navigator;
  const visible = globalThis.document?.visibilityState !== 'hidden';
  const activated = device?.userActivation?.hasBeenActive;
  let status;
  try {
    if (typeof device?.vibrate !== 'function') status = 'unsupported';
    else if (!visible) status = 'hidden';
    else if (activated === false) status = 'needs-tap';
    else status = device.vibrate(pattern) === true ? 'requested' : 'rejected';
  } catch {
    status = 'rejected';
  }
  scannerLastVibration = { status, source, at: Date.now(), visible, activated: activated ?? null };
  return scannerLastVibration;
}

function scannerScanFeedback() {
  return scannerRequestVibration(70);
}

function scannerVibrationMessage(result, compact = false) {
  switch (result?.status) {
    case 'requested':
      return compact
        ? 'Vibration: browser accepted request'
        : 'Browser accepted the request. If you felt no pulses, check Silent/Do Not Disturb and your phone’s vibration settings; the phone or browser may be suppressing it.';
    case 'needs-tap':
      return 'Tap a control to allow vibration on this page.';
    case 'hidden':
      return 'Vibration skipped: the app was in the background.';
    case 'unsupported':
      return 'This browser does not provide web vibration.';
    case 'rejected':
      return 'The browser rejected the vibration request.';
    default:
      return 'No scan vibration requested yet.';
  }
}

// A printing ID distinguishes sets/artwork. Names and Oracle IDs group printings
// together and must never be used to suppress separate physical versions.
function scannerPrintingIdentity(card) {
  const id = card?.cardId || card?.id;
  return typeof id === 'string'
    ? id
        .trim()
        .toLowerCase()
        .replace(/_back$/, '')
    : '';
}

function scannerCreateRepeatFilter({ ignoreSession = false } = {}) {
  const seen = new Set();
  const reason = (card) => {
    const key = scannerPrintingIdentity(card);
    return ignoreSession && key && seen.has(key) ? 'session' : null;
  };
  const isRepeat = (card) => reason(card) !== null;
  return {
    isRepeat,
    reason,
    accept(card) {
      if (isRepeat(card)) return false;
      const key = scannerPrintingIdentity(card);
      if (ignoreSession && key) seen.add(key);
      return true;
    },
  };
}

// Confirm stable identities and suppress repeats while a card stays in view.
function scannerCreateTracker({
  stableFrames = 2,
  rearmMs = 1200,
  idThreshold = 0.6,
  cornerThreshold = 0.02,
} = {}) {
  let candidate = null,
    lastKey = null,
    missingSince = null;
  return {
    observe(result, now = Date.now()) {
      if (scannerRecognitionError(result, { idThreshold, cornerThreshold })) {
        candidate = null;
        if (missingSince === null) missingSince = now;
        if (now - missingSince >= rearmMs) lastKey = null;
        return null;
      }
      missingSince = null;
      const key = scannerPrintingIdentity(result);
      if (key === lastKey) {
        candidate = null;
        return null;
      }
      if (!candidate || candidate.key !== key) candidate = { key, frames: 0, best: result };
      candidate.frames++;
      if (result.score > candidate.best.score) candidate.best = result;
      if (candidate.frames < stableFrames) return null;
      const best = candidate.best;
      const detected = !best.thumb && result.thumb ? { ...best, thumb: result.thumb } : best;
      lastKey = key;
      candidate = null;
      return detected;
    },
    pause() {
      candidate = null;
      missingSince = null;
    },
    get needsThumbnail() {
      return !!candidate;
    },
    get heldKey() {
      return lastKey;
    },
  };
}

// Actual processed scan rate, including the interval and inference time.
function scannerCreateFramerate() {
  const times = [];
  return {
    reset() {
      times.length = 0;
    },
    record(now) {
      times.push(now);
      if (times.length > 6) times.shift();
      const elapsed = now - times[0];
      return times.length > 1 && elapsed > 0 ? ((times.length - 1) * 1000) / elapsed : null;
    },
  };
}
