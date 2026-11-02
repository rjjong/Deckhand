// pages / inspiration / deck

/* ---------------- INSPIRATION PAGE ---------------- */

function inspirationPageHtml() {
  if (!state.decksIndex.length)
    return /* HTML */ `<main>
      ${needDeckHtml('Create a deck first to see recommendations for it.')}
    </main>`;
  if (!state.inspireDeckId || !getDeck(state.inspireDeckId))
    state.inspireDeckId = state.activeDeckId || state.decksIndex[0].id;
  const d = getDeck(state.inspireDeckId);
  if (d && deckIsConstructed(d)) return deckMetaPageHtml(d);
  // Each deck's recommendations start clean: type and theme selections never
  // carry over from the previous deck's session.
  if (d && state._inspireSelFor !== d.id) {
    // Both menus start EMPTY — an auto-detected theme was too often wrong
    // and quietly skewed the whole page. The person picks; the app follows.
    state.inspireSel = { kindred: '', theme: '' };
    state._inspireSelFor = d.id;
  }
  if (!d.admiral) {
    return /* HTML */ `<main>
      <div class="deck-title-row" style="margin-bottom:6px;">
        <div class="tb-titles"><div class="t2">${escapeHtml(d.name)}</div></div>
      </div>
      <div class="need-deck">
        <div class="anchor">${modeGlyph()}</div>
        <p>
          Appoint a Commander for <strong>${escapeHtml(d.name)}</strong> first — recommendations are
          built from its color identity.
        </p>
        <button id="goDecklistBtn">Go to Decklist</button>
      </div>
    </main>`;
  }
  const sel = state.inspireSel;
  // The menus hold THIS leader's own EDHREC themes and kindreds (the same
  // list its recommendations page shows); one pick at a time, as on EDHREC.
  const themes = inspEdhThemes(d);
  const ks = kindredNameSet();
  const isKin = (t) => !!t.k || ks.has(String(t.label || '').toLowerCase());
  const kinList = themes.filter(isKin),
    thList = themes.filter((t) => !isKin(t));
  // Too many cards: Theme AND Kindred can both be set (the cuts weigh both),
  // and a Cuts row sits ABOVE Theme (DOM-last in the reversed stack): opened,
  // its list grows upward and Theme / Kindred stay in view beneath it.
  const both = !!(sel.kindred && sel.theme); // 1.27: no Cuts any more -- one theme page at a time
  return /* HTML */ ` <main>
    <div class="browse-selects">
      ${sel.theme && !both ? '' : `<div class="bs-row">${cselectHtml('inspKindred', [{ v: '', l: trS('Kindred — none'), gen: '🐾' }].concat(kinList.map((t) => ({ v: t.slug, l: escapeHtml(t.label), art: inspSlugArt(t.slug, d) }))), sel.kindred || '', trS('Kindred — none'), { search: true, tiles: true })}</div>`}
      ${sel.kindred && !both ? '' : `<div class="bs-row">${cselectHtml('inspTheme', [{ v: '', l: trS('Theme — none'), gen: '📜' }].concat(thList.map((t) => ({ v: t.slug, l: escapeHtml(t.label), art: inspSlugArt(t.slug, d) }))), sel.theme || '', trS('Theme — none'), { search: true, tiles: true })}</div>`}
      <div class="bs-row insp-land-row">
        <button type="button" class="ghost-btn" id="inspLandBase">⛰ ${'Land base'}</button>
      </div>
    </div>
    <div id="inspireResults"></div>
  </main>`;
}

/* The deck's own creature subtypes, counted — the Kindred menu and the
   pre-fill are read straight from what's already sleeved. */
function deckKindredOptions(d) {
  const counts = {};
  deckLeaders(d)
    .concat(d.cards)
    .forEach((c) => {
      const tl = String(c.type_line || '').split('//')[0];
      if (!/Creature/.test(tl)) return;
      const sub = tl.split('—')[1];
      if (!sub) return;
      sub
        .trim()
        .split(/\s+/)
        .forEach((w) => {
          if (w) counts[w] = (counts[w] || 0) + 1;
        });
    });
  return Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t, n]) => ({ v: t, l: `${t} (${n})`, n }));
}

/* The deck's dominant THEME: walk the commander's ranked theme list and
   take the first non-kindred theme (with a real Scryfall clause) whose key
   word shows up in at least 8 of the deck's own rules texts — an Energy
   deck says "energy" everywhere, and that's the tell. */
function wireInspirationPage() {
  const d = getDeck(state.inspireDeckId);
  if (!d) {
    wireNeedDeck();
    return;
  }
  document.getElementById('goDecklistBtn')?.addEventListener('click', () => {
    state.activeDeckId = d.id;
    switchPage('decklist');
  });
  // 1.37: lands for THIS deck (its commander's EDHREC landbase, its own pips)
  document.getElementById('inspLandBase')?.addEventListener('click', () => openLandSuggest(d));
  if (deckIsConstructed(d)) {
    loadDeckMeta(d);
    return;
  }
  if (!d.admiral) return;
  // Drop-up tiles: pull every stored art into the sync ready-map before a
  // panel can open; the FIRST hydration repaints an already-open panel once
  // (scroll preserved by csRerender). Fresh keys fill in lazily per tile.
  hydrateTileArtReady().then((did) => {
    try {
      if (did && state.screen === 'inspiration' && state.openCSelect) csRerender();
    } catch (e) {}
  });
  // EDHREC serves one theme page at a time: picking a Kindred clears the
  // Theme and the other way round.
  // With too many cards both can be set: the cuts weigh Theme and Kindred.
  _csHandlers.inspKindred = (v) => {
    const both = false;
    state.inspireSel = { kindred: v || '', theme: both ? state.inspireSel.theme || '' : '' };
    state._inspShown = {};
    render();
  };
  _csHandlers.inspTheme = (v) => {
    const both = false;
    state.inspireSel = { kindred: both ? state.inspireSel.kindred || '' : '', theme: v || '' };
    state._inspShown = {};
    render();
  };
  wireCSelects();
  if (state._cutsDeck !== d.id) {
    state._cutsDeck = d.id;
    state._cutsOpenFor = null;
    state._cutsMore = 0;
  }
  paintCuts(d);
  loadInspiration(d);
}

/* ---- Deck Inspiration on EDHREC's full commander data --------------------
   The same source as a commander's recommendations page: every section
   EDHREC lists (New Cards, High Synergy, Top Cards, Game Changers, the type
   lists …), up to 400 cards, minus what the deck already holds, inside the
   deck's own format rules. A Theme or Kindred pick swaps in that theme's
   EDHREC page. */
function inspLeaderKey(d) {
  return recoCacheKey(d.admiral, d.partner);
}

function inspEdhThemes(d) {
  if (!d || !d.admiral) return [];
  const k = inspLeaderKey(d);
  const hit = (state._inspEdh || {})[k] || (state._recoCache || {})[k];
  return ((hit && hit.themes) || (state._inspThemes || {})[k] || []).slice();
}

/* A deck's view of an EDHREC pool: its colours, its format (legality and
   ban list), no leaders, nothing already in the main deck or maybeboard. */
function inspEdhFilter(d, pool, okSet) {
  const inDeck = new Set(
    d.cards
      .map((c) => c.name)
      .concat((d.maybeboard || []).map((c) => c.name))
      .concat(deckLeaders(d).map((c) => c.name)),
  );
  return (pool || []).filter(
    (c) =>
      !inDeck.has(c.name) &&
      colorIdentityOkDeck(c, d) &&
      !isBanned(c, d) &&
      (!okSet || okSet.has(c.name)),
  );
}

async function inspResolveNames(names, onFirst) {
  const rank = new Map(names.map((n, i) => [n, i]));
  const byRank = (a, b) =>
    (rank.has(a.name) ? rank.get(a.name) : 9999) - (rank.has(b.name) ? rank.get(b.name) : 9999);
  const lf = edhNamesLocalFirst(names, rank); // 1.4: the phone first
  const proms = chunkArr(lf.ask, 30).map((ch) =>
    searchAndVerifyLegal(
      '(' + ch.map((n) => exactNameClause(n)).join(' or ') + ')',
      'name',
      ch.length,
    ).catch(() => ({ results: [] })),
  );
  const seen = new Set(),
    got = [];
  lf.cards.forEach((c) => {
    seen.add(c.name);
    got.push(c);
  });
  const absorb = (r) =>
    (r.results || []).forEach((c) => {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        got.push(c);
      }
    });
  if (!proms.length) {
    const all = got.sort(byRank);
    if (onFirst)
      try {
        onFirst(all.slice());
      } catch (e) {}
    return all;
  }
  absorb(await proms[0]);
  if (onFirst)
    try {
      onFirst(got.slice().sort(byRank));
    } catch (e) {}
  (await Promise.all(proms.slice(1))).forEach(absorb);
  return got.sort(byRank);
}

/* The leader's main EDHREC page, resolved once per session (and shared by
   every deck with that leader). A second caller waits on the same job. */
