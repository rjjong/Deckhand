import records from '../shared/sync-records.cjs';

const PAGE_BYTES = 3_500_000;
const SPACE_BYTES = 60_000_000;

export function createSyncStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_links (
      code_hash TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sync_records (
      code_hash TEXT NOT NULL REFERENCES sync_links(code_hash),
      record_key TEXT NOT NULL,
      changed_at REAL NOT NULL,
      revision INTEGER NOT NULL,
      value TEXT,
      PRIMARY KEY (code_hash, record_key)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sync_records_revision ON sync_records(code_hash, revision, record_key);
  `);
  const link = db.prepare('SELECT revision FROM sync_links WHERE code_hash = ?');
  const create = db.prepare('INSERT OR IGNORE INTO sync_links VALUES (?, 0, ?)');
  const current = db.prepare(
    'SELECT changed_at AS t, value AS v FROM sync_records WHERE code_hash = ? AND record_key = ?',
  );
  const put = db.prepare(`INSERT INTO sync_records VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code_hash, record_key) DO UPDATE SET changed_at=excluded.changed_at,
    revision=excluded.revision, value=excluded.value`);
  const revision = db.prepare('UPDATE sync_links SET revision = ? WHERE code_hash = ?');
  const size = db.prepare(
    'SELECT coalesce(sum(coalesce(length(cast(value AS BLOB)), 0) + length(record_key) + 80), 0) AS bytes FROM sync_records WHERE code_hash = ?',
  );
  const page = db.prepare(`SELECT record_key AS k, changed_at AS t, revision AS r, value AS v
    FROM sync_records WHERE code_hash = ? AND revision > ? AND revision <= ?
    AND (revision > ? OR (revision = ? AND record_key > ?)) ORDER BY revision, record_key`);
  const transaction = (run) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = run();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  return {
    create(hash) {
      return create.run(hash, Date.now()).changes > 0;
    },
    probe(hash) {
      return link.get(hash)?.revision ?? null;
    },
    migrate(hash, document) {
      return transaction(() => {
        if (link.get(hash)) return;
        create.run(hash, Date.now());
        let rev = Math.max(1, Number(document.rev) || 0);
        for (const [key, entry] of Object.entries(document.keys || {})) {
          if (!entry || !Number.isFinite(entry.t)) continue;
          const projected = records.syncRecordAllowed(key)
            ? { [key]: entry.v }
            : records.SYNC_SOURCES.includes(key) && !entry.del
              ? records.syncProjectStorage(key, entry.v)
              : {};
          for (const [name, value] of Object.entries(projected)) {
            if (!entry.del && !records.syncRecordValid(name, value)) continue;
            const old = current.get(hash, name);
            if (!old || entry.t > old.t)
              put.run(hash, name, entry.t, rev, entry.del ? null : value);
          }
        }
        revision.run(rev, hash);
      });
    },
    exchange(hash, { since, changes, after }) {
      return transaction(() => {
        const found = link.get(hash);
        if (!found) return null;
        let rev = found.revision;
        const rejected = Object.create(null);
        for (const [key, change] of Object.entries(changes)) {
          const old = current.get(hash, key);
          if (old && change.t <= old.t) {
            rejected[key] = old.v === null ? { t: old.t, del: 1 } : { t: old.t, v: old.v };
            continue;
          }
          put.run(hash, key, change.t, found.revision + 1, change.del ? null : change.v);
          rev = found.revision + 1;
        }
        if (size.get(hash).bytes > SPACE_BYTES)
          throw Object.assign(new Error('size'), { status: 413 });
        if (rev !== found.revision) revision.run(rev, hash);
        // A pagination cursor retains its original high-water mark even if
        // another device writes while the following pages are being read.
        const until = after ? after.until : rev;
        if (since > rev || until > rev || until < since)
          throw Object.assign(new Error('revision'), { status: 409 });
        const out = Object.create(null);
        let bytes = 0,
          last,
          more = null;
        const cursor = after || { r: since, k: '' };
        for (const row of page.iterate(hash, since, until, cursor.r, cursor.r, cursor.k)) {
          const item = row.v === null ? { t: row.t, del: 1 } : { t: row.t, v: row.v };
          const length = Buffer.byteLength(JSON.stringify(item)) + Buffer.byteLength(row.k) + 8;
          if (bytes && bytes + length > PAGE_BYTES) {
            more = { r: last.r, k: last.k, until };
            break;
          }
          out[row.k] = item;
          bytes += length;
          last = row;
        }
        return { rev: until, changes: out, current: rejected, more };
      });
    },
  };
}
