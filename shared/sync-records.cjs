/* The browser bundle and Node server use the same sync record format. */
const SYNC_SCALARS = [
  'globalTags',
  'printPrefs',
  'printPrefsPlaced',
  'trade',
  'priceWatch',
  'draftNames',
  'budgetFloor',
  'lifeFmt',
  'decksView',
  'deckSort',
  'colView',
  'tileCovers',
  'dlView',
  'ptSmart',
];
const SYNC_SOURCES = ['collection', 'folders', 'settings:app', 'lifeSaves', ...SYNC_SCALARS];
const SYNC_SETTING_FIELDS = [
  'theme',
  'guild',
  'startupPage',
  'hideCollectionFolderPrices',
  'scannerIgnoreSession',
  'scannerIdThreshold',
  'scannerCornerThreshold',
  'scannerIntervalMs',
  'scannerShowFramerate',
];
// Older app versions may still submit this record in otherwise valid batches.
// Accept it for compatibility, but never project or restore it in current clients.
const SYNC_RETIRED_SETTING_FIELDS = ['scannerDebounceMs'];

function syncItemKey(item) {
  return (
    'collection-item:' +
    encodeURIComponent(
      JSON.stringify([
        item.name,
        item.set || '',
        item.cn || '',
        !!item.foil,
        item.cond || '',
        item.binder || '',
      ]),
    )
  );
}

function syncRecordSource(key) {
  if (key.startsWith('deck:')) return 'decks';
  if (
    key.startsWith('collection-item:') ||
    key.startsWith('binder:') ||
    key.startsWith('want:') ||
    key.startsWith('want-exclude:')
  )
    return 'collection';
  if (key.startsWith('folder:')) return 'folders';
  if (
    key.startsWith('setting:') &&
    (SYNC_SETTING_FIELDS.includes(key.slice(8)) ||
      SYNC_RETIRED_SETTING_FIELDS.includes(key.slice(8)))
  )
    return 'settings:app';
  if (key.startsWith('saved-game:')) return 'lifeSaves';
  return SYNC_SCALARS.includes(key) ? key : null;
}

function syncRecordAllowed(key) {
  if (typeof key === 'string' && (key.startsWith('want:') || key.startsWith('want-exclude:'))) {
    try {
      decodeURIComponent(key.slice(key.indexOf(':') + 1));
    } catch {
      return false;
    }
  }
  return (
    typeof key === 'string' && key.length <= 4096 && !!syncRecordSource(key) && !key.endsWith(':')
  );
}

function syncProjectStorage(source, raw) {
  const out = Object.create(null);
  if (raw == null) return out;
  if (SYNC_SCALARS.includes(source)) {
    out[source] = String(raw);
    return out;
  }
  const value = JSON.parse(raw);
  if (source === 'collection') {
    if (!value || !Array.isArray(value.items) || !Array.isArray(value.binders))
      throw new Error('Invalid collection');
    for (const item of value.items) {
      if (!item || typeof item.name !== 'string') throw new Error('Invalid collection card');
      out[syncItemKey(item)] = JSON.stringify(item);
    }
    for (const binder of value.binders) {
      if (!binder || typeof binder.id !== 'string') throw new Error('Invalid binder');
      out['binder:' + binder.id] = JSON.stringify(binder);
    }
    for (const item of value.wantsManual || [])
      out['want:' + encodeURIComponent(item.name)] = JSON.stringify(item);
    for (const name of value.wantsExclude || [])
      out['want-exclude:' + encodeURIComponent(name)] = '1';
  } else if (source === 'folders') {
    if (!Array.isArray(value)) throw new Error('Invalid folders');
    for (const folder of value) out['folder:' + folder.id] = JSON.stringify(folder);
  } else if (source === 'settings:app') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid settings');
    for (const field of SYNC_SETTING_FIELDS)
      if (value[field] != null) out['setting:' + field] = JSON.stringify(value[field]);
  } else if (source === 'lifeSaves') {
    if (!Array.isArray(value)) throw new Error('Invalid saved games');
    for (const game of value) {
      if (!game || typeof game.id !== 'string' || !game.d || !Array.isArray(game.d.players))
        throw new Error('Invalid saved game');
      out['saved-game:' + game.id] = JSON.stringify(game);
    }
  }
  return out;
}

