import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAppVersion, reserveAppVersion, setAppVersion } from '../scripts/app-version.mjs';

async function fixture(
  t,
  state = { version: '2.0.0', date: '2026-11-07', lastBuiltVersion: null },
) {
  const root = await mkdtemp(join(tmpdir(), 'deckhand-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'version.json');
  await writeFile(file, JSON.stringify(state));
  return { root, file };
}

test('the first build is 2.0.0, then every reservation increments the build', async (t) => {
  const { root } = await fixture(t);
  assert.equal((await reserveAppVersion(root)).version, '2.0.0');
  for (let build = 1; build <= 12; build++) {
    assert.equal((await reserveAppVersion(root)).version, `2.0.${build}`);
  }
  const metadata = await readAppVersion(root);
  assert.deepEqual(metadata, { version: '2.0.12', date: new Date().toISOString().slice(0, 10) });
});

test('manual major/minor changes reset the next build, including direct file edits', async (t) => {
  const { root, file } = await fixture(t, {
    version: '2.0.19',
    date: '2026-11-07',
    lastBuiltVersion: '2.0.19',
  });
  await setAppVersion('2.1', root);
  assert.equal((await reserveAppVersion(root)).version, '2.1.0');
  assert.equal((await reserveAppVersion(root)).version, '2.1.1');
  await setAppVersion('3.0', root);
  assert.equal((await reserveAppVersion(root)).version, '3.0.0');
  const state = JSON.parse(await readFile(file, 'utf8'));
  state.version = '3.2.83';
  await writeFile(file, JSON.stringify(state));
  assert.equal((await reserveAppVersion(root)).version, '3.2.0');
  await setAppVersion('3.2', root);
  assert.equal((await reserveAppVersion(root)).version, '3.2.1');
});

test('reusing an assigned version does not change the file or consume a build number', async (t) => {
  const { root, file } = await fixture(t);
  const initial = await readFile(file, 'utf8');
  assert.equal((await readAppVersion(root)).version, '2.0.0');
  assert.equal((await readAppVersion(root)).version, '2.0.0');
  assert.equal(await readFile(file, 'utf8'), initial);
  await reserveAppVersion(root);
  for (let i = 0; i < 3; i++) assert.equal((await readAppVersion(root)).version, '2.0.0');
  assert.equal((await reserveAppVersion(root)).version, '2.0.1');
});

test('concurrent reservations receive distinct, persistent build numbers', async (t) => {
  const { root } = await fixture(t);
  const versions = await Promise.all(Array.from({ length: 8 }, () => reserveAppVersion(root)));
  assert.deepEqual(
    versions.map(({ version }) => version).sort(),
    Array.from({ length: 8 }, (_, build) => `2.0.${build}`),
  );
  assert.equal((await readAppVersion(root)).version, '2.0.7');
});

test('invalid versions never overwrite the counter and failed reservations release the lock', async (t) => {
  const { root, file } = await fixture(t);
  for (const version of [
    '2.0',
    '02.0.1',
    '2.1.-1',
    '2.0.1-beta',
    '2.0.9007199254740992',
    '<script>',
  ]) {
    const value = JSON.stringify({ version, date: '2026-11-07' });
    await writeFile(file, value);
    await assert.rejects(reserveAppVersion(root), /version/i);
    assert.equal(await readFile(file, 'utf8'), value);
  }
  await writeFile(file, JSON.stringify({ version: '2.0.0', date: '2026-11-07' }));
  assert.throws(() => setAppVersion('2.1.3', root), /Major.Minor/);
  assert.equal((await reserveAppVersion(root)).version, '2.0.0');
});
