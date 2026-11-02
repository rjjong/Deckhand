// services / card-library

/* iOS pinch-zoom still fires gesture events even with user-scalable=no,
   and the attempted zoom is what was shoving parts of the page offscreen.
   Blocking the gesture (and double-tap zoom) keeps the layout anchored. */

let _bulkSyncing = false;

let _bulkDb = null,
  _bulkDbP = null;

function bulkDbOpen() {
  if (_bulkDb) return Promise.resolve(_bulkDb);
  if (_bulkDbP) return _bulkDbP;
  _bulkDbP = new Promise((res) => {
    let settled = false,
      timer = null;
    const finish = (db, why) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); // a healthy open must not log an alarm
      if (why) {
        try {
          sfJournal('bulkdb: open ' + why);
        } catch (e) {}
      }
      if (db) _bulkDb = db;
      else _bulkDbP = null; // a failure is never cached: the next caller may retry
      res(db);
    };
    try {
      const req = indexedDB.open('admiral-bulkdb', 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore('kv');
        } catch (e) {}
      };
      req.onsuccess = () => finish(req.result, '');
      req.onerror = () => finish(null, 'error');
      req.onblocked = () => finish(null, 'BLOCKED');
      timer = setTimeout(() => {
        // Slow is not dead. Let this caller move on, but keep listening --
        // when the open lands we adopt it, so the session is not stuck
        // pretending it has no database.
        req.onsuccess = () => {
          _bulkDb = req.result;
          _bulkDbP = null;
          try {
            sfJournal('bulkdb: opened late, adopted');
          } catch (e) {}
        };
        finish(null, 'slow (over 8s) \u2014 still listening');
      }, 8000);
    } catch (e) {
      finish(null, 'threw');
    }
  });
  return _bulkDbP;
}

async function bulkKvGet(key) {
  try {
    const db = await bulkDbOpen();
    if (!db) return null;
    return await new Promise((res) => {
      const rq = db.transaction('kv').objectStore('kv').get(key);
      rq.onsuccess = () => res(rq.result === undefined ? null : rq.result);
      rq.onerror = () => res(null);
    });
  } catch (e) {
    return null;
  }
}

async function bulkKvSet(key, value) {
  try {
    const db = await bulkDbOpen();
    if (!db) return false;
    return await new Promise((res) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => res(false);
    });
  } catch (e) {
    return false;
  }
}

/* Line feed: splits streamed text into JSONL objects, carrying partial
   lines across chunk boundaries. Pure — the unit tests run it dry. */
function bulkLineFeed(onLine) {
  let carry = '';
  return {
    push(text) {
      const all = carry + text;
      const lines = all.split('\n');
      carry = lines.pop();
      for (const ln of lines) {
        const t = ln.trim();
        if (t) onLine(JSON.parse(t));
      }
    },
    end() {
      const t = carry.trim();
      carry = '';
      if (t) onLine(JSON.parse(t));
    },
  };
}

function _bulkYield() {
  // A short breath while the person is actively using the app. The old
  // 180ms breath, times ~90 chunks, was most of a "stuck forever" ring —
  // an actively-poked phone kept every yield in the busy window.
  const busy = Date.now() - _warmLastInput < 2500;
  return new Promise((r) => setTimeout(r, busy ? 40 : 0));
}

async function _bulkStreamJsonl(url, onLine) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error('bulk fetch HTTP ' + res.status + ' for ' + url);
  const reader = res.body.pipeThrough(new DecompressionStream('gzip')).getReader();
  const dec = new TextDecoder();
  const feed = bulkLineFeed(onLine);
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) feed.push(dec.decode(value, { stream: true }));
    if (done) {
      feed.push(dec.decode());
      feed.end();
      break;
    }
    if (++n % 4 === 0) await _bulkYield();
  }
}

const BULK_CHUNK = 2000;

/* Which stamp belongs to which file. Manifest format 2 gives every file its
   own, and it only moves when that file's contents actually changed. An older
   manifest (format 1, one stamp for the whole build) still works: every file
   then reads the same stamp and the app behaves exactly as it did before. */
