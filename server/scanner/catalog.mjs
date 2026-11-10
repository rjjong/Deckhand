import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserCatalogV2, CatalogV2FeedClient } from './vendor/collectorvision-catalog-v2.mjs';

export const FEED_URL = 'https://hanclinto.github.io/CollectorVisionCatalog/catalog-v2/catalog-feed-v2.json';
export const CATALOG_KEY = 'milo1/scryfall/mtg';
export const MODEL = 'sha256:bd13d8d60383c69da04dce261f32e93fdaeaa8fd618fbc991e7385f71b3d45df';
export const DIMENSIONS = 128;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function compatible(embedding) {
  return typeof embedding?.model === 'string' && embedding.model.endsWith('@' + MODEL) && embedding.dimensions === DIMENSIONS &&
    embedding.dtype === 'float16' && embedding.byte_order === 'little' && embedding.layout === 'row-major';
}

// Downloads are bounded, including chunked responses. Only published assets
// under the trusted catalog directory can be fetched, never arbitrary feed URLs.
async function download(url, limit, fetchImpl) {
  const target = new URL(url);
  if (target.origin !== 'https://hanclinto.github.io' ||
      !target.pathname.startsWith('/CollectorVisionCatalog/catalog-v2/')) throw new Error('Untrusted catalog asset URL');
  const response = await fetchImpl(target, { signal: AbortSignal.timeout(120_000), redirect: 'error' });
  if (!response.ok) throw new Error('Catalog download failed (' + response.status + ')');
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Catalog asset too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Catalog asset too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function updateCatalog(previous, { fetchImpl = fetch } = {}) {
  const feedBytes = await download(FEED_URL, 4 * 1024 * 1024, fetchImpl);
  const feed = JSON.parse(feedBytes);
  const family = feed.families?.milo1;
  const advertised = family?.catalogs?.['scryfall/mtg'];
  if (!compatible(family?.embedding)) throw new Error('Catalog requires a different Milo1 model');
  if (!Number.isSafeInteger(advertised?.rows) || advertised.rows < 1 || advertised.rows > 500_000)
    throw new Error('Invalid catalog size');
  if (previous && advertised.current_version < previous.version) throw new Error('Catalog version went backwards');
  // The upstream client validates exact predecessor deltas, row counts, asset
  // lengths and SHA-256, and falls back to the latest base when a delta expires.
  const client = new CatalogV2FeedClient({ cache: null, feedUrl: FEED_URL,
    fetchImpl: async url => new Response(String(url) === FEED_URL ? feedBytes
      : await download(url, 80 * 1024 * 1024, fetchImpl)),
  });
  return client.loadCatalog(CATALOG_KEY, { previous, includeMetadata: false });
}

// A generation is fully written before the small pointer is atomically swapped.
// Keep its predecessor so even a damaged current snapshot has an offline fallback.
export async function saveCatalog(directory, catalog) {
  await mkdir(directory, { recursive: true });
  const generation = catalog.version + '-' + randomUUID();
  const target = join(directory, generation);
  await mkdir(target);
  try {
    const { embeddings, records, ...properties } = catalog;
    const matrix = Buffer.from(embeddings.buffer, embeddings.byteOffset, embeddings.byteLength);
    const recordBytes = Buffer.from(JSON.stringify(records));
    const state = { properties, rows: catalog.rows, hashes: { embeddings: hash(matrix), records: hash(recordBytes) } };
    await writeFile(join(target, 'embeddings.f16'), matrix);
    await writeFile(join(target, 'records.json'), recordBytes);
    await writeFile(join(target, 'state.json'), JSON.stringify(state));
    let old = {};
    try { old = JSON.parse(await readFile(join(directory, 'current.json'), 'utf8')); } catch {}
    const pointer = join(directory, 'current-' + randomUUID() + '.tmp');
    await writeFile(pointer, JSON.stringify({ current: generation, previous: old.current }));
    await rename(pointer, join(directory, 'current.json'));
    if (validGeneration(old.previous) && old.previous !== old.current)
      await rm(join(directory, old.previous), { recursive: true, force: true }).catch(() => {});
  } catch (error) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function validGeneration(value) { return typeof value === 'string' && /^\d+-[a-f0-9-]{36}$/.test(value); }

export async function loadCatalog(directory) {
  let pointer;
  try { pointer = JSON.parse(await readFile(join(directory, 'current.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  for (const generation of [pointer.current, pointer.previous]) {
    if (!validGeneration(generation)) continue;
    try {
      const target = join(directory, generation);
      const state = JSON.parse(await readFile(join(target, 'state.json'), 'utf8'));
      const matrix = await readFile(join(target, 'embeddings.f16'));
      const records = await readFile(join(target, 'records.json'));
      if (!compatible(state.properties.embedding) || state.properties.catalogKey !== CATALOG_KEY ||
          hash(matrix) !== state.hashes.embeddings || hash(records) !== state.hashes.records)
        throw new Error('Damaged or incompatible scanner catalog');
      const parsed = JSON.parse(records);
      if (matrix.length !== state.rows * DIMENSIONS * 2 || parsed.length !== state.rows)
        throw new Error('Invalid scanner snapshot size');
      return new BrowserCatalogV2({ ...state.properties, records: parsed,
        embeddings: new Uint16Array(matrix.buffer.slice(matrix.byteOffset, matrix.byteOffset + matrix.byteLength)) });
    } catch { /* Try the last successful generation before going online. */ }
  }
  throw new Error('No intact scanner catalog snapshot');
}

export function catalogStatus(catalog) {
  return { ready: !!catalog, model: MODEL, dimensions: DIMENSIONS, catalog: CATALOG_KEY,
    version: catalog?.version ?? null, rows: catalog?.rows ?? 0, sourceUpdatedAt: catalog?.sourceUpdatedAt ?? null };
}