function syncRestoreStorage(source, records, previous) {
  if (SYNC_SCALARS.includes(source)) return records[source] ?? null;
  const entries = Object.entries(records).filter(([key]) => syncRecordSource(key) === source);
  if (source === 'settings:app') {
    const out = {};
    for (const [key, raw] of entries)
      if (SYNC_SETTING_FIELDS.includes(key.slice(8))) out[key.slice(8)] = JSON.parse(raw);
    return JSON.stringify(out);
  }
  if (source === 'folders') return JSON.stringify(entries.map(([, raw]) => JSON.parse(raw)));
  if (source === 'lifeSaves')
    return JSON.stringify(
      entries
        .map(([, raw]) => JSON.parse(raw))
        .sort((a, b) => (b.t || 0) - (a.t || 0) || a.id.localeCompare(b.id))
        .slice(0, 10),
    );
  const out = previous ? JSON.parse(previous) : {};
  out.items = [];
  out.binders = [];
  out.wantsManual = [];
  out.wantsExclude = [];
  for (const [key, raw] of entries) {
    if (key.startsWith('collection-item:')) out.items.push(JSON.parse(raw));
    else if (key.startsWith('binder:')) out.binders.push(JSON.parse(raw));
    else if (key.startsWith('want:')) out.wantsManual.push(JSON.parse(raw));
    else if (key.startsWith('want-exclude:'))
      out.wantsExclude.push(decodeURIComponent(key.slice(13)));
  }
  return JSON.stringify(out);
}

function syncRecordValid(key, raw) {
  if (!syncRecordAllowed(key) || typeof raw !== 'string') return false;
  if (SYNC_SCALARS.includes(key)) return true;
  try {
    const value = JSON.parse(raw);
    if (key === 'setting:scannerDebounceMs')
      return Number.isInteger(value) && value >= 0 && value <= 60000;
    if (key === 'setting:scannerIdThreshold' || key === 'setting:scannerCornerThreshold')
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
    if (key === 'setting:scannerIntervalMs')
      return Number.isInteger(value) && value >= 100 && value <= 10000;
    if (
      key === 'setting:hideCollectionFolderPrices' ||
      key === 'setting:scannerIgnoreSession' ||
      key === 'setting:scannerShowFramerate'
    )
      return typeof value === 'boolean';
    if (key.startsWith('setting:')) return typeof value === 'string' && value.length <= 80;
    if (key.startsWith('want-exclude:')) return value === 1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (key.startsWith('deck:'))
      return (
        value.id === key.slice(5) &&
        Array.isArray(value.cards) &&
        (value.maybeboard == null || Array.isArray(value.maybeboard))
      );
    if (key.startsWith('saved-game:'))
      return (
        value.id === key.slice(11) &&
        value.d &&
        Array.isArray(value.d.players) &&
        Number.isFinite(value.t)
      );
    if (key.startsWith('binder:')) return value.id === key.slice(7);
    if (key.startsWith('folder:')) return value.id === key.slice(7);
    if (key.startsWith('collection-item:'))
      return typeof value.name === 'string' && syncItemKey(value) === key;
    if (key.startsWith('want:'))
      return typeof value.name === 'string' && 'want:' + encodeURIComponent(value.name) === key;
  } catch {}
  return false;
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = {
    SYNC_SCALARS,
    SYNC_SOURCES,
    SYNC_SETTING_FIELDS,
    syncItemKey,
    syncRecordSource,
    syncRecordAllowed,
    syncProjectStorage,
    syncRestoreStorage,
    syncRecordValid,
  };
