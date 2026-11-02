// pages / inspiration / browse

/* A 60-card deck's own Inspiration: the meta decks of its format that share
   the most cards with it -- what it is closest to, and what those lists
   play that it does not. */
function deckMetaPageHtml(d) {
  return /* HTML */ `<main>
    <p class="hint">
      ${trS('Meta decks closest to')} <strong>${escapeHtml(d.name)}</strong> —
      ${fmtLabelOf(deckFormat(d))}.
    </p>
    <div id="inspireResults"></div>
  </main>`;
}

async function loadDeckMeta(d) {
  const box = document.getElementById('inspireResults');
  if (!box) return;
  const fmt = deckFormat(d);
  if (!metaFormat(fmt))
    box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
  await loadMetaData();
  const live = document.getElementById('inspireResults');
  if (!live || state.screen !== 'inspiration') return;
  const F = metaFormat(fmt);
  if (!F) {
    live.innerHTML = /* HTML */ `<div class="empty-note">
      ${trS('The metagame for this format arrives with the weekly update.')}
    </div>`;
    return;
  }
  const mine = new Set((d.cards || []).concat(ensureMaybeboard(d)).map((c) => c.name));
  const scored = F.archetypes
    .map((a, i) => {
      const theirs = new Set((a.main || []).concat(a.side || []).map(([, n]) => n));
      let shared = 0;
      theirs.forEach((n) => {
        if (mine.has(n)) shared++;
      });
      return { a, i, shared, total: theirs.size };
    })
    .sort((x, y) => y.shared - x.shared || y.a.n - x.a.n);
  live.innerHTML = /* HTML */ `<div class="sr-grid">
    ${scored.map((x) => metaTileHtml(x.a, x.i, `${x.shared}/${x.total} ${trS('cards in common')}`)).join('')}
  </div>`;
  live.querySelectorAll('.meta-tile').forEach((t) =>
    t.addEventListener('click', () => {
      const a = F.archetypes[+t.dataset.meta];
      if (a) openMetaDeck(fmt, a);
    }),
  );
  hydrateMetaArt(live);
  scrollToPageFoot();
}

function browseFilterButtonHtml() {
  return /* HTML */ `<button
    type="button"
    class="ghost-btn search-tool"
    id="bsChev"
    aria-label="Advanced inspiration filters"
    title="${trS('Advanced filters')}"
    aria-haspopup="dialog"
    aria-expanded="${state.bsAdvOpen}"
  >
    ${ICONS.filter}
  </button>`;
}

function wireBrowseFilters() {
  document.getElementById('bsChev')?.addEventListener('click', () => openAdvancedSearch('browse'));
  document.querySelectorAll('#advancedSearchBody [data-ifwin]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.ifwin === _inspFeedWin) return;
      _inspCancelRetry();
      _inspRetryN = 0;
      sfDropQueuedFor('browse');
      _inspFeedWin = button.dataset.ifwin;
      render();
    }),
  );
  if (state.bsAdvOpen) wireAdvancedPanel();
}

function inspirationPeriodHtml() {
  const nl = appLang() === 'nl';
  return /* HTML */ `<div class="adv-row inspiration-period">
    <label id="inspirationPeriodLabel">${nl ? 'Periode' : 'Time period'}</label>
    <div class="if-winrow" role="group" aria-labelledby="inspirationPeriodLabel">
      ${['week', 'month', 'year'].map((win) => `<button type="button" class="ghost-btn if-win${win === _inspFeedWin ? ' active' : ''}" data-ifwin="${win}" aria-pressed="${win === _inspFeedWin}">${win === 'week' ? 'Week' : win === 'month' ? (nl ? 'Maand' : 'Month') : nl ? 'Jaar' : 'Year'}</button>`).join('')}
    </div>
  </div>`;
}

