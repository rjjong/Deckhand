import { mkdir, mkdtemp, rename, rm, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bulkIndex, requireDownloadUrl, bulkLines, trimCard, groupRuling } from './build-bulk.mjs';

export async function downloadLibrary({ directory, fetchImpl = fetch, log = console.log } = {}) {
  await mkdir(directory, { recursive: true });
  const stage = await mkdtemp(join(directory, '.library-'));
  const built = new Date().toISOString();
  let cards = 0, rulings = 0;
  const byOracle = new Map();
  async function writeGzip(name, lines) {
    const hash = createHash('sha256');
    async function* chunks() {
      for await (const record of lines) {
        const line = JSON.stringify(record) + '\n';
        hash.update(line);
        yield line;
      }
    }
    await pipeline(Readable.from(chunks()), createGzip(), createWriteStream(join(stage, name)));
    return hash.digest('hex');
  }
  try {
    const idx = await bulkIndex(fetchImpl);
    log('Downloading the Oracle card catalogue (one record per distinct card; no images)…');
    async function* cardRecords() {
      for await (const card of bulkLines(requireDownloadUrl(idx.oracle_cards, 'Oracle Cards'), fetchImpl)) {
        const slim = trimCard(card);
        if (!slim) continue;
        cards++;
        if (cards % 5000 === 0) log(`Processed ${cards} card records…`);
        yield slim;
      }
    }
    const oracleSha = await writeGzip('oracle-slim.jsonl.gz', cardRecords());
    if (cards < 1000) throw new Error(`Card catalogue unexpectedly small (${cards}); keeping the previous cache`);
    log(`Cached ${cards} supported card records. Downloading official rulings…`);
    for await (const ruling of bulkLines(requireDownloadUrl(idx.rulings, 'Rulings'), fetchImpl)) {
      groupRuling(byOracle, ruling);
      if (ruling.oracle_id && ruling.comment) rulings++;
    }
    if (rulings < 100) throw new Error('Rulings catalogue unexpectedly small; keeping the previous cache');
    const rulingsSha = await writeGzip('rulings-slim.jsonl.gz',
      (function* () { for (const [o, r] of byOracle) yield { o, r }; })());
    const meta = { format: 2, sample: false, built,
      oracle: { count: cards, built, sha256: oracleSha, sourceUpdatedAt: idx.oracle_cards.updated_at },
      rulings: { count: rulings, cards: byOracle.size, built, sha256: rulingsSha },
      tags: null, combos: null };
    // Files are staged first; publish the manifest only after both succeed.
    await writeFile(join(stage, 'bulk-meta.json'), JSON.stringify(meta));
    for (const name of ['oracle-slim.jsonl.gz', 'rulings-slim.jsonl.gz', 'bulk-meta.json']) {
      await rename(join(stage, name), join(directory, name));
    }
    const bytes = (await readFile(join(directory, 'oracle-slim.jsonl.gz'))).length
      + (await readFile(join(directory, 'rulings-slim.jsonl.gz'))).length;
    log(`Library ready: ${cards} cards, ${rulings} rulings, ${(bytes / 1024 / 1024).toFixed(1)} MiB stored.`);
    return meta;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await downloadLibrary({ directory: resolve(process.env.DATA_DIR || './var/data-library') }); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