function inspEdhMain(d) {
  const key = inspLeaderKey(d);
  state._inspEdh = state._inspEdh || {};
  state._inspJobs = state._inspJobs || {};
  state._inspThemes = state._inspThemes || {};
  if (state._inspEdh[key]) return Promise.resolve(state._inspEdh[key]);
  if (state._inspJobs[key]) return state._inspJobs[key];
  const admiral = d.admiral,
    partner = d.partner || null;
  const job = (async () => {
    try {
      const page = partner
        ? await edhrecPairPage(admiral, partner)
        : await edhrecCommanderPage(admiral);
      const names = (page.names || []).slice(0, 400);
      if (names.length < 20) return null;
      state._inspThemes[key] = page.themes || [];
      try {
        mergeEdhrecTags(page.themes || []);
      } catch (e) {}
      inspThemesArrived(key);
      const notLeader = (c) => c.name !== admiral.name && (!partner || c.name !== partner.name);
      const pool = (
        await inspResolveNames(names, (first) => {
          state._inspPartial = state._inspPartial || {};
          state._inspPartial[key] = {
            pool: first.filter(notLeader),
            themes: page.themes || [],
            sections: page.sections || [],
          };
          inspPaintIfCurrent(key, '');
        })
      ).filter(notLeader);
      if (pool.length < 10) return null;
      const entry = {
        pool,
        themes: page.themes || [],
        sections: page.sections || [],
        stats: page.stats || null,
      };
      state._inspEdh[key] = entry;
      return entry;
    } catch (e) {
      return null;
    } finally {
      delete state._inspJobs[key];
      if (state._inspPartial) delete state._inspPartial[key];
    }
  })();
  state._inspJobs[key] = job;
  return job;
}

async function inspEdhTheme(d, slug) {
  const key = inspLeaderKey(d) + '/' + slug;
  state._inspEdhTheme = state._inspEdhTheme || {};
  if (state._inspEdhTheme[key]) return state._inspEdhTheme[key];
  try {
    const tp = d.partner
      ? await edhrecPairThemePage(d.admiral, d.partner, slug)
      : await edhrecThemePage(d.admiral, slug);
    const names = (tp.names || []).slice(0, 400);
    if (names.length < 8) return null;
    const pool = (await inspResolveNames(names)).filter(
      (c) => c.name !== d.admiral.name && (!d.partner || c.name !== d.partner.name),
    );
    if (pool.length < 8) return null;
    return (state._inspEdhTheme[key] = {
      pool,
      sections: tp.sections || [],
      stats: tp.stats || null,
    });
  } catch (e) {
    return null;
  }
}

/* Kindred AND Theme (only while the deck runs over): both EDHREC pages in
   one list, cards that both pages play first. */
async function inspEdhCombo(d, kSlug, tSlug) {
  const key = inspLeaderKey(d) + '/' + kSlug + '+' + tSlug;
  state._inspEdhTheme = state._inspEdhTheme || {};
  if (state._inspEdhTheme[key]) return state._inspEdhTheme[key];
  const [a, b] = await Promise.all([inspEdhTheme(d, kSlug), inspEdhTheme(d, tSlug)]);
  if (!a || !b) return a || b || null;
  const inB = new Set(b.pool.map((c) => c.name)),
    inA = new Set(a.pool.map((c) => c.name));
  const both = (n) => inA.has(n) && inB.has(n);
  const seen = new Set(),
    pool = [];
  a.pool
    .filter((c) => inB.has(c.name))
    .concat(a.pool, b.pool)
    .forEach((c) => {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        pool.push(c);
      }
    });
  const secs = [];
  a.sections.concat(b.sections).forEach((sec) => {
    let g = secs.find((x) => x.header === sec.header);
    if (!g) {
      g = { header: sec.header, names: [] };
      secs.push(g);
    }
    sec.names.forEach((n) => {
      if (!g.names.includes(n)) g.names.push(n);
    });
  });
  secs.forEach((g) => {
    g.names = g.names.filter(both).concat(g.names.filter((n) => !both(n)));
  });
  return (state._inspEdhTheme[key] = { pool, sections: secs, stats: null });
}

/* The menus were drawn before this leader's theme list was known: draw the
   page once more now that it is (the pool keeps loading underneath). */
function inspThemesArrived(key) {
  const d = getDeck(state.inspireDeckId);
  if (state.screen !== 'inspiration' || !d || !d.admiral || inspLeaderKey(d) !== key) return;
  if (state.openCSelect) return;
  if (
    document.querySelector('#inspKindred, [data-cs="inspKindred"]') &&
    state._inspMenusFor === key
  )
    return;
  state._inspMenusFor = key;
  const y = pageScroller().scrollTop;
  render();
  pageScroller().scrollTo(0, y);
}

function inspPaintIfCurrent(key, slug) {
  const d = getDeck(state.inspireDeckId);
  if (state.screen !== 'inspiration' || !d || !d.admiral || inspLeaderKey(d) !== key) return;
  const cur = state.inspireSel.kindred || state.inspireSel.theme || '';
  if (cur !== slug) return;
  const part = state._inspPartial && state._inspPartial[key];
  if (!slug && part && !state._inspEdh[key]) {
    renderInspEdh(d, part, state._inspPartialPainted === key, true);
    state._inspPartialPainted = key; // the full list, when it lands, keeps the reader's place
  }
}

let _inspSeq = 0;

async function loadInspiration(d) {
  const box = document.getElementById('inspireResults');
  if (!box) return;
  const _sel = state.inspireSel;
  const slug =
    _sel.kindred && _sel.theme ? _sel.kindred + '+' + _sel.theme : _sel.kindred || _sel.theme || '';
  const seq = ++_inspSeq;
  state._inspRepaint = null;
  const current = () =>
    seq === _inspSeq &&
    state.screen === 'inspiration' &&
    state.inspireDeckId === d.id &&
    document.getElementById('inspireResults');
  const key = inspLeaderKey(d);
  state._inspPartialPainted = null;
  const ready = slug ? (state._inspEdhTheme || {})[key + '/' + slug] : (state._inspEdh || {})[key];
  if (!ready)
    box.innerHTML = /* HTML */ `<div class="status">
      <div class="spinner"></div>
      ${slug ? trS('Charting themed recommendations…') : 'Charting recommendations…'}
    </div>`;
  let entry = null;
  try {
    entry = slug
      ? _sel.kindred && _sel.theme
        ? await inspEdhCombo(d, _sel.kindred, _sel.theme)
        : await inspEdhTheme(d, slug)
      : await inspEdhMain(d);
  } catch (e) {}
  if (!current()) return;
  if (entry) {
    // Other formats than Commander: every card passes that format's own

    const fmt = deckFormat(d);
    let ok = null;
    if (fmt !== 'commander') {
      const b2 = document.getElementById('inspireResults');
      if (b2 && !ready)
        b2.innerHTML = /* HTML */ `<div class="status">
          <div class="spinner"></div>
          Checking ${fmtLabelOf(fmt)} legality…
        </div>`;
      try {
        ok = await filterCardsByFormat(entry.pool, fmt, 'card');
      } catch (e) {
        ok = null;
      }
      if (!current()) return;
    }
    renderInspEdh(d, entry, state._inspPartialPainted === key, false, ok);
    state._inspPartialPainted = null;
    return;
  }
  if (slug) {
    toast(trS('No themed play data for this leader.'));
    state.inspireSel = { kindred: '', theme: '' };
    render();
    return;
  }
  // EDHREC unreachable: the colour-wide Scryfall list, as before, with a way back.
  loadInspirationScryfall(d);
}

/* The \u2630 of deck Inspiration rides just above the Theme / Kindred menus
   (in the gap under the explanation) and, once those scroll out of view,
   sinks to a spot just above the bottom navigation. */
let _inspJumpBound = false,
  _safeBottomPx = null;

function placeInspJump() {
  const row = document.querySelector('.app > main .edh-jump-row.insp-jump');
  if (!row) return;
  if (_safeBottomPx === null) {
    try {
      const pr = document.createElement('div');
      pr.style.cssText =
        'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;';
      document.body.appendChild(pr);
      _safeBottomPx = pr.offsetHeight || 0;
      pr.remove();
    } catch (e) {
      _safeBottomPx = 0;
    }
  }
  const navH =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 66;
  let min = navH + 14 + _safeBottomPx;
  // 1.30: a page with the sticky search bar above the nav (Inspiration):
  // the burger rests just above that bar, never on it.
  const sbar = document.querySelector('.app > main > .searchbar');
  if (sbar) {
    const r = sbar.getBoundingClientRect();
    if (r.height && r.top < window.innerHeight)
      min = Math.max(min, window.innerHeight - r.top + 10);
  }
  const sel = document.querySelector('.app > main > .browse-selects');
  let b = min,
    hide = false;
  if (sel) {
    const top = sel.getBoundingClientRect().top;
    if (top > 0) b = Math.max(min, window.innerHeight - top + 5);
    // Cuts open and the menus fill the screen: no free spot above them, and
    // at the foot the burger would sit on the Cuts button -- it steps out
    // until the menus' top is back in view.
    if (
      top < 90 &&
      document.querySelector('#cutSlot .cut-body') &&
      sel.getBoundingClientRect().bottom > 0
    )
      hide = true;
  }
  // 1.37: the land-base button row leaves room on its right: the burger
  // rides level with it instead of floating over an empty strip above it
  const lr = document.querySelector('.app > main .insp-land-row');
  if (lr && !hide) {
    const r = lr.getBoundingClientRect();
    if (r.height && r.top > 0) {
      const jh = row.offsetHeight || 42;
      b = Math.max(min, window.innerHeight - r.bottom + (r.height - jh) / 2);
    }
  }
  row.style.bottom = Math.round(b) + 'px';
  row.style.visibility = hide ? 'hidden' : '';
}