function browseFiltersHtml() {
  const sel = state.browseSel;
  const combos = COLOR_COMBOS[sel.count] || null;
  const fmt = browseFmt();
  return /* HTML */ `<div class="browse-selects">
    <div class="bs-row">
      ${cselectHtml(
        'bsFmt',
        FMT_ORDER.map((f) => ({
          v: f,
          l: fmtFolderGlyph(f, 14) + ' ' + fmtLabelOf(f),
          art: FMT_ICON_CARDS[f]
            ? 'nm|' + FMT_ICON_CARDS[f]
            : 'sf|' + artFmtParam(f) + '|' + leaderArtClause(f),
        })),
        state.browseFormat || 'commander',
        'Format',
        { tiles: true },
      )}
    </div>
    ${
      browseIsMeta()
        ? `<div class="bs-row">${cselectHtml('bsStyle', metaStyleOptions(fmt), sel.style || '', trS('Every archetype'), { tiles: true })}</div>`
        : `
      ${inspirationPeriodHtml()}
      <div class="bs-row">${cselectHtml(
        'bsCount',
        [
          {
            v: '',
            l:
              fmtFolderGlyph(browseFmt(), 14) +
              ' ' +
              leaderNoun(browseFmt(), true) +
              ' — any colors',
            gen: manaPentagonSvg(20),
          },
        ].concat(
          COLOR_COUNTS.filter((c) => c.key).map((c) => ({
            v: c.key,
            l: c.label,
            art: bsArtSf(c.clause),
          })),
        ),
        sel.count,
        fmtFolderGlyph(browseFmt(), 14) + ' ' + leaderNoun(browseFmt(), true) + ' — any colors',
        { tiles: true },
      )}</div>
      ${
        combos
          ? `<div class="bs-row">${cselectHtml(
              'bsCombo',
              [{ v: '', l: 'Any combination', gen: manaPentagonSvg(20) }].concat(
                sortCombosByPlay(combos).map((c) => ({
                  v: c.key,
                  l: c.label,
                  icons: manaRowSvg(c.key, 18),
                  art: bsArtSf(c.key === 'c' ? 'id=c' : 'id=' + c.key),
                })),
              ),
              sel.combo,
              'Colors — any combination',
              { tiles: true },
            )}</div>`
          : ''
      }
      ${sel.tribe ? '' : `<div class="bs-row">${cselectHtml('bsTheme', [{ v: '', l: 'Theme — none', gen: '📜' }].concat(browseThemeOptions().map((o) => Object.assign({}, o, { art: bsThemeArt(o.v) }))), sel.theme, 'Theme — none', { search: true, tiles: true })}</div>`}
      ${sel.theme ? '' : `<div class="bs-row">${cselectHtml('bsTribe', [{ v: '', l: 'Kindred — none', gen: '🐾' }].concat(browseKindredOptions().map((t) => ({ v: t.slug, l: t.label, art: bsArtEd(t.slug) }))), sel.tribe || '', 'Kindred — none', { search: true, tiles: true })}</div>`}`
    }
  </div>`;
}

function browsePageHtml() {
  if (browseIsMeta()) return metaBrowseHtml();
  const swd = state.switchSeat ? getDeck(state.switchSeat) : null;
  return /* HTML */ ` <main class="inspiration-page">
    ${swd ? `<div class="panel-card" style="margin-bottom:10px;border-color:var(--brass);"><div class="panel-h">${modeGlyph()} Switching ${fmtName(swd)}</div><p class="hint" style="margin:4px 0 0;">Tap any leader below to make it the new ${fmtName(swd)} of <strong style="color:var(--head-ink);">${escapeHtml(swd.name)}</strong> — the current one returns to the deck${swd.partner ? ', and a still-compatible second seat stays' : ''}.</p></div>` : ''}
    <div class="searchbar page-searchbar sticky-searchbar">
      <input
        id="bsName"
        enterkeyhint="search"
        placeholder="${trS('Search by card name')}"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        value="${escapeHtml(state.browseNameQ || '')}"
      />
      ${browseFilterButtonHtml()}
    </div>
    <div id="bsAdvSlot">${state.bsAdvOpen ? advancedSearchScreenHtml() : ''}</div>
    <div class="browse-hero" id="inspFeed"></div>
    <div id="bsNameResults"></div>
    <div id="browseResults"></div>
  </main>`;
}

/* Art tap from the leader name search: pairable leaders first get the
   second-seat sheet — pick a legal pairing, or Continue without one to sail
   standalone — then land on the recommendations page (solo or as a pair). */

const _inspFeed = { data: {} };

let _inspFeedWin = 'week';

const INSP_FEED_LABELS = {
  commander: 'Top Commanders',
  paupercommander: 'Top Pauper Commanders',
  predh: 'Top PreDH Commanders',
  duel: 'Top Duel Commanders',
};

const INSP_WIN_LABELS = {
  week: 'This week',
  month: 'This month',
  year: 'This year',
  all: 'All time',
  // Said plainly, because it answers a different question than the others:
  // most-played CARD, not most-played commander.
  popular: 'Most played overall',
};

async function _inspFeedWinNames(win) {
  try {
    const page = await edhrecFetchJson(`/pages/commanders/${win}.json`);
    const secs = edhrecSectionsFrom(page);
    const names = ((secs[0] && secs[0].names) || []).slice(0, 60);
    return names.length ? names : null;
  } catch (e) {
    return null;
  }
}