function bulkPartStamp(meta, k) {
  if (!meta) return '';
  const sec = meta[k];
  if (sec && sec.built) return String(sec.built);
  return String(meta.built || '');
}

async function bulkSyncCheck(force) {
  // The price file is tiny and independent; it never waits on the weekly one.
  if (!force) dailyPricesCheck();
  // force = the Extras button: every silent bail becomes a spoken toast, so
  // an empty database can never be a mystery again.
  if (_bulkSyncing) {
    if (force) toast(trS('Already downloading…'));
    return;
  }
  try {
    if (!('DecompressionStream' in window)) {
      sfJournal('bulkdb: skipped — no DecompressionStream');
      if (force) toast(trS('This browser cannot unpack the database file.'));
      return;
    }
    if (!force && (navigator.onLine === false || document.hidden)) return;
    // Data Saver used to veto the weekly file entirely — on a phone that
    // always runs Data Saver (Stef's does) the database was simply NEVER
    // ingested, which is why combos, salt images, and every other local
    // lookup came up empty. The weekly file is the app's beating heart;
    // it downloads regardless, once a week, compressed.
    let remote = null;
    try {
      const r = await fetch('bulk-meta.json', { cache: 'no-store' });
      if (!r.ok) {
        sfJournal('bulkdb: bulk-meta.json ' + r.status);
        if (force) toast(trS('Database file not published on the server.'));
        return;
      }
      remote = await r.json();
    } catch (e) {
      sfJournal('bulkdb: meta fetch failed');
      if (force) toast(trS('Couldn\u2019t reach the server.'));
      return;
    }
    if (!remote || !remote.built) return;
    const local = await bulkKvGet('meta');
    const lp = (local && local.parts) || {};
    const newBuild = !local || local.built !== remote.built;
    /* A file comes down when its stamp moved, or when we have nothing for it.
       The optional files (tags, combos) may legitimately be missing from the
       server; for those an empty shelf is retried ONCE per weekly build, never
       on every open. */
    const need = {
      oracle: !local || !(local.cardChunks > 0) || lp.oracle !== bulkPartStamp(remote, 'oracle'),
      rulings: !local || !(local.rulChunks > 0) || lp.rulings !== bulkPartStamp(remote, 'rulings'),
      tags:
        hasLocalDataFile('tags-slim.jsonl.gz') &&
        remote.tags != null &&
        (!local ||
          lp.tags !== bulkPartStamp(remote, 'tags') ||
          (!(local.tagChunks > 0) && newBuild)),
      combos:
        hasLocalDataFile('combos-slim.jsonl.gz') &&
        remote.combos != null &&
        (!local ||
          lp.combos !== bulkPartStamp(remote, 'combos') ||
          (!(local.comboChunks > 0) && newBuild)),
    };
    if (!need.oracle && !need.rulings && !need.tags && !need.combos) {
      if (force)
        toast(
          trS('Database already current') +
            ' \u2014 ' +
            (local.cards || 0) +
            ' cards, ' +
            (local.combos || 0) +
            ' combos.',
        );
      return;
    }
    const _want = Object.keys(need).filter((k) => need[k]);
    if (force) toast(trS('Downloading card database\u2026'));
    _bulkSyncing = true; // the image warmer stands down
    _noteInputListeners();
    sfJournal('bulkdb: sync start ' + remote.built + ' \u2014 ' + _want.join(', '));

    // Counts carry over untouched for every file we are not fetching.
    let ci = (local && local.cardChunks) || 0,
      cardCount = (local && local.cards) || 0;
    let ri = (local && local.rulChunks) || 0,
      rulingCards = (local && local.rulingCards) || 0;
    let ti = (local && local.tagChunks) || 0,
      tagCount = (local && local.tagCards) || 0;
    let ki = (local && local.comboChunks) || 0,
      comboCount = (local && local.combos) || 0;

    let cards = null;
    if (need.oracle) {
      cards = [];
      await _bulkStreamJsonl('oracle-slim.jsonl.gz', (c) => cards.push(c));
      if (remote.oracle && remote.oracle.count && cards.length < remote.oracle.count * 0.9)
        throw new Error('oracle stream came up short: ' + cards.length);
      // Write chunks first, meta LAST — an interrupted sync stays invisible
      // and simply redoes the work next session.
      let n = 0;
      for (let x = 0; x < cards.length; x += BULK_CHUNK) {
        await bulkKvSet('cards:' + n++, cards.slice(x, x + BULK_CHUNK));
        await _bulkYield();
      }
      for (let k = n; k < ci; k++) await bulkKvSet('cards:' + k, null);
      ci = n;
      cardCount = cards.length;
    }
    if (need.rulings) {
      const ruls = [];
      await _bulkStreamJsonl('rulings-slim.jsonl.gz', (r) => ruls.push(r));
      if (remote.rulings && remote.rulings.cards && ruls.length < remote.rulings.cards * 0.9)
        throw new Error('rulings stream came up short: ' + ruls.length);
      let n = 0;
      for (let x = 0; x < ruls.length; x += BULK_CHUNK) {
        await bulkKvSet('rul:' + n++, ruls.slice(x, x + BULK_CHUNK));
        await _bulkYield();
      }
      for (let k = n; k < ri; k++) await bulkKvSet('rul:' + k, null);
      ri = n;
      rulingCards = ruls.length;
    }
    // ---- oracle tags: optional. Absent simply means "not published yet". ----
    if (need.tags)
      try {
        const tagRecs = [];
        await _bulkStreamJsonl('tags-slim.jsonl.gz', (r) => tagRecs.push(r));
        let n = 0;
        for (let x = 0; x < tagRecs.length; x += BULK_CHUNK) {
          await bulkKvSet('tag:' + n++, tagRecs.slice(x, x + BULK_CHUNK));
          await _bulkYield();
        }
        for (let k = n; k < ti; k++) await bulkKvSet('tag:' + k, null);
        ti = n;
        tagCount = tagRecs.length;
      } catch (e) {
        /* keep whatever we already had */
      }
    // ---- combos: optional too. Only 2–4 card combos pass the door. ----
    if (need.combos)
      try {
        const rows = [];
        await _bulkStreamJsonl('combos-slim.jsonl.gz', (r) => {
          if (r && Array.isArray(r.nm) && r.nm.length >= 2 && r.nm.length <= 4) rows.push(r);
        });
        let n = 0;
        for (let x = 0; x < rows.length; x += BULK_CHUNK) {
          await bulkKvSet('cmb:' + n++, rows.slice(x, x + BULK_CHUNK));
          await _bulkYield();
        }
        for (let k = n; k < ki; k++) await bulkKvSet('cmb:' + k, null);
        ki = n;
        comboCount = rows.length;
      } catch (e) {
        /* keep whatever we already had */
      }
    // The ban seed is derived from the card file, so it is only redone when
    // that file came down.
    if (cards && !remote.sample)
      await bulkKvSet('bannedCommander', {
        t: Date.parse(remote.built) || 0,
        names: bulkBannedNamesFrom(cards),
      });
    await bulkKvSet('meta', {
      built: remote.built,
      sample: !!remote.sample,
      cardChunks: ci,
      rulChunks: ri,
      tagChunks: ti,
      comboChunks: ki,
      cards: cardCount,
      rulingCards,
      tagCards: tagCount,
      combos: comboCount,
      comboRetryBuilt: remote.built,
      savedAt: Date.now(),
      parts: {
        oracle: bulkPartStamp(remote, 'oracle'),
        rulings: bulkPartStamp(remote, 'rulings'),
        tags: bulkPartStamp(remote, 'tags'),
        combos: bulkPartStamp(remote, 'combos'),
      },
    });
    _bulkIdx = null;
    _bulkLoadP = null; // rebuilt lazily from the new data
    state._bulkMetaCache = null; // Data Sources re-reads the new meta
    sfJournal(
      'bulkdb: synced ' +
        _want.join(', ') +
        ' \u2014 now ' +
        cardCount +
        ' cards, ' +
        rulingCards +
        ' ruling sets, ' +
        tagCount +
        ' tag sets, ' +
        comboCount +
        ' combos',
    );
    if (force)
      toast(trS('Database ready') + ': ' + cardCount + ' cards, ' + comboCount + ' combos.');
    setTimeout(() => {
      try {
        bulkIndexReady().catch(() => {});
      } catch (e) {}
    }, 500); // warm the fresh data
  } catch (e) {
    console.warn('bulk sync failed', e);
    try {
      sfJournal('bulkdb: sync FAILED ' + ((e && e.message) || e));
    } catch (err) {}
    if (force) toast(trS('Download failed') + ' — ' + ((e && e.message) || e));
  } finally {
    _bulkSyncing = false;
  }
}