function bindInspJump() {
  placeInspJump();
  if (_inspJumpBound) return;
  _inspJumpBound = true;
  let raf = 0;
  const go = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      placeInspJump();
    });
  };
  window.addEventListener('scroll', go, { passive: true, capture: true });
  window.addEventListener('resize', go);
}

/* ── Cuts ─ the deck holds more cards than its format allows: which can go?
   Three kinds of evidence, the way deckbuilders weigh it:
   1. play data -- how often EDHREC decks with this very leader run the card,
      and its synergy with the leader (a card no one plays with it, first);
   2. the deck's roles against a common template (Command Zone style:
      ~37 lands, ~10 ramp, ~10 draw, ~10 removal, 2-3 wipes) -- a card in a
      role the deck has too many of is easier to miss, one in a role it is
      short on stays;
   3. the curve -- 6+ mana cards weigh on a crowded deck.
   Leaders never appear; lands only when there are too many. Nothing moves
   by itself: each suggestion has its own Remove and Maybeboard button. */
const CUT_TEMPLATE = { cmdr: { land: 37, ramp: 10, draw: 10, removal: 10, wipe: 3 } };

function cutRoles(card) {
  const r = new Set();
  const tl = String(card.type_line || '').split('//')[0];
  if (/\bLand\b/.test(tl)) {
    r.add('land');
    return r;
  }
  let tags = null;
  try {
    tags = _localTagsDecide(_bulkIdx, card);
  } catch (e) {}
  const t = new Set(Array.isArray(tags) ? tags : []);
  const f = (typeof frontFace === 'function' ? frontFace(card) : card) || card;
  const o = String(f.oracle_text || card.oracle_text || '').toLowerCase();
  if (
    t.has('ramp') ||
    t.has('mana-rock') ||
    t.has('mana-dork') ||
    t.has('land-ramp') ||
    /\badd \{|search your library for (?:a|up to \w+) (?:basic )?lands?/.test(o)
  )
    r.add('ramp');
  if (
    t.has('draw') ||
    t.has('card-advantage') ||
    t.has('repeatable-draw') ||
    /\bdraws? (?:a|two|three|four|x) cards?/.test(o)
  )
    r.add('draw');
  if (
    t.has('boardwipe') ||
    /(?:destroy|exile) all (?:creatures|nonland permanents|other)|all creatures get -\d/.test(o)
  )
    r.add('wipe');
  else if (
    t.has('removal') ||
    t.has('spot-removal') ||
    t.has('creature-removal') ||
    t.has('counterspell') ||
    /(?:destroy|exile) target|counter target spell/.test(o)
  )
    r.add('removal');
  return r;
}

/* How many cards over the format's size (0 when it fits). */
function deckCutOver(d) {
  if (!d || deckIsConstructed(d)) return 0;
  return Math.max(0, (d.cards || []).length + deckLeaders(d).length - deckTotal(d));
}

/* A Kindred label ("Elves", "Zombies", "Mice") as the creature types and
   words a card would use for it: elf, zombie, mouse. */
function kinSingulars(label) {
  const inv = {};
  Object.keys(KINDRED_PLURAL_IRREGULAR).forEach((k) => {
    inv[KINDRED_PLURAL_IRREGULAR[k].toLowerCase()] = k.toLowerCase();
  });
  const out = new Set();
  String(label || '')
    .toLowerCase()
    .replace(/\b(kindred|tribal|typal)\b/g, ' ')
    .split(/[^a-z]+/)
    .forEach((w) => {
      if (w.length < 3) return;
      [
        w,
        inv[w],
        w.replace(/ves$/, 'f'),
        w.replace(/ies$/, 'y'),
        w.replace(/es$/, ''),
        w.replace(/s$/, ''),
        w.replace(/men$/, 'man'),
      ].forEach((x) => {
        if (x && x.length >= 3) out.add(x);
      });
    });
  return out;
}

/* Does this card belong to the tribe: the type itself, a changeling, or
   rules text that names it (lords, payoffs)? */
function tribeHit(card, S) {
  if (!S || !S.size) return false;
  const tl = String(card.type_line || '').split('//')[0];
  const subs = (tl.split('—')[1] || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (subs.some((s) => S.has(s))) return true;
  const f = (typeof frontFace === 'function' ? frontFace(card) : card) || card;
  const o = String(f.oracle_text || card.oracle_text || '').toLowerCase();
  if (/\bchangeling\b/.test(o)) return true;
  for (const w of S) {
    if (new RegExp('\\b' + w + 's?\\b').test(o)) return true;
  }
  return false;
}

/* Cuts read the page's own choices: the leader's play data, the Theme and
   Kindred picked above (their EDHREC pages), and the deck's land goal. */
function inspCutCtx(d) {
  const key = inspLeaderKey(d),
    sel = state.inspireSel || {};
  const main = (state._inspEdh || {})[key] || (state._inspPartial || {})[key];
  const themes = inspEdhThemes(d);
  const lab = (s) => {
    const t = themes.find((x) => x.slug === s);
    return t ? String(t.label) : String(s).replace(/-/g, ' ');
  };
  let selStats = null;
  [sel.kindred, sel.theme].filter(Boolean).forEach((s) => {
    const e = (state._inspEdhTheme || {})[key + '/' + s];
    const st = e && e.stats;
    if (!st) return;
    selStats = selStats || {};
    for (const k in st) {
      const o = selStats[k];
      selStats[k] = o ? [Math.max(o[0], st[k][0]), Math.max(o[1], st[k][1])] : st[k];
    }
  });
  return {
    stats: (main && main.stats) || null,
    selStats,
    kin: sel.kindred ? lab(sel.kindred) : '',
    theme: sel.theme ? lab(sel.theme) : '',
    lands: typeof d.landGoal === 'number' ? d.landGoal : null,
  };
}

/* Which reasons lead on a tile: the strongest evidence first. */
const CUT_WHY_ORDER = {
  land: 1,
  rate: 2,
  absent: 2,
  offtheme: 2,
  weakest: 3,
  offtribe: 4,
  cast: 5,
  winmore: 6,
  narrow: 7,
  antisyn: 8,
  role: 9,
  pricey: 10,
  mv: 11,
  rank: 12,
};

/* Win-more: pays off only when the board is already yours. Narrow: hits one
   kind of target, so some games it is a dead draw. */
const CUT_WINMORE =
  /creatures you control get \+\d+\/\+\d+|additional combat phase|deals? double (?:that )?damage|double (?:the )?(?:damage|power)|if you control (?:seven|eight|nine|ten|\d{2}) or more|as long as you have (?:\d{2}|forty) or more life/;

const CUT_NARROW =
  /(?:destroy|exile) target (?:tapped |attacking |blocking )?(?:artifact|enchantment|planeswalker|creature with (?:power|toughness|mana value) \d or (?:less|greater)|non(?:black|white|blue|red|green|artifact) creature|(?:black|white|blue|red|green) creature|creature with flying)|counter target (?:noncreature|creature|instant|sorcery|activated|triggered|artifact|enchantment)/;

/* Coloured pips in a card's cost (hybrid counts half, Phyrexian not at all). */
function cutManaPips(c) {
  const f = !c.mana_cost && c.card_faces && c.card_faces[0] ? c.card_faces[0] : c;
  const mc = String(f.mana_cost || '').split('//')[0];
  const p = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  (mc.match(/\{[0-9WUBRGCSXP\/]+\}/gi) || []).forEach((t) => {
    const x = t.slice(1, -1).toUpperCase();
    if (p[x] !== undefined) p[x] += 1;
    else if (/^[WUBRG]\/[WUBRG]$/.test(x)) {
      p[x[0]] += 0.5;
      p[x[2]] += 0.5;
    } else if (/^2\/[WUBRG]$/.test(x)) p[x[2]] += 0.5;
  });
  return p;
}

/* How many of the deck's lands make each colour. */
function cutColorSources(lands) {
  const src = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const BASIC = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
  (lands || []).forEach((c) => {
    let pm = producedManaOf(c);
    if (!pm.length) {
      pm = [];
      Object.keys(BASIC).forEach((b) => {
        if (new RegExp('\\b' + b + '\\b').test(c.type_line || '')) pm.push(BASIC[b]);
      });
    }
    new Set(pm).forEach((x) => {
      if (src[x] !== undefined) src[x]++;
    });
  });
  return src;
}

function deckCutPlan(d, stats, o) {
  if (!d || deckIsConstructed(d)) return null;
  o = o || {};
  const over = deckCutOver(d);
  if (over <= 0) return { over: 0, list: [] };
  const tpl = Object.assign({}, CUT_TEMPLATE.cmdr);
  if (tpl.land && typeof o.lands === 'number') tpl.land = o.lands;
  const counts = { land: 0, ramp: 0, draw: 0, removal: 0, wipe: 0 },
    roles = new Map();
  d.cards.forEach((c) => {
    const r = cutRoles(c);
    roles.set(c, r);
    r.forEach((k) => {
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  const hasStats = !!stats && Object.keys(stats).length > 20;
  const selStats = o.selStats && Object.keys(o.selStats).length > 20 ? o.selStats : null;
  const pg = [o.kin, o.theme].filter(Boolean).join(' + ');
  const tribe = o.kin ? kinSingulars(o.kin) : null;
  const look = (S, c) =>
    S[String(c.name).toLowerCase()] || S[String(c.name).split(' // ')[0].toLowerCase()];
  // Deeper evidence, the way a deckbuilder argues a cut:
  //  - the weakest card of its own role (by play data), or a pricey one;
  //  - hard to cast on this mana base (heavy pips, few sources);
  //  - win-more (only good when already ahead) or narrow (a dead draw at times);
  //  - negative EDHREC synergy with this leader.
  const qS = selStats || (hasStats ? stats : null);
  const qOf = (c) => {
    if (qS) {
      const st = look(qS, c);
      return st ? st[0] : 0;
    }
    return typeof c.edhrec_rank === 'number' ? Math.max(0, 1 - c.edhrec_rank / 15000) : null;
  };
  const peers = {},
    uniq = new Set();
  d.cards.forEach((c) => {
    if (!c || !c.name || uniq.has(c.name)) return;
    uniq.add(c.name);
    roles.get(c).forEach((k) => {
      if (k !== 'land') (peers[k] = peers[k] || []).push({ c, q: qOf(c), mv: Number(c.cmc) || 0 });
    });
  });
  Object.keys(peers).forEach((k) =>
    peers[k].sort((a, b) => (a.q == null ? 0.5 : a.q) - (b.q == null ? 0.5 : b.q)),
  );
  const landCards = d.cards.filter((c) => roles.get(c).has('land'));
  const src = cutColorSources(landCards);
  const seen = new Set(),
    list = [];
  d.cards.forEach((c) => {
    if (!c || !c.name || seen.has(c.name)) return;
    seen.add(c.name);
    const r = roles.get(c),
      why = [];
    let score;
    if (r.has('land')) {
      const excess = counts.land - tpl.land;
      if (!tpl.land || excess <= 0) return;
      score = 0.55 + Math.min(0.3, excess * 0.08) + (/Basic/.test(c.type_line || '') ? 0.1 : 0);
      why.push({ k: 'land', n: counts.land, t: tpl.land, mine: typeof o.lands === 'number' });
    } else {
      let keep = 0,
        cut = 0;
      if (selStats) {
        // A Theme or Kindred is picked: what THOSE decks run counts most.
        const st = look(selStats, c);
        if (st) {
          keep += st[0] * 0.8 + Math.max(0, st[1]) * 0.5;
          if (st[0] < 0.12) why.push({ k: 'rate', p: st[0], pg });
        } else {
          const m = hasStats ? look(stats, c) : null;
          if (m) keep += m[0] * 0.35;
          why.push({ k: 'offtheme', pg });
        }
      } else if (hasStats) {
        const st = look(stats, c);
        if (st) {
          keep += st[0] * 0.8 + Math.max(0, st[1]) * 0.5;
          if (st[0] < 0.12) why.push({ k: 'rate', p: st[0] });
        } else why.push({ k: 'absent' });
      } else if (typeof c.edhrec_rank === 'number') {
        keep += Math.max(0, 1 - c.edhrec_rank / 15000) * 0.6;
        if (c.edhrec_rank > 8000) why.push({ k: 'rank' });
      }
      const inTribe = !!tribe && tribeHit(c, tribe);
      if (tribe) {
        if (inTribe) keep += 0.45;
        else if (/\bCreature\b/.test(String(c.type_line || '').split('//')[0])) {
          cut += 0.12;
          why.push({ k: 'offtribe', pg: o.kin });
        }
      }
      const mv0 = Number(c.cmc) || 0;
      // weakest of its role, or the slow one
      for (const k of r) {
        const a = peers[k];
        if (!a || a.length < 4) continue;
        const pos = a.findIndex((x) => x.c === c),
          known = a.filter((x) => x.q != null).length;
        // (only when it truly stands out: a tie with the next ones proves nothing)
        if (
          pos >= 0 &&
          pos < 2 &&
          known >= a.length / 2 &&
          (a[a.length - 1].q || 0) - (a[pos].q || 0) > 0.1 &&
          (a[2].q || 0) > (a[pos].q || 0)
        ) {
          cut += pos === 0 ? 0.1 : 0.06;
          why.push({
            k: 'weakest',
            role: k,
            pos: pos + 1,
            of: a.length,
            best: a[a.length - 1].c.name,
          });
          break;
        }
        const others = a.filter((x) => x.c !== c),
          avg = others.reduce((t, x) => t + x.mv, 0) / (others.length || 1);
        if (mv0 >= 4 && mv0 >= avg + 1.5) {
          cut += 0.06;
          why.push({ k: 'pricey', role: k, mv: mv0, avg: Math.round(avg * 10) / 10 });
          break;
        }
      }
      // hard to cast on this mana base
      if (landCards.length >= 10) {
        const pp = cutManaPips(c);
        let worst = null;
        for (const col in pp) {
          const n = pp[col];
          if (n < 2) continue;
          const frac = src[col] / landCards.length;
          if (
            ((n >= 3 && frac < 0.6) || frac < 0.4 || (n >= 3 && mv0 <= 3 && frac < 0.75)) &&
            (!worst || n > worst.p)
          )
            worst = { col, p: n, src: src[col] };
        }
        if (worst) {
          cut += 0.08;
          why.push({
            k: 'cast',
            col: worst.col,
            p: worst.p,
            src: worst.src,
            lands: landCards.length,
          });
        }
      }
      const ot = String(
        ((typeof frontFace === 'function' ? frontFace(c) : c) || c).oracle_text ||
          c.oracle_text ||
          '',
      ).toLowerCase();
      if (!inTribe && CUT_WINMORE.test(ot)) {
        cut += 0.08;
        why.push({ k: 'winmore' });
      } else if (CUT_NARROW.test(ot)) {
        cut += 0.05;
        why.push({ k: 'narrow' });
      }
      const stAny = qS ? look(qS, c) : null;
      if (stAny && stAny[1] < -0.05) {
        cut += 0.05;
        why.push({ k: 'antisyn', s: stAny[1] });
      }
      for (const k of ['ramp', 'draw', 'removal', 'wipe']) {
        if (!r.has(k) || !tpl[k]) continue;
        if (counts[k] > tpl[k]) {
          cut += Math.min(0.25, (counts[k] - tpl[k]) * 0.05);
          why.push({ k: 'role', role: k, n: counts[k], t: tpl[k] });
        } else keep += 0.25;
      }
      const mv = Number(c.cmc) || 0;
      if (mv >= 6) {
        cut += mv >= 7 ? 0.15 : 0.1;
        why.push({ k: 'mv', mv });
      }
      score = 1 - keep + cut;
    }
    why.sort((a, b) => (CUT_WHY_ORDER[a.k] || 50) - (CUT_WHY_ORDER[b.k] || 50));
    list.push({ card: c, score, why });
  });
  list.sort((a, b) => b.score - a.score);
  return { over, counts, tpl, list, pg };
}

function cutWhyText(w, d) {
  const lead = d.admiral ? String(d.admiral.name).split(',')[0] : 'your leader';
  const role = { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipe: 'board wipes' };
  switch (w.k) {
    case 'rate':
      return w.pg
        ? `in ${Math.round(w.p * 100)}% of ${w.pg} decks`
        : `in ${Math.round(w.p * 100)}% of ${lead} decks`;
    case 'absent':
      return `hardly ever played with ${lead}`;
    case 'offtheme':
      return `rarely played in ${w.pg} decks`;
    case 'offtribe':
      return `off-tribe for ${w.pg}`;
    case 'rank':
      return 'rarely played in Commander';
    case 'role':
      return `${w.n} ${role[w.role]} already (guide ~${w.t})`;
    case 'mv':
      return `${w.mv} mana — top-heavy curve`;
    case 'weakest':
      return w.pos === 1
        ? `weakest ${role[w.role]} of your ${w.of}`
        : `second-weakest ${role[w.role]}`;
    case 'pricey':
      return `pricey for ${role[w.role]} (${w.mv} vs ~${w.avg})`;
    case 'cast':
      return `${w.p}× {${w.col}} — hard to cast`;
    case 'winmore':
      return 'win-more';
    case 'narrow':
      return 'situational';
    case 'antisyn':
      return `low synergy with ${lead}`;
    case 'land':
      return w.mine ? `${w.n} lands (your goal ${w.t})` : `${w.n} lands (guide ~${w.t})`;
  }
  return '';
}

/* The long story behind one reason, for the explanation popup. */
function cutWhyLong(w, d) {
  const lead = d.admiral ? String(d.admiral.name).split(',')[0] : 'your leader';
  const role = { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipe: 'board wipes' };
  const col = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[w.col] || w.col;
  const pct = (p) => Math.round(p * 100) + '%';
  switch (w.k) {
    case 'rate':
      return w.pg
        ? `${lead} decks built around ${w.pg} run it only ${pct(w.p)} of the time. Players on this plan usually pick something else for the slot.`
        : `On EDHREC only ${pct(w.p)} of ${lead} decks run this card. People building this commander usually find something better for the slot.`;
    case 'absent':
      return `It isn't on ${lead}'s EDHREC page: hardly anyone plays it with this commander. Not proof it's bad, but it sits outside the known plan.`;
    case 'offtheme':
      return `It (almost) never shows up on ${lead}'s ${w.pg} page. For the theme you picked it adds little.`;
    case 'offtribe':
      return `A creature that isn't ${w.pg} and doesn't help the tribe. In a kindred deck every creature slot feeds the lords and tribal payoffs; this one doesn't count.`;
    case 'weakest':
      return `Of your ${w.of} ${role[w.role]} cards this one scores ${w.pos === 1 ? 'lowest' : 'second-lowest'} on how often it is played. ${w.best} does the same job and is picked far more often. The weakest in a role is the easiest cut: the role stays filled.`;
    case 'pricey':
      return `It costs ${w.mv} mana while your other ${role[w.role]} cards average ${w.avg}. The same job, but later in the game.`;
    case 'cast':
      return `It asks for ${w.p}× ${col} mana ({${w.col}}), and only ${w.src} of your ${w.lands} lands make ${col}. Good odds you can't cast it when you want to.`;
    case 'winmore':
      return `Win-more: it mostly matters when you're already ahead (pumping a big board, extra combat, double damage). When you're behind it barely helps you back.`;
    case 'narrow':
      return `Situational: it only hits one kind of target. When the table has none, it's a dead card in hand.`;
    case 'antisyn':
      return `EDHREC gives it negative synergy with ${lead} (${Math.round(w.s * 100)}%): it shows up more in other decks than in this kind.`;
    case 'role':
      return `You already run ${w.n} ${role[w.role]} cards; a common guide is ~${w.t}. One fewer costs you little.`;
    case 'mv':
      return `${w.mv} mana is heavy. Too many expensive cards slow your early turns; with too many cards in the deck, the top of the curve is a natural place to trim.`;
    case 'land':
      return w.mine
        ? `Your deck has ${w.n} lands and your goal is ${w.t}. A basic land is the cheapest cut there is.`
        : `Your deck has ${w.n} lands; the common guide is ~${w.t}. A basic land is the cheapest cut there is.`;
    case 'rank':
      return 'Across all of Commander it is rarely played (EDHREC rank).';
  }
  return '';
}

/* Tap the short reason under a tile: the full argument in a popup. */
function openCutWhy(d, x, i, total) {
  document.getElementById('cutWhyOverlay')?.remove();
  const el = document.createElement('div');
  el.id = 'cutWhyOverlay';
  const items =
    (x.ai ? `<li><b>\u2726 ${'What the AI says'}</b><span>${escapeHtml(x.ai)}</span></li>` : '') +
      x.why
        .map(
          (w) =>
            `<li><b>${escapeHtml(cutWhyText(w, d))}</b><span>${escapeHtml(cutWhyLong(w, d))}</span></li>`,
        )
        .join('') ||
    `<li><span>${'No single weakness — it is simply the least essential of what is there.'}</span></li>`;
  el.innerHTML = /* HTML */ ` <div class="appoint-sheet" style="max-width:460px;">
    <div class="appoint-head">
      <span>${escapeHtml(x.card.name)}</span
      ><button class="icon-btn" id="cwClose">${ICONS.close || '✕'}</button>
    </div>
    <p class="hint" style="margin:0 0 8px;">${`Cut candidate ${i + 1} of ${total}. Why:`}</p>
    <ul class="cut-why-list">
      ${items}
    </ul>
    <p class="hint" style="margin:10px 0 0;">${'A guide, not a rule — you know your deck best.'}</p>
  </div>`;
  document.body.appendChild(el);
  pushOverlay('cutWhy', () => {
    document.getElementById('cutWhyOverlay')?.remove();
  });
  el.addEventListener('click', (e) => {
    if (!e.target.closest('.appoint-sheet')) closeTopOverlay();
  });
  document.getElementById('cwClose').addEventListener('click', () => closeTopOverlay());
}

async function deckAiAsk(payload) {
  const ctl = 'AbortController' in window ? new AbortController() : null;
  const t = setTimeout(() => {
    try {
      ctl && ctl.abort();
    } catch (e) {}
  }, 58000);
  try {
    const res = await fetch('/api/deckai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctl ? ctl.signal : undefined,
    });
    let txt = '',
      j = null;
    try {
      txt = await res.text();
      j = JSON.parse(txt);
    } catch (e) {
      j = null;
    }
    // 1.17: not an answer of ours -- say what the server sent (404: the
    // function is not on the site; 502/504: it crashed or ran out of time)
    if (!j || typeof j !== 'object')
      return {
        ok: false,
        error: 'down',
        http: res.status,
        raw: String(txt || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 90),
      };
    if (!j.v && !j.ok) j.old = true; // an older deckai.mjs on the site
    return j;
  } catch (e) {
    return { ok: false, error: 'offline' };
  } finally {
    clearTimeout(t);
  }
}

function deckAiLeftGet() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_PREFIX + 'deckAiLeft') || 'null');
    if (o && o.d === new Date().toISOString().slice(0, 10) && typeof o.n === 'number') return o.n;
  } catch (e) {}
  return null;
}

function deckAiLeftSet(n) {
  try {
    localStorage.setItem(
      LS_PREFIX + 'deckAiLeft',
      JSON.stringify({ d: new Date().toISOString().slice(0, 10), n }),
    );
  } catch (e) {}
}

/* Which AI answered: the strong model, or the smaller reserve one when the
   strong one was busy (the reserve reasons less deeply). */
/* A model id as people read it: gemini-2.5-pro -> Gemini 2.5 Pro. */
function deckAiModelName(m) {
  m = String(m || '');
  if (/^gemini/i.test(m))
    return m
      .replace(/^gemini-/i, 'Gemini ')
      .replace(/-/g, ' ')
      .replace(
        /\b(pro|flash|lite|preview|latest|argon)\b/gi,
        (w) => w.charAt(0).toUpperCase() + w.slice(1),
      );
  if (/gpt-oss/.test(m)) return 'GPT-OSS 120B';
  if (/llama/i.test(m)) return 'Llama 3.3';
  return m;
}

function deckAiModelHtml(res) {
  const m = String((res && res.model) || '');
  if (!m) return '';
  const reserve = /llama/i.test(m);
  return /* HTML */ `<span class="ai-via"
    >${reserve ? 'reserve model (Llama 3.3) \u2014 the strong AI was busy' : escapeHtml(deckAiModelName(m))}${res.cached ? ' \u00b7 earlier answer' : ''}</span
  >`;
}

function deckAiErrText(res) {
  const e = res && res.error;
  // what each model said, small, so a screenshot tells what went wrong
  const tried = (res && Array.isArray(res.tried) ? res.tried : [])
    .map((t) => `${deckAiModelName(t.model)}: ${t.why}`)
    .join(' \u00b7 ');
  let tail = tried ? `\n(${tried})` : '';
  if (!tried && res && res.http)
    tail = `\n(server: http ${res.http}${res.http === 404 ? ' \u2014 the AI function is not on the site' : ''}${res.raw ? ': ' + res.raw : ''})`;
  else if (!tried && res && res.old) tail = '\n(server: an older version of the AI function)';
  if (res && Array.isArray(res.keys) && !res.keys.includes('gemini'))
    tail += '\n(server: no Gemini key found)';
  if (e === 'quota')
    return 'The AI is busy: the free per-minute limit is used up. Try again in a minute.' + tail;
  if (e === 'shape') return 'The AI gave an answer the app could not read. Try again.' + tail;
  if (e === 'down' && tried)
    return 'The AI can\u2019t be reached right now. Try again in a while.' + tail;
  if (e === 'limit')
    return `Your ${res.limit || ''} AI analyses for today are used up. More tomorrow.`;
  if (e === 'offline') return 'No connection. The AI needs the internet.';
  if (e === 'nokey') return 'The AI is not set up yet.';
  return 'The AI can’t be reached right now. Try again in a while.' + tail;
}

/* A card's rules text for the AI: every face, short. */
function deckAiOracle(c, max) {
  const faces =
    c && Array.isArray(c.card_faces) && c.card_faces.length && !c.oracle_text
      ? c.card_faces
      : [c || {}];
  const t = faces
    .map((f) => String(f.oracle_text || ''))
    .filter(Boolean)
    .join(' // ')
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
}

/* A card's mana cost, the front face for split and double-faced cards. */
function deckAiCost(c) {
  const f =
    c && !c.mana_cost && Array.isArray(c.card_faces) && c.card_faces[0] ? c.card_faces[0] : c || {};
  return String(f.mana_cost || '').split(' // ')[0];
}

const DECKAI_FORMATS = ['commander', 'paupercommander', 'predh', 'duel'];

function deckAiFits(d) {
  return !!d && !!d.admiral && DECKAI_FORMATS.includes(deckFormat(d));
}

/* The deck's numbers, the same for both questions. */
function deckAiDeckInfo(d) {
  const ctx = inspCutCtx(d);
  const kind = 'cmdr';
  const tpl = Object.assign({}, CUT_TEMPLATE[kind]);
  if (tpl.land && typeof d.landGoal === 'number') tpl.land = d.landGoal;
  const roles = { ramp: 0, draw: 0, removal: 0, wipe: 0 },
    curve = [0, 0, 0, 0, 0, 0, 0, 0],
    pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const lands = [];
  let mvSum = 0,
    nonland = 0;
  d.cards.forEach((c) => {
    const r = cutRoles(c);
    if (r.has('land')) {
      lands.push(c);
      return;
    }
    r.forEach((k) => {
      if (roles[k] !== undefined) roles[k]++;
    });
    const mv = Math.max(0, Math.floor(Number(c.cmc) || 0));
    curve[Math.min(7, mv)]++;
    mvSum += mv;
    nonland++;
  });
  d.cards.concat(deckLeaders(d)).forEach((c) => {
    if (cutRoles(c).has('land')) return;
    const p = cutManaPips(c);
    for (const k in p) pips[k] += p[k];
  });
  for (const k in pips) pips[k] = Math.round(pips[k]);
  return {
    ctx,
    lands,
    info: {
      format: deckFormat(d),
      leaders: deckLeaders(d).map((c) => ({
        name: c.name,
        type: c.type_line || '',
        oracle: deckAiOracle(c, 900),
        cost: deckAiCost(c),
        colors: (Array.isArray(c.colors) && c.colors.length
          ? c.colors
          : (c.card_faces && c.card_faces[0] && c.card_faces[0].colors) || c.color_identity || []
        ).join(''),
      })),
      name: String(d.name || '').slice(0, 60),
      theme: ctx.theme || '',
      kindred: ctx.kin || '',
      size: d.cards.length + deckLeaders(d).length,
      limit: deckTotal(d),
      over: deckCutOver(d),
      landCount: lands.length,
      landGoal: typeof d.landGoal === 'number' ? d.landGoal : 0,
      roles,
      guide: tpl,
      curve,
      avgMv: nonland ? Math.round((mvSum / nonland) * 100) / 100 : 0,
      pips,
      sources: cutColorSources(lands),
      colors: deckColorIdentity(d).join(''),
    },
  };
}

/* Names in a short list: basics once, with their count. */
function deckAiNameList(cards) {
  const n = new Map();
  cards.forEach((c) => {
    const k = String(c.name);
    n.set(k, (n.get(k) || 0) + 1);
  });
  return Array.from(n.entries()).map(([k, v]) => (v > 1 ? `${k} ×${v}` : k));
}

/* Cuts: every card that may go, with its rules text and how often decks
   with this leader run it -- the AI weighs synergy above that number. */
function deckAiCutsPayload(d, plan) {
  const base = deckAiDeckInfo(d);
  const ctx = base.ctx;
  const qS =
    ctx.selStats && Object.keys(ctx.selStats).length > 20
      ? ctx.selStats
      : ctx.stats && Object.keys(ctx.stats).length > 20
        ? ctx.stats
        : null;
  const look = (c) =>
    qS
      ? qS[String(c.name).toLowerCase()] || qS[String(c.name).split(' // ')[0].toLowerCase()]
      : null;
  const landsOver = plan.tpl.land && plan.counts.land > plan.tpl.land;
  const rank = new Map(plan.list.map((x, i) => [x.card.name, i]));
  const CAP = 100; // 1.16: Gemini reads the whole deck; the server trims for the reserve
  const seen = new Set(),
    cands = [],
    others = [];
  d.cards.forEach((c) => {
    if (!c || !c.name) return;
    const isLand = cutRoles(c).has('land');
    if (isLand && !landsOver) {
      others.push(c);
      return;
    }
    if (seen.has(c.name)) return;
    seen.add(c.name);
    if (!rank.has(c.name) || rank.get(c.name) >= CAP) {
      others.push(c);
      return;
    }
    const st = look(c);
    const nBasic = isLand ? d.cards.filter((x) => x.name === c.name).length : 0;
    cands.push({
      name: c.name,
      type: String(c.type_line || ''),
      mv: Number(c.cmc) || 0,
      cost: deckAiCost(c),
      oracle: deckAiOracle(c, 400),
      note: [
        st
          ? `played ${Math.round(st[0] * 100)}%${st[1] ? `, synergy ${st[1] > 0 ? '+' : ''}${Math.round(st[1] * 100)}%` : ''}`
          : '',
        nBasic > 1 ? `\u00d7${nBasic} in deck` : '',
      ]
        .filter(Boolean)
        .join(', '),
      _r: rank.get(c.name),
    });
  });
  cands.sort((a, b) => a._r - b._r);
  cands.forEach((k) => {
    delete k._r;
  });
  return {
    kind: 'cuts',
    lang: 'en',
    device: judgeDevice(),
    want: Math.min(15, plan.over + 3),
    deck: Object.assign(base.info, { others: deckAiNameList(others) }),
    cands,
  };
}

/* The AI's cuts as Cuts rows: its picks first (its own reason on top),
   then the app's own list for the rest. */
function deckAiCutRows(d, plan, res) {
  const used = new Set(),
    ai = [];
  (res.cuts || []).forEach((p) => {
    const hit = plan.list.find((x) => x.card.name === p.name);
    const card = hit ? hit.card : d.cards.find((c) => c.name === p.name);
    if (!card || used.has(card.name)) return;
    used.add(card.name);
    ai.push({ card, score: hit ? hit.score : 0, why: hit ? hit.why : [], ai: p.why || '' });
  });
  return { ai, list: ai.concat(plan.list.filter((x) => !used.has(x.card.name))) };
}

function cutsAiStoreGet(d) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PREFIX + 'cutsAI') || '{}');
    const e = all[d.id] && all[d.id][deckAiCutKey(d)];
    if (!e || !e.res || Date.now() - (e.t || 0) > 14 * 864e5) return null;
    // only while the deck has had cards taken out, none put in
    const had = new Set(e.names || []);
    if (!d.cards.every((c) => had.has(c.name))) return null;
    return e.res;
  } catch (e) {
    return null;
  }
}

