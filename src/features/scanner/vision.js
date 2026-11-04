// OpenCV finds separated card outlines; OCR reads each corrected card upright.
let scannerLibraries;
function scannerScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('Scanner libraries could not load. Check your connection to Deckhand.'));
    };
    document.head.appendChild(script);
  });
}

async function scannerLoadLibraries() {
  if (!scannerLibraries)
    scannerLibraries = (async () => {
      await Promise.all([
        window.cv ? null : scannerScript('/assets/scanner/opencv.js'),
        window.Tesseract ? null : scannerScript('/assets/scanner/tesseract.min.js'),
      ]);
      return { cv: await window.cv, tesseract: window.Tesseract };
    })().catch((error) => {
      scannerLibraries = null;
      throw error;
    });
  return scannerLibraries;
}

function scannerOrderCorners(points) {
  const sum = (p) => p.x + p.y,
    difference = (p) => p.y - p.x;
  return [
    points.reduce((a, b) => (sum(a) < sum(b) ? a : b)),
    points.reduce((a, b) => (difference(a) < difference(b) ? a : b)),
    points.reduce((a, b) => (sum(a) > sum(b) ? a : b)),
    points.reduce((a, b) => (difference(a) > difference(b) ? a : b)),
  ];
}

function scannerDetectCards(canvas, cv) {
  const source = cv.imread(canvas),
    gray = new cv.Mat(),
    edges = new cv.Mat();
  const contours = new cv.MatVector(),
    hierarchy = new cv.Mat();
  const candidates = [];
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 40, 140);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i),
        polygon = new cv.Mat();
      try {
        const area = Math.abs(cv.contourArea(contour));
        if (
          area < canvas.width * canvas.height * 0.018 ||
          area > canvas.width * canvas.height * 0.98
        )
          continue;
        cv.approxPolyDP(contour, polygon, 0.025 * cv.arcLength(contour, true), true);
        if (polygon.rows !== 4 || !cv.isContourConvex(polygon)) continue;
        const raw = Array.from({ length: 4 }, (_, j) => ({
          x: polygon.data32S[j * 2],
          y: polygon.data32S[j * 2 + 1],
        }));
        const points = scannerOrderCorners(raw);
        if (new Set(points).size !== 4) continue;
        const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const width = (distance(points[0], points[1]) + distance(points[2], points[3])) / 2;
        const height = (distance(points[0], points[3]) + distance(points[1], points[2])) / 2;
        const ratio = Math.min(width, height) / Math.max(width, height);
        if (ratio < 0.55 || ratio > 0.83) continue;
        candidates.push({ points, area, width, height, bounds: cv.boundingRect(polygon) });
      } finally {
        polygon.delete();
        contour.delete();
      }
    }
    const kept = [];
    for (const candidate of candidates.sort((a, b) => b.area - a.area)) {
      const a = candidate.bounds;
      if (
        kept.some((other) => {
          const b = other.bounds;
          const intersection =
            Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
            Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          return intersection / (a.width * a.height) > 0.7;
        })
      )
        continue;
      kept.push(candidate);
      if (kept.length === 8) break;
    }
    return kept.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  } finally {
    source.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function scannerWarpCard(canvas, region, cv) {
  const width = 500,
    height = 700;
  let points = region.points;
  if (region.width > region.height) points = [points[1], points[2], points[3], points[0]];
  const source = cv.imread(canvas),
    output = new cv.Mat();
  const from = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    points.flatMap((p) => [p.x, p.y]),
  );
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const transform = cv.getPerspectiveTransform(from, to);
  const result = document.createElement('canvas');
  try {
    cv.warpPerspective(source, output, transform, new cv.Size(width, height));
    cv.imshow(result, output);
    return result;
  } finally {
    source.delete();
    output.delete();
    from.delete();
    to.delete();
    transform.delete();
  }
}

function scannerTitleImage(card, rotated = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 220;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (rotated) {
    const flipped = document.createElement('canvas');
    flipped.width = card.width;
    flipped.height = card.height;
    const flip = flipped.getContext('2d');
    flip.translate(card.width, card.height);
    flip.rotate(Math.PI);
    flip.drawImage(card, 0, 0);
    card = flipped;
  }
  context.filter = 'grayscale(1) contrast(1.6)';
  context.drawImage(
    card,
    card.width * 0.04,
    card.height * 0.025,
    card.width * 0.84,
    card.height * 0.15,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}
