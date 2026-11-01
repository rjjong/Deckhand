import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { trimCard } from './build-bulk.mjs';

export const SAMPLE_NAMES = [
  'Sol Ring', 'Arcane Signet', 'Command Tower', 'Evolving Wilds',
  'Terramorphic Expanse', 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
  'Swords to Plowshares', 'Path to Exile', 'Lightning Bolt', 'Counterspell',
  'Negate', 'Cultivate', "Kodama's Reach", 'Llanowar Elves', 'Elvish Mystic',
  "Nature's Lore", 'Brainstorm', 'Ponder', 'Mulldrifter', 'Sakura-Tribe Elder',
  'Tatyova, Benthic Druid', 'Muldrotha, the Gravetide', "Atraxa, Praetors' Voice",
  'Krenko, Mob Boss', 'Talrand, Sky Summoner', 'Rhystic Study'
];

export async function downloadSample({ directory, fetchImpl = fetch } = {}) {
  // One request, no pagination, no bulk-data endpoint, no images.
  const response = await fetchImpl('https://api.scryfall.com/cards/collection', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json',
      'user-agent': 'Deckhand-Selfhost-Sample/1.0' },
    body: JSON.stringify({ identifiers: SAMPLE_NAMES.map(name => ({ name })) }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok || !response.body) throw new Error(`Sample request failed: HTTP ${response.status}`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 512 * 1024) throw new Error('Sample response exceeded the 512 KiB download limit');
    chunks.push(chunk);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(result.data) || !result.data.length || result.data.length > SAMPLE_NAMES.length) {
    throw new Error('Expected between 1 and 30 sample cards');
  }
  const cards = result.data.map(trimCard).filter(Boolean);
  if (!cards.length) throw new Error('No usable cards in the sample');
  const built = new Date().toISOString();
  const files = {
    'oracle-slim.jsonl.gz': gzipSync(cards.map(card => JSON.stringify(card) + '\n').join('')),
    'rulings-slim.jsonl.gz': gzipSync(''),
    'tags-slim.jsonl.gz': gzipSync(''),
    'combos-slim.jsonl.gz': gzipSync(''),
    'tags-index.json': JSON.stringify([]),
    'meta.json': JSON.stringify({ sample: true, built, formats: {} }),
    'bulk-meta.json': JSON.stringify({ format: 2, sample: true, built,
      oracle: { count: cards.length, built }, rulings: { cards: 0, built },
      tags: { cards: 0, built }, combos: { count: 0, built } })
  };
  await mkdir(directory, { recursive: true });
  let written = 0;
  // Publish the manifest last, after all its matching files are ready.
  for (const [name, content] of Object.entries(files)) {
    const target = join(directory, name), temporary = `${target}.${randomUUID()}.part`;
    try {
      await writeFile(temporary, content, { flag: 'wx' });
      await rename(temporary, target);
      written += Buffer.byteLength(content);
    } finally { await rm(temporary, { force: true }); }
  }
  return { count: cards.length, downloadedBytes: size, storedBytes: written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve('./var/data-sample');
  try {
    const result = await downloadSample({ directory });
    console.log(`Downloaded ${result.count} sample cards (${result.downloadedBytes} bytes received).`);
    console.log(`Stored ${result.storedBytes} bytes in ${directory}. No images or bulk files downloaded.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