function cutsAiStoreSet(d, key, res) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PREFIX + 'cutsAI') || '{}');
    const mine = all[d.id] || {};
    mine[key] = { t: Date.now(), names: Array.from(new Set(d.cards.map((c) => c.name))), res };
    // keep the newest 3 choices per deck, and 20 decks
    const ks = Object.keys(mine).sort((a, b) => (mine[b].t || 0) - (mine[a].t || 0));
    ks.slice(3).forEach((k) => {
      delete mine[k];
    });
    all[d.id] = mine;
    const ids = Object.keys(all).sort(
      (a, b) =>
        Math.max(...Object.values(all[b]).map((x) => x.t || 0)) -
        Math.max(...Object.values(all[a]).map((x) => x.t || 0)),
    );
    ids.slice(20).forEach((k) => {
      delete all[k];
    });
    localStorage.setItem(LS_PREFIX + 'cutsAI', JSON.stringify(all));
  } catch (e) {}
}

function deckAiCutKey(d) {
  const ctx = inspCutCtx(d);
  return [
    inspLeaderKey(d),
    ctx.theme,
    ctx.kin,
    typeof d.landGoal === 'number' ? d.landGoal : '',
  ].join('|');
}

async function askCutsAi(d, plan) {
  state._cutsAI = state._cutsAI || {};
  const key = deckAiCutKey(d);
  const cur = state._cutsAI[d.id];
  if (cur && cur.busy) return;
  state._cutsAI[d.id] = { key, busy: true };
  paintCuts(d);
  const res = await deckAiAsk(deckAiCutsPayload(d, plan));
  if (res && res.ok && typeof res.left === 'number') deckAiLeftSet(res.left);
  if (res && res.error === 'limit') deckAiLeftSet(0);
  state._cutsAI[d.id] =
    res && res.ok && res.kind === 'cuts' ? { key, res } : { key, err: deckAiErrText(res) };
  if (res && res.ok && res.kind === 'cuts') cutsAiStoreSet(d, key, res);
  if (
    state.screen === 'inspiration' &&
    document.getElementById('cutSlot') &&
    getDeck(state.activeDeckId) === d
  )
    paintCuts(d);
}

