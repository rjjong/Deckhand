import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createZstdDecompress } from 'node:zlib';
import {
  scannerBundleDirectory,
  scannerBundleFiles,
  scannerBundleHash,
  scannerBundleUrl,
  scannerDetector,
} from './scanner-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let preparation;

async function installed() {
  try {
    await Promise.all(
      scannerBundleFiles.map((file) => access(resolve(root, scannerBundleDirectory, file))),
    );
    return true;
  } catch {
    return false;
  }
}

async function prepareBundle() {
  if (await installed()) return;
  console.log('Preparing CollectorVision models and runtime (one-time download)…');
  const response = await fetch(scannerBundleUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw new Error('CollectorVision assets could not download: HTTP ' + response.status);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 64 * 1024 * 1024) {
      throw new Error('CollectorVision bundle exceeds its download limit.');
    }
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (createHash('sha256').update(archive).digest('hex') !== scannerBundleHash) {
    throw new Error(
      'CollectorVision bundle checksum changed. Update the pinned assets before building.',
    );
  }
  const destination = resolve(root, scannerBundleDirectory);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(resolve(dirname(destination), '.install-'));
  try {
    // Extract only known paths from the verified upstream archive, without
    // restoring its ownership or permission bits. No external code is executed.
    const tar = spawn(
      'tar',
      [
        '-xf',
        '-',
        '--no-same-owner',
        '--no-same-permissions',
        '-C',
        temporary,
        ...scannerBundleFiles,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    const done = new Promise((resolve, reject) => {
      tar.on('error', reject);
      tar.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Could not unpack CollectorVision assets.')),
      );
    });
    await Promise.all([
      pipeline(Readable.from([archive]), createZstdDecompress(), tar.stdin),
      done,
    ]);
    await Promise.all(scannerBundleFiles.map((file) => access(resolve(temporary, file))));
    if (await installed()) return;
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function prepareDetector() {
  const destination = resolve(root, scannerDetector.file);
  try {
    await access(destination);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  console.log('Preparing Fastweb-Single 1.39 card detector (one-time download)…');
  const response = await fetch(scannerDetector.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Card detector download failed: HTTP ' + response.status);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > scannerDetector.size) throw new Error('Card detector exceeds its download limit.');
    chunks.push(chunk);
  }
  const model = Buffer.concat(chunks);
  if (
    bytes !== scannerDetector.size ||
    createHash('sha256').update(model).digest('hex') !== scannerDetector.sha256
  )
    throw new Error('Card detector checksum did not match its pinned release.');
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(resolve(dirname(destination), '.detector-'));
  try {
    const file = resolve(temporary, 'model.onnx');
    await writeFile(file, model);
    await rename(file, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function prepare() {
  await prepareBundle();
  await prepareDetector();
}

export function prepareScannerAssets() {
  return (preparation ||= prepare().catch((error) => {
    preparation = null;
    throw error;
  }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await prepareScannerAssets();
}
