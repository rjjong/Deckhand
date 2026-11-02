// services / query-cache

// session cache — repeating a search is instant

/* ---------- Persistent query cache ----------
   Deck-building is iterative: people circle the same themes and searches for
   days while an idea takes shape. Results are therefore also kept in
   IndexedDB for 24 hours, so reopening the app and re-running yesterday's
   search paints instantly from disk, then behaves exactly like the live
   result. Anything can fail here without consequence — every operation
   degrades silently to a normal network search. */
const QCACHE_TTL = 24 * 3600 * 1000;

const _qRevalidating = new Set();

let _qdb = null;

function qdbOpen() {
  if (_qdb) return _qdb;
  _qdb = new Promise((res) => {
    try {
      const req = indexedDB.open('admiral-qcache', 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore('q');
        } catch (e) {}
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch (e) {
      res(null);
    }
  });
  return _qdb;
}

async function qdbGet(key) {
  try {
    const db = await qdbOpen();
    if (!db) return null;
    const rec = await new Promise((res) => {
      const rq = db.transaction('q').objectStore('q').get(key);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
    // Self-heal: some earlier writers passed an already-wrapped {t,v} into
    // qdbSet (which wraps again), leaving {t,v:{t,v:data}} on disk. Reading
    // that served the wrapper instead of the data — the "works once, then
    // never again" EDHREC bug. Unwrap here and rewrite the record properly.
    if (
      rec &&
      rec.v &&
      typeof rec.v === 'object' &&
      !Array.isArray(rec.v) &&
      typeof rec.v.t === 'number' &&
      'v' in rec.v &&
      Object.keys(rec.v).length === 2
    ) {
      const fixed = { t: rec.v.t, v: rec.v.v };
      try {
        db.transaction('q', 'readwrite').objectStore('q').put(fixed, key);
      } catch (e) {}
      return fixed;
    }
    return rec;
  } catch (e) {
    return null;
  }
}

function qdbSet(key, value) {
  qdbOpen()
    .then((db) => {
      if (!db) return;
      try {
        db.transaction('q', 'readwrite').objectStore('q').put({ t: Date.now(), v: value }, key);
      } catch (e) {}
    })
    .catch(() => {});
}

/* One cursor pass over a key prefix: everything under it in a single
   IndexedDB transaction, for bulk cache hydration. */
async function qdbGetPrefix(prefix) {
  try {
    const db = await qdbOpen();
    if (!db) return {};
    return await new Promise((res) => {
      const out = {};
      try {
        const st = db.transaction('q').objectStore('q');
        const cur = st.openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) {
            res(out);
            return;
          }
          out[String(c.key)] = c.value || null;
          c.continue();
        };
        cur.onerror = () => res(out);
      } catch (e) {
        res(out);
      }
    });
  } catch (e) {
    return {};
  }
}

/* prune stale entries once per startup, in the background */
function qdbPrune() {
  qdbOpen()
    .then((db) => {
      if (!db) return;
      try {
        const st = db.transaction('q', 'readwrite').objectStore('q');
        const cur = st.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          if (!c.value || Date.now() - (c.value.t || 0) > QCACHE_TTL) c.delete();
          c.continue();
        };
      } catch (e) {}
    })
    .catch(() => {});
}

function _qcSet(k, v) {
  _queryCache.set(k, v);
  if (_queryCache.size > 60) _queryCache.delete(_queryCache.keys().next().value);
  qdbSet(k, v);
}