/* The AI row at the foot of the Cuts settings: the button, or the AI's
   reading of the deck once it has answered. */
function cutsAiRowHtml(d) {
  if (!deckAiFits(d)) return '';

  const a = (state._cutsAI || {})[d.id];
  const left = deckAiLeftGet();
  const leftTxt = left == null ? '' : ` · ${left} left today`;
  if (
    (a && a.busy) ||
    (!a &&
      state._cutsOpenFor === d.id &&
      !(state._cutsAIOff || {})[d.id] &&
      deckAiLeftGet() !== 0 &&
      navigator.onLine !== false)
  )
    return /* HTML */ `<div class="ai-row busy">
      <span class="ai-spin" aria-hidden="true"></span
      ><span class="ai-txt">${'The AI is reading your deck… (up to half a minute)'}</span>
    </div>`;
  if (a && a.res)
    return /* HTML */ `<div class="ai-row done">
      <span class="ai-badge" aria-hidden="true">✦ AI</span
      ><span class="ai-txt"
        >${escapeHtml(a.res.plan || 'Picked on how the cards work with your leader and plan.')}${deckAiModelHtml(a.res)}</span
      ><button type="button" class="cut-reset" id="cutAiOff">${'Own list'}</button>
    </div>`;
  return `${a && a.err ? `<div class="ai-err">${escapeHtml(a.err)}</div>` : ''}<button type="button" class="ghost-btn ai-btn" id="cutAiBtn"><span class="ai-star" aria-hidden="true">✦</span>${'Ask the AI for cuts'}</button><div class="ai-hint">${'Reads how your cards work together'}${leftTxt}</div>`;
}