/* Derived once per sync so the ban seed never needs the full index. */
function bulkBannedNamesFrom(cards) {
  const out = new Set();
  cards.forEach((c) => {
    if (c && c.lg === 'banned' && c.n) out.add(String(c.n).split(' // ')[0]);
  });
  return Array.from(out);
}

/* ---- lazy in-memory index (built on first use, kept for the session) ---- */
let _bulkIdx = null,
  _bulkLoadP = null;

function bulkIndexReady() {
  if (_bulkIdx) return Promise.resolve(_bulkIdx);
  if (_bulkLoadP) return _bulkLoadP;
  _bulkLoadP = (async () => {
    const meta = await bulkKvGet('meta');
    if (!meta || !meta.cardChunks) {
      _bulkLoadP = null;
      return null;
    }
    const byName = new Map(),
      rulByOid = new Map(),
      cardsArr = [];
    let hasLx = false;
    for (let i = 0; i < meta.cardChunks; i++) {
      const arr = await bulkKvGet('cards:' + i);
      if (Array.isArray(arr))
        arr.forEach((c) => {
          if (!c || !c.n) return;
          if (c.lx) hasLx = true;
          cardsArr.push(c);
          const full = String(c.n).toLowerCase();
          if (!byName.has(full)) byName.set(full, c);
          const front = full.split(' // ')[0];
          if (front && !byName.has(front)) byName.set(front, c);
        });
      await _bulkYield();
    }
    for (let i = 0; i < meta.rulChunks; i++) {
      const arr = await bulkKvGet('rul:' + i);
      if (Array.isArray(arr))
        arr.forEach((x) => {
          if (x && x.o) rulByOid.set(x.o, x.r || []);
        });
      await _bulkYield();
    }
    const tagByOid = meta.tagChunks > 0 ? new Map() : null;
    if (tagByOid) {
      for (let i = 0; i < meta.tagChunks; i++) {
        const arr = await bulkKvGet('tag:' + i);
        if (Array.isArray(arr))
          arr.forEach((x) => {
            if (x && x.o) tagByOid.set(x.o, x.g || []);
          });
        await _bulkYield();
      }
    }
    _bulkIdx = {
      built: meta.built,
      sample: !!meta.sample,
      byName,
      rulByOid,
      cards: cardsArr,
      tagByOid,
      hasLx,
    };
    return _bulkIdx;
  })();
  return _bulkLoadP;
}

