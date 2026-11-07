import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { scannerAssets, scannerDetector } from '../scripts/scanner-assets.mjs';

test('the Fastweb detector and shipped manifest agree with the pinned artifact', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../assets/scanner/collectorvision/manifest.json', import.meta.url)),
  );
  const model = await readFile(new URL('../' + scannerDetector.file, import.meta.url));
  assert.equal(model.length, scannerDetector.size);
  assert.equal(createHash('sha256').update(model).digest('hex'), scannerDetector.sha256);
  assert.equal(manifest.model_ids.detector, scannerDetector.id);
  assert.equal(manifest.model_hashes.detector, 'sha256:' + scannerDetector.sha256);
  assert.equal(manifest.model_sizes.detector, scannerDetector.size);
  assert.ok(
    scannerAssets.some(
      (asset) =>
        asset.source === scannerDetector.file &&
        asset.target.endsWith('/' + manifest.models.detector),
    ),
  );
  assert.equal(manifest.detector.outputs.sharpness, 'sharpness');
  assert.equal(manifest.detector.input_size, 384);
  assert.ok(scannerDetector.url.includes(scannerDetector.revision));
});
