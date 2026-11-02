// services / collection-csv

/* ---------------- Collection CSV import / export (Moxfield-compatible) ----------------
   Moxfield and Archidekt both round-trip collections as CSV, so we do the same:
   import a CSV they exported, and export a CSV they can re-import. */
const CSV_COND_TO_APP = {
  mint: 'MT',
  m: 'MT',
  'near mint': 'NM',
  nearmint: 'NM',
  nm: 'NM',
  excellent: 'EX',
  ex: 'EX',
  good: 'GD',
  gd: 'GD',
  'lightly played': 'LP',
  'light played': 'LP',
  lightlyplayed: 'LP',
  lp: 'LP',
  'moderately played': 'PL',
  moderatelyplayed: 'PL',
  played: 'PL',
  pl: 'PL',
  mp: 'PL',
  'heavily played': 'PO',
  hp: 'PO',
  poor: 'PO',
  po: 'PO',
  damaged: 'PO',
  dmg: 'PO',
};

const APP_COND_TO_CSV = {
  MT: 'Mint',
  NM: 'Near Mint',
  EX: 'Lightly Played',
  GD: 'Lightly Played',
  LP: 'Lightly Played',
  PL: 'Moderately Played',
  PO: 'Damaged',
};

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function csvField(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function cleanImportName(name) {
  let n = String(name || '')
    .trim()
    .replace(/^"|"$/g, '');
  n = n.replace(/\s*\*[A-Za-z]\*\s*$/, '').trim(); // *F* foil tag
  n = n.replace(/\s*\([0-9A-Za-z]{2,6}\)\s*[0-9A-Za-z\-★]*\s*$/, '').trim(); // trailing (SET) 123
  return n;
}

// Parse a Moxfield / Archidekt collection CSV (or a plain "N Name" list) into entries.
function parseCollectionCsv(text) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length);
  if (!rows.length) return [];
  const header = splitCsvLine(rows[0]).map((h) => norm(h.replace(/^"|"$/g, '')));
  const looksCsv = rows[0].includes(',') && header.includes('name');
  const entries = [];
  const add = (name, qty, set, cn, cond, foil) => {
    name = cleanImportName(name);
    if (!name) return;
    entries.push({
      name,
      qty: Math.max(1, parseInt(qty, 10) || 1),
      set: (set || '').replace(/^"|"$/g, '').toLowerCase().trim(),
      cn: (cn || '').replace(/^"|"$/g, '').trim(),
      cond: CSV_COND_TO_APP[norm(cond)] || 'NM',
      foil: /true|foil|etched|^1$/i.test(String(foil || '').trim()),
    });
  };
  if (looksCsv) {
    const idx = (n) => header.indexOf(n);
    const pick = (...names) => {
      for (const n of names) {
        const i = idx(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const iName = idx('name');
    const iQty = pick('count', 'quantity', 'qty');
    const iSet = pick('edition', 'set code', 'edition code', 'set');
    const iCn = pick('collector number', 'collectornumber', 'card number');
    const iCond = idx('condition');
    const iFoil = pick('foil', 'finish');
    for (let r = 1; r < rows.length; r++) {
      const cells = splitCsvLine(rows[r]).map((c) => c.replace(/^"|"$/g, ''));
      const nm = cells[iName];
      if (!nm || !nm.trim()) continue;
      add(
        nm,
        iQty >= 0 ? cells[iQty] : 1,
        iSet >= 0 ? cells[iSet] : '',
        iCn >= 0 ? cells[iCn] : '',
        iCond >= 0 ? cells[iCond] : '',
        iFoil >= 0 ? cells[iFoil] : '',
      );
    }
  } else {
    rows.forEach((l) => {
      l = l.trim();
      const bare = l
        .replace(/^\/\/\s*|^#+\s*/, '')
        .replace(/^\[(.+)\]$/, '$1')
        .replace(/^\((.+)\)$/, '$1')
        .replace(/:\s*$/, '')
        .trim();
      if (
        !/\d/.test(bare) &&
        /^(deck|commander|side ?board|maybe ?board|main ?board|main|considering|planeswalkers?|creatures?|battles?|instants?|sorcer(?:y|ies)|artifacts?|enchantments?|lands?|spells?|other|tokens?)$/i.test(
          bare,
        )
      )
        return;
      const m = l.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) add(m[2], m[1]);
      else add(l, 1);
    });
  }
  // merge identical rows
  const merged = [];
  entries.forEach((e) => {
    const same = merged.find(
      (x) =>
        norm(x.name) === norm(e.name) &&
        x.set === e.set &&
        x.cn === e.cn &&
        x.cond === e.cond &&
        !!x.foil === !!e.foil,
    );
    if (same) same.qty += e.qty;
    else merged.push(e);
  });
  return merged;
}

// Resolve entries to Scryfall cards — exact printing (set+collector number) when
// available, otherwise by name; then a name-only retry for any misses.
let _sfBatchOk = false;
// did ANY /cards/collection chunk answer this run?
async function resolveCollectionEntries(entries, onProgress) {
  const cards = new Array(entries.length).fill(null);
  _sfBatchOk = false;
  async function batch(list) {
    const chunks = [];
    for (let i = 0; i < list.length; i += 70) chunks.push(list.slice(i, i + 70));
    let done = 0;
    const found = new Map();
    for (const chunk of chunks) {
      // A "set" that isn't a real set code (spaces, full edition names from
      // odd exports) would poison the identifier — resolve those by name.
      const ids = chunk.map((e) =>
        e.set && /^[0-9a-z]{2,6}$/.test(e.set) && e.cn
          ? { set: e.set, collector_number: e.cn }
          : { name: e.name },
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await postWithTimeout(
            `${SF_BASE}/cards/collection`,
            { identifiers: ids },
            6000,
          );
          if (r.ok) {
            _sfBatchOk = true;
            const d = await r.json();
            (d.data || []).forEach((c) => {
              found.set('s:' + (c.set || '') + ':' + (c.collector_number || ''), c);
              if (!found.has('n:' + norm(c.name))) found.set('n:' + norm(c.name), c);
              (c.card_faces || []).forEach((f) => {
                if (!found.has('n:' + norm(f.name))) found.set('n:' + norm(f.name), c);
              });
            });
            break;
          }
        } catch (err) {
          console.error('batch lookup failed', err);
        }
        await new Promise((res) => setTimeout(res, 600)); // brief pause, then one retry
      }
      done += chunk.length;
      if (onProgress) onProgress(Math.min(done, list.length), list.length);
      await new Promise((res) => setTimeout(res, 110));
    }
    return found;
  }
  const found1 = await batch(entries);
  const missing = [];
  entries.forEach((e, i) => {
    let c = e.set && e.cn ? found1.get('s:' + e.set + ':' + e.cn) : null;
    if (!c) c = found1.get('n:' + norm(e.name));
    if (c) cards[i] = c;
    else missing.push({ e, i });
  });
  if (missing.length) {
    const found2 = await batch(missing.map((m) => ({ name: m.e.name })));
    missing.forEach(({ e, i }) => {
      const c = found2.get('n:' + norm(e.name));
      if (c) cards[i] = c;
    });
  }
  // The batch endpoint never answered at all (network / CORS / outage) and
  // nothing resolved: fall back to the same serial GET lookups the rest of
  // the app runs on — slower, but they demonstrably work. One request per
  // unique name, exact first, fuzzy as a rescue.
  if (!_sfBatchOk && cards.every((c) => c === null) && entries.length) {
    const uniq = new Map();
    entries.forEach((e, i) => {
      const k = norm(e.name);
      if (!uniq.has(k)) uniq.set(k, []);
      uniq.get(k).push(i);
    });
    let done = 0;
    for (const idxs of uniq.values()) {
      const nm = entries[idxs[0]].name;
      try {
        let c = null;
        const r = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(nm)}`);
        if (r.ok) c = await r.json();
        else {
          const rf = await sfFetch(`${SF_BASE}/cards/named?fuzzy=${encodeURIComponent(nm)}`);
          if (rf.ok) c = await rf.json();
        }
        if (c)
          idxs.forEach((i) => {
            cards[i] = c;
          });
      } catch (err) {}
      done += idxs.length;
      if (onProgress) onProgress(Math.min(done, entries.length), entries.length);
    }
  }
  return cards;
}

function setCiReport(html) {
  const el = document.getElementById('ciReport');
  if (el) el.innerHTML = html;
}

// Moxfield/Archidekt don't put the binder name inside the CSV, but exports are
// often named after the binder (e.g. "White Blue Black_2026-07-21.csv"), so we
// derive a binder name from the filename — stripping the source prefix and the
// trailing date stamp — and auto-create/reuse a binder with that name.
function binderNameFromFilename(fname) {
  let n = String(fname || '').replace(/\.[a-z0-9]+$/i, '');
  n = n.replace(
    /^(moxfield|archidekt|manabox|deckbox|tcgplayer|dragonshield|helvault)[_\- ]+/i,
    '',
  );
  n = n.replace(/[_\- ]+\d{4}-\d{2}-\d{2}([-_ tT]?\d{0,4}z?)?$/i, '');
  n = n.replace(/[_\- ]+\d{6,}$/, '');
  n = n.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  // "haves"/"wants" are Moxfield's generic export labels, not real binder names —
  // treat them as unknown so the import prompts the user for a name.
  if (/^(haves?|wants?|collection|library|inventory|cards)$/i.test(n)) return '';
  if (/^[a-z]+$/.test(n)) n = n.charAt(0).toUpperCase() + n.slice(1); // "cube" -> "Cube"
  return n;
}

function openCollectionImport(presetBinder) {
  document.getElementById('colImportOverlay')?.remove();
  const el = document.createElement('div');
  el.id = 'colImportOverlay';
  el.innerHTML = /* HTML */ `<div
    class="appoint-sheet transfer-dialog"
    role="dialog"
    aria-label="Collection import / export"
  >
    ${transferHeaderHtml('Import / export', 'Move cards between your collection and other apps.', 'ciClose')}
    <div class="transfer-body">
      <p class="transfer-help">
        Paste a card list or load a CSV from Moxfield, Archidekt, ManaBox, or Delver Lens.
      </p>
      <input type="file" id="ciFile" accept=".csv,.txt,text/csv,text/plain" style="display:none;" />
      <label class="transfer-label" for="ciBinder">Import into</label>
      <select id="ciBinder" class="deck-select"></select>
      <label class="transfer-label" for="ciText">Card list or CSV</label>
      <textarea
        id="ciText"
        class="bulk-textarea"
        placeholder="1 Sol Ring&#10;2 Arcane Signet&#10;…"
      ></textarea>
      <button type="button" class="ghost-btn" id="ciPick">
        ${inlIco('file')}${'Load a file (.csv / .txt)'}
      </button>
      <button type="button" class="primary-btn" id="ciGo">${inlIco('imp')}Import cards</button>
      <div id="ciReport" class="transfer-report" role="status"></div>
      <p class="transfer-help">No file yet? Scan your cards with a free app:</p>
      <a
        class="ghost-btn"
        target="_blank"
        rel="noopener"
        href="${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'https://apps.apple.com/app/manabox-mtg/id1460407674' : 'https://play.google.com/store/apps/details?id=skilldevs.com.manabox'}"
        >ManaBox</a
      >
      ${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '' : `<a class="ghost-btn" target="_blank" rel="noopener" href="https://play.google.com/store/apps/details?id=delverlab.delverlens">Delver Lens</a>`}
      <div class="transfer-export">
        <button type="button" class="ghost-btn" id="ciExport">
          ${inlIco('exp')}Export collection
        </button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(el);
  pushOverlay('colImport', () => {
    document.getElementById('colImportOverlay')?.remove();
  });
  el.addEventListener('click', (e) => {
    if (!e.target.closest('.appoint-sheet')) closeTopOverlay();
  });
  document.getElementById('ciClose').addEventListener('click', () => closeTopOverlay());
  const bsel = document.getElementById('ciBinder');
  bsel.innerHTML = colImportBinderOptions();
  if (presetBinder) bsel.value = presetBinder;
  document
    .getElementById('ciPick')
    .addEventListener('click', () => document.getElementById('ciFile').click());
  // A file only fills the box -- nothing is added until Import is tapped,
  // just like the decklist paste sheet. Its name still suggests a binder.
  let ciFileName = '';
  document.getElementById('ciFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      setCiReport('⚠ ' + 'Could not read that file.');
      e.target.value = '';
      return;
    }
    const ta = document.getElementById('ciText');
    if (ta) {
      ta.value = text;
      ta.scrollTop = 0;
    }
    ciFileName = file.name;
    setCiReport(escapeHtml(file.name) + ' loaded — tap Import.');
    e.target.value = '';
  });
  document.getElementById('ciText').addEventListener('input', () => {
    if (!document.getElementById('ciText').value.trim()) ciFileName = '';
  });
  document.getElementById('ciGo').addEventListener('click', () => {
    const t = document.getElementById('ciText')?.value || '';
    if (!t.trim()) {
      setCiReport('Paste a list or load a file first.');
      return;
    }
    runCsvImport(t, ciFileName ? binderNameFromFilename(ciFileName) : null);
  });
  document.getElementById('ciExport').addEventListener('click', downloadCollectionCsv);
}

/* Where imported cards go: binder rules, a new binder, no binder, or one of
   the binders -- the same choice for a CSV file and for a pasted list. */
function colImportBinderOptions() {
  return (
    (ruledBinders().length
      ? `<option value="__auto__">✦ ${'Automatic (binder rules)'}</option>`
      : '') +
    `<option value="__new__">${"A binder (I'll name it)…"}</option><option value="">${'My whole collection — no binder'}</option>` +
    (state.collection.binders || [])
      .map((b) => `<option value="${b.id}">${'Into binder'}: ${escapeHtml(b.name)}</option>`)
      .join('')
  );
}

async function runCsvImport(text, suggestedBinderName, forcedBinder) {
  const entries = parseCollectionCsv(text);
  if (!entries.length) {
    setCiReport('⚠ ' + 'No cards found — one card per line (1 Sol Ring) or a CSV export.');
    return;
  }
  let binder =
    typeof forcedBinder === 'string'
      ? forcedBinder
      : document.getElementById('ciBinder')
        ? document.getElementById('ciBinder').value
        : '';
  let binderLabel = '';
  if (binder === '__new__') {
    let nm = (suggestedBinderName || '').trim();
    if (!nm)
      nm = (
        (await new Promise((res) =>
          openInAppPrompt('Name this binder', 'Leave blank for your whole collection', '', res),
        )) || ''
      ).trim();
    if (nm) {
      const existing = (state.collection.binders || []).find((b) => norm(b.name) === norm(nm));
      if (existing) {
        binder = existing.id;
        binderLabel = existing.name;
      } else {
        const b = { id: 'bnd_' + Date.now().toString(36), name: nm };
        state.collection.binders.push(b);
        binder = b.id;
        binderLabel = nm;
      }
    } else binder = '';
  } else if (binder === '__auto__') {
    binderLabel = '';
  } else if (binder) {
    binderLabel = binderName(binder) || '';
  }
  await resolveLegalSets();
  setCiReport(
    `<div class="status"><div class="spinner"></div>Looking up ${entries.length} cards…</div>`,
  );
  const cards = await resolveCollectionEntries(entries, (done, all) =>
    setCiReport(
      `<div class="status"><div class="spinner"></div>Looking up ${done}/${all} cards…</div>`,
    ),
  );
  let types = 0,
    qtyTotal = 0;
  const missing = [];
  const _memo = {};
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i],
      c = cards[i];
    if (!c) {
      missing.push(e.name);
      continue;
    }
    const slim = colFoilSlim(slimForCollection(c), c, e.foil);
    const bnd =
      binder === '__auto__'
        ? await routeBinder({ ...slim, cond: e.cond, qty: e.qty }, _memo)
        : binder;
    const same = state.collection.items.find(
      (x) =>
        x.name === slim.name &&
        x.set === slim.set &&
        x.cn === slim.cn &&
        x.cond === e.cond &&
        !!x.foil === !!slim.foil &&
        (x.binder || null) === (bnd || null),
    );
    if (same) same.qty += e.qty;
    else
      state.collection.items.unshift({
        ...slim,
        cond: e.cond,
        qty: e.qty,
        binder: bnd || null,
        addedAt: Date.now(),
      });
    types++;
    qtyTotal += e.qty;
  }
  saveCollection();
  let msg = `<span style="color:var(--success);">Imported ${qtyTotal} card${qtyTotal === 1 ? '' : 's'} (${types} unique)${binderLabel ? ` into “${escapeHtml(binderLabel)}”` : ''}.</span>`;
  if (missing.length)
    msg += `<br><span class="hint">${missing.length} not found: ${escapeHtml(missing.slice(0, 6).join(', '))}${missing.length > 6 ? '…' : ''}</span>`;
  setCiReport(msg);
  if (qtyTotal) toast(`Imported ${qtyTotal} cards${binderLabel ? ` into ${binderLabel}` : ''}.`);
  if (state.screen === 'collection') {
    const rep = document.getElementById('ciReport')?.innerHTML;
    render();
  }
}