async function _inspFeedFetch(f, win, bg) {
  const q =
    f === 'paupercommander'
      ? 't:creature r:uncommon'
      : f === 'duel'
        ? 'is:duelcommander'
        : 'is:commander';
  const opts = { format: f === 'paupercommander' ? 'any' : f, bg: !!bg };
  const winNames = await _inspFeedWinNames(win);
  const alias = (map, c) => {
    if (!map.has(c.name)) map.set(c.name, c);
    const cut = c.name.indexOf(' // ');
    if (cut > 0 && !map.has(c.name.slice(0, cut))) map.set(c.name.slice(0, cut), c);
  };
  const pickByWindow = (byName) => {
    const seen = new Set();
    const picked = [];
    for (const nm of winNames) {
      let c = byName.get(nm);
      if (!c && nm.indexOf(' // ') > 0) c = byName.get(nm.split(' // ')[0].trim());
      if (c && !seen.has(c.name)) {
        seen.add(c.name);
        picked.push(c);
      }
    }
    return picked;
  };
  if (winNames) {
    try {
      const cards = [];
      for (const chunk of chunkArr(winNames, 70)) {
        const r = await postWithTimeout(
          `${SF_BASE}/cards/collection`,
          { identifiers: chunk.map((n) => ({ name: n })) },
          6000,
        );
        if (r.ok) {
          const d = await r.json();
          cards.push(...(d.data || []));
        }
      }
      const ok = (c) => {
        const L = c.legalities || {};
        // Since the PDH framework of Nov 2024 an uncommon commander reads
        // not_legal on Scryfall (legal only in the command zone): any creature
        // that is not banned may lead.
        if (f === 'paupercommander')
          return L.paupercommander !== 'banned' && /Creature/.test(String(c.type_line || ''));
        return L[f] === 'legal';
      };
      const byName = new Map();
      cards.filter(ok).forEach((c) => alias(byName, c));
      const picked = pickByWindow(byName);
      if (picked.length >= 4) return { cards: picked.slice(0, 8), win };
    } catch (e) {}
  }
  const { results, error } = await searchAndVerifyLegal(q, 'edhrec', 24, opts);
  if (error && !(results || []).length) return null;
  // 'popular' is NOT a period: it is Scryfall's rank of the card itself.
  return { cards: (results || []).slice(0, 8), win: 'popular', fallback: true };
}

/* A network hiccup must not leave this page on a dead end. When the feed comes
   back empty the note says so and the page tries again by itself, with room
   between attempts; tapping it retries at once. Guarded on format and period,
   so a pending retry for a view the person already left is dropped. */
let _inspRetryT = null,
  _inspRetryN = 0;

function _inspCancelRetry() {
  if (_inspRetryT) {
    clearTimeout(_inspRetryT);
    _inspRetryT = null;
  }
}

function _inspRetryLater(bf, win) {
  _inspCancelRetry();
  if (_inspRetryN >= 3) return false;
  const wait = [4000, 9000, 20000][_inspRetryN] || 20000;
  _inspRetryN++;
  _inspRetryT = setTimeout(() => {
    _inspRetryT = null;
    if (
      state.screen !== 'browse' ||
      _inspFeedWin !== win ||
      (state.browseFormat || 'commander') !== bf
    )
      return;
    const b = document.getElementById('inspFeed');
    if (!b) return;
    sfDropQueuedFor('browse'); // clear the doomed backlog before asking again
    delete b.dataset.busy;
    loadInspFeed();
  }, wait);
  return true;
}

async function loadInspFeed() {
  const box = document.getElementById('inspFeed');
  if (!box) return;
  if (box.offsetParent === null) return; // hidden: results own the page
  if (box.dataset.busy) return;
  box.dataset.busy = '1';
  const bf = state.browseFormat || 'commander';
  const win = _inspFeedWin;
  // The feed follows the search bar; its period is chosen in advanced filters.
  box.innerHTML = /* HTML */ `<div class="edh-sec if-sec">
    <div class="section-label"><span data-iflab>${INSP_FEED_LABELS[bf] || bf}</span></div>
    <div class="sr-grid" data-ifgrid="${bf}">
      <div class="status"><div class="spinner"></div></div>
    </div>
  </div>`;
  if (!box.dataset.wired) {
    box.dataset.wired = '1';
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-ifretry]')) {
        _inspCancelRetry();
        _inspRetryN = 0;
        delete document.getElementById('inspFeed').dataset.busy;
        loadInspFeed();
        return;
      }
      const t = e.target.closest('.if-tile');
      if (!t) return;
      const c = (_inspFeed.data[t.dataset.ifkey] || { cards: [] }).cards[+t.dataset.ifi];
      if (!c) return;
      const f = t.dataset.iffmtc;
      if ((state.browseFormat || 'commander') !== f) {
        state.browseFormat = f;
        state.browseCache = {};
      }
      maybePairThenReco(c);
    });
  }
  const tile = (c, f, key, i) =>
    `<button type="button" class="sr-tile if-tile" data-iffmtc="${f}" data-ifkey="${key}" data-ifi="${i}" title="${escapeHtml(c.name)}"><img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}" loading="lazy"></button>`;
  const key = bf + '|' + win;
  let out = _inspFeed.data[key];
  if (!out) {
    // Hard ceiling on the wait. The serial queue retries a dead endpoint six
    // times with backoff, and the feed asks for several things in a row, so a
    // flat line could keep this spinner turning indefinitely -- the page stayed
    // busy and only switching period broke the spell. Past this point the note
    // goes up and the retry lane takes over; whatever is still in flight is
    // dropped when the next attempt starts.
    try {
      out = await Promise.race([
        _inspFeedFetch(bf, win, false),
        new Promise((r) => setTimeout(() => r(null), 12000)),
      ]);
    } catch (e) {
      out = null;
    }
    // Only a REAL period answer is worth keeping; a fallback is retried on
    // the next visit rather than frozen in for the session.
    if (out && out.cards && out.cards.length && !out.fallback) _inspFeed.data[key] = out;
  }
  delete box.dataset.busy;
  if (
    state.screen !== 'browse' ||
    _inspFeedWin !== win ||
    (state.browseFormat || 'commander') !== bf
  )
    return;
  const grid = box.querySelector(`.sr-grid[data-ifgrid="${bf}"]`);
  if (!grid || !grid.isConnected) return;
  const _got = !!(out && out.cards && out.cards.length);
  let _retrying = false;
  if (_got) {
    _inspCancelRetry();
    _inspRetryN = 0;
  } else {
    _retrying = _inspRetryLater(bf, win);
    // This page only ever calls two endpoints, so it can never reach the three
    // DISTINCT failures the offline banner waits for. Ask for the active probe
    // instead: it goes and checks the line, and is the only thing allowed to
    // raise the banner -- a slow connection is left alone.
    try {
      _netConfirmDown();
    } catch (e) {}
  }
  const _NL = appLang() === 'nl';
  grid.innerHTML = _got
    ? out.cards.map((c, i) => tile(c, bf, key, i)).join('')
    : `<div class="empty-note" data-ifretry="1" style="flex:1 1 100%;cursor:pointer;">${
        _retrying
          ? _NL
            ? 'Scryfall antwoordt even niet \u2014 ik probeer het zo opnieuw. Tik om het nu te proberen.'
            : 'No answer from Scryfall just now \u2014 trying again shortly. Tap to retry now.'
          : _NL
            ? 'Het lukt niet om deze op te halen. Tik om opnieuw te proberen.'
            : 'Could not load these. Tap to retry.'
      }</div>`;
  const lab = box.querySelector('[data-iflab]');
  if (lab && out)
    lab.textContent = `${INSP_FEED_LABELS[bf] || bf} · ${trS(INSP_WIN_LABELS[out.win] || '')}`;
}

