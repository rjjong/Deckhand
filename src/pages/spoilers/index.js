// pages / spoilers / index

/* ---------- Spoilers page: every unreleased set with previews on Scryfall,
   shown as image grids — a normal app page with the standard top bar. ---------- */

function openAppointSearch(d, onPick) {
  document.getElementById('appointOverlay')?.remove();
  const label = fmtName(d);
  const glyph = fmtFolderGlyph(deckFormat(d), 15);
  const el = document.createElement('div');
  el.id = 'appointOverlay';
  el.innerHTML = /* HTML */ ` <div class="appoint-sheet">
    <div class="appoint-head">
      <span>${glyph} Appoint a ${escapeHtml(label)}</span
      ><button class="icon-btn" id="appointClose" style="flex:none;">${ICONS.close || '✕'}</button>
    </div>
    <div class="searchbar" style="margin:0 0 10px;">
      <input
        id="appointInput"
        placeholder="Search eligible ${escapeHtml(label)}s…"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
      />
    </div>
    <div id="appointResults" class="appoint-results">
      <div class="empty-note" style="padding:14px 4px;">
        Start typing to find a ${escapeHtml(label)}.
      </div>
    </div>
  </div>`;
  document.body.appendChild(el);
  pushOverlay('appoint', () => {
    document.getElementById('appointOverlay')?.remove();
  });
  // Tap outside the sheet closes; taps inside don't bubble out to close.
  el.addEventListener('click', (e) => {
    if (!e.target.closest('.appoint-sheet')) closeTopOverlay();
  });
  document.getElementById('appointClose').addEventListener('click', () => closeTopOverlay());
  const input = document.getElementById('appointInput');
  setTimeout(() => {
    try {
      input.focus();
    } catch (e) {}
  }, 40); // pop the keyboard
  let seq = 0,
    deb = null;
  const run = async () => {
    const q = input.value.trim();
    const mySeq = ++seq;
    const box = () => document.getElementById('appointResults');
    if (q.length < 2) {
      if (box())
        box().innerHTML = /* HTML */ `<div class="empty-note" style="padding:14px 4px;">
          Start typing to find a ${escapeHtml(label)}.
        </div>`;
      return;
    }
    if (box()) box().innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
    // Who may lead is the deck's format's call: a legendary creature in the
    // commander family, an uncommon creature in Pauper Commander, a

    const fmt = deckFormat(d);
    const clause = leaderSearchClause(fmt) + ' ' + q;
    let results = [];
    try {
      const r = await searchAndVerifyLegal(clause, 'name', 40, { format: leaderSearchFmt(fmt) });
      results = r.results || [];
    } catch (e) {}
    if (mySeq !== seq) return; // superseded by a newer keystroke
    results = results.filter((c) => leaderFitsFormat(c, fmt) && !isBanned(c, d));
    if (!box()) return;
    if (!results.length) {
      box().innerHTML = /* HTML */ `<div class="empty-note" style="padding:14px 4px;">
        No eligible ${escapeHtml(label)} matches “${escapeHtml(q)}”.
      </div>`;
      return;
    }
    box().innerHTML = results
      .slice(0, 30)
      .map(
        (c, i) => `
      <button class="appoint-row" data-idx="${i}">
        <img loading="lazy" class="${wbClass(c)}" src="${cardImageMed(c) || cardImage(c)}" alt="">
        <div class="appoint-row-txt"><div class="ar-name">${escapeHtml(c.name)}</div><div class="ar-type">${escapeHtml(frontFace(c).type_line || '')}</div></div>
        <span class="ar-set">Set as ${escapeHtml(label)} ▸</span>
      </button>`,
      )
      .join('');
    box()
      .querySelectorAll('.appoint-row')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = results[+btn.dataset.idx];
          if (!c) return;
          if (onPick) {
            closeOverlayThen(() => onPick(c));
            return;
          }
          promoteToCommander(d, c);
          scheduleSave(d);
          closeTopOverlay();
          toast(`${c.name} appointed ${label} of ${d.name}.`);
          render();
        });
      });
  };
  input.addEventListener('input', () => {
    clearTimeout(deb);
    deb = setTimeout(run, 260);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(deb);
      run();
    }
  });
}

function currentPreviewSets() {
  const today = new Date().toISOString().slice(0, 10);
  // Every upcoming paper set, straight from the live Scryfall catalogue,
  // so the page is never behind.
  const rawByCode = new Map((state.allSetsRaw || []).map((s) => [s.code, s]));
  const SKIP_TYPES = NO_CARDS_SET_TYPES;
  const map = new Map();
  Object.entries(autoSets.previewMeta || {}).forEach(([c, dte]) => {
    if (SKIP_TYPES.has((rawByCode.get(c) || {}).set_type)) return; // token sets carry no spoilers of their own
    if (dte > today) map.set(c, { code: c, name: autoSets.names[c] || c.toUpperCase(), date: dte });
  });
  (state.allSetsRaw || []).forEach((x) => {
    if (x.digital || !x.released_at || x.released_at <= today || map.has(x.code)) return;
    if (SKIP_TYPES.has(x.set_type)) return;
    map.set(x.code, { code: x.code, name: x.name, date: x.released_at });
  });
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 24);
}

