import { randomBytes, randomUUID } from 'node:crypto';

export function createAccountsStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      verified_at INTEGER, sync_space TEXT NOT NULL UNIQUE REFERENCES sync_links(code_hash),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS account_session_owner ON account_sessions(account_id);
    CREATE TABLE IF NOT EXISTS account_tokens (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('verify','reset')), expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS account_limits (
      bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS account_legacy_claims (
      code_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id)
    ) STRICT;
  `);
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
  const byEmail = db.prepare('SELECT * FROM accounts WHERE email = ?');
  const byId = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const deleteToken = db.prepare('DELETE FROM account_tokens WHERE token_hash = ?');
  const clean = db.prepare('DELETE FROM account_limits WHERE expires_at <= ?');
  return {
    byEmail: (email) => byEmail.get(email) || null,
    byId: (id) => byId.get(id) || null,
    create(email, passwordHash, now) {
      return transaction(() => {
        if (byEmail.get(email)) return null;
        const id = randomUUID(),
          space = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sync_links VALUES (?, 0, ?)').run(space, now);
        db.prepare('INSERT INTO accounts VALUES (?, ?, ?, NULL, ?, ?)').run(
          id,
          email,
          passwordHash,
          space,
          now,
        );
        return byId.get(id);
      });
    },
    session(hash, now) {
      return (
        db
          .prepare(
            `SELECT a.*, s.csrf FROM account_sessions s JOIN accounts a
        ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?`,
          )
          .get(hash, now) || null
      );
    },
    addSession(hash, userId, csrf, expiresAt) {
      db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(Date.now());
      db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?, ?)').run(
        hash,
        userId,
        csrf,
        expiresAt,
      );
    },
    removeSession(hash) {
      db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(hash);
    },
    addToken(hash, userId, kind, expiresAt) {
      db.prepare('DELETE FROM account_tokens WHERE expires_at <= ?').run(Date.now());
      db.prepare('INSERT INTO account_tokens VALUES (?, ?, ?, ?)').run(
        hash,
        userId,
        kind,
        expiresAt,
      );
    },
    removeToken(hash) {
      deleteToken.run(hash);
    },
    token(hash, kind, now) {
      return (
        db
          .prepare(
            'SELECT * FROM account_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?',
          )
          .get(hash, kind, now) || null
      );
    },
    consumeToken(hash, kind, now, passwordHash) {
      return transaction(() => {
        const token = this.token(hash, kind, now);
        if (!token) return false;
        if (kind === 'reset') {
          db.prepare(
            'UPDATE accounts SET password_hash = ?, verified_at = coalesce(verified_at, ?) WHERE id = ?',
          ).run(passwordHash, now, token.account_id);
          db.prepare('DELETE FROM account_sessions WHERE account_id = ?').run(token.account_id);
          // A password change invalidates every outstanding recovery link.
          db.prepare('DELETE FROM account_tokens WHERE account_id = ?').run(token.account_id);
        } else {
          db.prepare('UPDATE accounts SET verified_at = coalesce(verified_at, ?) WHERE id = ?').run(
            now,
            token.account_id,
          );
          db.prepare("DELETE FROM account_tokens WHERE account_id = ? AND kind = 'verify'").run(
            token.account_id,
          );
        }
        return true;
      });
    },
    limit(key, maximum, windowMs, now) {
      clean.run(now);
      const found = db.prepare('SELECT * FROM account_limits WHERE bucket = ?').get(key);
      if (found && found.attempts >= maximum) return false;
      db.prepare(
        `INSERT INTO account_limits VALUES (?, 1, ?) ON CONFLICT(bucket)
        DO UPDATE SET attempts = attempts + 1`,
      ).run(key, now + windowMs);
      return true;
    },
    claimLegacy(hash, userId) {
      return transaction(() => {
        const owner = db
          .prepare('SELECT account_id FROM account_legacy_claims WHERE code_hash = ?')
          .get(hash);
        if (owner) return owner.account_id === userId;
        if (!db.prepare('SELECT 1 FROM sync_links WHERE code_hash = ?').get(hash)) return false;
        const account = byId.get(userId);
        const max = db
          .prepare('SELECT revision FROM sync_links WHERE code_hash = ?')
          .get(account.sync_space).revision;
        db.prepare(
          `INSERT INTO sync_records SELECT ?, record_key, changed_at, ?, value FROM sync_records WHERE code_hash = ?
          ON CONFLICT(code_hash, record_key) DO UPDATE SET changed_at=excluded.changed_at,
          revision=excluded.revision,value=excluded.value WHERE excluded.changed_at > sync_records.changed_at`,
        ).run(account.sync_space, max + 1, hash);
        const bytes = db
          .prepare(
            'SELECT coalesce(sum(length(cast(value AS BLOB)) + length(record_key) + 80),0) AS n FROM sync_records WHERE code_hash = ?',
          )
          .get(account.sync_space).n;
        if (bytes > 60_000_000) throw Object.assign(new Error('size'), { status: 413 });
        db.prepare('UPDATE sync_links SET revision = ? WHERE code_hash = ?').run(
          max + 1,
          account.sync_space,
        );
        db.prepare('INSERT INTO account_legacy_claims VALUES (?, ?)').run(hash, userId);
        return true;
      });
    },
  };
}
