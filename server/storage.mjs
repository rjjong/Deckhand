import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// The small store interface used by the existing sync and AI handlers.
// Conditional writes are single SQL statements, so concurrent sync requests
// cannot silently overwrite each other's document revisions.
export function openStorage(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS blobs (
      store TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      metadata TEXT NOT NULL,
      etag TEXT NOT NULL,
      PRIMARY KEY (store, key)
    ) STRICT;`);
  const read = db.prepare('SELECT value, metadata, etag FROM blobs WHERE store = ? AND key = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO blobs VALUES (?, ?, ?, ?, ?)');
  const replace = db.prepare(`INSERT INTO blobs VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(store, key) DO UPDATE SET
      value = excluded.value, metadata = excluded.metadata, etag = excluded.etag`);
  const compare = db.prepare('UPDATE blobs SET value = ?, metadata = ?, etag = ? WHERE store = ? AND key = ? AND etag = ?');
  const remove = db.prepare('DELETE FROM blobs WHERE store = ? AND key = ?');
  const list = db.prepare('SELECT key FROM blobs WHERE store = ? ORDER BY key');
  function store(name) {
    return {
      async get(key) {
        const row = read.get(name, key);
        return row ? JSON.parse(row.value) : null;
      },
      async getWithMetadata(key) {
        const row = read.get(name, key);
        return row ? { data: JSON.parse(row.value), metadata: JSON.parse(row.metadata), etag: row.etag } : null;
      },
      async getMetadata(key) {
        const row = read.get(name, key);
        return row ? { metadata: JSON.parse(row.metadata), etag: row.etag } : null;
      },
      async setJSON(key, value, options = {}) {
        const json = JSON.stringify(value), metadata = JSON.stringify(options.metadata || {});
        const etag = randomUUID();
        let result;
        if (options.onlyIfMatch) result = compare.run(json, metadata, etag, name, key, options.onlyIfMatch);
        else if (options.onlyIfNew) result = insert.run(name, key, json, metadata, etag);
        else result = replace.run(name, key, json, metadata, etag);
        return { modified: result.changes > 0, etag };
      },
      async delete(key) { remove.run(name, key); },
      async list() { return { blobs: list.all(name).map(row => ({ key: row.key })) }; }
    };
  }
  return { store, close: () => db.close(), healthy: () => db.prepare('SELECT 1').get() };
}