async function fetchWholeSet(code, fresh) {
  // Spoiler season moves hourly: cached previews go stale after 3 hours on
  // their own, every fetch bypasses the browser's HTTP cache, and cards come
  // NEWEST-FIRST (order=spoiled) — the same ordering as Scryfall's preview
  // page, so the latest reveal sits at the top instead of buried by number.
  state._spoilerCache = state._spoilerCache || {};
  const hit = state._spoilerCache[code];
  const MAXAGE = 3 * 3600 * 1000;
  if (!fresh && hit && Array.isArray(hit.cards) && Date.now() - hit.t < MAXAGE) return hit.cards;
  const out = [];
  // No game:paper here — preview cards often carry empty game flags until
  // release, and that filter was silently hiding entire spoiler seasons.
  let url = `${SF_BASE}/cards/search?unique=cards&order=spoiled&q=${encodeURIComponent('set:' + code)}`;
  for (let i = 0; i < 3 && url; i++) {
    try {
      const r = await sfFetch(url, 0, false, true);
      if (!r.ok) break;
      const d = await r.json();
      // Spoilers mean NEW cards: Scryfall marks anything with an earlier
      // printing as a reprint - those don't belong in the feed.
      (d.data || []).forEach((c) => {
        if (!c.reprint) out.push(c);
      });
      url = d.has_more ? d.next_page : null;
    } catch (e) {
      break;
    } // keep whatever pages arrived
  }
  if (!out.length && hit && Array.isArray(hit.cards)) return hit.cards; // network hiccup: keep showing what we had
  state._spoilerCache[code] = { t: Date.now(), cards: out };
  return out;
}

/* The spoiler advanced filter: the collection filter's exact semantics,
   applied to raw Scryfall card objects -- the FRONT FACE decides the type
   line and colors, same as the color buckets. No price row: preview cards
   have no market yet. */