/* The Cuts row: the top of the Inspiration menus, right above Theme, in
   the same button as Theme and Kindred -- so those two stay in view to pick
   from while the cuts are open. Closed by default; it opens UPWARD
   (bottom-up): settings right above the button, then the list with the
   strongest cut lowest, More at the top. */
function cutsBlockHtml(d, plan) {
  const open = state._cutsOpenFor === d.id;
  const btn = `<button type="button" class="cselect-btn cut-toggle" id="cutToggle" aria-expanded="${open}"><span class="cs-label">Cuts — ${plan.over} ${'too many'}</span><span class="cs-car">${open ? '▴' : '▾'}</span></button>`;
  if (!open) return /* HTML */ `<div class="cut-block">${btn}</div>`;
  const n = plan.aiWait
    ? 0
    : Math.min(
        plan.list.length,
        (plan.aiOnly ? Math.max(1, plan.aiN || 0) : Math.max(plan.over + 4, 6)) +
          (state._cutsMore || 0),
      );
  const rows = plan.list.slice(0, n);
  const lead = d.admiral ? String(d.admiral.name).split(',')[0] : '';
  const own =
    !plan.aiOnly && !plan.aiWait && deckAiFits(d)
      ? `<div class="cut-basis"><b>${'The app\u2019s own estimate (no AI)'}</b></div>`
      : '';
  const basis =
    own +
    `<div class="cut-basis">${'Based on'} ${escapeHtml(lead)}${plan.pg ? ' · ' + escapeHtml(plan.pg) : ''}${plan.pg ? '' : ' — pick a Theme or Kindred below'}</div>`;
  const lands = plan.tpl.land
    ? `<div class="cut-lands"><span class="cut-lands-l">${'Land count'}</span>
      <button type="button" class="ghost-btn cut-step" data-cutland="-1" aria-label="−">−</button>
      <b class="cut-lands-n">${plan.tpl.land}</b>
      <button type="button" class="ghost-btn cut-step" data-cutland="1" aria-label="+">+</button>
      <span class="cut-lands-h">${'now'} ${plan.counts.land}${typeof d.landGoal === 'number' ? ` · <button type="button" class="cut-reset" data-cutland="0">${'default'}</button>` : ''}</span></div>`
    : '';
  // Tiles, two across, bottom-up (wrap-reverse): the strongest cut at the
  // foot, on the left. Under each card: the short reason (tap = the full
  // argument), then Remove one over To maybeboard -- the card sheet's buttons.
  const list = rows.length
    ? `<div class="cut-grid">${rows
        .map(
          (x, i) => `<div class="cut-tile" data-cut="${i}" data-name="${escapeHtml(x.card.name)}">
      <img src="${cardImageMed(x.card) || ''}" alt="${escapeHtml(x.card.name)}" loading="lazy" data-cutimg="${i}">
      ${x.ai != null ? '<span class="ai-badge cut-ai-tag" aria-hidden="true">\u2726 AI</span>' : ''}<button type="button" class="cut-reason" data-cutwhy="${i}"><span class="cut-reason-t">${
        x.ai
          ? escapeHtml(x.ai)
          : x.why
              .slice(0, 2)
              .map((w) => escapeHtml(cutWhyText(w, d)))
              .filter(Boolean)
              .join(' · ') || 'least essential in this deck'
      }</span><span class="cut-reason-i" aria-hidden="true">›</span></button>
      <button type="button" class="ghost-btn cut-act" data-cutdel="${i}" style="color:var(--danger);border-color:var(--danger);"><span class="ib">${ICONS.removeOne}</span>${trS('Remove one')}</button>
      <button type="button" class="ghost-btn cut-act" data-cutmaybe="${i}"><span class="ib">${ICONS.maybe}</span>${trS('To maybeboard')}</button>
    </div>`,
        )
        .join('')}</div>`
    : '';
  const more =
    plan.list.length > n
      ? `<button type="button" class="ghost-btn cut-more">${trS('More')}</button>`
      : '';
  // bottom-up (column-reverse): the AI row at the settings' foot, right above the button
  const ai = cutsAiRowHtml(d);
  return /* HTML */ `<div class="cut-block">
    ${btn}
    <div class="cut-body">
      <div class="cut-set">${ai ? `<div class="cut-ai">${ai}</div>` : ''}${lands}${basis}</div>
      ${list}${more}
    </div>
  </div>`;
}

