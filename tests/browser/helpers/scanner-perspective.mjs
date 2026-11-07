import { readFile } from 'node:fs/promises';

export async function makeScannerPerspectiveScenes(page) {
  const source = await readFile(
    new URL('../../../assets/scanner/collectorvision/scanner.worker.mjs', import.meta.url),
    'utf8',
  );
  const math = source.slice(
    source.indexOf('function solveLinearSystem('),
    source.indexOf('function normalizeEmbedding('),
  );
  await page.addScriptTag({
    content: `window.scannerTestWarp = (() => { ${math}; return {computeHomography, applyHomography, sampleBilinear}; })();`,
  });
  return page.evaluate(async () => {
    const engine = await scannerGetEngine();
    const photo = new Image();
    photo.src = SCANNER_ASSET_BASE + '/assets/samples/mtg-sample.jpg';
    await photo.decode();
    const original = await engine.recognize(scannerImageCanvas(photo));
    const crop = new Image();
    crop.src = original.thumb;
    await crop.decode();
    const source = document.createElement('canvas');
    source.width = 200;
    source.height = 280;
    source.getContext('2d').drawImage(crop, 0, 0, 200, 280);
    const pixels = source.getContext('2d').getImageData(0, 0, 200, 280);
    const quads = [
      [
        [460, 160],
        [710, 190],
        [685, 535],
        [445, 505],
      ],
      [
        [130, 210],
        [360, 130],
        [460, 460],
        [200, 540],
      ],
    ];
    const scenes = [];
    for (const corners of quads) {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 720;
      const context = canvas.getContext('2d');
      context.fillStyle = '#303236';
      context.fillRect(0, 0, 960, 720);
      const output = context.getImageData(0, 0, 960, 720);
      const inverse = scannerTestWarp.computeHomography(corners, [
        [0, 0],
        [199, 0],
        [199, 279],
        [0, 279],
      ]);
      for (
        let y = Math.floor(Math.min(...corners.map((p) => p[1])));
        y <= Math.ceil(Math.max(...corners.map((p) => p[1])));
        y++
      ) {
        for (
          let x = Math.floor(Math.min(...corners.map((p) => p[0])));
          x <= Math.ceil(Math.max(...corners.map((p) => p[0])));
          x++
        ) {
          const [sx, sy] = scannerTestWarp.applyHomography(inverse, x, y);
          if (sx < 0 || sx > 199 || sy < 0 || sy > 279) continue;
          const offset = (y * 960 + x) * 4;
          for (let channel = 0; channel < 3; channel++)
            output.data[offset + channel] = scannerTestWarp.sampleBilinear(
              pixels.data,
              200,
              280,
              sx,
              sy,
              channel,
            );
        }
      }
      context.putImageData(output, 0, 0);
      scenes.push(canvas.toDataURL('image/png'));
    }
    return scenes;
  });
}
