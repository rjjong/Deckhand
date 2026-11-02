// Development tools only. These do not implement the application's sync API.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function verifyDatabase(db) {
  const result = db.prepare('PRAGMA integrity_check').all();
  if (result.length !== 1 || result[0].integrity_check !== 'ok') {
    throw new Error('SQLite integrity check failed.');
  }
}

async function main() {
  const mode = process.argv[2] || 'check';
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('This project uses Node 24. Run fnm install and fnm use.');
  }

  if (mode === 'check') {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE smoke_check (value TEXT NOT NULL)');
      db.prepare('INSERT INTO smoke_check (value) VALUES (?)').run('ready');
      if (db.prepare('SELECT value FROM smoke_check').get().value !== 'ready') {
        throw new Error('SQLite read/write check failed.');
      }
      verifyDatabase(db);
      const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
      console.log(`Node ${process.versions.node}: OK`);
      console.log(`Embedded SQLite ${sqliteVersion}: read/write and integrity OK`);
    } finally {
      db.close();
    }
    console.log('Environment check passed. Start Deckhand with npm run dev.');
    return;
  }

  if (mode !== 'db:init' && mode !== 'db:check') {
    throw new Error(`Unknown command: ${mode}`);
  }
  const path = resolve(process.env.DATABASE_PATH || './var/deckhand.dev.sqlite');
  if (mode === 'db:init') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly: mode === 'db:check' });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    if (mode === 'db:init') db.exec('PRAGMA journal_mode = WAL');
    verifyDatabase(db);
    console.log(`Database ${mode === 'db:init' ? 'initialized' : 'verified'}: ${path}`);
    console.log('Integrity: OK. The server creates its storage tables on startup.');
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