function paintCuts(d) {
  const slot = document.getElementById('cutSlot');
  if (!slot || !d) return;
  const ctx = inspCutCtx(d);
  const plan = deckCutPlan(d, ctx.stats, ctx);
  if (!plan || !(plan.over > 0)) {
    slot.remove();
    placeInspJump();
    return;
  }
  state._cutsAI = state._cutsAI || {};
  let aiSt = state._cutsAI[d.id];
  if (aiSt && aiSt.key !== deckAiCutKey(d) && !aiSt.busy) {
    delete state._cutsAI[d.id];
    aiSt = null;
  }
  const aiOn = deckAiFits(d) && !(state._cutsAIOff || {})[d.id];
  if (aiOn && !aiSt) {
    const kept = cutsAiStoreGet(d);
    if (kept) aiSt = state._cutsAI[d.id] = { key: deckAiCutKey(d), res: kept };
  }
  if (aiSt && aiSt.res) {
    const r = deckAiCutRows(d, plan, aiSt.res);
    plan.list = r.list;
    plan.aiN = r.ai.length;
    plan.aiOnly = true;
  }
  // 1.17: the AI is the default -- Cuts open and nothing asked yet: ask now
  // (not when today's analyses are used up: then the button stays)
  if (
    aiOn &&
    !aiSt &&
    state._cutsOpenFor === d.id &&
    deckAiLeftGet() !== 0 &&
    navigator.onLine !== false
  ) {
    setTimeout(() => {
      if (state._cutsOpenFor === d.id && !(state._cutsAI || {})[d.id]) askCutsAi(d, plan);
    }, 0);
    plan.aiWait = true;
  }
  if (aiSt && aiSt.busy) plan.aiWait = true;
  const fromFoot = pageScroller().scrollTop;
  slot.innerHTML = cutsBlockHtml(d, plan);
  wireCutsBlock(d, plan);
  pageScroller().scrollTo(0, fromFoot);
  placeInspJump();
}

function wireCutsBlock(d, plan) {
  const slot = document.getElementById('cutSlot');
  if (!slot) return;

  slot.querySelector('#cutToggle')?.addEventListener('click', () => {
    state._cutsOpenFor = state._cutsOpenFor === d.id ? null : d.id;
    paintCuts(d);
    scrollToPageFoot();
  });
  const act = (i, toMaybe) => {
    const x = plan.list[i];
    if (!x) return;
    const idx = d.cards.indexOf(x.card);
    if (idx < 0) return;
    d.cards.splice(idx, 1);
    if (toMaybe) {
      ensureMaybeboard(d).push(x.card);
      logDeckChange(d, { type: 'toMaybe', name: x.card.name, card: x.card });
    } else logDeckChange(d, { type: 'remove', name: x.card.name, card: x.card });
    scheduleSave(d);
    toast(toMaybe ? `${x.card.name} to the maybeboard.` : `${x.card.name} removed.`);
    // Fits now: the page draws again, without the Cuts row and with the
    // Theme / Kindred menus back to one at a time.
    if (deckCutOver(d) <= 0) {
      render();
      return;
    }
    if (typeof state._inspRepaint === 'function') state._inspRepaint();
    else paintCuts(d);
  };
  slot
    .querySelectorAll('[data-cutdel]')
    .forEach((b) => b.addEventListener('click', () => act(+b.dataset.cutdel, false)));
  slot
    .querySelectorAll('[data-cutmaybe]')
    .forEach((b) => b.addEventListener('click', () => act(+b.dataset.cutmaybe, true)));
  slot.querySelectorAll('[data-cutimg]').forEach((im) =>
    im.addEventListener('click', () => {
      const x = plan.list[+im.dataset.cutimg];
      if (x) openCardInfo(x.card);
    }),
  );
  slot.querySelectorAll('[data-cutwhy]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = +b.dataset.cutwhy,
        x = plan.list[i];
      if (x) openCutWhy(d, x, i, plan.list.length);
    }),
  );
  slot.querySelector('.cut-more')?.addEventListener('click', () => {
    state._cutsMore = (state._cutsMore || 0) + 8;
    paintCuts(d);
  });
  slot.querySelector('#cutAiBtn')?.addEventListener('click', () => {
    if (state._cutsAIOff) delete state._cutsAIOff[d.id];
    askCutsAi(d, plan);
  });
  slot.querySelector('#cutAiOff')?.addEventListener('click', () => {
    if (state._cutsAI) delete state._cutsAI[d.id];
    (state._cutsAIOff = state._cutsAIOff || {})[d.id] = true;
    state._cutsMore = 0;
    paintCuts(d);
  });
  slot.querySelectorAll('[data-cutland]').forEach((b) =>
    b.addEventListener('click', () => {
      const step = +b.dataset.cutland;
      if (!step) delete d.landGoal;
      else d.landGoal = Math.max(20, Math.min(50, plan.tpl.land + step));
      scheduleSave(d);
      paintCuts(d);
    }),
  );
}

