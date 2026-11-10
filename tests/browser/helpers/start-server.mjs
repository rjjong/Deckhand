import { saveCatalog } from '../../../server/scanner/catalog.mjs';
import { scannerFixture } from '../../fixtures/scanner-catalog.mjs';
await saveCatalog(process.env.SCANNER_CATALOG_DIR, scannerFixture());
await import('../../../server/index.mjs');
