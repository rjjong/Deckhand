// Scanner libraries load on demand; the normal app startup stays small.
export const scannerAssets = [
  ['@techstark/opencv-js/dist/opencv.js', 'opencv.js'],
  ['tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  ...['', '-simd', '-relaxedsimd'].flatMap((suffix) =>
    ['', '-lstm'].flatMap((lstm) =>
      ['wasm.js', 'wasm'].map((extension) => {
        const file = `tesseract-core${suffix}${lstm}.${extension}`;
        return ['tesseract.js-core/' + file, file];
      }),
    ),
  ),
  ['tesseract.js/dist/tesseract.min.js.LICENSE.txt', 'TESSERACT-NOTICES.txt'],
  ['tesseract.js-core/LICENSE', 'TESSERACT-CORE-LICENSE.txt'],
  ['@techstark/opencv-js/LICENSE', 'OPENCV-LICENSE.txt'],
].map(([source, name]) => ({ source: 'node_modules/' + source, target: 'assets/scanner/' + name }));

scannerAssets.push(
  ...['NOTICE.txt', 'TESSDATA-LICENSE.txt'].map((name) => ({
    source: 'assets/scanner/' + name,
    target: 'assets/scanner/' + name,
  })),
);