function spFilterMatch(c) {
  const f = state.spFilter || {};
  if (
    f.q &&
    !String(c.name || '')
      .toLowerCase()
      .includes(f.q.toLowerCase())
  )
    return false;
  const face = frontFace(c);
  if (f.type) {
    // Same semantics as the Search page's Card Type box: every word must
    // appear in the type line, commas and spaces both separate words.
    const tl = String(face.type_line || c.type_line || '').toLowerCase();
    const wants = f.type
      .toLowerCase()
      .replace(/"/g, '')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (wants.length && !wants.every((w) => tl.includes(w))) return false;
  }
  const rsel = Object.keys(f.rarity || {}).filter((k) => f.rarity[k]);
  if (rsel.length && !rsel.includes(c.rarity)) return false;
  const csel = Object.keys(f.colors || {}).filter((k) => k !== 'C' && f.colors[k]);
  const wantC = !!(f.colors || {}).C;
  if (csel.length || wantC) {
    const cs = face.colors || c.colors || [];
    if (wantC && !csel.length) {
      if (cs.length) return false;
    } // C alone = colorless only
    else if (f.colorMode === 'exact') {
      if (!(cs.length === csel.length && csel.every((x) => cs.includes(x)))) return false;
    } else if (f.colorMode === 'atmost') {
      if (!cs.every((x) => csel.includes(x))) return false;
    } else {
      if (!csel.every((x) => cs.includes(x))) return false;
    } // 'all' -- must have all selected
  }
  return true;
}

function spFilterActive() {
  const f = state.spFilter || {};
  return !!(
    f.q ||
    f.type ||
    Object.values(f.colors || {}).some(Boolean) ||
    Object.values(f.rarity || {}).some(Boolean)
  );
}

function resetSpoilerFilters() {
  state.spoilerSetFilter = null;
  state.spFilter = {
    q: '',
    type: '',
    colors: { W: false, U: false, B: false, R: false, G: false, C: false },
    colorMode: 'all',
    rarity: { common: false, uncommon: false, rare: false, mythic: false },
  };
}

/* True while the page still has to fetch the fresh set list. Until then
   "no sets are previewing" would be a guess, not a fact -- opening the page
   from a push showed exactly that wrong message for a moment. */
function spSetsPending() {
  return (
    !!state._spSetsLoading ||
    !state._spoilerAutoFresh ||
    Date.now() - state._spoilerAutoFresh > 3 * 3600 * 1000
  );
}

function spoilersPageHtml() {
  const sets = currentPreviewSets();
  const active =
    state.spoilerSetFilter && sets.some((x) => x.code === state.spoilerSetFilter)
      ? state.spoilerSetFilter
      : null;
  // A row of square set-symbol buttons at the very top. Each is a FILTER:
  // tapping one shows only that set's spoilers (colour-sorted); tapping it
  // again returns to the all-sets feed, newest spoilers first.
  const jumpRow = sets.length
    ? `<div class="sp-jump">${sets
        .map(
          (x) => `
      <button class="sp-jump-btn ${active === x.code ? 'active' : ''}" data-spjump="${x.code}" title="${escapeHtml(x.name)}">${setIcoHtml(x.code, 'rare')}<span class="sp-jump-code">${escapeHtml((x.code || '').toUpperCase())}</span></button>
    `,
        )
        .join('')}</div>`
    : '';
  return /* HTML */ `<main id="spMainPage">
    ${jumpRow}
    ${
      sets.length
        ? `<div id="spBody"><div class="status"><div class="spinner"></div></div></div>`
        : spSetsPending()
          ? `<div class="status" style="margin-top:24px;"><div class="spinner"></div></div>`
          : `<div class="empty-note" style="margin-top:24px;">No sets are previewing right now.<br>Spoiler season returns in the weeks before each release.</div>`
    }
    <div id="spAdvSlot">${state.spAdvOpen ? advancedSearchScreenHtml() : ''}</div>
  </main>`;
}

function spoilerAdvancedPanelHtml() {
  const sets = currentPreviewSets();
  const active = state.spoilerSetFilter;
  const sf = state.spFilter;
  const setOpts = [{ v: '', l: 'All sets' }].concat(
    sets.map((x) => ({ v: x.code, l: x.name, icons: setIconHtml(x.code) })),
  );
  const colorOrder = ['W', 'U', 'B', 'R', 'G', 'C'];
  return /* HTML */ `<div class="adv-panel" id="spAdvBox">
    <div class="adv-row">
      <label>Name</label
      ><input
        id="spFq"
        class="col-filter-input"
        placeholder="Card name…"
        value="${escapeHtml(sf.q)}"
      />
    </div>
    <div class="adv-row">
      <label>Set</label>${cselectHtml('spSet', setOpts, active || '', 'All sets')}
    </div>
    <div class="adv-row">
      <label>Type</label
      ><input
        id="spTypeText"
        class="col-filter-input"
        placeholder="e.g. Dragon, Equipment"
        value="${escapeHtml(sf.type)}"
      />
    </div>
    <div class="adv-row">
      <label>Colors</label>
      <div class="color-check-row">
        ${colorOrder.map((c) => `<label class="ccheck"><input type="checkbox" data-spcolor="${c}" ${sf.colors[c] ? 'checked' : ''}><span class="mana-check">${manaIconSvg(c, 26)}</span></label>`).join('')}
      </div>
      <div class="adv-sub" style="max-width:220px;">
        ${cselectHtml(
          'spCM',
          [
            { v: 'all', l: 'Must have all selected' },
            { v: 'exact', l: 'Exactly these colors' },
            { v: 'atmost', l: 'At most these colors' },
          ],
          sf.colorMode,
          'Match mode',
        )}
      </div>
    </div>
    <div class="adv-row">
      <label>Rarity</label>
      <div class="rarity-row">
        ${[
          ['common', 'Common'],
          ['uncommon', 'Uncommon'],
          ['rare', 'Rare'],
          ['mythic', 'Mythic'],
        ]
          .map(
            ([v, l]) =>
              `<label class="rcheck"><input type="checkbox" data-sprarity="${v}" ${sf.rarity[v] ? 'checked' : ''}><span class="rpill r-${v}">${l}</span></label>`,
          )
          .join('')}
      </div>
    </div>
  </div>`;
}

/* Colour bucket for the single-set view: W, U, B, R, G, colourless,
   multicolour, lands — front face decides. */
function spoilerColorBucket(c) {
  const f = frontFace(c);
  if (/\bLand\b/.test(f.type_line || '')) return 7;
  const cols = f.colors || c.colors || [];
  if (cols.length === 0) return 5;
  if (cols.length > 1) return 6;
  return { W: 0, U: 1, B: 2, R: 3, G: 4 }[cols[0]] ?? 5;
}

/* The phone's spoiler push counts only cards you have NOT seen in the app:
   every card this page shows is reported to the app shell once (APK 4.0+). */
const _spReported = new Set();

function reportSpoilersSeen(cards) {
  try {
    if (!(window.DeckhandNotify && typeof DeckhandNotify.markSpoilersSeen === 'function')) return;
    const keys = [];
    (cards || []).forEach((c) => {
      if (!c || !c.id || !c.set) return;
      const k = String(c.set).toLowerCase() + ':' + c.id;
      if (!_spReported.has(k)) {
        _spReported.add(k);
        keys.push(k);
      }
    });
    if (keys.length) DeckhandNotify.markSpoilersSeen(keys.join(','));
  } catch (e) {}
}

function spoilerDateKey(c) {
  // Only a real preview date counts as a spoiler date. released_at is NOT a
  // substitute: for unreleased sets it lies in the future, so undated bulk
  // loads (reprint dumps, tokens) would hijack the top of the feed.
  return (c.preview && c.preview.previewed_at) || '';
}

const SPOILER_SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series']);

function spoilerPlayable(c) {
  return !SPOILER_SKIP_LAYOUTS.has(c.layout);
}

function renderSpoilerBody(loaded, failed) {
  // Remember the latest streamed data: the advanced filter repaints from
  // here without restarting the whole page render.
  state._spLoaded = loaded;
  state._spFailed = failed;
  // Full repaints land while sets stream in. Rather than guessing how much
  // grew ABOVE the view, we hold on to a real card: the first tile in sight
  // keeps its exact place on screen across the rebuild. Name plus set
  // survives the rebuild, so the same tile can be found again.
  const _box0 = document.getElementById('spBody');
  let _anker = null,
    _voor = 0;
  // Keep the first visible card in place as more previews arrive.
  try {
    const viewport = _box0?.closest('.tab-viewport')?.getBoundingClientRect();
    for (const t of _box0 ? _box0.querySelectorAll('.sc-tile') : []) {
      const r = t.getBoundingClientRect();
      if (
        r.height > 0 &&
        r.bottom > (viewport?.top || 0) &&
        r.top < (viewport?.bottom || window.innerHeight)
      ) {
        _anker = (t.dataset.spn || '') + '\u0000' + (t.dataset.spset || '');
        _voor = r.top;
        break;
      }
    }
  } catch (e) {}
  try {
    return _renderSpoilerBodyCore(loaded, failed);
  } finally {
    if (_anker) {
      try {
        const b2 = document.getElementById('spBody');
        let weer = null;
        for (const t of b2 ? b2.querySelectorAll('.sc-tile') : []) {
          if ((t.dataset.spn || '') + '\u0000' + (t.dataset.spset || '') === _anker) {
            weer = t;
            break;
          }
        }
        if (weer) {
          const sc = scrollParentOf(weer) || pageScroller();
          const schuif = weer.getBoundingClientRect().top - _voor;
          if (Math.abs(schuif) > 0.5) sc.scrollTop += schuif;
        }
      } catch (e) {}
    }
  }
}

function _renderSpoilerBodyCore(loaded, failed) {
  const box = document.getElementById('spBody');
  if (!box) return;
  const sets = currentPreviewSets();
  const fmtDate = (d) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return d;
    }
  };
  const active =
    state.spoilerSetFilter && sets.some((x) => x.code === state.spoilerSetFilter)
      ? state.spoilerSetFilter
      : null;
  const tile = (c) =>
    `<div class="sc-tile" role="button" tabindex="0" data-spn="${escapeHtml(c.name)}" data-spset="${escapeHtml(c.set || '')}"><img loading="lazy" class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}">${cardBadgesHtml(c)}</div>`;
  let cards = [],
    headHtml = '',
    footHtml = '',
    feedGroups = null;
  if (active) {
    const x = sets.find((s) => s.code === active);
    const got = loaded[active];
    if (got === undefined && !failed.has(active)) {
      box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
      return;
    }
    const rawSet = (state.allSetsRaw || []).find((s) => s.code === active) || {};
    const playables = (got || []).filter(spoilerPlayable);
    const gotN = playables.length;
    // The honest denominator: Scryfall's printed_size is the set's announced
    // collector-number count (233 for The Hobbit). card_count is NOT it —
    // for preview sets that just equals what's spoiled. When printed_size
    // isn't known yet, the highest collector number seen is the best floor.
    const maxCN = playables.reduce((m, c) => {
      const n = parseInt(String(c.collector_number || '').replace(/\D/g, ''), 10);
      return !isNaN(n) && n > m ? n : m;
    }, 0);
    // Take the larger of Scryfall's announced size and the highest collector
    // number seen: printed_size can lag during preview season (HOB reported
    // its spoiled count), and a #206 in hand proves the set runs past 193.
    // The weekly sets catalog lags further still — so ask Scryfall's LIVE
    // set record once per session and repaint when it lands: printed_size
    // is the announced collector count, filled in as the season matures.
    state._setInfo = state._setInfo || {};
    const liveInfo = state._setInfo[active];
    if (!liveInfo && !(state._setInfoBusy && state._setInfoBusy[active])) {
      (state._setInfoBusy = state._setInfoBusy || {})[active] = true;
      (async () => {
        try {
          const res = await sfFetch(
            SF_BASE + '/sets/' + encodeURIComponent(active),
            0,
            false,
            false,
            true,
          );
          const j = await res.json();
          state._setInfo[active] = {
            printed_size: j.printed_size || 0,
            card_count: j.card_count || 0,
          };
        } catch (e) {
          state._setInfo[active] = { printed_size: 0, card_count: 0 };
        }
        if (state.screen === 'spoilers' && state.spoilerSetFilter === active) {
          try {
            renderSpoilerBody(loaded, failed);
          } catch (err) {}
        }
      })();
    }
    const setTotal = Math.max(
      rawSet.printed_size || 0,
      (liveInfo && liveInfo.printed_size) || 0,
      maxCN,
    );
    headHtml =
      `<div class="chip-label" style="margin:10px 0 4px;">${escapeHtml(x.name)} <span style="float:right;color:var(--sub-text-2);text-transform:none;font-weight:500;">releases ${fmtDate(x.date)}</span></div>` +
      (gotN
        ? `<p class="hint" style="margin:0 0 6px;">${
            setTotal > 0 && gotN >= setTotal
              ? `${gotN}/${setTotal} cards previewed — the whole set is out.`
              : setTotal > 0
                ? `${gotN}/${setTotal} cards previewed so far.`
                : `${gotN} cards previewed so far.`
          }</p>`
        : '');
    if (failed.has(active)) {
      box.innerHTML =
        headHtml +
        '<p class="hint">Couldn\'t reach the archive for this set — reopen this page to retry.</p>';
      return;
    }
    // Colour-sorted set view; collector number orders within each colour.
    const cn = (c) => {
      const n = parseInt(String(c.collector_number || '').replace(/\D/g, ''), 10);
      return isNaN(n) ? 1e9 : n;
    };
    cards = got
      .filter(spoilerPlayable)
      .filter(spFilterMatch)
      .sort((a, b) => spoilerColorBucket(a) - spoilerColorBucket(b) || cn(a) - cn(b));
    // The preview count already lives in headHtml, which now renders at the
    // FOOT of the set view — no separate footer copy needed.
  } else {
    // All sets, one feed, newest spoilers first. Scryfall often stops
    // filling previewed_at partway through a season; the old fix filed
    // undated top-of-feed cards under "today" — a MOVING target, so the
    // same cards re-labelled themselves with each new day (the "always the
    // current date" bug). The truth is pinned instead: the day this app
    // FIRST SAW a card is recorded once in a small registry and never
    // changes — the closest client-side stand-in for its real reveal date.
    // Cards with a genuine previewed_at always use that.
    const withKeys = [];
    const todayKey = new Date().toISOString().slice(0, 10);
    let seen = {};
    try {
      seen = JSON.parse(localStorage.getItem(LS_PREFIX + 'spoilerSeen') || '{}') || {};
    } catch (e) {
      seen = {};
    }
    let seenDirty = false;
    const liveIds = new Set();
    sets.forEach((x, si) => {
      const cs = (loaded[x.code] || []).filter(spoilerPlayable).filter(spFilterMatch);
      cs.forEach((c, ci) => {
        const own = spoilerDateKey(c);
        if (c.id) liveIds.add(c.id);
        if (!own && c.id && !seen[c.id]) {
          seen[c.id] = todayKey;
          seenDirty = true;
        }
        withKeys.push({ c, k: own || (c.id && seen[c.id]) || todayKey, si, ci });
      });
    });
    withKeys.sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : 0) || a.si - b.si || a.ci - b.ci);
    cards = withKeys.map((w) => w.c);
    // Shelves are per SET per day now: The Hobbit and Star Trek both
    // spoiling on the 5th get their own dividers, each named and dated.
    feedGroups = [];
    withKeys.forEach((w) => {
      const gk = (w.k || '') + '|' + (w.c.set || '');
      if (!feedGroups.length || feedGroups[feedGroups.length - 1].gk !== gk)
        feedGroups.push({ gk, k: w.k, set: w.c.set, cs: [] });
      feedGroups[feedGroups.length - 1].cs.push(w.c);
    });
    const pending = sets.filter((x) => loaded[x.code] === undefined && !failed.has(x.code)).length;
    // Housekeep the registry only once EVERYTHING is loaded — pruning
    // against a half-loaded feed would drop pins for late sets and re-mint
    // them "today", the very drift this registry exists to stop.
    if (!pending && !failed.size) {
      Object.keys(seen).forEach((id) => {
        if (!liveIds.has(id)) {
          delete seen[id];
          seenDirty = true;
        }
      });
    }
    if (seenDirty) {
      try {
        localStorage.setItem(LS_PREFIX + 'spoilerSeen', JSON.stringify(seen));
      } catch (e) {}
    }
    footHtml =
      (pending
        ? `<div class="status" style="margin:8px 0;"><div class="spinner"></div>More sets unfurling…</div>`
        : '') +
      (failed.size
        ? `<p class="hint" style="margin:6px 0 2px;">Couldn't reach ${failed.size} set${failed.size === 1 ? '' : 's'} — reopen this page to retry.</p>`
        : '');
    if (!cards.length && !pending) {
      box.innerHTML =
        '<p class="hint">' +
        (spFilterActive()
          ? 'Nothing matches these filters.'
          : 'Nothing spoiled yet — check back soon.') +
        '</p>';
      return;
    }
    if (!cards.length) {
      box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
      return;
    }
  }
  if (active && !cards.length) {
    box.innerHTML =
      headHtml +
      '<p class="hint">' +
      (spFilterActive()
        ? 'Nothing matches these filters.'
        : 'Nothing spoiled yet — check back soon.') +
      '</p>';
    return;
  }
  const fmtDayHead = (d) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      return d;
    }
  };
  const setNameOf = (code) => {
    const x = sets.find((s) => s.code === code);
    return x ? x.name : String(code || '').toUpperCase();
  };
  const gridHtml = feedGroups
    ? `<div class="sp-feed">${feedGroups.map((g) => `<div class="sp-group"><div class="chip-label sp-shelf" style="margin:6px 0 12px;">${g.set ? `<span class="sp-shelf-ico">${setIcoHtml(g.set, 'rare')}</span>${escapeHtml(setNameOf(g.set))} — ` : ''}${g.k ? fmtDayHead(g.k) : trS('Date to be announced')}</div><div class="sc-grid">${g.cs.map(tile).join('')}</div></div>`).join('')}${footHtml}</div>`
    : `<div class="sc-grid">${cards.map(tile).join('')}</div>`;
  // Set view: the shelf (set name, release date, preview count) sits at the
  // FOOT, under the cards — release dates live at the bottom everywhere now.
  box.innerHTML = active ? gridHtml + headHtml : headHtml + gridHtml;
  reportSpoilersSeen(cards);
  // 1.19: long-press selects (gold tick), like Search and Inspiration; with a
  // selection, a tap adds or removes; the gold button adds them all.
  state.spSel = state.spSel || new Map();
  const cardOf = (b) =>
    cards.find((c) => c.name === b.dataset.spn && (c.set || '') === b.dataset.spset) ||
    cards.find((c) => c.name === b.dataset.spn);
  box.querySelectorAll('.sc-tile').forEach((b) => {
    if (!b.querySelector('.sel-check')) {
      const m = document.createElement('span');
      m.className = 'sel-check';
      m.textContent = '\u2713';
      b.appendChild(m);
    }
    b.classList.toggle('selected', state.spSel.has(b.dataset.spn));
    let lpT = null,
      fired = false;
    const toggle = () => {
      const c = cardOf(b);
      if (!c) return;
      if (state.spSel.has(c.name)) state.spSel.delete(c.name);
      else state.spSel.set(c.name, c);
      box.querySelectorAll('.sc-tile').forEach((t) => {
        if (t.dataset.spn === c.name) t.classList.toggle('selected', state.spSel.has(c.name));
      });
      paintSpPickFab();
    };
    b.addEventListener('pointerdown', () => {
      fired = false;
      clearTimeout(lpT);
      lpT = setTimeout(() => {
        fired = true;
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (err) {}
        toggle();
      }, 480);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      b.addEventListener(ev, () => clearTimeout(lpT)),
    );
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (fired) {
        fired = false;
        return;
      }
      if (state.spSel.size) {
        toggle();
        return;
      }
      const card = cardOf(b);
      if (card) openCardInfo(card, { pool: cards });
    });
  });
  paintSpPickFab();
}

