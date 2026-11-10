import { parentPort, workerData } from 'node:worker_threads';
import { loadCatalog, saveCatalog, updateCatalog, catalogStatus } from './catalog.mjs';

let catalog = null, updating = null, timer, closed = false;
let checkedAt = null, updatedAt = null, updateError = false;
function status() {
  return { ...catalogStatus(catalog), checkedAt, updatedAt, updateError, updating: !!updating };
}
function publish() { parentPort.postMessage({ type: 'status', status: status() }); }

async function refresh() {
  if (updating) return updating;
  updating = (async () => {
    try {
      const next = await updateCatalog(catalog);
      if (next !== catalog) {
        await saveCatalog(workerData.directory, next);
        catalog = next;
        updatedAt = new Date().toISOString();
      }
      updateError = false;
    } catch (error) {
      updateError = true;
      console.error('Scanner catalog update failed; retaining last good copy:', error.message);
    } finally {
      checkedAt = new Date().toISOString();
      updating = null;
      publish();
      if (!closed) {
        timer = setTimeout(refresh, updateError ? 5 * 60_000 : 6 * 60 * 60_000);
        timer.unref();
      }
    }
  })();
  publish();
  return updating;
}

parentPort.on('message', ({ type, id, embedding }) => {
  if (type !== 'lookup') return;
  if (!catalog) return parentPort.postMessage({ id, error: 'catalog_unavailable' });
  const started = performance.now();
  const [match] = catalog.searchRecords(Float32Array.from(embedding), 1);
  // Send only the best printing; no need to transfer catalog records or photos.
  parentPort.postMessage({ id, result: {
    match: { score: match.score, cardId: match.card_id, cardName: match.name,
      secondaryId: match.identifiers.scryfall_oracle ?? null, secondaryIdField: 'scryfallOracleId' },
    catalog: catalogStatus(catalog), searchMs: performance.now() - started,
  } });
});

try { catalog = await loadCatalog(workerData.directory); }
catch (error) { console.error('Scanner snapshot:', error.message); }
publish();
if (workerData.autoUpdate !== false) void refresh();
parentPort.on('close', () => { closed = true; clearTimeout(timer); });
