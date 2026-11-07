// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep camera quality independent of inference speed; only analysis is downscaled.
function scannerCameraConstraints({ portrait = false } = {}) {
  return {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: portrait ? 1080 : 1920 },
      height: { ideal: portrait ? 1920 : 1080 },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: { ideal: 'none' },
    },
    audio: false,
  };
}

function scannerFocusPoint(video, stage, event) {
  const rect = stage.getBoundingClientRect();
  const width = video.videoWidth,
    height = video.videoHeight;
  if (!width || !height || !rect.width || !rect.height || !event.detail) return { x: 0.5, y: 0.5 };
  const crop = scannerFrameRect(width, height, rect.width, rect.height);
  const clamp = (value) => Math.max(0, Math.min(1, value));
  return {
    x: (crop.x + clamp((event.clientX - rect.left) / rect.width) * crop.width) / width,
    y: (crop.y + clamp((event.clientY - rect.top) / rect.height) * crop.height) / height,
  };
}

function scannerConfigureCamera(
  track,
  { isCurrent, onChange = () => {}, pointsOfInterest = false },
) {
  let stopped = false,
    queue = Promise.resolve();
  let capabilities = {};
  try {
    capabilities = track?.getCapabilities?.() || {};
  } catch (error) {
    // Some browsers expose the method without supporting camera controls.
  }
  const modes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
  const focusMode = modes.includes('continuous')
    ? 'continuous'
    : modes.includes('single-shot')
      ? 'single-shot'
      : null;
  const current = () => !stopped && isCurrent() && track?.readyState !== 'ended';
  const enqueue = (operation) => {
    queue = queue
      .then(async () => {
        if (!current()) return;
        await operation();
      })
      .catch(() => {
        // Optional settings must not stop the working camera or recognition.
      })
      .then(() => {
        if (current()) onChange();
      });
    return queue;
  };
  const focus = (point) =>
    enqueue(async () => {
      if (!focusMode || !track.applyConstraints) return;
      const {
        focusMode: previousMode,
        pointsOfInterest: previousPoint,
        ...constraints
      } = track.getConstraints?.() || {};
      // Keep independent camera settings, replacing older focus requests.
      const advanced = (constraints.advanced || []).map((entry) => {
        const { focusMode, pointsOfInterest, ...other } = entry;
        return other;
      });
      await track.applyConstraints({
        ...constraints,
        advanced: [
          ...advanced.filter((entry) => Object.keys(entry).length),
          { focusMode, ...(point && pointsOfInterest ? { pointsOfInterest: [point] } : {}) },
        ],
      });
    });

  const ready = enqueue(async () => {
    const actual = track?.getSettings?.() || {};
    if (!actual.width || !actual.height || !track.applyConstraints) return;
    // A portrait phone can negotiate a small stream from landscape ideals.
    // Retry once in the orientation actually supplied by this camera.
    const portrait = actual.height > actual.width;
    const width = Math.min(portrait ? 1080 : 1920, capabilities.width?.max || Infinity);
    const height = Math.min(portrait ? 1920 : 1080, capabilities.height?.max || Infinity);
    if (actual.width >= width || actual.height >= height) return;
    await track.applyConstraints({
      ...(track.getConstraints?.() || {}),
      width: { ideal: width },
      height: { ideal: height },
      resizeMode: { ideal: 'none' },
    });
  }).then(() => focus());
  return {
    ready,
    canFocus: !!focusMode && !!track?.applyConstraints,
    focus,
    stop() {
      stopped = true;
    },
  };
}