/* The Spoilers page's gold selection button: the count, and on a tap the
   same menu as elsewhere (Add to deck, Add to collection, Deselect all).
   position:fixed, so where it sits in the DOM does not move it; it stands
   above the fixed Advanced-filter bar. */
function paintSpPickFab() {
  const host = document.getElementById('spMainPage');
  if (!host) return;
  let f = document.getElementById('spPickFab');
  if (!f) {
    f = document.createElement('button');
    f.type = 'button';
    f.id = 'spPickFab';
    f.className = 'reco-fab ov-pick-fab';
    f.hidden = true;
    f.setAttribute('aria-label', trS('Add to\u2026'));
    host.appendChild(f);
    f.addEventListener('click', (e) => {
      e.stopPropagation();
      const picked = Array.from((state.spSel || new Map()).values());
      if (!picked.length) return;
      openTileMenu(f, [
        { label: '\u2715 ' + trS('Deselect all'), fn: () => spSelClear() },
        {
          label: mIco('binder') + trS('Add to collection\u2026'),
          fn: () => openAddManyToCollection(picked, () => spSelClear()),
        },
        {
          label: '\uFF0B ' + trS('Add to deck\u2026'),
          fn: () => openMultiDeckChooser(picked, () => spSelClear()),
        },
      ]);
    });
  }
  const n = state.spSel ? state.spSel.size : 0;
  f.hidden = !n;
  f.innerHTML = selFabLabel(n);
}