function maybePairThenReco(c) {
  if (!pairAbility(c)) {
    openCommanderReco(c);
    return;
  }
  const standin = {
    admiral: c,
    partner: null,
    format: state.browseFormat || 'commander',
    name: c.name,
  };
  openPartnerSearch(standin, (partner) => openCommanderReco(c, partner), {
    skippable: true,
    onSkip: () => openCommanderReco(c),
  });
}

function wireBrowsePage() {
  if (browseIsMeta()) {
    wireMetaBrowse();
    return;
  }
  wireBrowseFilters();
  ensureEdhrecTags();
  hydrateTileArtReady().then((did) => {
    try {
      if (did && state.screen === 'browse' && state.openCSelect) csRerender();
    } catch (e) {}
  });
  preloadBrowseTileArt();
  loadInspFeed();
  state._crossLanded = false; // landing classes were baked into this render
  let _bsSeq = 0;
  const runLeaderSearch = async () => {
    const q = (document.getElementById('bsName')?.value || '').trim();
    state.browseNameQ = q;
    const mySeq = ++_bsSeq;
    const box = () => document.getElementById('bsNameResults');
    if (!box()) return;
    if (!q) {
      box().innerHTML = '';
      return;
    }
    box().innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
    // The exact eligibility pipeline the Appoint sheet uses: verified pool
    // legality plus the client-side leader rules for the current fleet.
    // Leader pool per format: Scryfall's is:commander for the commander
    // family (PDH commanders are the uncommon creatures Scryfall marks

    const bf = state.browseFormat || 'commander';
    const clause = bf === 'paupercommander' ? `t:creature r:uncommon ${q}` : `is:commander ${q}`;
    const sfFmt = bf === 'paupercommander' ? 'any' : bf;
    let results = [];
    try {
      const r = await searchAndVerifyLegal(clause, 'name', 40, { format: sfFmt });
      results = r.results || [];
    } catch (e) {}
    if (mySeq !== _bsSeq) return; // superseded by a newer search
    results = results.filter((c) => isNonlandFront(c) && !isBanned(c) && leaderFitsFormat(c, bf));
    if (!box()) return;
    if (!results.length) {
      box().innerHTML = /* HTML */ `<div class="empty-note" style="margin:8px 0;">
        No eligible ${leaderNoun(bf)} matches “${escapeHtml(q)}”.
      </div>`;
      return;
    }
    box().innerHTML = /* HTML */ `<div class="sr-grid">
      ${results
        .slice(0, 30)
        .map(
          (c, i) => `<div class="sr-tile ta-tile" data-i="${i}" role="button">
        <img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}" loading="lazy">${dfcFlipHtml(c)}
        <div class="st-body"><div class="tp-set">${escapeHtml(c.name)}</div><div class="tp-sub">${escapeHtml(frontFace(c).type_line || '')}</div></div>
      </div>`,
        )
        .join('')}
    </div>`;
    box()
      .querySelectorAll('.ta-tile')
      .forEach((btn) =>
        btn.addEventListener('click', () => maybePairThenReco(results[+btn.dataset.i])),
      );
    scrollToPageFoot();
  };
  document.getElementById('bsName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runLeaderSearch();
    }
  });
  // 1.10: the live suggestion list from Search -- leaders only here
  wireNameSuggest(document.getElementById('bsName'), leaderNamesFor, (name) => {
    const inp = document.getElementById('bsName');
    if (inp) inp.value = name;
    runLeaderSearch();
  });
  if (state.browseNameQ) runLeaderSearch(); // restore results after a re-render
  if (state.browseSel && state.browseSel.combo) ensureComboTagRanks(state.browseSel.combo);
  _csHandlers.bsFmt = (v) => {
    sfDropQueuedFor('browse');
    state.browseFormat = v || 'commander';
    state.browseCache = {}; // leader results are format-specific
    render();
    const q = (document.getElementById('bsName')?.value || '').trim();
    if (q) runLeaderSearch();
  };
  _csHandlers.bsCount = (v) => {
    sfDropQueuedFor('browse');
    state.browseSel.count = v;
    state.browseSel.combo = ''; // combos belong to a color count
    state.browseTypal = null;
    state.openCSelect = 'bsCombo'; // flow straight into picking the combination
    render();
    // 1.31: this opening skips csRerender, so the page did not know a sheet
    // was open and the Top Commanders feed showed behind the picker.
    try {
      const m = document.querySelector('.app > main');
      if (m) m.classList.add('cs-open');
    } catch (e) {}
    csFitBrowsePanel();
  };
  _csHandlers.bsCombo = (v) => {
    sfDropQueuedFor('browse');
    state.browseSel.combo = v;
    state.browseTypal = null;
    if (v) ensureComboTagRanks(v);
    render();
  };
  _csHandlers.bsTheme = (v) => {
    sfDropQueuedFor('browse');
    state.browseSel.theme = v;
    if (v) state.browseSel.tribe = '';
    state.browseTypal = null;
    render();
  };
  _csHandlers.bsTribe = (v) => {
    sfDropQueuedFor('browse');
    state.browseSel.tribe = v;
    if (v) state.browseSel.theme = '';
    state.browseTypal = null;
    render();
  };
  wireCSelects();
  loadBrowse();
}