/* Combos-only fast lane: the full index reads EVERY card chunk before it
   touches combos — tens of seconds on a phone — while the combo chunks
   alone are a blink. The card-sheet button rides this lane; the full index,
   once built by the boot prewarm, is preferred for free. */
let _cmbIdx = null,
  _cmbLoadP = null;

function combosReady() {
  if (_cmbIdx) return Promise.resolve(_cmbIdx);
  if (_cmbLoadP) return _cmbLoadP;
  _cmbLoadP = (async () => {
    // A meta written by an older ingest may not carry comboChunks at all —
    // when the count is absent, probe cmb:0, cmb:1, … until a chunk is
    // missing, exactly like the data was laid down.
    try {
      sfJournal('combos: lane start');
    } catch (e) {}
    const meta = await bulkKvGet('meta');
    const known = meta && meta.comboChunks > 0 ? meta.comboChunks : null;
    try {
      sfJournal('combos: meta ' + (meta ? 'ok, chunks=' + (known || '?') : 'MISSING'));
    } catch (e) {}
    const combos = [],
      comboByName = new Map();
    const eat = (arr) => {
      if (!Array.isArray(arr)) return false;
      arr.forEach((x) => {
        if (!x || !Array.isArray(x.nm) || x.nm.length < 2) return;
        const idx = combos.push(x) - 1;
        x.nm.forEach((n) => {
          const k = String(n).toLowerCase();
          let lst = comboByName.get(k);
          if (!lst) {
            lst = [];
            comboByName.set(k, lst);
          }
          lst.push(idx);
        });
      });
      return true;
    };
    if (known) {
      for (let i = 0; i < known; i++) {
        eat(await bulkKvGet('cmb:' + i));
        if (i % 15 === 0) {
          try {
            sfJournal('combos: chunk ' + i + '/' + known);
          } catch (e) {}
        }
        await _bulkYield();
      }
    } else {
      for (let i = 0; i < 400; i++) {
        if (!eat(await bulkKvGet('cmb:' + i))) break;
        if (i % 15 === 0) {
          try {
            sfJournal('combos: probe ' + i);
          } catch (e) {}
        }
        await _bulkYield();
      }
    }
    try {
      sfJournal('combos: lane done, ' + combos.length + ' combos');
    } catch (e) {}
    // An empty harvest is NOT cached: a later weekly ingest (or the full
    // index) may still bring combos, and callers fall through to it.
    _cmbIdx = combos.length ? { combos, comboByName } : null;
    _cmbLoadP = null;
    return _cmbIdx;
  })();
  return _cmbLoadP;
}

