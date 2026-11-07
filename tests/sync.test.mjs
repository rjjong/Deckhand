import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../server/storage.mjs';
import { handle, idOf } from '../server/services/sync.mjs';
import records from '../shared/sync-records.cjs';

test('scanner preferences project, validate and persist as independent numeric/boolean settings', async (t) => {
  const storage = openStorage(':memory:');
  t.after(() => storage.close());
  const ctx = { sync: storage.sync };
  const code = (await handle({ op: 'create' }, ctx)).json.code;
  const raw = {
    theme: 'dark',
    scannerDebounceMs: 2500,
    scannerIgnoreSession: true,
    scannerIdThreshold: 0.72,
    scannerCornerThreshold: 0.08,
    scannerIntervalMs: 950,
    scannerShowFramerate: true,
  };
  const projected = records.syncProjectStorage('settings:app', JSON.stringify(raw));
  assert.equal(projected['setting:scannerDebounceMs'], '2500');
  assert.equal(projected['setting:scannerIgnoreSession'], 'true');
  const changes = Object.fromEntries(
    Object.entries(projected).map(([key, v]) => [key, { t: 1, v }]),
  );
  assert.equal((await handle({ op: 'sync', code, changes }, ctx)).status, 200);
  const saved = (await handle({ op: 'sync', code, since: 0 }, ctx)).json.changes;
  const values = Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, value.v]));
  assert.deepEqual(JSON.parse(records.syncRestoreStorage('settings:app', values)), raw);
  for (const value of ['2500', -1, 60001, 2.5, null])
    assert.equal(
      records.syncRecordValid('setting:scannerDebounceMs', JSON.stringify(value)),
      false,
    );
  for (const value of ['true', 1, {}, null])
    assert.equal(
      records.syncRecordValid('setting:scannerIgnoreSession', JSON.stringify(value)),
      false,
    );
  assert.equal(records.syncRecordValid('setting:scannerIgnoreSession', 'false'), true);
  assert.equal(records.syncRecordValid('setting:scannerDebounceMs', '0'), true);
  for (const key of ['scannerIdThreshold', 'scannerCornerThreshold']) {
    for (const value of ['0.5', -0.1, 1.01, null, true])
      assert.equal(records.syncRecordValid('setting:' + key, JSON.stringify(value)), false);
    for (const value of [0, 0.6, 1])
      assert.equal(records.syncRecordValid('setting:' + key, JSON.stringify(value)), true);
  }
  for (const value of ['650', 99, 10001, 650.1, null])
    assert.equal(
      records.syncRecordValid('setting:scannerIntervalMs', JSON.stringify(value)),
      false,
    );
  assert.equal(records.syncRecordValid('setting:scannerIntervalMs', '100'), true);
  assert.equal(records.syncRecordValid('setting:scannerIntervalMs', '10000'), true);
  assert.equal(records.syncRecordValid('setting:scannerShowFramerate', 'true'), true);
  assert.equal(records.syncRecordValid('setting:scannerShowFramerate', 'false'), true);
  assert.equal(records.syncRecordValid('setting:scannerShowFramerate', '1'), false);
});