const TYPAL_TRIBES = [
  'Angel',
  'Artificer',
  'Assassin',
  'Barbarian',
  'Bat',
  'Bear',
  'Beast',
  'Bird',
  'Boar',
  'Cat',
  'Centaur',
  'Cleric',
  'Construct',
  'Crab',
  'Cyclops',
  'Demon',
  'Devil',
  'Dinosaur',
  'Djinn',
  'Dog',
  'Dragon',
  'Drake',
  'Druid',
  'Dryad',
  'Dwarf',
  'Eldrazi',
  'Elemental',
  'Elephant',
  'Elf',
  'Faerie',
  'Fish',
  'Fox',
  'Frog',
  'Fungus',
  'Giant',
  'Gnome',
  'Goat',
  'Goblin',
  'God',
  'Golem',
  'Gorgon',
  'Griffin',
  'Horror',
  'Horse',
  'Human',
  'Hydra',
  'Illusion',
  'Imp',
  'Insect',
  'Kithkin',
  'Knight',
  'Kor',
  'Kraken',
  'Leviathan',
  'Lizard',
  'Merfolk',
  'Minotaur',
  'Monk',
  'Moonfolk',
  'Mouse',
  'Mutant',
  'Myr',
  'Naga',
  'Nightmare',
  'Ninja',
  'Octopus',
  'Ooze',
  'Orc',
  'Otter',
  'Ox',
  'Pegasus',
  'Phoenix',
  'Phyrexian',
  'Pirate',
  'Plant',
  'Praetor',
  'Rabbit',
  'Raccoon',
  'Rat',
  'Rhino',
  'Rogue',
  'Salamander',
  'Samurai',
  'Satyr',
  'Scarecrow',
  'Scorpion',
  'Scout',
  'Serpent',
  'Shaman',
  'Shapeshifter',
  'Shark',
  'Skeleton',
  'Sliver',
  'Slug',
  'Snail',
  'Snake',
  'Soldier',
  'Specter',
  'Sphinx',
  'Spider',
  'Spirit',
  'Squirrel',
  'Treefolk',
  'Troll',
  'Turtle',
  'Unicorn',
  'Vampire',
  'Viashino',
  'Wall',
  'Warlock',
  'Warrior',
  'Weird',
  'Werewolf',
  'Whale',
  'Wizard',
  'Wolf',
  'Wolverine',
  'Wurm',
  'Zombie',
];

