// CollectorVision is warmed in the background after the app's first page loads.
export const scannerBundleHash = '6138910aedad5108c40bd0f2afffaef216326474594b53c128ad4e9cc158eb97';
export const scannerBundleUrl =
  'https://github.com/HanClinto/CollectorVision/releases/download/web-scanner-assets/web-scanner-assets.tar.zst';
export const scannerBundleDirectory = 'assets/scanner/generated/' + scannerBundleHash.slice(0, 12);
export const scannerDetector = {
  id: 'fastweb-single-1.39',
  revision: '2ef37ff78ee80ad4c3558e4a15341e447ff8a1be',
  sha256: '05d2b90b928a5a3bf0f49aa90aa86211b2103d9c347c238fd18b4f544b3cb8ca',
  size: 3185226,
  file: 'assets/scanner/generated/fastweb-single-1.39-05d2b90b928a.onnx',
  url: 'https://huggingface.co/HanClinto/ccgdetector-fastweb-single/resolve/2ef37ff78ee80ad4c3558e4a15341e447ff8a1be/fastweb-single-1.39.onnx',
};
export const scannerBundleFiles = [
  'assets/models/milo.onnx',
  'assets/catalog/scryfall-mtg-embeddings.f16.bin',
  'assets/catalog/scryfall-mtg-card-ids.json',
  'assets/catalog/scryfall-mtg-oracle-ids.json',
  'assets/samples/mtg-sample.jpg',
  'vendor/onnxruntime-web/ort.webgpu.min.mjs',
  'vendor/onnxruntime-web/ort.webgpu.min.mjs.map',
  'vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs',
  'vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm',
];

export const scannerAssets = [
  ...scannerBundleFiles.map((file) => ({
    source: scannerBundleDirectory + '/' + file,
    target: 'assets/scanner/collectorvision/' + file,
  })),
  {
    source: scannerDetector.file,
    target: 'assets/scanner/collectorvision/assets/models/fastweb-single-1.39.onnx',
  },
  {
    source: 'assets/scanner/collectorvision/manifest.json',
    target: 'assets/scanner/collectorvision/assets/manifest.json',
  },
  ...[
    'scanner.worker.mjs',
    'LICENSE',
    'ONNXRUNTIME-LICENSE.txt',
    'UPSTREAM.json',
    'NOTICE.txt',
  ].map((file) => ({
    source: 'assets/scanner/collectorvision/' + file,
    target: 'assets/scanner/collectorvision/' + file,
  })),
];