function renderInspEdh(d, entry, keepScroll, partial, okSet) {
  const box = document.getElementById('inspireResults');
  if (!box) return;
  if (okSet) entry._ok = okSet;
  const pool = inspEdhFilter(d, entry.pool, entry._ok || null);
  const fromFoot = pageScroller().scrollTop;
  state._inspRepaint = () => renderInspEdh(d, entry, true, partial);
  paintCuts(d);
  if (!pool.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      ${trS('Nothing left to recommend here — every pick is already in your deck.')}
    </div>`;
    if (!keepScroll) scrollToPageFoot();
    return;
  }
  // EDHREC's own sections; bottom-up, its best ones (New Cards, High
  // Synergy, Top Cards …) end at the page FOOT where reading starts.
  const groups = edhGroupPool(pool, entry.sections || [])
    .map((g) => ({ title: trS(g.title), cards: g.cards }))
    .reverse();
  const CAP = 10;
  state._inspShown = state._inspShown || {};
  const shownOf = (g) => Math.min(g.cards.length, state._inspShown[g.title] || CAP);
  const shown = [];
  // Still streaming in: a spinner at the TOP, where the rest will appear.
  box.innerHTML =
    (partial ? `<div class="status"><div class="spinner"></div></div>` : '') +
    groups
      .map((g, i) => {
        const n = shownOf(g);
        const cards = g.cards.slice(0, n);
        shown.push(...cards);
        // Label at the section's foot (order:10), More at its top, as on the
        // recommendations page.
        return `<div class="edh-sec" data-isec="${i}"><div class="section-label" style="margin-top:14px;">${escapeHtml(g.title)}</div>${g.cards.length > n ? `<button class="ghost-btn edh-more" data-si="${i}" style="width:100%;margin:0 0 6px;">${trS('More')}</button>` : ''}<div class="sr-grid">${cards.map((c) => searchRowHtml(c, d)).join('')}</div></div>`;
      })
      .join('') +
    `<div class="edh-jump-row insp-jump"><button class="icon-btn edh-jump" id="inspJump" title="${trS('Jump to section')}">☰</button></div>`;
  bindInspJump();
  document.getElementById('inspJump')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const items = groups.map((g, i) => ({
      label: g.title,
      fn: () => {
        document
          .querySelector(`.edh-sec[data-isec="${i}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      },
    }));
    openTileMenu(e.currentTarget, items);
  });
  box.querySelectorAll('.edh-more').forEach((btn) =>
    btn.addEventListener('click', () => {
      const g = groups[+btn.dataset.si];
      if (!g) return;
      state._inspShown[g.title] = shownOf(g) + 10;
      renderInspEdh(d, entry, true, partial);
    }),
  );
  wireResultButtons(shown, d, () => renderInspEdh(d, entry, true, partial));
  // EVERY tile on the page gets its price. The list reads bottom-up, so the
  // best sections (Top Cards, Game Changers…) are LAST in `shown` -- the old
  // first-60 cut left exactly those on "…" forever. Filling prices is a
  // lookup in what is already known (no network), so no cap is needed.
  loadTilePrices(shown);
  if (keepScroll) pageScroller().scrollTo(0, fromFoot);
  else scrollToPageFoot();
}

function inspireClause(d) {
  const sel = state.inspireSel;
  const parts = [];
  // A kindred is a THEME, not a type filter: the tribe itself OR any card
  // that names the tribe (lords, payoffs, tribal lands) — so the page keeps
  // all its categories instead of collapsing into one creature list.
  if (sel.kindred) parts.push(`(t:"${sel.kindred}" or o:"${sel.kindred}")`);
  const th = BROWSE_THEMES.find((c) => c.key === sel.theme);
  if (th) parts.push(th.clause);
  parts.push(idClauseForDeck(d));
  return parts.join(' ');
}

function inspireCacheKey(d) {
  return d.id + ':' + (state.inspireSel.kindred || '-') + ':' + (state.inspireSel.theme || '-');
}

async function loadInspirationScryfall(d) {
  const box = document.getElementById('inspireResults');
  const cacheKey = inspireCacheKey(d);
  if (state.inspireCache[cacheKey]) {
    renderInspireFromCache(cacheKey, d);
    return;
  }
  box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
  const clause = inspireClause(d);
  // Fetch a larger pool than we display: when a card gets added to the deck
  // we filter it out and reveal the next one from this same pool instantly,
  // with no extra network round-trip.
  const { results, error } = await searchAndVerifyLegal(clause, 'edhrec', 100, {
    format: deckFormat(d),
  });
  if (cacheKey !== inspireCacheKey(d)) return; // selection changed mid-flight
  if (error) {
    const b = document.getElementById('inspireResults');
    if (b)
      b.innerHTML = /* HTML */ `<div class="error-note">
        Couldn't reach Scryfall. Check your connection and try again.
      </div>`;
    return;
  }
  const filtered = results.filter(
    (c) => !isBanned(c, d) && !deckLeaders(d).some((L) => L.name === c.name),
  );
  state.inspireCache[cacheKey] = filtered;
  renderInspireFromCache(cacheKey, d);
}

/* Grouping for the deck-Inspiration list, factored out so the Node battery
   can test it. Display typing happens HERE, not via primaryTypeOf: that
   helper skips Land entirely (and lowercases for its scoring callers),
   which filed every land under a lowercase "Others" at the page FOOT and
   broke the Lands pin. Titles are proper plurals; Lands pin to the very
   TOP (never the headline), the biggest section ends at the page foot. */
function inspireGroups(display) {
  const PLUR = {
    Planeswalker: 'Planeswalkers',
    Creature: 'Creatures',
    Instant: 'Instants',
    Sorcery: 'Sorceries',
    Enchantment: 'Enchantments',
    Artifact: 'Artifacts',
    Battle: 'Battles',
    Land: 'Lands',
    Other: 'Others',
  };
  const dispType = (c) => {
    const tl = frontFace(c).type_line || '';
    for (const t of [
      'Planeswalker',
      'Creature',
      'Instant',
      'Sorcery',
      'Enchantment',
      'Artifact',
      'Battle',
      'Land',
    ]) {
      if (tl.includes(t)) return t;
    }
    return 'Other';
  };
  const byType = new Map();
  display.forEach((c) => {
    const t = dispType(c);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(c);
  });
  let groups = Array.from(byType.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([t, cards]) => ({ title: PLUR[t], cards }));
  // Bottom-up: the biggest type ends at the page FOOT where reading starts;
  // Lands pin to the very TOP -- they are never the headline.
  const landsG = groups.filter((g) => g.title === 'Lands');
  groups = groups.filter((g) => g.title !== 'Lands');
  groups.reverse();
  return landsG.concat(groups);
}

function renderInspireFromCache(cacheKey, d, keepScroll) {
  const box = document.getElementById('inspireResults');
  const pool = state.inspireCache[cacheKey] || [];
  const inDeck = new Set(
    d.cards.map((c) => c.name).concat((d.maybeboard || []).map((c) => c.name)),
  );
  const remaining = pool.filter((c) => !inDeck.has(c.name));
  // EDHREC popularity IS the order — the pool arrived sorted that way;
  // the old colour re-sort buried the most-played picks mid-list.
  const display = remaining.slice(0, 60);
  // Running low on unused recommendations for this category? Quietly fetch a
  // bigger pool in the background so adding cards keeps surfacing new ones
  // instead of just shrinking the list.
  if (remaining.length < 15 && !(state.inspireRefilling && state.inspireRefilling[cacheKey])) {
    refillInspireCache(cacheKey, d);
  }
  if (!display.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      Nothing left to recommend here — you've already added the top picks for this category. Try
      another one.
    </div>`;
    if (!keepScroll) scrollToPageFoot();
    return;
  }
  const edhNote = `<div style="text-align:center;margin:10px 0 0;"><p class="hint" style="margin:0 0 6px;">${trS("EDHREC play data didn't load — showing the app's own synergy picks.")}</p><button class="ghost-btn" id="inspRetryEdh" style="width:100%;">↻ ${trS('Try EDHREC again')}</button></div>`;
  // Categories like Recommendations: grouped by card type, biggest section
  // at the FOOT (bottom-up), golden stripe under each name, ☰ to jump.
  const groups = inspireGroups(display);
  box.innerHTML =
    groups
      .map(
        (g, i) =>
          `<div class="edh-sec" data-isec="${i}"><div class="section-label" style="margin-top:14px;border-bottom:2px solid var(--line);">${escapeHtml(g.title)}</div><div class="sr-grid">${g.cards.map((c) => searchRowHtml(c, d)).join('')}</div></div>`,
      )
      .join('') +
    `<div class="edh-jump-row insp-jump"><button class="icon-btn edh-jump" id="inspJump" title="${trS('Jump to section')}">☰</button></div>` +
    edhNote;
  bindInspJump();
  document.getElementById('inspJump')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTileMenu(
      e.currentTarget,
      groups.map((g, i) => ({
        label: g.title,
        fn: () => {
          document
            .querySelector(`.edh-sec[data-isec="${i}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        },
      })),
    );
  });
  document.getElementById('inspRetryEdh')?.addEventListener('click', () => {
    loadInspiration(d);
  });
  wireResultButtons(display, d, () => renderInspireFromCache(cacheKey, d, true));
  loadTilePrices(display); // every tile, not just the first 36
  if (!keepScroll) scrollToPageFoot();
}

async function refillInspireCache(cacheKey, d) {
  if (!state.inspireRefilling) state.inspireRefilling = {};
  state.inspireRefilling[cacheKey] = true;
  try {
    const clause = inspireClause(d);
    const { results, error } = await searchAndVerifyLegal(clause, 'edhrec', 180, {
      format: deckFormat(d),
    });
    if (!error) {
      const filtered = results.filter(
        (c) => !isBanned(c, d) && !deckLeaders(d).some((L) => L.name === c.name),
      );
      state.inspireCache[cacheKey] = filtered;
      if (
        state.screen === 'inspiration' &&
        state.inspireDeckId === d.id &&
        cacheKey === inspireCacheKey(d)
      ) {
        renderInspireFromCache(cacheKey, d);
      }
    }
  } finally {
    state.inspireRefilling[cacheKey] = false;
  }
}

const COLOR_COUNTS = [
  { key: '', label: 'Any number of colors', clause: '' },
  { key: '1', label: 'Monocolored', clause: 'c=1' },
  { key: '2', label: '2 colors', clause: 'c=2' },
  { key: '3', label: '3 colors', clause: 'c=3' },
  { key: '45', label: '4 & 5 colors', clause: 'c>=4' },
];