/* One card never fronts two tribes: a popular Human Wizard used to rep both
   Human and Wizard. Each tribe takes its most-played leader NOT yet used in
   this gallery; only when every match is taken does it fall back to its
   true number one. Pure, for the Node battery (v2.51.585). */
function pickTypalReps(pool, tribes) {
  const items = [],
    used = new Set();
  tribes.forEach((tribe) => {
    const re = new RegExp('\\b' + tribe + '\\b', 'i');
    const matches = pool.filter((c) => re.test(frontFace(c).type_line || ''));
    if (!matches.length) return;
    const rep = matches.find((c) => !used.has(c.id || c.name)) || matches[0];
    used.add(rep.id || rep.name);
    items.push({ tribe, card: rep });
  });
  return items;
}

async function loadTypal(box, key, keepScroll) {
  const sel = state.browseSel;
  const colClause = browseColorClause() || '';
  if (state.browseTypal) {
    const tribe = state.browseTypal;
    const q = `${browseLeaderBase()} t:${tribe.toLowerCase()} ${colClause}`.trim();
    const { results, error } = await searchAndVerifyLegal(q, 'edhrec', 200, browseSfOpts());
    if (state.browseSel.theme !== 'typal' || state.browseTypal !== tribe) return;
    const live = document.getElementById('browseResults');
    if (!live) return;
    if (error) {
      live.innerHTML = /* HTML */ `<div class="error-note">
        Couldn't reach Scryfall. Check your connection and try again.
      </div>`;
      return;
    }
    const pool = results
      .filter((c) => leaderTypeOk(c) && hasPowerToughness(c) && isNonlandFront(c) && !isBanned(c))
      .slice(0, 200);
    const pinned = null; // 1.7: the loose Inspiration page has no tie to any deck
    // Bottom-up (§10a): the grid reads upward, so the caption and the way
    // back ride the FOOT, nearest the thumb — not ten screens up at the
    // head of a 200-tile list. Normal flow column: DOM-last = bottom.
    live.innerHTML = '';
    if (pool.length) {
      pagedGrid(
        live,
        pool,
        (c) => searchRowHtml(c, pinned, { showCommanderBtn: true }),
        (chunk) => {
          wireResultButtons(pool, pinned, () => loadTypal(box, key, true), {
            onCardTap: (c) => openCommanderReco(c),
          });
          loadTilePrices(chunk);
        },
      );
    }
    live.insertAdjacentHTML(
      'beforeend',
      `${pool.length ? '' : `<div class="empty-note">No legal ${escapeHtml(tribe)} ${leaderNoun(browseFmt(), true)} found${colClause ? ' in these colors' : ''}.</div>`}
      <p class="hint" style="margin:8px 0 4px;">${escapeHtml(tribe)} ${leaderNoun(browseFmt(), true)} — most played first.</p>
      <button class="ghost-btn" id="typalBack" style="margin:0 0 4px;width:100%;">‹ All creature types</button>`,
    );
    document.getElementById('typalBack').addEventListener('click', () => {
      state.browseTypal = null;
      render();
    });
    if (!keepScroll) scrollToPageFoot();
    return;
  }
  // Gallery view: bucket the top legendaries by creature type
  const idxKey = 'typal-index|' + colClause;
  state._typalIndex = state._typalIndex || {};
  let items = state._typalIndex[idxKey];
  if (!items) {
    const { results, error } = await searchAndVerifyLegal(
      `${browseLeaderBase()} ${colClause}`.trim(),
      'edhrec',
      600,
      browseSfOpts(),
    );
    if (state.browseSel.theme !== 'typal' || state.browseTypal) return;
    const live0 = document.getElementById('browseResults');
    if (!live0) return;
    if (error) {
      live0.innerHTML = /* HTML */ `<div class="error-note">
        Couldn't reach Scryfall. Check your connection and try again.
      </div>`;
      return;
    }
    const pool = results.filter(
      (c) => leaderTypeOk(c) && hasPowerToughness(c) && isNonlandFront(c) && !isBanned(c),
    );
    items = pickTypalReps(pool, TYPAL_TRIBES);
    state._typalIndex[idxKey] = items;
  }
  const live = document.getElementById('browseResults');
  if (!live || state.browseSel.theme !== 'typal' || state.browseTypal) return;
  // Bottom-up (§10a): grid first, caption at the FOOT beneath it.
  live.innerHTML = /* HTML */ `<div class="sr-grid">
      ${items
        .map(
          (it) => `
      <div class="sr-tile typal-tile" data-tribe="${escapeHtml(it.tribe)}">
        <img loading="lazy" class="${wbClass(it.card)}" src="${cardImageMed(it.card)}" alt="${escapeHtml(it.card.name)}">${cardBadgesHtml(it.card)}
        <div class="typal-label">${escapeHtml(it.tribe)}</div>
      </div>`,
        )
        .join('')}
    </div>
    <p class="hint" style="margin:8px 0 0;">
      Creature types with a typal identity — each shown as its most-played
      ${leaderNoun(browseFmt())}. Tap one to see all its ${leaderNoun(browseFmt(), true)}.
    </p>`;
  live.querySelectorAll('.typal-tile').forEach((t) =>
    t.addEventListener('click', () => {
      state.browseTypal = t.dataset.tribe;
      render();
    }),
  );
  if (!keepScroll) scrollToPageFoot();
}