test('sync codes isolate SQLite data across restarts without storing credentials or the code', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'deckhand-sync-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'sync.sqlite');
  let storage = openStorage(path);
  let ctx = { sync: storage.sync };
  const first = await handle({ op: 'create', username: 'ignored', password: 'ignored' }, ctx);
  const second = await handle({ op: 'create' }, ctx);
  assert.equal(first.status, 201);
  const code = first.json.code;
  assert.match(code, /^(?:[A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
  const deck = JSON.stringify({ id: 'persisted', name: 'Persisted deck', cards: [] });
  assert.equal(
    (await handle({ op: 'sync', code, changes: { 'deck:persisted': { t: 1, v: deck } } }, ctx))
      .status,
    200,
  );
  storage.close();
  storage = openStorage(path);
  t.after(() => storage.close());
  ctx = { sync: storage.sync };
  const restored = await handle(
    { op: 'sync', code: code.toLowerCase().replaceAll('-', ' '), since: 0 },
    ctx,
  );
  assert.equal(restored.json.changes['deck:persisted'].v, deck);
  assert.deepEqual(
    Object.keys((await handle({ op: 'sync', code: second.json.code }, ctx)).json.changes),
    [],
  );
  assert.equal(
    (await handle({ op: 'probe', code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ' }, ctx)).status,
    404,
  );
  const db = new DatabaseSync(path, { readOnly: true });
  const links = db.prepare('SELECT * FROM sync_links').all();
  assert.equal(links.length, 2);
  assert.equal(links[0].code_hash.length, 64);
  const content =
    JSON.stringify(links) + JSON.stringify(db.prepare('SELECT * FROM sync_records').all());
  assert.ok(!content.includes(code));
  assert.ok(
    !content.includes('username') && !content.includes('password') && !content.includes('ignored'),
  );
  db.close();
});

test('legacy SQLite sync documents migrate without changing the existing code', async (t) => {
  const storage = openStorage(':memory:');
  t.after(() => storage.close());
  const code = 'LEGACY12345678901234';
  const collection = {
    items: [{ name: 'Island', set: 'tst', qty: 3, cond: 'NM' }],
    binders: [{ id: 'b1', name: 'Binder' }],
    wantsManual: [],
    wantsExclude: [],
  };
  const game = { id: 'game-1', t: 50, d: { players: [{ name: 'Player', life: 20 }] } };
  await storage.store('deckhand-sync').setJSON(idOf(code), {
    rev: 8,
    keys: {
      collection: { t: 10, r: 2, v: JSON.stringify(collection) },
      'settings:app': {
        t: 11,
        r: 3,
        v: JSON.stringify({ theme: 'light', guild: 'dimir', startupPage: 'life' }),
      },
      lifeSaves: { t: 12, r: 4, v: JSON.stringify([game]) },
      'deck:deleted': { t: 15, r: 8, del: 1 },
      username: { t: 16, r: 8, v: 'not an account' },
    },
  });
  const ctx = { sync: storage.sync, legacy: storage.store('deckhand-sync') };
  const result = await handle({ op: 'sync', code }, ctx);
  assert.equal(result.status, 200);
  assert.equal(result.json.rev, 8);
  assert.equal(JSON.parse(result.json.changes[records.syncItemKey(collection.items[0])].v).qty, 3);
  assert.equal(result.json.changes['saved-game:game-1'].v, JSON.stringify(game));
  assert.equal(result.json.changes['setting:guild'].v, '"dimir"');
  assert.deepEqual(result.json.changes['deck:deleted'], { t: 15, del: 1 });
  assert.equal(Object.hasOwn(result.json.changes, 'username'), false);
});

test('collection records preserve independent cards, binders, wants, and printing identities', () => {
  const collection = {
    items: [
      { name: 'A "card"', qty: 2, cond: 'NM', foil: false, binder: 'b1' },
      { name: 'A "card"', qty: 1, cond: 'NM', foil: true },
    ],
    binders: [{ id: 'b1', name: 'Trades' }],
    wantsManual: [{ name: 'Want' }],
    wantsExclude: ['Excluded & card'],
  };
  const projected = records.syncProjectStorage('collection', JSON.stringify(collection));
  assert.equal(Object.keys(projected).length, 5);
  for (const [key, value] of Object.entries(projected))
    assert.equal(records.syncRecordValid(key, value), true, key);
  assert.deepEqual(JSON.parse(records.syncRestoreStorage('collection', projected)), collection);
  projected[records.syncItemKey({ name: 'Independent card' })] = JSON.stringify({
    name: 'Independent card',
    qty: 1,
  });
  assert.equal(JSON.parse(records.syncRestoreStorage('collection', projected)).items.length, 3);
});

test('SQLite sync validates whole changesets before writing and returns winners for rejected old edits', async (t) => {
  const storage = openStorage(':memory:');
  t.after(() => storage.close());
  const ctx = { sync: storage.sync },
    code = (await handle({ op: 'create' }, ctx)).json.code;
  await handle({ op: 'sync', code, changes: { 'setting:theme': { t: 20, v: '"dark"' } } }, ctx);
  const conflict = await handle(
    { op: 'sync', code, since: 1, changes: { 'setting:theme': { t: 20, v: '"light"' } } },
    ctx,
  );
  assert.equal(conflict.json.current['setting:theme'].v, '"dark"');
  assert.equal(conflict.json.rev, 1);
  for (const changes of [
    { username: { t: 21, v: 'user' } },
    { password: { t: 21, v: 'secret' } },
    { 'setting:theme': { t: 21, v: 'not-json' } },
    { 'deck:a': { t: 21, v: JSON.stringify({ id: 'b', cards: [] }) } },
    { 'setting:guild': { t: 21, v: '"simic"' }, 'arbitrary-key': { t: 21, v: 'bad' } },
  ])
    assert.equal((await handle({ op: 'sync', code, changes }, ctx)).status, 400);
  assert.equal((await handle({ op: 'probe', code }, ctx)).json.rev, 1);
});

test('saved-game projection merges devices and shows the ten newest games', () => {
  const all = Object.create(null);
  for (let i = 0; i < 12; i++)
    all['saved-game:' + i] = JSON.stringify({ id: String(i), t: i, d: { players: [] } });
  const games = JSON.parse(records.syncRestoreStorage('lifeSaves', all));
  assert.equal(games.length, 10);
  assert.equal(games[0].id, '11');
  assert.equal(games.at(-1).id, '2');
  assert.equal(records.syncRecordAllowed('syncState'), false);
  assert.equal(records.syncRecordAllowed('prices'), false);
  assert.equal(records.syncRecordAllowed('packages'), false);
  assert.equal(records.syncRecordAllowed('lifeBright'), false);
});
