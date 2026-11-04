// core / deck-storage

const MAX_DECK_NAME_LENGTH = 99;

function normalizeDeckName(value, fallback = 'Untitled deck') {
  // Match input maxlength (UTF-16 units), without leaving half an emoji.
  return (String(value ?? '').trim() || fallback)
    .slice(0, MAX_DECK_NAME_LENGTH)
    .replace(/[\uD800-\uDBFF]$/u, '')
    .trimEnd();
}

let storageWarned = false;
const deckStorageJobs = new Map();

function queueDeckStorage(id, write) {
  const previous = deckStorageJobs.get(id) || Promise.resolve();
  const job = previous.catch(() => {}).then(write);
  deckStorageJobs.set(id, job);
  return job.finally(() => {
    if (deckStorageJobs.get(id) === job) deckStorageJobs.delete(id);
  });
}

async function waitForDeckStorage(id) {
  while (deckStorageJobs.has(id)) await deckStorageJobs.get(id);
}

function lsAvailable() {
  try {
    const t = '__t__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return true;
  } catch (e) {
    return false;
  }
}

function warnStorageOnce() {
  if (storageWarned) return;
  storageWarned = true;
  toast(
    "Couldn't access browser storage — decks won't be saved. Private/incognito mode often blocks this.",
  );
}

/* ================= FOLDERS =================
   Folders organise decks and can nest arbitrarily. Each folder: {id, name,
   parentId (null = top level), icon}. A deck's folderId points to its folder
   (null = loose at top level). A deck's `fav` flag stars it. All stored
   alongside decks in localStorage. */
const FOLDER_ICONS = [
  'anchor',
  'wheel',
  'sail',
  'compass',
  'waves',
  'map',
  'chest',
  'bottle',
  'flag',
  'star2',
  'skull',
  'trident',
];

const CMDR_FOLDER_SVG = {
  anchor: `<path d="M7 7 L7 4.5 L9.5 6.5 L12 4 L14.5 6.5 L17 4.5 L17 7 Z"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="8" y1="12" x2="16" y2="19"/><line x1="16" y1="12" x2="8" y2="19"/>`,
  wheel: `<path d="M12 3 L19 6 V12 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 12 V6 Z"/><path d="M12 7 V16 M8.5 11.5 H15.5"/>`,
  sail: `<path d="M5 5 H19 V13 L16.5 11.5 L14 13 L12 11.5 L10 13 L7.5 11.5 L5 13 Z"/><line x1="5" y1="5" x2="5" y2="21"/>`,
  compass: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/><line x1="7.5" y1="16.5" x2="5" y2="19"/><line x1="16.5" y1="16.5" x2="19" y2="19"/><path d="M5.5 6.5 L5 5 L6.5 5.5 M18.5 6.5 L19 5 L17.5 5.5"/>`,
  waves: `<path d="M12 21c-3.6 0-6-2.6-6-6 0-3.4 2.8-5.4 3.8-9 1.6 1.8 2.3 3.4 2.2 5.2 1-.9 1.6-2 1.7-3.4 2.3 2 4.3 4.6 4.3 7.2 0 3.4-2.4 6-6 6z"/><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.9 0-1.6 1.3-2.6 2.1-4 1.4 1.3 3.5 2.5 3.5 4 0 1.7-1.2 2.9-2.8 2.9z"/>`,
  map: `<path d="M8 4h10a2 2 0 012 2v1.5h-4"/><path d="M8 4a2 2 0 00-2 2v11"/><path d="M16 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5h10v1.5a2 2 0 002 2"/><path d="M9 9h4.5M9 12h4.5"/>`,
  chest: `<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M10 4L8 9l4 11 4-11-2-5"/>`,
  bottle: `<path d="M10 3h4M10.5 3v5.2L5.8 16.3A3 3 0 008.4 21h7.2a3 3 0 002.6-4.7L13.5 8.2V3"/><path d="M7.3 14.5h9.4"/><circle cx="11" cy="17.5" r=".8"/><circle cx="13.5" cy="16.3" r=".6"/>`,
  flag: `<path d="M4 21h16M6 21V10h12v11"/><path d="M6 10V5.5h2.4V7.5h2.4V5.5h2.4V7.5h2.4V5.5H18V10"/><path d="M10 21v-3.5a2 2 0 014 0V21"/>`,
  star2: `<path d="M12 3l2.5 5.5L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z"/>`,
  skull: `<path d="M12 3c-4 0-7 3-7 7 0 2.5 1.5 4 3 5v3h8v-3c1.5-1 3-2.5 3-5 0-4-3-7-7-7z"/><circle cx="9.5" cy="10.5" r="1.3"/><circle cx="14.5" cy="10.5" r="1.3"/><path d="M10.5 18v3M13.5 18v3"/>`,
  trident: `<path d="M13.5 2.5L5 13.5h6.2L10 21.5l9-11.5h-6.4z"/>`,
};