async function loadBrowse() {
  const box = document.getElementById('browseResults');
  if (!box) return;
  if (!browseReady()) {
    box.innerHTML = '';
    return;
  }
  const key = browseKey();
  if (browseCommanderMode() && state.browseSel.combo) {
    loadLeaderPairs(
      key,
      state.browseSel.combo,
      !state.browseSel.tribe && state.browseSel.theme && state.browseSel.theme.indexOf('ed:') !== 0
        ? state.browseSel.theme
        : '',
    );
    const th = state.browseSel.theme;
    const tagSlug = state.browseSel.tribe
      ? state.browseSel.tribe
      : th && th !== 'typal'
        ? th.indexOf('ed:') === 0
          ? th.slice(3)
          : th
        : '';
    loadEdhrecDeckCounts(key, state.browseSel.combo, tagSlug);
    if (browseColorOnly()) loadColorStaples(key, state.browseSel.combo);
  }
  // A cached EMPTY pool is a remembered failure, not an answer — treat it
  // as no cache at all, so the page reloads with its spinner instead of
  // rendering instant blankness for the rest of the session.
  const cachedPool = state.browseCache[key];
  if (cachedPool && (cachedPool.length || cachedPool._sections)) {
    renderBrowseResults(key);
    return;
  }
  if (cachedPool) delete state.browseCache[key];
  box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
  const admiralMode = browseCommanderMode();
  const sel = state.browseSel;
  if (admiralMode && sel.theme === 'typal') {
    await loadTypal(box, key);
    return;
  }
  if (admiralMode && sel.tribe) {
    await loadEdhrecTypalBrowse(box, key, sel.tribe);
    return;
  }
  if (admiralMode && sel.theme && sel.theme.indexOf('ed:') === 0) {
    await loadEdhrecThemeBrowse(box, key, sel.theme.slice(3));
    return;
  }
  // Scryfall-native engine. Every theme maps to a bundle of Scryfall queries
  // (community function tags + oracle patterns); results sort by Scryfall's

  let filtered = null;
  const themeClause = sel.theme ? themeQueryClause(sel.theme, admiralMode) : '';
  const base = admiralMode
    ? browseLeaderBase()
    : (function () {
        const t = TYPE_CHIPS.find((c) => c.key === sel.type);
        return (t && t.clause) || '';
      })();
  const colClause = browseColorClause();
  const fullClause = [base, colClause, themeClause].filter(Boolean).join(' ');

  // ---- BLEND, fully parallel ----
  // The tag/text query and the curated-staples resolution launch TOGETHER, so
  // total wait ≈ the slower of the two, not their sum. Curated staples are
  // also cached per theme for the session — a colour change re-filters them
  // locally with zero requests.
  const curatedPromise =
    admiralMode && sel.theme
      ? (async () => {
          const names = CURATED_THEME_COMMANDERS[sel.theme] || [];
          if (!names.length) return [];
          state._curatedCache = state._curatedCache || {};
          if (!state._curatedCache[sel.theme]) {
            const ck = 'curated|' + sel.theme;
            state._curatedCache[sel.theme] = (async () => {
              const disk = await qdbGet(ck);
              if (disk && Date.now() - (disk.t || 0) < QCACHE_TTL && Array.isArray(disk.v))
                return disk.v;
              const cards = (await namesToLegalCards(names)).filter(
                (c) => isLegendary(c) && true && isNonlandFront(c),
              );
              if (cards.length) qdbSet(ck, cards);
              return cards;
            })();
          }
          const cur = (await state._curatedCache[sel.theme]).filter((c) => !isBanned(c));
          if (browseFmt() === 'commander') return cur;
          const okc = await filterCardsByFormat(cur, browseFmt(), 'leader');
          return cur.filter((c) => okc.has(c.name));
        })()
      : Promise.resolve([]);

  const [{ results, error }, curatedAll] = await Promise.all([
    searchAndVerifyLegal(fullClause, 'edhrec', 300, admiralMode ? browseSfOpts() : {}),
    curatedPromise.catch(() => []),
  ]);
  if (key !== browseKey()) return; // selection changed mid-flight
  let list = (results || []).filter((c) => !isBanned(c));
  if (admiralMode) list = list.filter((c) => leaderTypeOk(c) && hasPowerToughness(c));

  const inColor = (curatedAll || []).filter(colorSelectionAllows);
  if (inColor.length) {
    const seen = new Set(inColor.map((c) => c.name));
    list = inColor.concat(list.filter((c) => !seen.has(c.name)));
  }

  if (error && !list.length) {
    const l = document.getElementById('browseResults');
    if (l)
      l.innerHTML = /* HTML */ `<div class="error-note">
        Couldn't reach Scryfall. Check your connection and try again.
      </div>`;
    return;
  }
  filtered = list;
  filtered._complete = true;
  if (key !== browseKey()) return;
  state.browseCache[key] = filtered;
  renderBrowseResults(key);
}