async function bulkCardByName(name) {
  const ix = await bulkIndexReady();
  if (!ix || !name) return null;
  return ix.byName.get(String(name).toLowerCase()) || null;
}

/* Tri-state, pure for testing: an array (possibly empty) is an
   authoritative local answer; undefined means "can't say — ask the
   live API" (no database, or a card newer than the weekly file). */
function _bulkRulingsDecide(ix, card) {
  if (!ix || !card) return undefined;
  if (ix.sample) return undefined; // Sample data has no rulings; ask the live API.
  const nameKey = card.name ? String(card.name).toLowerCase() : null;
  if (card.oracle_id) {
    if (ix.rulByOid.has(card.oracle_id)) return ix.rulByOid.get(card.oracle_id);
    return nameKey && ix.byName.has(nameKey) ? [] : undefined;
  }
  if (!nameKey) return undefined;
  const c = ix.byName.get(nameKey);
  if (!c) return undefined;
  if (c.o && ix.rulByOid.has(c.o)) return ix.rulByOid.get(c.o);
  return [];
}

async function bulkRulingsFor(card) {
  const ix = await bulkIndexReady();
  return _bulkRulingsDecide(ix, card);
}

/* A candidate's own tags, synchronously, from the already-loaded index —
   complete local tag scoring instead of depending on which pools happened
   to be fetched. Null when the tags file (or index) isn't there. */
function localTagSetSync(cardish) {
  if (!cardish) return null;
  if (cardish._ltg !== undefined) return cardish._ltg;
  const ix = _bulkIdx;
  if (!ix || !ix.tagByOid) {
    return (cardish._ltg = null);
  }
  let oid = cardish.oracle_id || cardish.o || null;
  if (!oid && (cardish.name || cardish.n)) {
    const c = ix.byName.get(String(cardish.name || cardish.n).toLowerCase());
    if (c) oid = c.o || null;
  }
  if (!oid) return (cardish._ltg = null);
  const g = ix.tagByOid.get(oid);
  return (cardish._ltg = g && g.length ? new Set(g) : new Set());
}

/* Tri-state like rulings: an array is an authoritative local answer (the
   card's app-relevant tags, possibly none); undefined means the tags file
   isn't synced or the card is newer than it — probe the live API then. */
function _localTagsDecide(ix, card) {
  if (!ix || !ix.tagByOid || !card) return undefined;
  let oid = card.oracle_id || null;
  const nameKey = card.name ? String(card.name).toLowerCase() : null;
  if (!oid && nameKey) {
    const c = ix.byName.get(nameKey);
    if (!c) return undefined;
    oid = c.o || null;
  }
  if (!oid) return undefined;
  if (card.oracle_id && !(nameKey && ix.byName.has(nameKey)) && !ix.tagByOid.has(oid))
    return undefined;
  return ix.tagByOid.get(oid) || [];
}

window.addEventListener('load', () => {
  setTimeout(bulkSyncCheck, 5000);
});