function spSelClear() {
  if (state.spSel) state.spSel.clear();
  document
    .querySelectorAll('#spMainPage .sc-tile.selected')
    .forEach((t) => t.classList.remove('selected'));
  paintSpPickFab();
}

async function wireSpoilersPage() {
  document
    .getElementById('spAdvToggle')
    ?.addEventListener('click', () => openAdvancedSearch('spoilers'));
  if (state.spAdvOpen) wireAdvancedPanel();
  // First visit of the session: force a fresh pull so the page is never behind
  // Scryfall, without the user having to remember the refresh button.
  if (!state._spoilerAutoFresh || Date.now() - state._spoilerAutoFresh > 3 * 3600 * 1000) {
    state._spoilerAutoFresh = Date.now();
    state._spoilerCache = {};
    state._spSetsLoading = true;
    (async () => {
      try {
        await resolveLegalSets(true);
      } catch (e) {} // fresh /sets → allSetsRaw (Commander sees every new set)
      state._spSetsLoading = false; // the set list is what the page needs; draw it now
      if (state.screen === 'spoilers') render();
      try {
        await checkForNewSets(true);
      } catch (e) {} // refresh curated previewMeta (Commander's Standard list)
      if (state.screen === 'spoilers') render();
    })();
  }
  // Set-symbol buttons filter to one set (colour-sorted); tapping the active
  // one again clears back to the all-sets, newest-first feed.
  document.querySelectorAll('[data-spjump]').forEach((b) => {
    // Long-press names the set (a brief toast) without activating the filter;
    // a normal tap toggles it.
    let lpTimer = null,
      lpFired = false;
    const arm = () => {
      lpFired = false;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpFired = true;
        toast(b.title || b.dataset.spjump.toUpperCase());
      }, 450);
    };
    const disarm = () => clearTimeout(lpTimer);
    b.addEventListener('pointerdown', arm);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, disarm));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      if (lpFired) {
        lpFired = false;
        e.preventDefault();
        return;
      }
      state.spoilerSetFilter =
        state.spoilerSetFilter === b.dataset.spjump ? null : b.dataset.spjump;
      render();
    });
  });
  const rBtn = document.getElementById('spRefreshBtn');
  if (rBtn && !rBtn.dataset.wired) {
    rBtn.dataset.wired = '1';
    rBtn.addEventListener('click', async () => {
      rBtn.disabled = true;
      rBtn.textContent = '⟳ Checking for new spoilers…';
      state.spoilerSetFilter = null; // the check always shows the full newest-first feed
      state._spoilerCache = {};
      state._spoilerFresh = true;
      try {
        await checkForNewSets(true);
      } catch (e) {}
      render(); // sets may have been added, purged, or reclassified
    });
  }
  // Advanced filter (collection-style, priceless). Checkbox and text
  // changes repaint the body from the remembered streamed data -- the
  // panel itself is untouched, so typing never loses focus.
  const spRepaint = () => {
    try {
      if (state._spLoaded) renderSpoilerBody(state._spLoaded, state._spFailed || new Set());
    } catch (e) {}
  };
  _csHandlers['spSet'] = (v) => {
    state.spoilerSetFilter = v || null;
    render();
  };
  _csHandlers['spCM'] = (v) => {
    state.spFilter.colorMode = v;
    csRerender();
  };
  wireCSelects();
  document.querySelectorAll('[data-spcolor]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.spFilter.colors[chk.dataset.spcolor] = chk.checked;
      spRepaint();
    }),
  );
  document.querySelectorAll('[data-sprarity]').forEach((chk) =>
    chk.addEventListener('change', () => {
      state.spFilter.rarity[chk.dataset.sprarity] = chk.checked;
      spRepaint();
    }),
  );
  document.getElementById('spFq')?.addEventListener('input', (e) => {
    state.spFilter.q = e.target.value;
    spRepaint();
  });
  document.getElementById('spTypeText')?.addEventListener('input', (e) => {
    state.spFilter.type = e.target.value;
    spRepaint();
  });
  const freshPull = !!state._spoilerFresh;
  state._spoilerFresh = false;
  const loaded = {},
    failed = new Set();
  const myToken = (state._spoilerRunToken = (state._spoilerRunToken || 0) + 1);
  const sets = currentPreviewSets();
  // The filtered set loads first so a tap answers immediately; the rest
  // stream into the all-sets feed as they arrive.
  const order = state.spoilerSetFilter
    ? sets
        .slice()
        .sort(
          (a, b) =>
            (a.code === state.spoilerSetFilter ? -1 : 0) -
            (b.code === state.spoilerSetFilter ? -1 : 0),
        )
    : sets;
  for (const x of order) {
    let cards;
    try {
      cards = await fetchWholeSet(x.code, freshPull);
    } catch (e) {
      cards = null;
    } // one bad set must never strand the others
    if (state.screen !== 'spoilers' || myToken !== state._spoilerRunToken) return;
    if (cards === null) {
      failed.add(x.code);
    } else {
      loaded[x.code] = cards;
      if (cards.length > (autoSets.previewSeen[x.code] || 0)) {
        autoSets.previewSeen[x.code] = cards.length;
        saveAutoSets();
      }
    }
    renderSpoilerBody(loaded, failed);
  }
}