function downloadCollectionCsv() {
  const items = state.collection.items || [];
  if (!items.length) {
    toast('Your collection is empty — nothing to export.');
    return;
  }
  const header = [
    'Count',
    'Tradelist Count',
    'Name',
    'Edition',
    'Condition',
    'Language',
    'Foil',
    'Tags',
    'Last Modified',
    'Collector Number',
    'Alter',
    'Proxy',
    'Purchase Price',
  ];
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const lines = [header.join(',')];
  items.forEach((it) => {
    lines.push(
      [
        it.qty || 1,
        0,
        it.name || '',
        (it.set || '').toLowerCase(),
        APP_COND_TO_CSV[it.cond] || 'Near Mint',
        'English',
        it.foil ? 'foil' : '',
        it.binder ? binderName(it.binder) || '' : '',
        now,
        it.cn || '',
        'False',
        'False',
        '',
      ]
        .map(csvField)
        .join(','),
    );
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deckhand-collection-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${items.length} collection entries as CSV.`);
}

function loadPriceCache() {
  try {
    const raw = localStorage.getItem(LS_PREFIX + 'prices');
    if (!raw) return {};
    const obj = JSON.parse(raw) || {};
    const now = Date.now();
    Object.keys(obj).forEach((k) => {
      if (!obj[k] || now - obj[k].t > PRICE_TTL) delete obj[k];
    });
    return obj;
  } catch (e) {
    return {};
  }
}

let _priceSaveT = null;

function savePriceCache() {
  clearTimeout(_priceSaveT);
  _priceSaveT = setTimeout(() => {
    try {
      localStorage.setItem(LS_PREFIX + 'prices', JSON.stringify(state.priceCache));
    } catch (e) {}
  }, 400);
}

function fmtEur(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return '€' + Number(v).toFixed(2);
}

/* The weekly build carries a price for nearly every card, sitting in IndexedDB
   on the phone. Until now nothing read it for deck totals, so every price went
   over the network -- which is what kept tripping Scryfall's limiter. This
   reads it straight out of the already-loaded index; when the index is not in
   memory yet it simply answers "don't know" and the online path takes over. */
/* The daily price file. The weekly build carries prices too, but those are up
   to a week old; this one is rebuilt every morning and is a fraction of the
   size, so prices are never more than a day behind without asking Scryfall a
   single question. The weekly numbers stay as the fallback for anything the
   daily file does not list. */
const DPRICE_META = './prices-meta.json';

const DPRICE_FILE = './prices-slim.tsv.gz';

let _dPrices = null,
  _dPricesBuilt = '';

async function dailyPricesReady() {
  if (_dPrices) return _dPrices;
  try {
    const rows = await bulkKvGet('dprices');
    if (Array.isArray(rows) && rows.length) {
      _dPrices = new Map(rows);
      const meta = await bulkKvGet('dpricesMeta');
      _dPricesBuilt = (meta && meta.built) || '';
    }
  } catch (e) {}
  return _dPrices;
}

async function dailyPricesCheck(force) {
  if (!hasLocalDataFile('prices-meta.json')) return;
  try {
    if (!('DecompressionStream' in window)) return;
    if (!force && (navigator.onLine === false || document.hidden)) return;
    const r = await fetch(DPRICE_META, { cache: 'no-store' });
    if (!r.ok) return; // not published yet: no harm done
    const meta = await r.json();
    await dailyPricesReady();
    if (meta && meta.built && meta.built === _dPricesBuilt) return; // already have today's
    const res = await fetch(DPRICE_FILE, { cache: 'no-store' });
    if (!res.ok || !res.body) return;
    const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const map = new Map();
    for (const line of text.split('\n')) {
      const t = line.indexOf('\t');
      if (t < 1) continue;
      const v = parseFloat(line.slice(t + 1));
      if (!isNaN(v)) map.set(line.slice(0, t).toLowerCase(), v);
    }
    if (map.size < 1000) return; // a thin file is a broken file
    _dPrices = map;
    _dPricesBuilt = (meta && meta.built) || '';
    await bulkKvSet('dprices', Array.from(map.entries()));
    await bulkKvSet('dpricesMeta', { built: _dPricesBuilt, count: map.size });
    // Everything seeded from the older weekly numbers is now out of date. Live
    // answers (no mark) are left alone -- they came from Scryfall itself.
    let dropped = 0;
    for (const k of Object.keys(state.priceCache || {})) {
      if (state.priceCache[k] && state.priceCache[k].s === 1) {
        delete state.priceCache[k];
        dropped++;
      }
    }
    if (dropped)
      try {
        savePriceCache();
      } catch (e) {}
    try {
      sfJournal(
        'prices: daily file, ' +
          map.size +
          ' cards, built ' +
          _dPricesBuilt +
          (dropped ? ', ' + dropped + ' week-old entries dropped' : ''),
      );
    } catch (e) {}
    if (state.screen === 'decks' || state.screen === 'decklist') render();
  } catch (e) {}
}

function bulkEurFor(name) {
  try {
    // Today's number wins over the weekly one.
    if (_dPrices) {
      const d = _dPrices.get(String(name).toLowerCase());
      if (typeof d === 'number' && isFinite(d)) return d;
    }
    const ix = _bulkIdx;
    if (!ix || !ix.byName) return undefined;
    const e = ix.byName.get(String(name).toLowerCase());
    if (!e) return undefined;
    // Only a real number counts. A card the build has no price for must still
    // be asked about online -- never cache "no price" on the build's say-so.
    return typeof e.eur === 'number' && isFinite(e.eur) ? e.eur : undefined;
  } catch (err) {
    return undefined;
  }
}

/* Fills the cache from the local database for every card it knows, and reports
   how many were still left for the network. */
function seedPricesFromBulk(cards) {
  let seeded = 0;
  const now = Date.now();
  for (const c of cards || []) {
    if (!c || !c.name) continue;
    if (state.priceCache[c.name]) continue; // never overwrite a live answer
    const v = bulkEurFor(c.name);
    if (v === undefined) continue;
    state.priceCache[c.name] = { v, t: now, s: 1 }; // s: came from the local database
    try {
      notePrice(c.name, v);
    } catch (e) {}
    seeded++;
  }
  if (seeded)
    try {
      savePriceCache();
    } catch (e) {}
  return seeded;
}

async function cheapestEur(card, front, fresh) {
  if (!card || !card.name) return null;
  const hit = state.priceCache[card.name];
  const cached = hit && Date.now() - hit.t < PRICE_TTL ? hit.v : undefined;
  if (!fresh && cached !== undefined) return cached;
  if (!fresh) {
    // The database on this phone usually knows. This is why a spoiler card
    // could show no price at all while its price sat in the weekly build.
    const local = bulkEurFor(card.name);
    if (local !== undefined) {
      state.priceCache[card.name] = { v: local, t: Date.now(), s: 1 };
      try {
        notePrice(card.name, local);
        savePriceCache();
      } catch (e) {}
      return local;
    }
  }
  if (!card.prints_search_uri) return cached !== undefined ? cached : null;
  let min = null;
  try {
    const res = await sfFetch(card.prints_search_uri, 0, true, false, front);
    if (!res.ok) return cached !== undefined ? cached : null;
    const data = await res.json();
    (data.data || []).forEach((p) => {
      if (p.digital) return; // MTGO/Arena printings aren't purchasable in paper
      const raw = p.prices && p.prices.eur;
      if (!raw) return;
      const e = parseFloat(raw);
      if (!isNaN(e) && (min === null || e < min)) min = e;
    });
  } catch (e) {
    console.error('price lookup failed for', card.name, e);
    return cached !== undefined ? cached : null;
  }
  state.priceCache[card.name] = { v: min, t: Date.now() };
  notePrice(card.name, min);
  savePriceCache();
  return min;
}

/* Pricing a whole deck one card at a time means one request per card. Instead we
   ask Scryfall for the printings of a batch of cards in a single query
   (`!"A" or !"B" or ...` with unique=prints) and reduce to the cheapest per name
   client-side — roughly an order of magnitude fewer round-trips. */
const PRICE_BATCH = 10;

function exactNameClause(name) {
  // Scryfall's !"..." is an exact-name match; strip stray quotes so we can't break the query
  return '!"' + name.replace(/"/g, '') + '"';
}

/* Returned instead of a result when Scryfall refused the request outright, so
   the caller can back off rather than ask ten more times. */
const REFUSED = Symbol('scryfall-refused');

async function fetchPricesForBatch(names, bg) {
  const found = {};
  names.forEach((n) => {
    found[n] = null;
  });
  const q = '(' + names.map(exactNameClause).join(' or ') + ') game:paper -is:digital';
  let url = `${SF_BASE}/cards/search?unique=prints&q=${encodeURIComponent(q)}`;
  // Look up each name case-insensitively; Scryfall echoes canonical capitalisation
  const byLower = {};
  names.forEach((n) => {
    byLower[n.toLowerCase()] = n;
  });
  for (let page = 0; page < 6 && url; page++) {
    let data;
    try {
      const res = await sfFetch(url, 0, !!bg);
      if (!res.ok) {
        if (res.status === 404) break; // nothing in this batch matched
        throw new Error('status ' + res.status);
      }
      data = await res.json();
    } catch (e) {
      // Two very different failures wear the same coat here. A network error
      // (or a 429) means Scryfall refused us -- answering that with ten single
      // lookups is exactly the wrong move. A query-level failure is the case
      // the per-card fallback was written for.
      const refused =
        !(e && /status (4[0-9]{2})/.test(String(e.message))) ||
        /status 429/.test(String(e && e.message));
      console.error('batch price query failed', e);
      return refused ? REFUSED : null;
    }
    (data.data || []).forEach((p) => {
      if (p.digital) return;
      const key = byLower[(p.name || '').toLowerCase()];
      if (!key) return;
      const raw = p.prices && p.prices.eur;
      if (!raw) return;
      const e = parseFloat(raw);
      if (isNaN(e)) return;
      if (found[key] === null || e < found[key]) found[key] = e;
    });
    url = data.has_more ? data.next_page : null;
  }
  return found;
}

async function priceDeck(d, onProgress, bg) {
  const all = deckLeaders(d).concat(d.cards);
  const seen = new Set();
  const unique = [];
  all.forEach((c) => {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      unique.push(c);
    }
  });

  // Make sure the local database is in memory, then take everything it knows.
  // Whatever is left over is genuinely new and worth a request.
  try {
    await bulkIndexReady();
  } catch (e) {}
  const _seeded = seedPricesFromBulk(unique);
  if (_seeded)
    try {
      sfJournal('prices: ' + _seeded + ' from the local database, no request needed');
    } catch (e) {}

  const now = Date.now();
  // Anything priced within the last week is served immediately; entries past a
  // day old are re-priced quietly in the background afterwards, so daily deck
  // sessions open at cache speed with at most day-old numbers.
  const needed = unique.filter((c) => {
    const hit = state.priceCache[c.name];
    return !(hit && now - hit.t < SWR_SERVE);
  });
  const staleNames = unique
    .filter((c) => {
      const hit = state.priceCache[c.name];
      return hit && now - hit.t >= PRICE_TTL && now - hit.t < SWR_SERVE;
    })
    .map((c) => c.name);

  if (needed.length) {
    const batches = chunkArr(
      needed.map((c) => c.name),
      PRICE_BATCH,
    );
    let doneNames = unique.length - needed.length;
    if (onProgress) onProgress(doneNames, unique.length);
    // A few batches in parallel; sfFetch's queue still paces the actual requests
    let _refused = false;
    // How many times this deck has already been picked back up. Three is
    // plenty: beyond that something is wrong that waiting will not fix.
    state._priceResume = state._priceResume || {};
    await runLimited(
      batches,
      async (names) => {
        if (_refused) return; // the server already said no
        const found = await fetchPricesForBatch(names, bg);
        if (found === REFUSED) {
          // Scryfall is refusing. Ten single lookups would be ten more refusals
          // and six retries each; stop this run and let the queue's cool-off do
          // its work. What we did get is kept.
          _refused = true;
          state._priceHoldUntil = Date.now() + 45000;
          try {
            sfJournal(
              'prices: Scryfall refused the batch \u2014 pausing, will finish this by itself',
            );
          } catch (e) {}
          return;
        }
        if (found) {
          names.forEach((n) => {
            state.priceCache[n] = { v: found[n], t: Date.now() };
            notePrice(n, found[n]);
          });
        } else {
          // The query itself broke — this is what the per-card fallback is for.
          for (const n of names) {
            const card = unique.find((c) => c.name === n);
            if (card) await cheapestEur(card);
          }
        }
        doneNames += names.length;
        if (onProgress) onProgress(Math.min(doneNames, unique.length), unique.length);
      },
      2,
    );
    savePriceCache();
    if (_refused) {
      // Come back to it on our own, once the hold and the queue's cool-off have
      // passed. The person should not have to keep reopening the deck -- that
      // habit is what kept Scryfall's limiter awake in the first place.
      const tries = (state._priceResume[d.id] || 0) + 1;
      state._priceResume[d.id] = tries;
      if (tries <= 3) {
        setTimeout(
          () => {
            if (state._pricingDeck) return; // something else is busy
            state._priceHoldUntil = 0;
            priceDeck(d, onProgress, true)
              .then(() => {
                // background lane: no rush
                if (state.screen === 'decklist' && state.activeDeckId === d.id)
                  refreshDecklistBox(d);
                if (state.screen === 'decks') paintDeckPrice(d);
              })
              .catch(() => {});
          },
          50000 + tries * 15000,
        );
      }
    } else {
      state._priceResume[d.id] = 0;
    }
  }

  let total = 0,
    missing = 0;
  unique.forEach((c) => {
    const hit = state.priceCache[c.name];
    const v = hit ? hit.v : null;
    if (v === null || v === undefined) missing++;
    else total += v;
  });
  if (onProgress) onProgress(unique.length, unique.length);
  let refreshed = null;
  if (staleNames.length) {
    refreshed = (async () => {
      for (const batch of chunkArr(staleNames, PRICE_BATCH)) {
        const found = await fetchPricesForBatch(batch, true); // background lane
        if (found)
          batch.forEach((n) => {
            state.priceCache[n] = { v: found[n], t: Date.now() };
            notePrice(n, found[n]);
          });
      }
      savePriceCache();
    })().catch(() => {});
  }
  return { total, missing, counted: unique.length - missing, refreshed };
}