let _searchBusy = 0;
// live searches in flight — background work yields to these
async function searchAndVerifyLegal(baseClause, sortOrder, limit, opts) {
  limit = limit || 40;
  opts = opts || {};
  await resolveLegalSets();
  // The exact sorted pool is the cache key: any per-set choice change makes
  // its own cache lane, so mixed selections can never serve each other's data.
  const setsSig = 'all';
  // Format routing: callers that never said (name lookups, reco flows)
  // search in the format of the page in front of the player -- the open
  // deck, the recommendation, Inspiration; the Search page passes its filter.
  const fmtWanted = opts.format === undefined ? ctxFmt() : opts.format || 'any';
  const qcKey = [
    'f:' + fmtWanted,
    baseClause || '',
    sortOrder || '',
    limit,
    opts.dir || '',
    opts.restrictSet || '',
    's' + setsSig,
  ].join('|');
  if (!opts._revalidate) {
    if (_queryCache.has(qcKey)) return { results: _queryCache.get(qcKey).slice(), error: false };
    const disk = await qdbGet(qcKey);
    if (disk && Date.now() - (disk.t || 0) < SWR_SERVE && Array.isArray(disk.v)) {
      if (Date.now() - (disk.t || 0) > QCACHE_TTL && !_qRevalidating.has(qcKey)) {
        // Stale but serviceable: hand it over now, re-run the search quietly in
        // the background lane so tomorrow's visit is fresh.
        _qRevalidating.add(qcKey);
        searchAndVerifyLegal(
          baseClause,
          sortOrder,
          limit,
          Object.assign({}, opts, { _revalidate: true, bg: true }),
        )
          .catch(() => {})
          .finally(() => _qRevalidating.delete(qcKey));
      }
      _queryCache.set(qcKey, disk.v);
      return { results: disk.v.slice(), error: false };
    }
  }
  _searchBusy++;
  try {
    await resolveLegalSets();
    const orderParam =
      sortOrder === 'cmc'
        ? 'cmc'
        : sortOrder === 'eur'
          ? 'eur'
          : sortOrder === 'edhrec' || sortOrder === 'salt'
            ? 'edhrec'
            : 'name';
    const dir = opts.dir === 'desc' ? 'desc' : 'auto';
    {
      // Scryfall's own format flag IS the legality engine — one query, all
      // sets, the format's ban list included, lands welcome. 'any' asks for
      // no legality at all.
      let base = (baseClause || '').replace(/\s*-t:land/g, '');
      if (opts.restrictSet) base += ' set:' + opts.restrictSet;
      // A previewing set's cards are often still marked not_legal until
      // release day — demanding legal:commander would hide the very spoilers
      // being searched for. The format flag returns the moment it releases.
      let rsPreview = false;
      try {
        rsPreview =
          !!opts.restrictSet &&
          (currentPreviewSets() || []).some((x) => x.code === opts.restrictSet);
      } catch (e) {}
      const q =
        `${base} ${rsPreview || fmtWanted === 'any' ? '' : sfLegalClause(fmtWanted) + ' '}game:paper -is:digital -st:memorabilia -st:token -st:minigame`.trim();
      const url = `${SF_BASE}/cards/search?unique=cards&order=${orderParam}&dir=${dir}&q=${encodeURIComponent(q)}`;
      const out = [];
      let next = url,
        guard = 0;
      while (next && out.length < limit && guard < 4) {
        guard++;
        let res = null;
        try {
          res = await sfFetch(next, 0, !!opts.bg);
        } catch (e) {
          return { results: out.slice(), error: true };
        } // dead line: ANSWER, never throw
        if (!res.ok) {
          if (res.status === 404) break;
          // A caller waiting on this promise would otherwise hang forever with
          // its spinner up -- that is exactly how Inspiration got stuck.
          return { results: out.slice(), error: res.status === 400 ? 'badquery' : true };
        }
        let dd = null;
        try {
          dd = await res.json();
        } catch (e) {
          return { results: out.slice(), error: true };
        }
        (dd.data || []).forEach((c) => {
          if (out.length < limit && isRealCard(c)) out.push(c);
        });
        next = dd.has_more ? dd.next_page : null;
      }
      _queryCache.set(qcKey, out);
      qdbSet(qcKey, out);
      return { results: out.slice(), error: false };
    }
  } finally {
    _searchBusy--;
  }
}

/* Resolving names one at a time costs two requests per card, which made a
   60-card import crawl. This asks Scryfall for the printings of a whole batch
   in one query — that single response tells us the card exists, whether any
   printing is format-legal, and its cheapest price. Names that don't match
   exactly (typos, nicknames) fall back to the per-card fuzzy lookup. */