/* Does the current color picker admit this card? Mirrors the query's color
   clause so curated seeds are held to the same standard. */
function colorSelectionAllows(card) {
  const sel = state.browseSel;
  if (sel.combo) return colorIdentityExact(card, sel.combo);
  if (sel.count) {
    const n = (card.color_identity || []).length;
    if (sel.count === '45') return n >= 4;
    return n === parseInt(sel.count, 10);
  }
  return true; // any colors
}

function renderBrowseResults(key, keepScroll) {
  const box = document.getElementById('browseResults');
  if (!box) return;
  const pool = state.browseCache[key] || []; // live array — background waves keep growing it
  if (pool._sections) {
    renderEdhrecSections(box, key, pool._sections);
    return;
  }
  const admiralMode = browseCommanderMode();
  const pairsApply = admiralMode && state.browseSel.combo;
  const pairs = pairsApply ? state.browseCache[pairsCacheKey(key)] : undefined;
  const pairsReady = Array.isArray(pairs);
  const pinned = null; // 1.7: the loose Inspiration page has no tie to any deck
  const wireOpts = admiralMode ? { onCardTap: (c) => openCommanderReco(c) } : undefined;
  // Pairs status note — shown only while they can't be blended in yet.
  const pairNote = () => {
    if (!pairsApply) return;
    if (!pairsReady)
      box.insertAdjacentHTML(
        'beforeend',
        `<div class="status" style="margin:12px 0 10px;"><div class="spinner"></div></div>`,
      );
  };
  if (!pool.length && !(pairsReady && pairs.length)) {
    // While anything is still loading, hold the verdict: just the spinner.
    // The "nothing found" note only appears once the search truly finished.
    const stillLoading = !pool._complete || (pairsApply && !pairsReady);
    box.innerHTML = stillLoading
      ? `<div class="status" style="margin:12px 0 10px;"><div class="spinner"></div></div>`
      : `<div class="empty-note">No ${admiralMode ? 'single ' + leaderNoun(browseFmt(), true) : 'cards'} found for this combination — try loosening the theme or colors.</div>`;
    return;
  }
  const note =
    admiralMode && state.browseSel.theme
      ? `<p class="hint" style="margin:8px 0 0;">${leaderNoun(browseFmt(), true)} for this theme, most-played first.</p>`
      : '';
  // Bottom-up: the caption used to open the box (visual TOP of a list that
  // can run ten screens tall); it now rides the FOOT, right where reading
  // starts. #browseResults is a normal flow column, so DOM-last = bottom.
  box.innerHTML = '';
  // Two-commander pairs are treated like any other eligible commander: they
  // share one ranking with the singles. Order comes from EDHREC's own deck
  // counts for this colour combination whenever that page is available.
  if (pairsApply && pairsReady && pairs.length && pool._complete) {
    const edecksRaw = state.browseCache[edhrecDeckCountsKey(key)];
    const edecks = edecksRaw && typeof edecksRaw === 'object' ? edecksRaw : null;
    const merged = orderBrowseMerged(pool, pairs, edecks);
    const after = (chunk) => {
      wireResultButtons(pool, pinned, () => renderBrowseResults(key, true), wireOpts);
      wireMergedPairTiles(merged, pinned, () => renderBrowseResults(key, true));
      loadTilePrices(chunk.flatMap((x) => (x._pair ? x._pair : [x])));
    };
    const mTile = (it, idx) =>
      it._pair
        ? pairTileHtml(it._pair, idx, pairPlayDecks(it._pair, edecks))
        : searchRowHtml(it, pinned, { showCommanderBtn: true, decks: singlePlayDecks(it, edecks) });
    if (browseColorOnly()) {
      renderColorBrowse(box, key, { items: merged, tile: mTile, after }, keepScroll);
      return;
    }
    pagedGrid(box, merged, mTile, after);
    if (note) box.insertAdjacentHTML('beforeend', note);
    if (!keepScroll) scrollToPageFoot();
    return;
  }
  const after = (chunk) => {
    wireResultButtons(pool, pinned, () => renderBrowseResults(key, true), wireOpts);
    loadTilePrices(chunk);
  };
  const streaming = !pool._complete;
  if (browseColorOnly()) {
    renderColorBrowse(
      box,
      key,
      { items: pool, tile: (c) => searchRowHtml(c, pinned, { showCommanderBtn: true }), after },
      keepScroll,
    );
    pairNote();
    return;
  }
  pagedGrid(box, pool, (c) => searchRowHtml(c, pinned, { showCommanderBtn: true }), after, {
    stream: streaming,
  });
  if (note) box.insertAdjacentHTML('beforeend', note);
  pairNote();
  if (!keepScroll) scrollToPageFoot();
}
