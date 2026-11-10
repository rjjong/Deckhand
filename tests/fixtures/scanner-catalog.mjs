import vector from './scrying-glass-milo1.json' with { type: 'json' };
import { BrowserCatalogV2 } from '../../server/scanner/vendor/collectorvision-catalog-v2.mjs';
import { MODEL, CATALOG_KEY } from '../../server/scanner/catalog.mjs';

// Public CollectorVision sample's reference embedding, extracted from the
// pinned original scanner bundle. Tests never download the live catalog.
export function scannerFixture() {
  return new BrowserCatalogV2({ familyKey: 'milo1', catalogKey: CATALOG_KEY,
    publicName: 'scryfall-mtg', version: 1, sourceUpdatedAt: '2026-11-10T00:00:00Z',
    descriptor: { game: 'magic-the-gathering', source: 'scryfall', profile: 'default',
      description: 'Test fixture', result_identifier: 'scryfall_card', recommended: true },
    embedding: { model: 'collectorvision:test:milo-1.0.0@' + MODEL,
      dimensions: 128, dtype: 'float16', byte_order: 'little', layout: 'row-major' },
    records: [{ id: '7286819f-6c57-4503-898c-528786ad86e9', name: 'Scrying Glass', faceIndex: 0,
      identifiers: { scryfall_oracle: 'ca16b32c-3f1e-4f8d-821a-064f922c45d8' } }],
    embeddings: Uint16Array.from(vector), metadataLoaded: false,
  });
}