function folderIsNaval() {
  return false;
}

function folderIconSvg(name, px, naval) {
  px = px || 44;
  if (!naval) {
    const d = CMDR_FOLDER_SVG[name] || CMDR_FOLDER_SVG.anchor;
    return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }
  const p = (d) =>
    `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  switch (name) {
    case 'wheel':
      return p(
        '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
      );
    case 'sail':
      return p('<path d="M12 3v18M12 3C8 6 5.5 10 5 18h7z"/><path d="M12 5c3 3 5 7 5.5 13H12"/>');
    case 'compass':
      return p('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>');
    case 'waves':
      return p(
        '<path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
      );
    case 'map':
      return p('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>');
    case 'chest':
      return p(
        '<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M3 13h18M3 9c0-3 3-5 9-5s9 2 9 5"/><rect x="10.5" y="12" width="3" height="4" rx="1"/>',
      );
    case 'bottle':
      return p(
        '<path d="M10 3h4M11 3v3.5c0 .8-.4 1.3-1 2C8.5 10 8 11 8 13v6a2 2 0 002 2h4a2 2 0 002-2v-6c0-2-.5-3-2-4.5-.6-.7-1-1.2-1-2V3"/>',
      );
    case 'flag':
      return p('<path d="M6 3v18M6 4h12l-3 4 3 4H6"/>');
    case 'star2':
      return p('<path d="M12 3l2.5 5.5L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z"/>');
    case 'skull':
      return p(
        '<path d="M12 3c-4 0-7 3-7 7 0 2.5 1.5 4 3 5v3h8v-3c1.5-1 3-2.5 3-5 0-4-3-7-7-7z"/><circle cx="9.5" cy="10.5" r="1.3"/><circle cx="14.5" cy="10.5" r="1.3"/>',
      );
    case 'trident':
      return p('<path d="M12 6v15M8 21h8M6 4v4a6 6 0 0012 0V4M6 4l-1.5 2M18 4l1.5 2M12 3v3"/>');
    default:
      return p(
        '<path d="M5 21c0-3 3-6 7-6M12 3v10M8 7h8M12 15a6 6 0 01-7-5M12 15a6 6 0 007-5"/><circle cx="12" cy="4.5" r="1.6"/>',
      ); // anchor
  }
}

function loadFolders() {
  try {
    return normalizeFolders(JSON.parse(localStorage.getItem(LS_PREFIX + 'folders') || '[]'));
  } catch (e) {
    return [];
  }
}

function normalizeFolders(folders) {
  return (Array.isArray(folders) ? folders : []).map((f) => {
    if (!FMT_SPEC[f.format]) f.format = 'commander';
    if (isFmtFolder(f.parentId) && !FMT_SPEC[fmtOfFolder(f.parentId)])
      f.parentId = fmtFolderId('commander');
    return f;
  });
}

function saveFolders() {
  try {
    state.folders = normalizeFolders(state.folders);
    localStorage.setItem(LS_PREFIX + 'folders', JSON.stringify(state.folders));
  } catch (e) {
    warnStorageOnce();
  }
}

function createFolder(name, parentId, icon) {
  const f = {
    id: 'fld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || 'New Folder',
    parentId: parentId || null,
    format: 'commander',
    icon: icon || FOLDER_ICONS[(state.folders || []).length % FOLDER_ICONS.length],
  };
  state.folders = (state.folders || []).concat(f);
  saveFolders();
  return f;
}

function folderFormat(f) {
  return f && FMT_SPEC[f.format] ? f.format : 'commander';
}

function childFolders(parentId) {
  return (state.folders || []).filter((f) => (f.parentId || null) === (parentId || null));
}
// ONE app: every folder shows
function decksInFolder(folderId) {
  return state.decksIndex.filter((d) => (d.folderId || null) === (folderId || null));
}

/* decks of the CURRENTLY ACTIVE format only, for folder membership + counts */
function decksInFolderMode(folderId) {
  return decksInFolder(folderId);
}
// THE MERGE: folders show every format
function folderPath(id) {
  const out = [];
  let cur = (state.folders || []).find((f) => f.id === id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? (state.folders || []).find((f) => f.id === cur.parentId) : null;
  }
  return out;
}

function deleteFolder(id) {
  // Re-home children and decks to this folder's parent, then remove it.
  const f = (state.folders || []).find((x) => x.id === id);
  if (!f) return;
  const parent = f.parentId || null;
  const deckHome = isFmtFolder(parent) ? null : parent; // decks never point at a virtual folder
  (state.folders || []).forEach((x) => {
    if (x.parentId === id) x.parentId = parent;
  });
  state.decksIndex.forEach((d) => {
    if (d.folderId === id) {
      d.folderId = deckHome;
      persistDeck(d);
    }
  });
  state.folders = (state.folders || []).filter((x) => x.id !== id);
  saveFolders();
}

let _deckDbP = null;

function deckDbOpen() {
  if (_deckDbP) return _deckDbP;
  _deckDbP = new Promise((res) => {
    try {
      const req = indexedDB.open('admiral-decks', 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore('decks');
        } catch (e) {}
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    } catch (e) {
      res(null);
    }
  });
  _deckDbP.then((db) => {
    if (!db) _deckDbP = null;
  }); // a failure is never cached
  return _deckDbP;
}

/* Resolves true only once the write is durable (transaction complete). */
async function deckDbPutMany(entries) {
  const db = await deckDbOpen();
  if (!db || !entries.length) return !!db;
  return await new Promise((res) => {
    try {
      const tx = db.transaction('decks', 'readwrite');
      const st = tx.objectStore('decks');
      entries.forEach(([k, v]) => st.put(v, k));
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => res(false);
    } catch (e) {
      res(false);
    }
  });
}

async function deckDbDelete(key) {
  const db = await deckDbOpen();
  if (!db) return false;
  return await new Promise((res) => {
    try {
      const tx = db.transaction('decks', 'readwrite');
      tx.objectStore('decks').delete(key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    } catch (e) {
      res(false);
    }
  });
}

async function deckDbAll() {
  const db = await deckDbOpen();
  if (!db) return null;
  return await new Promise((res) => {
    const out = {};
    try {
      const cur = db.transaction('decks').objectStore('decks').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) {
          res(out);
          return;
        }
        out[String(c.key)] = c.value;
        c.continue();
      };
      cur.onerror = () => res(null);
    } catch (e) {
      res(null);
    }
  });
}

async function deckDbClear() {
  const db = await deckDbOpen();
  if (!db) return false;
  return await new Promise((res) => {
    try {
      const tx = db.transaction('decks', 'readwrite');
      tx.objectStore('decks').clear();
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    } catch (e) {
      res(false);
    }
  });
}

let _deckDbOk = false;
// decks are being kept in IndexedDB this session
async function loadDecksIndex() {
  try {
    const lsOk = lsAvailable();
    const byKey = {};
    const idb = await deckDbAll();
    if (idb) {
      _deckDbOk = true;
      Object.keys(idb).forEach((k) => {
        try {
          const v = idb[k];
          const d = typeof v === 'string' ? JSON.parse(v) : v;
          if (d && d.id) byKey[k] = d;
        } catch (e) {}
      });
    }
    // Decks still in localStorage: older saves, or written while IndexedDB
    // was unavailable. The newer copy wins; then they move house.
    const lsKeys = [];
    if (lsOk) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LS_PREFIX + 'deck:')) continue;
        lsKeys.push(k);
        try {
          const d = JSON.parse(localStorage.getItem(k));
          if (d && d.id && (!byKey[k] || (d.updatedAt || 0) > (byKey[k].updatedAt || 0)))
            byKey[k] = d;
        } catch (e) {
          /* skip corrupt entry */
        }
      }
    }
    if (!idb && !lsOk) {
      warnStorageOnce();
    }
    state.decksIndex = Object.values(byKey)
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (idb && lsKeys.length) {
      const moved = lsKeys.filter((k) => byKey[k]).map((k) => [k, JSON.stringify(byKey[k])]);
      deckDbPutMany(moved).then((ok) => {
        if (ok)
          lsKeys.forEach((k) => {
            try {
              localStorage.removeItem(k);
            } catch (e) {}
          });
      });
    }
  } catch (e) {
    console.error(e);
    state.decksIndex = [];
  }
  state.folders = loadFolders();
  if (state.folderNav === undefined) state.folderNav = null; // which folder we're viewing (null = top)
  migrateTagsToGlobal();
  // The stored format field follows the folder a deck lives in.
  try {
    (state.decksIndex || []).forEach((d) => {
      const was = d.format;
      const oldName = d.name;
      d.name = normalizeDeckName(d.name);
      if (deckFormat(d) !== was || d.name !== oldName) persistDeck(d);
    });
  } catch (e) {}
  state.homeLoaded = true;
}

/* ---- Storage slimming ----
   Full Scryfall card objects weigh 2–4 KB each (eighty formats of legality,
   purchase links, every image size…). A 100-card deck stored raw eats up to
   half a megabyte of the ~5 MB the browser grants — which is how saves
   started silently failing. Stored cards now keep only the fields the app
   actually reads (~1 KB each): three-to-four-fold more room. */
const SLIM_KEYS = [
  'id',
  'oracle_id',
  'name',
  'mana_cost',
  'cmc',
  'type_line',
  'oracle_text',
  'colors',
  'color_identity',
  'power',
  'toughness',
  'loyalty',
  'rarity',
  'set',
  'set_name',
  'set_type',
  'collector_number',
  'border_color',
  'layout',
  'keywords',
  'artist',
  'produced_mana',
  'edhrec_rank',
  'released_at',
  'game_changer', // WotC's live bracket flag, via Scryfall — must survive storage
  'pin',
  '_foilPick',
];
// 1.39: a slot's own chosen printing (and its foil) survive storage
const SLIM_FACE_KEYS = [
  'name',
  'mana_cost',
  'type_line',
  'oracle_text',
  'power',
  'toughness',
  'loyalty',
  'colors',
];

function slimImageUris(iu) {
  if (!iu) return undefined;
  const out = {};
  if (iu.normal) out.normal = iu.normal;
  if (iu.large) out.large = iu.large;
  if (iu.art_crop) out.art_crop = iu.art_crop;
  return out;
}

function slimCard(c) {
  if (!c || typeof c !== 'object') return c;
  const out = {};
  SLIM_KEYS.forEach((k) => {
    if (c[k] !== undefined) out[k] = c[k];
  });
  if (c.image_uris) out.image_uris = slimImageUris(c.image_uris);
  if (Array.isArray(c.card_faces))
    out.card_faces = c.card_faces.map((f) => {
      const ff = {};
      SLIM_FACE_KEYS.forEach((k) => {
        if (f[k] !== undefined) ff[k] = f[k];
      });
      if (f.image_uris) ff.image_uris = slimImageUris(f.image_uris);
      return ff;
    });
  if (c.legalities)
    out.legalities = { commander: c.legalities.commander, standard: c.legalities.standard };
  if (c.prices) out.prices = { eur: c.prices.eur, eur_foil: c.prices.eur_foil };
  return out;
}

function slimDeckForSave(clean) {
  const s = {};
  Object.keys(clean).forEach((k) => {
    s[k] = clean[k];
  });
  s.format = deckFormat(s);
  s.name = normalizeDeckName(s.name);
  if (Array.isArray(s.cards)) s.cards = s.cards.map(slimCard);
  if (Array.isArray(s.maybeboard)) s.maybeboard = s.maybeboard.map(slimCard);
  if (s.admiral) s.admiral = slimCard(s.admiral);
  if (s.partner) s.partner = slimCard(s.partner);
  return s;
}

function compactAllDecks(skipId) {
  (state.decksIndex || []).forEach((dd) => {
    if (!dd || dd.id === skipId) return;
    if (_deckDbOk) {
      try {
        if (localStorage.getItem(LS_PREFIX + 'deck:' + dd.id) === null) return;
      } catch (e) {}
    }
    try {
      const clean = {};
      Object.keys(dd).forEach((k) => {
        if (k !== '_saveStatus') clean[k] = dd[k];
      });
      localStorage.setItem(LS_PREFIX + 'deck:' + dd.id, JSON.stringify(slimDeckForSave(clean)));
    } catch (e) {}
  });
}

const DV_GAP = 10 * 60 * 1000,
  DV_MAX = 25,
  DV_KEEP_DEL = 60 * 86400000;

let _dvDbP = null;

const _dvSess = {},
  _dvLast = {};

function dvDbOpen() {
  if (_dvDbP) return _dvDbP;
  _dvDbP = new Promise((res) => {
    try {
      const req = indexedDB.open('admiral-deckhist', 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore('v');
        } catch (e) {}
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    } catch (e) {
      res(null);
    }
  });
  _dvDbP.then((db) => {
    if (!db) _dvDbP = null;
  });
  return _dvDbP;
}

async function dvTx(mode, fn) {
  const db = await dvDbOpen();
  if (!db) return null;
  return await new Promise((res) => {
    try {
      const tx = db.transaction('v', mode),
        st = tx.objectStore('v');
      let out = null;
      const r = fn(st, (v) => {
        out = v;
      });
      tx.oncomplete = () => res(out);
      tx.onerror = () => res(null);
      tx.onabort = () => res(null);
    } catch (e) {
      res(null);
    }
  });
}

// All versions of one deck, oldest first.
async function dvList(id) {
  const r = await dvTx('readonly', (st, set) => {
    const q = st.getAll(IDBKeyRange.bound(id + '|', id + '|￿'));
    q.onsuccess = () => set(q.result || []);
  });
  return (r || []).sort((a, b) => a.start - b.start);
}

async function dvAll() {
  const r = await dvTx('readonly', (st, set) => {
    const q = st.getAll();
    q.onsuccess = () => set(q.result || []);
  });
  return r || [];
}

async function dvPut(rec) {
  return dvTx('readwrite', (st) => {
    st.put(rec, rec.id + '|' + String(rec.start).padStart(15, '0'));
  });
}

async function dvDelKeys(keys) {
  if (!keys.length) return;
  return dvTx('readwrite', (st) => {
    keys.forEach((k) => st.delete(k));
  });
}

/* Note the deck as it is now. why: 'edit' (merges into the open session),
   'presync' / 'sync' / 'deleted' / 'restore' (always a version of its own). */
async function dvNote(id, name, why, json, nCards) {
  try {
    if (!id || !json) return;
    const now = Date.now();
    const sess = _dvSess[id];
    let start = now;
    if (why === 'edit' && sess && now - sess.t < DV_GAP) start = sess.start;
    else {
      if (_dvLast[id] && start <= _dvLast[id]) start = _dvLast[id] + 1;
      _dvLast[id] = start;
    } // two notes in one millisecond stay two
    _dvSess[id] = why === 'edit' ? { start, t: now } : null;
    await dvPut({ id, name: name || '', start, t: now, why, n: nCards || 0, j: json });
    if (start === now) {
      const all = await dvList(id);
      if (all.length > DV_MAX)
        await dvDelKeys(
          all
            .slice(0, all.length - DV_MAX)
            .map((r) => r.id + '|' + String(r.start).padStart(15, '0')),
        );
    }
  } catch (e) {}
}

function dvNoteDeck(d, why) {
  try {
    if (!d || !d.id) return;
    const c = {};
    Object.keys(d).forEach((k) => {
      if (k !== '_saveStatus') c[k] = d[k];
    });
    dvNote(d.id, d.name, why, JSON.stringify(slimDeckForSave(c)), (d.cards || []).length);
  } catch (e) {}
}

// Old versions of decks deleted long ago are let go, once per start.
async function dvPrune() {
  try {
    const all = await dvAll();
    const live = new Set((state.decksIndex || []).map((d) => d.id));
    const now = Date.now();
    const byId = {};
    all.forEach((r) => {
      (byId[r.id] = byId[r.id] || []).push(r);
    });
    const drop = [];
    Object.keys(byId).forEach((id) => {
      if (live.has(id)) return;
      const newest = Math.max(...byId[id].map((r) => r.t));
      if (now - newest > DV_KEEP_DEL)
        byId[id].forEach((r) => drop.push(r.id + '|' + String(r.start).padStart(15, '0')));
    });
    await dvDelKeys(drop);
  } catch (e) {}
}

function dvWhyLabel(w) {
  return (
    {
      edit: 'edited',
      presync: 'before sync',
      sync: 'from other device',
      deleted: 'deleted',
      restore: 'restored',
      prerestore: 'before restore',
    }[w] || w
  );
}

function dvWhen(t) {
  const d = new Date(t),
    today = new Date();
  const same = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return same
    ? 'Today ' + time
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + time;
}

async function dvRestore(rec, asCopy) {
  let v = null;
  try {
    v = JSON.parse(rec.j);
  } catch (e) {}
  if (!v) {
    toast('This version cannot be read.');
    return;
  }
  if (asCopy) {
    v.id = uid();
    v.name = (v.name || rec.name || 'Deck') + ' (version)';
    v.createdAt = Date.now();
    v.updatedAt = Date.now();
    state.decksIndex.unshift(v);
    await persistDeck(v);
    toast('Version saved as a new deck.');
    openDeck(v.id);
    return;
  }
  const cur = getDeck(rec.id);
  if (cur) dvNoteDeck(cur, 'prerestore'); // what it was, kept too
  v.id = rec.id;
  v.updatedAt = Date.now();
  v._dvWhy = 'restore';
  const i = state.decksIndex.findIndex((x) => x.id === rec.id);
  if (i >= 0) state.decksIndex[i] = v;
  else state.decksIndex.unshift(v);
  await persistDeck(v);
  toast('Version restored.');
  openDeck(v.id);
}

/* The versions sheet of one deck (or, with no id, every deleted deck). */
async function openDeckVersions(id) {
  let recs = [];
  if (id) {
    recs = (await dvList(id)).reverse(); // newest first
  } else {
    const all = await dvAll(),
      live = new Set((state.decksIndex || []).map((d) => d.id));
    const byId = {};
    all.forEach((r) => {
      if (!live.has(r.id) && (!byId[r.id] || r.t > byId[r.id].t)) byId[r.id] = r;
    });
    recs = Object.values(byId).sort((a, b) => b.t - a.t);
  }
  document.getElementById('dvSheet')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'dvSheet';
  el.style.zIndex = 205;
  el.style.alignItems = 'flex-end';
  const d = id ? getDeck(id) : null;
  const rows = recs
    .map((r, i) => {
      const isNow = !!id && i === 0; // every change is noted, so the newest is what is there now
      return `<div class="dv-row">
      <div class="dv-txt"><b>${escapeHtml(id ? dvWhen(r.t) : r.name || '?')}</b><span>${id ? '' : escapeHtml(dvWhen(r.t)) + ' · '}${r.n} ${r.n === 1 ? 'card' : 'cards'} · ${escapeHtml(dvWhyLabel(r.why))}${isNow ? ' · <i>now</i>' : ''}</span></div>
      ${isNow ? '' : `<button type="button" class="ghost-btn" data-dvi="${i}" data-dvc="0">${'Restore'}</button>`}
      <button type="button" class="ghost-btn" data-dvi="${i}" data-dvc="1">${'As copy'}</button>
    </div>`;
    })
    .join('');
  // column-reverse sheet: DOM-first = foot -- the newest version nearest the thumb
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet bk-sheet dv-sheet">
    <div class="dv-list">
      ${rows || `<div class="bk-hint" style="text-align:center;">${id ? 'No earlier versions yet — they appear by themselves as you edit the deck.' : 'No deleted decks to restore.'}</div>`}
    </div>
    <div class="br-title">
      <b
        >${inlIco('restore', 16)}${id ? 'Versions of ' + escapeHtml(d ? d.name : '') : 'Deleted decks'}</b
      ><span
        >${
          id
            ? 'One version per editing session, plus a copy before every sync. Restoring keeps what is there now as well.'
            : 'Deleted decks are kept for 60 days.'
        }</span
      >
    </div>
  </div>`;
  brSheetOpen(el, 'dvSheet');
  const close = () => brSheetClose('dvSheet');
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelectorAll('[data-dvi]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = recs[+b.dataset.dvi];
      if (!r) return;
      const copy = b.dataset.dvc === '1';
      const msg = copy
        ? `Add this version (${dvWhen(r.t)}) as a new deck?`
        : `Restore the deck to ${dvWhen(r.t)}? What is there now stays as a version.`;
      openInAppConfirm(
        msg,
        async (ok) => {
          if (!ok) return;
          close();
          await brAfterPop();
          dvRestore(r, copy);
        },
        { ok: copy ? 'As copy' : 'Restore' },
      );
    }),
  );
}

