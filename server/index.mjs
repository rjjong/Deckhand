import { resolve } from 'node:path';
import { createApp } from './app.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const databasePath = resolve(process.env.DATABASE_PATH || './var/deckhand.dev.sqlite');
const app = createApp({ databasePath, dataDirectory: resolve(process.env.DATA_DIR || './var/data-sample') });
app.server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
  app.close();
});
app.server.listen(port, host, () => {
  console.log(`Deckhand: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`SQLite: ${databasePath}`);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
