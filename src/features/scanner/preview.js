// SPDX-License-Identifier: AGPL-3.0-or-later
// Map detected corners through the same aspect-preserving crop as the preview.
function scannerPreviewRect(sourceWidth, sourceHeight, viewWidth, viewHeight) {
  if (![sourceWidth, sourceHeight, viewWidth, viewHeight].every((v) => Number.isFinite(v) && v > 0))
    return null;
  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  const width = sourceWidth * scale,
    height = sourceHeight * scale;
  return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}

function scannerOutlinePoints(result, rect, cornerThreshold = 0.02) {
  if (
    !rect ||
    scannerIsIgnoredCard(result) ||
    !result?.cardPresent ||
    !result.cornersValid ||
    !Number.isFinite(result.confidence) ||
    result.confidence < cornerThreshold ||
    !Array.isArray(result.corners) ||
    result.corners.length !== 4
  )
    return null;
  if (
    !result.corners.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    )
  )
    return null;
  const source = result.sourceFrame;
  return result.corners.map(([x, y]) => {
    // Worker coordinates belong to the captured crop. Restore source-camera
    // coordinates before projecting onto the current (possibly resized) view.
    if (source) {
      x = (source.x + x * source.cropWidth) / source.width;
      y = (source.y + y * source.cropHeight) / source.height;
    }
    return [rect.x + x * rect.width, rect.y + y * rect.height];
  });
}

function scannerCreateBorder(stage, video, element, cornerThreshold) {
  let lastResult = null;
  const draw = () => {
    const width = stage.clientWidth,
      height = stage.clientHeight;
    const rect = scannerPreviewRect(
      lastResult?.sourceFrame?.width || video.videoWidth || lastResult?.frameWidth,
      lastResult?.sourceFrame?.height || video.videoHeight || lastResult?.frameHeight,
      width,
      height,
    );
    const points = scannerOutlinePoints(lastResult, rect, cornerThreshold);
    element.toggleAttribute('hidden', !points);
    if (!points) return;
    element.setAttribute('viewBox', `0 0 ${width} ${height}`);
    element
      .querySelector('polygon')
      .setAttribute('points', points.map((p) => p.join(',')).join(' '));
  };
  const observer = new ResizeObserver(draw);
  observer.observe(stage);
  video.addEventListener('resize', draw);
  return {
    update(result) {
      lastResult = result;
      draw();
    },
    clear() {
      lastResult = null;
      element.setAttribute('hidden', '');
    },
    dispose() {
      observer.disconnect();
      video.removeEventListener('resize', draw);
      lastResult = null;
      element.setAttribute('hidden', '');
    },
  };
}
