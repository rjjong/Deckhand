import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticFiles, media } from '../scripts/frontend-sources.mjs';
import { scannerAssets } from '../scripts/scanner-assets.mjs';

const run = promisify(execFile);
const source = fileURLToPath(new URL('../', import.meta.url));

test('CLI builds, Docker builds and deployment packaging assign one consistent version each', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deckhand-build-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function copy(file) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(source, file), join(root, file));
  }
  for (const directory of ['src', 'styles', 'shared']) {
    await symlink(join(source, directory), join(root, directory), 'dir');
  }
  for (const file of [
    ...staticFiles,
    ...media,
    'scripts/build-frontend.mjs',
    'scripts/app-version.mjs',
    'scripts/frontend-sources.mjs',
    'scripts/scanner-assets.mjs',
    'scripts/build-docker.mjs',
    'scripts/server/deploy.py',
    'Dockerfile',
  ])
    await copy(file);
  // The build only copies these libraries; fixtures need no downloads or OCR.
  for (const { source: file } of scannerAssets) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), 'test asset');
  }
  const versionFile = join(root, 'version.json');
  await writeFile(
    versionFile,
    JSON.stringify({ version: '2.0.0', date: '2026-11-07', lastBuiltVersion: null }),
  );
  const json = async (file) => JSON.parse(await readFile(join(root, file), 'utf8'));
  const node = (file, args = [], env = process.env) =>
    run(process.execPath, [join(root, file), ...args], { cwd: root, env });
  async function builtVersion(expected) {
    assert.equal((await json('version.json')).version, expected);
    assert.equal((await json('public/version.json')).version, expected);
    const bundle = await readFile(join(root, 'public/assets/app.js'), 'utf8');
    assert.ok(bundle.includes(`const DECKHAND_VERSION = '${expected}';`));
    const hash = bundle.match(/const DECKHAND_BUILD = '([a-f0-9]+)'/)[1];
    const html = await readFile(join(root, 'public/index.html'), 'utf8');
    const worker = await readFile(join(root, 'public/sw.js'), 'utf8');
    assert.ok(html.includes(`assets/app.js?v=${hash}`));
    assert.ok(worker.includes(`const BUILD = '${hash}'`));
    return hash;
  }

  await node('scripts/build-frontend.mjs');
  const first = await builtVersion('2.0.0');
  await node('scripts/build-frontend.mjs');
  const second = await builtVersion('2.0.1');
  assert.notEqual(first, second, 'A build-only increment must invalidate old app shells');
  await node('scripts/build-frontend.mjs', ['--reuse-version']);
  assert.equal(await builtVersion('2.0.1'), second);
  await node('scripts/app-version.mjs', ['--set', '2.1']);
  await node('scripts/build-frontend.mjs');
  await builtVersion('2.1.0');

  const bin = join(root, 'bin');
  await mkdir(bin);
  const env = {
    ...process.env,
    PATH: bin + ':' + process.env.PATH,
    DECKHAND_TEST_NODE: process.execPath,
    DECKHAND_TEST_ROOT: root,
    DECKHAND_TEST_UPLOAD: join(root, 'uploaded.tar.gz'),
  };
  await writeFile(
    join(bin, 'docker'),
    '#!/bin/sh\nexec "$DECKHAND_TEST_NODE" "$DECKHAND_TEST_ROOT/scripts/build-frontend.mjs" --reuse-version\n',
    { mode: 0o755 },
  );
  await node('scripts/build-docker.mjs', [], env);
  await builtVersion('2.1.1');

  // Exercise the actual deployment archive without connecting to any server.
  await writeFile(join(bin, 'scp'), '#!/bin/sh\ncp "$2" "$DECKHAND_TEST_UPLOAD"\n', {
    mode: 0o755,
  });
  await writeFile(join(bin, 'ssh'), '#!/bin/sh\ncat >/dev/null\n', { mode: 0o755 });
  await run('python3', [join(root, 'scripts/server/deploy.py'), 'test-server'], { cwd: root, env });
  const { stdout } = await run('python3', [
    '-c',
    'import json,sys,tarfile; t=tarfile.open(sys.argv[1]); print(json.dumps(json.load(t.extractfile("version.json"))))',
    env.DECKHAND_TEST_UPLOAD,
  ]);
  const packaged = JSON.parse(stdout);
  assert.equal(packaged.version, '2.1.2');
  assert.equal(packaged.lastBuiltVersion, '2.1.2');
  assert.equal((await json('version.json')).lastBuiltVersion, '2.1.2');
});
