import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export const DATA_FILES = new Set([
  'oracle-slim.jsonl.gz', 'rulings-slim.jsonl.gz', 'bulk-meta.json',
  'tags-slim.jsonl.gz', 'tags-index.json', 'combos-slim.jsonl.gz',
  'prices-slim.tsv.gz', 'prices-meta.json', 'arthash.tsv.gz',
  'arthash-meta.json', 'meta.json'
]);

// Serve only deliberately downloaded files. Browser requests never download
// missing bulk databases, images, or scanner fingerprints.
export function createDataCache({ directory }) {
  return {
    async get(name) {
      if (!DATA_FILES.has(name)) throw new Error('Unknown data file');
      const target = join(directory, name);
      await stat(target);
      return target;
    }
  };
}
