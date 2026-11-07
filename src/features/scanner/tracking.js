// SPDX-License-Identifier: AGPL-3.0-or-later
// Apply repeat rules to confirmed card names, independent of printing IDs.
function scannerCreateRepeatFilter({ debounceMs = 0, ignoreSession = false } = {}) {
  const seen = new Map();
  const key = (name) => String(name).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const reason = (name, at) => {
    const previous = seen.get(key(name));
    if (previous === undefined) return null;
    if (ignoreSession) return 'session';
    return debounceMs > 0 && at - previous < debounceMs ? 'debounce' : null;
  };
  const isRepeat = (name, at) => reason(name, at) !== null;
  return {
    isRepeat,
    reason,
    accept(name, at) {
      if (isRepeat(name, at)) return false;
      seen.set(key(name), at);
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
      // Alternate printing predictions for the same card are one detection.
      const key = result.secondaryId || result.cardId;
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
