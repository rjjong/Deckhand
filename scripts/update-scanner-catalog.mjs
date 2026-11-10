import { resolve } from 'node:path';
import { loadCatalog, saveCatalog, updateCatalog } from '../server/scanner/catalog.mjs';

// Operator command for a first download or an immediate update. Normal server
// startup and six-hour checks do this automatically without a public admin API.
const directory = resolve(process.argv[2] || process.env.SCANNER_CATALOG_DIR || './var/scanner-catalog');
let previous = null;
try { previous = await loadCatalog(directory); } catch (error) { console.warn(error.message); }
const catalog = await updateCatalog(previous);
if (catalog !== previous) await saveCatalog(directory, catalog);
console.log(`Scanner catalog v${catalog.version}: ${catalog.rows} entries (${catalog.sourceUpdatedAt}).`);
console.log('Saved in ' + directory);