async function openShowcase(payload, opts) {
  opts = opts || {};
  let el = document.getElementById('showcaseOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'showcaseOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  // From a link, the back press must land on the app's home page — never exit
  // the browser. CloseWatcher (Chrome 120+) consumes exactly one back press
  // for a modal with no history tricks and no prior interaction needed; the
  // deferred history entry below remains as the fallback for older browsers.
  let cw = null;
  const closeFn = () => {
    document.getElementById('showcaseOverlay')?.remove();
    if (cw) {
      try {
        cw.destroy();
      } catch (e) {}
      cw = null;
    }
  };
  pushOverlay('showcase', closeFn, !!opts.fromLink);
  if (opts.fromLink && typeof CloseWatcher !== 'undefined') {
    try {
      cw = new CloseWatcher();
      cw.onclose = () => {
        cw = null;
        const top = state.overlayStack[state.overlayStack.length - 1];
        if (top && top.id === 'showcase') {
          if (top.pushed) {
            try {
              history.back();
              return;
            } catch (e) {}
          }
          state.overlayStack.pop();
          top.closeFn();
          state.screen = 'home';
          render();
        }
      };
    } catch (e) {
      cw = null;
    }
  }
  const count = (payload.c || []).length + (payload.a ? 1 : 0) + (payload.a2 ? 1 : 0);
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(payload.n || 'Shared Deck', `<button type="button" class="header-filter" id="scBack" aria-label="Back">${ICONS.back}</button>`, payload.by ? `Created by ${payload.by}` : `${count} cards`)}
    <main>
      <div id="scBody">
        <div class="status">
          <div class="spinner"></div>
          Loading the deck…
        </div>
      </div>
    </main>
  </div>`;
  document.getElementById('scBack').addEventListener('click', closeTopOverlay);

  const box = document.getElementById('scBody');
  let admiralCard = null,
    partnerCard = null;
  if (payload.a) {
    try {
      const r = await resolveCardByName(payload.a);
      if (r && r.found) admiralCard = r.card;
    } catch (e) {}
  }
  if (payload.a2) {
    try {
      const r = await resolveCardByName(payload.a2);
      if (r && r.found) partnerCard = r.card;
    } catch (e) {}
  }
  if (!document.getElementById('scBody')) return;
  const names = payload.c || [];
  box.innerHTML = `
    ${
      admiralCard
        ? `<div class="sc-hero">
      <img class="${wbClass(admiralCard)}" src="${cardImageLarge(admiralCard) || cardImage(admiralCard)}" alt="${escapeHtml(admiralCard.name)}">
      ${partnerCard ? `<img class="${wbClass(partnerCard)}" src="${cardImageLarge(partnerCard) || cardImage(partnerCard)}" alt="${escapeHtml(partnerCard.name)}" style="margin-top:10px;">` : ''}
      <div class="sc-adm-price" id="scAdmPrice"></div>
    </div>`
        : ''
    }
    ${payload.p && payload.p.trim() ? `<div class="sc-primer">${escapeHtml(payload.p.trim())}</div>` : ''}
    <div class="action-row" style="margin:14px 0;">
      <button class="primary-btn" id="scSave" style="flex:1;">♥ Save to my decks</button>
    </div>
    <div id="scGridWrap"><div class="status"><div class="spinner"></div>Loading the deck…</div></div>
    ${(payload.m || []).length ? `<div class="chip-label" style="margin-top:12px;">Maybeboard — ${payload.m.length}</div><div id="scMaybeWrap"></div>` : ''}
    <div id="scStats" style="margin-top:14px;"></div>
  `;
  appReady(); // the deck page is on screen — the app is open
  if (admiralCard) {
    box.querySelector('.sc-hero img')?.addEventListener('click', () => openCardInfo(admiralCard));
  }
  const scReady = renderShowcaseCards(payload, admiralCard);
  document.getElementById('scSave')?.addEventListener('click', async () => {
    const btn = document.getElementById('scSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    // The showcase already resolved every card for its grid — file the deck
    // directly from those, on the TOP LEVEL of My Decks (no folder), then
    // navigate there once the overlay has fully closed.
    let res = null;
    try {
      res = await scReady;
    } catch (e) {}
    if (payload.t) {
      // legacy links: their tags still join the registry
      const g = ensureGlobalTags();
      Object.entries(payload.t).forEach(([name, list]) => {
        const cur = g[name] || (g[name] = []);
        (list || []).forEach((t) => {
          if (t && !cur.some((x) => x.toLowerCase() === String(t).toLowerCase()))
            cur.push(String(t));
        });
      });
      saveGlobalTags();
    }
    const d = {
      id: uid(),
      name: payload.n || 'Shared deck',
      admiral: (res && res.admiral) || null,
      partner: partnerCard || null,
      cards: (res && res.main) || [],
      maybeboard: (res && res.maybe) || [],
      tags: {},
      primer: payload.p || '',
      description: payload.ds || '',
      playLog: payload.wr
        ? Array.from({ length: payload.wr.w }, () => ({ res: 'W' })).concat(
            Array.from({ length: payload.wr.l }, () => ({ res: 'L' })),
          )
        : [],
      author: payload.by || '',
      collected: true,
      folderId: null,
      format: payload.f && FMT_SPEC[payload.f] ? payload.f : 'commander',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.decksIndex.unshift(d);
    await persistDeck(d);
    closeOverlayThen(() => {
      toast('♥ Saved to your decks.');
      switchPage('decks');
    });
  });
}

/* Resolve the shared names on the receiver's device and show the deck the way
   the app always shows cards — image tiles plus live stats — instead of a
   text list. Names that can't be resolved are listed rather than dropped. */
async function renderShowcaseCards(payload, admiralCard) {
  const names = payload.c || [];
  const maybe = payload.m || [];
  let resolved;
  try {
    resolved = await namesToLegalCards(names.concat(maybe));
  } catch (e) {
    resolved = [];
  }
  const byName0 = new Map(resolved.map((c) => [c.name.toLowerCase(), c]));
  const out = {
    admiral: admiralCard,
    main: names.map((n) => byName0.get(n.toLowerCase())).filter(Boolean),
    maybe: maybe.map((n) => byName0.get(n.toLowerCase())).filter(Boolean),
  };
  const wrap = document.getElementById('scGridWrap');
  if (!wrap) return out; // showcase was closed mid-resolve
  const missing = names.concat(maybe).filter((n) => !byName0.get(n.toLowerCase()));

  const tile = (c) =>
    `<div class="sc-tile" role="button" tabindex="0" data-scn="${escapeHtml(c.name)}"><img loading="lazy" class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}">${cardBadgesHtml(c)}</div>`;

  // Grouped and sorted exactly like the decklist page's default view: the
  // same categories in the same order, each with its price and count, cards
  // sorted by mana value then name — with the whole-deck total on top.
  const byCat = {};
  CATS_CMDR.forEach((c) => (byCat[c] = []));
  out.main.forEach((c, i) => byCat[categoryOf(c, pseudo)].push(i));
  let html = `<div class="cat-head" style="margin-bottom:4px;"><span class="t">Total deck price</span><span class="cat-price" id="scDeckTotal">…</span><span class="n">${out.main.length + (admiralCard ? 1 : 0)}</span></div>
    <p class="hint" style="margin:0 0 10px;">Cardmarket trend price, cheapest printing of each card.</p>`;
  CATS_CMDR.forEach((cat) => {
    let idxs = byCat[cat];
    if (!idxs.length) return;
    idxs = sortIdxs(idxs, out.main, 'type-cmc-name');
    const cards = idxs.map((i) => out.main[i]);
    html += `<div class="cat-group">
      <div class="cat-head"><span class="t">${cat}</span><span class="cat-price">${groupPriceLabel(cards)}</span><span class="n">${cards.length}</span></div>
      <div class="cat-body"><div class="sc-grid">${cards.map(tile).join('')}</div></div>
    </div>`;
  });
  wrap.innerHTML = html;
  const mw = document.getElementById('scMaybeWrap');
  if (mw) {
    const midx = sortIdxs(
      out.maybe.map((_, i) => i),
      out.maybe,
      'type-cmc-name',
    );
    mw.innerHTML = /* HTML */ `<div class="sc-grid">
      ${midx.map((i) => tile(out.maybe[i])).join('')}
    </div>`;
  }
  if (missing.length) {
    wrap.insertAdjacentHTML(
      'beforeend',
      `<p class="hint" style="margin-top:10px;">Couldn't show: ${missing.map(escapeHtml).join(', ')}</p>`,
    );
  }
  const wireRoot = (root, list) => {
    root.querySelectorAll('.sc-tile:not([data-w])').forEach((b) => {
      b.dataset.w = '1';
      b.addEventListener('click', () => {
        const card = list.find((c) => c.name === b.dataset.scn);
        if (card) openCardInfo(card, { pool: list });
      });
    });
  };
  wireRoot(wrap, out.main);
  if (mw) wireRoot(mw, out.maybe);

  // Whole-deck total: the same Cardmarket-trend cheapest-printing pricing the
  // decklist page uses, streaming its progress into the header line.
  (async () => {
    try {
      const pseudo = { admiral: admiralCard || null, cards: out.main, maybeboard: [] };
      const { total } = await priceDeck(pseudo, (done, all) => {
        const t = document.getElementById('scDeckTotal');
        if (t && done < all) t.textContent = `${done}/${all}…`;
      });
      const t = document.getElementById('scDeckTotal');
      if (t) t.textContent = fmtEur(total);
      if (admiralCard) {
        const hit = state.priceCache[admiralCard.name];
        const ap = document.getElementById('scAdmPrice');
        if (ap && hit && typeof hit.v === 'number') ap.textContent = fmtEur(hit.v);
      }
    } catch (e) {
      const t = document.getElementById('scDeckTotal');
      if (t) t.textContent = '—';
    }
  })();

  // ---- Mana Curve (Overview card removed — curve carries the average) ----
  const statsBox = document.getElementById('scStats');
  if (!statsBox) return out;
  const curveCards = out.main.concat(admiralCard ? [admiralCard] : []);
  const curve = [0, 0, 0, 0, 0, 0, 0];
  let mvSum = 0,
    mvN = 0;
  curveCards.forEach((c) => {
    const mv = Math.round(c.cmc || 0);
    curve[Math.min(6, mv)]++;
    mvSum += c.cmc || 0;
    mvN++;
  });
  const maxB = Math.max(1, ...curve);
  const avg = mvN ? (mvSum / mvN).toFixed(2) : '—';
  statsBox.innerHTML = /* HTML */ ` <div class="panel-card" style="margin:0;">
    <div class="panel-h">
      ${out.main.length + (admiralCard ? 1 : 0)}/${fmtSpec((payload && payload.f) || (admiralCard ? 'commander' : 'standard')).min}
      Mana Curve
      <span style="text-transform:none;color:var(--brass);font-weight:700;float:right;"
        >avg mv ${avg}</span
      >
    </div>
    <div class="curve-panel">
      ${curve.map((n, i) => `<div class="curve-col"><div class="curve-bar" style="height:${n ? 14 + (n / maxB) * 54 : 2}px"></div><div class="curve-n">${n || ''}</div><div class="curve-lbl">${i === 6 ? '6+' : i}</div></div>`).join('')}
    </div>
  </div>`;
  return out;
}