function persistDeck(d) {
  d.name = normalizeDeckName(d.name);
  return queueDeckStorage(d.id, () => persistDeckLocally(d));
}

async function persistDeckLocally(d) {
  const clean = {};
  Object.keys(d).forEach((k) => {
    if (k !== '_saveStatus') clean[k] = d[k];
  });
  const payload = JSON.stringify(slimDeckForSave(clean));
  try {
    if (!_syncQuiet) dvNote(d.id, d.name, d._dvWhy || 'edit', payload, (d.cards || []).length);
    delete d._dvWhy;
  } catch (e) {}
  const key = LS_PREFIX + 'deck:' + d.id;
  // IndexedDB first: room for as many decks as anyone builds. Once that
  // write is confirmed, any old localStorage copy goes (frees the small store).
  if (await deckDbPutMany([[key, payload]])) {
    _deckDbOk = true;
    syncTouchDeck(d.id, false);
    try {
      if (localStorage.getItem(key) !== null) localStorage.removeItem(key);
    } catch (e) {}
    return;
  }
  try {
    localStorage.setItem(LS_PREFIX + 'deck:' + d.id, payload);
    syncTouchDeck(d.id, false);
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') {
      // Emergency: compact every other deck (older saves may still be fat),
      // drop rebuildable catalogs, then RETRY this save — never lose a deck
      // to a full disk without a fight.
      try {
        compactAllDecks(d.id);
      } catch (_e) {}
      try {
        localStorage.removeItem('admiral_app:edhrecTags4');
      } catch (_e) {}
      try {
        localStorage.removeItem('admiral_app:edhrecTypal2');
      } catch (_e) {}
      try {
        localStorage.setItem(LS_PREFIX + 'deck:' + d.id, payload);
        syncTouchDeck(d.id, false);
        toast('Storage was full — everything was compacted and this deck IS saved.');
        return;
      } catch (e2) {
        toast(
          '⚠ Storage is completely full — this deck could NOT be saved. Delete an old deck, then edit this one again.',
        );
        return;
      }
    }
    console.error('Save failed', e);
    warnStorageOnce();
  }
}

function deleteDeckStorage(id) {
  return queueDeckStorage(id, () => deleteDeckLocally(id));
}

async function deleteDeckLocally(id) {
  // 1.27: the deck's last state stays as a version (60 days)
  try {
    const key = LS_PREFIX + 'deck:' + id;
    let raw = null;
    const all = await deckDbAll();
    if (all && all[key] != null)
      raw = typeof all[key] === 'string' ? all[key] : JSON.stringify(all[key]);
    if (raw == null) {
      try {
        raw = localStorage.getItem(key);
      } catch (e) {}
    }
    if (raw) {
      let nm = '',
        n = 0;
      try {
        const o = JSON.parse(raw);
        nm = o.name;
        n = (o.cards || []).length;
      } catch (e) {}
      await dvNote(id, nm, 'deleted', raw, n);
    }
  } catch (e) {}
  try {
    localStorage.removeItem(LS_PREFIX + 'deck:' + id);
  } catch (e) {}
  try {
    await deckDbDelete(LS_PREFIX + 'deck:' + id);
  } catch (e) {}
  syncTouchDeck(id, true);
}