async function resolveManyByName(names, onProgress, fmt) {
  await resolveLegalSets();
  const out = new Array(names.length).fill(null);
  const byLower = {};
  names.forEach((n, i) => {
    const k = n.trim().toLowerCase();
    if (!byLower[k]) byLower[k] = [];
    byLower[k].push(i);
  });
  const uniqueNames = Object.keys(byLower);
  let done = 0;
  const bump = (n) => {
    done += n;
    if (onProgress) onProgress(Math.min(done, names.length), names.length);
  };

  const unmatched = [];
  // Resolves from a single printing (legality and price ride on the card
  // itself), skipping the all-printings pagination — basics alone have
  // hundreds of prints and were the bulk of long import waits. Only an

  const batches = chunkArr(uniqueNames, 20);
  await runLimited(
    batches,
    async (chunk) => {
      const q =
        '(' + chunk.map((n) => exactNameClause(n)).join(' or ') + ') game:paper -is:digital';
      let url = `${SF_BASE}/cards/search?unique=cards&q=${encodeURIComponent(q)}`;
      const hits = {}; // lowercased name -> { card, legal, minEur }
      for (let page = 0; page < 2 && url; page++) {
        try {
          const res = await sfFetch(url);
          if (!res.ok) {
            if (res.status === 404) break;
            throw new Error('status ' + res.status);
          }
          const data = await res.json();
          (data.data || []).forEach((p) => {
            let key = (p.name || '').toLowerCase();
            if (!byLower[key]) {
              // Double-faced and adventure cards: decklists carry the front
              // face's name while Scryfall answers "Front // Back" — match on
              // the front so these stop falling into the slow one-by-one lane.
              const cut = key.indexOf(' // ');
              const front = cut > 0 ? key.slice(0, cut) : null;
              if (front && byLower[front]) key = front;
              else return;
            }
            if (!hits[key]) hits[key] = { card: p, legal: false, minEur: null };
            const h = hits[key];
            h.legal =
              (fmt && fmt !== 'commander') ||
              isPreviewCard(p) ||
              !!(p.legalities && p.legalities.commander && p.legalities.commander !== 'not_legal');
            const raw = p.prices && p.prices.eur;
            if (raw) {
              const e = parseFloat(raw);
              if (!isNaN(e) && (h.minEur === null || e < h.minEur)) h.minEur = e;
            }
          });
          url = data.has_more ? data.next_page : null;
        } catch (e) {
          console.error('batch resolve failed', e);
          break;
        }
      }
      chunk.forEach((k) => {
        const hit = hits[k];
        if (hit) {
          state.priceCache[hit.card.name] = { v: hit.minEur, t: Date.now() };
          notePrice(hit.card.name, hit.minEur);
          byLower[k].forEach((i) => {
            out[i] = { input: names[i], found: true, card: hit.card, legalPrint: hit.legal };
          });
          bump(byLower[k].length);
        } else {
          unmatched.push(k); // exact match missed, or the batch errored — retry individually
        }
      });
    },
    2,
  );
  savePriceCache();

  // Fuzzy fallback catches typos and anything the exact batch couldn't resolve
  if (unmatched.length) {
    await runLimited(
      unmatched,
      async (k) => {
        const first = byLower[k][0];
        const r = await resolveCardByName(names[first], fmt);
        byLower[k].forEach((i) => {
          out[i] = r
            ? Object.assign({}, r, { input: names[i] })
            : { input: names[i], found: false };
        });
        bump(byLower[k].length);
      },
      3,
    );
  }
  return out;
}

async function resolveCardByName(rawName, fmt) {
  const name = stripDeckLineDecorations(rawName).trim();
  if (!name) return null;
  try {
    const res = await sfFetch(SF_BASE + '/cards/named?fuzzy=' + encodeURIComponent(name));
    if (!res.ok)
      return {
        input: rawName,
        found: false,
        ...(res.status === 404 ? {} : { networkIssue: true }),
      };
    const card = await res.json();
    const legal =
      (fmt && fmt !== 'commander') ||
      isPreviewCard(card) ||
      !!(card.legalities && card.legalities.commander && card.legalities.commander !== 'not_legal');
    return { input: rawName, found: true, card, legalPrint: legal, verifyFailed: false };
  } catch (e) {
    return { input: rawName, found: false, networkIssue: true };
  }
}

function idClauseFor(admiral) {
  const ci = (admiral.color_identity || []).map((c) => c.toLowerCase());
  if (!ci.length) return 'id=c';
  return 'id<=' + ci.join('');
}

/* 1.9: "in the colours of <deck>" -- under a card's Recommendations and
   Similar cards when they were opened from that deck's card sheet */
function deckColorNoteHtml(d) {
  if (!d || !deckLeaders(d).length) return '';
  const ci = deckColorIdentity(d);
  const pips = ci.length ? manaRowSvg(ci.join('').toLowerCase(), 14) : manaIconSvg('C', 14);
  const NL = appLang() === 'nl';
  return /* HTML */ `<div
    class="ra-sub deck-ci-note"
    style="font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:6px;"
  >
    ${pips}<span
      >${NL ? 'binnen de kleuren van' : 'within the colours of'} ${escapeHtml(d.name || '')}</span
    >
  </div>`;
}

function idClauseForDeck(d) {
  return idClauseFor({ color_identity: deckColorIdentity(d) });
}