function syncTabsUI() {
  document.querySelectorAll('.b-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.btab === state.builderTab);
    b.setAttribute('aria-selected', String(b.dataset.btab === state.builderTab));
    b.tabIndex = b.dataset.btab === state.builderTab ? 0 : -1;
  });
  document
    .querySelector('.builder-tabs')
    ?.style.setProperty('--deck-tab-index', DECK_TABS.indexOf(state.builderTab));
  document
    .getElementById('builderBody')
    ?.setAttribute('aria-labelledby', 'deckTab-' + state.builderTab);
}

async function duplicateDeck(d) {
  const copy = JSON.parse(JSON.stringify(d));
  copy.id = uid();
  copy.name = d.name + ' (copy)';
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  await persistDeck(copy);
  state.decksIndex.unshift(copy);
  toast('Deck duplicated.');
  render();
}

function renderBuilderBody(d) {
  cleanupDeckStacks();
  const box = document.getElementById('builderBody');
  if (!box) return;
  box.classList.toggle('deck-log', state.builderTab === 'primer');
  if (state.builderTab === 'list') box.innerHTML = listTabHtml(d);
  else if (state.builderTab === 'stats') box.innerHTML = statsTabHtml(d);
  else if (state.builderTab === 'inspiration') box.innerHTML = deckInspirationTabHtml(d);
  else box.innerHTML = primerTabHtml(d);
  wireBuilderBody(d);
}
