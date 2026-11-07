// pages / inspiration / card-synergy

/* ---------------- CARD SYNERGY ("played with") ----------------
   The ✦ button on any card opens an EDHREC-style view: the card on top, and
   below it the most-played legal cards that share its themes and fit its
   colors. Themes are detected from the card's own text against our theme
   catalog (lifegain, tutors-adjacent draw, protection, and so on), then
   Scryfall ranks the matches by EDHREC play data. */
function themeMatchesCard(theme, card) {
  const faces = card.card_faces && card.card_faces.length ? card.card_faces : [card];
  const text = faces
    .map((f) => (f.oracle_text || '') + ' ' + (f.type_line || ''))
    .join(' ')
    .toLowerCase();
  const kwSet = new Set((card.keywords || []).map((k) => k.toLowerCase()));
  const quoted = Array.from(theme.clause.matchAll(/o:"([^"]+)"/g)).map((m) =>
    m[1].toLowerCase().replace(/\'/g, "'"),
  );
  const kws = Array.from(theme.clause.matchAll(/kw:(\w+)/g)).map((m) => m[1].toLowerCase());
  const types = Array.from(theme.clause.matchAll(/t:(\w+)/g)).map((m) => m[1].toLowerCase());
  return (
    quoted.some((q) => text.includes(q)) ||
    kws.some((k) => kwSet.has(k) || text.includes(k)) ||
    types.some((t) => text.includes(t))
  );
}

function detectCardThemes(card) {
  return BROWSE_THEMES.filter((t) => themeMatchesCard(t, card)).slice(0, 4);
}

function openCardReco(card, forDeck, comboKey) {
  // 1.8: recommendations for the CARD itself; 1.9: opened from a deck's card
  // sheet they stay inside that deck's colour identity -- only its colours,
  // nothing else of the deck. Adding goes through the pick button.
  comboKey = null;
  if (forDeck && !deckLeaders(forDeck).length) forDeck = null;
  const combo = comboKey
    ? Object.values(COLOR_COMBOS)
        .flat()
        .find((c) => c.key === comboKey) || null
    : null;
  let el = document.getElementById('cardRecoOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'cardRecoOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  pushOverlay('cardReco', () => {
    document.getElementById('cardRecoOverlay')?.remove();
  });
  const themes = detectCardThemes(card);

  const scope = combo
    ? `within ${combo.label} colors`
    : forDeck && forDeck.admiral
      ? `within ${forDeck.admiral.name}'s colors`
      : 'any colors';
  // The real app navigation at the foot, back button included -- like every
  // other sub-page. The old top bar's second line now sits under the card.
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml('Played with ' + card.name)}
    <main>
      <div class="tag-focus-row" id="crTagRow" hidden></div>
      <div class="reco-admiral">
        <img
          class="${wbClass(card)}"
          src="${cardImageLarge(card)}"
          id="crImg"
          alt="${escapeHtml(card.name)}"
        />
        <div class="ra-nm">${escapeHtml(card.name)}</div>
        <div class="ra-sub">${escapeHtml(frontFace(card).type_line || '')}</div>
        ${deckColorNoteHtml(forDeck)}
      </div>
      <div id="crBody">
        <div class="status"><div class="spinner"></div></div>
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  document
    .getElementById('crImg')
    .addEventListener('click', () => showCardPreview(card, cardImageLarge(card)));
  loadCardReco(card, themes, forDeck || null, comboKey || null);
}

async function loadCardReco(card, themes, forDeck, comboKey) {
  // Synergy from Scryfall: we read the card's OWN function tags (what it does)
  // and find other cards that share those roles/themes, ranked by EDHREC
  // popularity via order:edhrec. The chosen colors set the ceiling — the
  // picked combination (id<=) or, from older paths, a deck's identity.
  const idClause = comboKey
    ? comboKey === 'c'
      ? 'id=c'
      : 'id<=' + comboKey
    : forDeck && forDeck.admiral
      ? idClauseForDeck(forDeck)
      : '';
  // 1) detect this card's function tags
  const tagMap = await detectOtagsForCards([card]);
  const cardTags = tagMap[card.name] || [];
  // 1.25: the tag focus drop-up under the card
  {
    const ov = document.getElementById('cardRecoOverlay');
    if (ov) ov._crCtx = { idClause, pool: (ov._crCtx && ov._crCtx.pool) || null };
    tagFocusRowFill('crTagRow', 'crTagSel', cardTags, (t) => {
      if (t) cardRecoFocus(card, forDeck, comboKey, t);
      else loadCardReco(card, themes, forDeck, comboKey);
    });
  }
  const themeParts = themes && themes.length ? themes.map((t) => t.clause) : [];
  // 2) build a synergy clause: shares a tag OR shares a theme pattern
  const signalParts = cardTags.map((t) => 'otag:' + t).concat(themeParts);
  let pool = [];
  if (signalParts.length) {
    const clause = ['(' + signalParts.join(' or ') + ')', idClause].filter(Boolean).join(' ');
    const { results } = await searchAndVerifyLegal(clause, 'edhrec', 200);
    pool = (results || []).filter((c) => !isBanned(c) && c.name !== card.name);
  }
  // 3) fallback: colour-matched format staples by popularity
  if (pool.length < 6) {
    const { results, error } = await searchAndVerifyLegal(idClause, 'edhrec', 200);
    const errBox = document.getElementById('crBody');
    if (!errBox) return;
    if (error && !pool.length) {
      errBox.innerHTML = /* HTML */ `<div class="error-note">
        Couldn't reach Scryfall. Check your connection and try again.
      </div>`;
      return;
    }
    const seen = new Set(pool.map((c) => c.name));
    (results || [])
      .filter((c) => !isBanned(c) && c.name !== card.name && !seen.has(c.name))
      .forEach((c) => pool.push(c));
  }
  pool = pool.slice(0, 150);
  // EDHREC's own page for this card: its card lists (not the commander
  // lists) become the sections, in the colours this page is limited to.
  let edhSecs = [];
  try {
    const data = await edhrecFetchJson('/pages/cards/' + edhrecSlug(card.name) + '.json');
    edhSecs = edhrecSectionsFrom(data).filter((x) => !/commander/i.test(x.header));
  } catch (e) {}
  if (edhSecs.length && edhSecs.reduce((n, x) => n + x.names.length, 0) >= 12) {
    const idSet = comboKey
      ? new Set(comboKey === 'c' ? [] : comboKey.toUpperCase().split(''))
      : forDeck && forDeck.admiral
        ? new Set(deckLeaders(forDeck).flatMap((x) => x.color_identity || []))
        : null;
    const keepE = (c) =>
      !isBanned(c) &&
      c.name !== card.name &&
      (!idSet || (c.color_identity || []).every((x) => idSet.has(x)));
    const all = [];
    const seenN = new Set();
    edhSecs.forEach((x) =>
      x.names.forEach((n) => {
        if (!seenN.has(n)) {
          seenN.add(n);
          all.push(n);
        }
      }),
    );
    try {
      const got = await resolveEdhrecNames(all.slice(0, 300), keepE);
      if (got.length >= 6) pool = got;
      else edhSecs = [];
    } catch (e) {
      edhSecs = [];
    }
  } else edhSecs = [];
  const box = document.getElementById('crBody');
  if (!box) return; // overlay closed meanwhile
  {
    const ov = document.getElementById('cardRecoOverlay');
    if (ov && ov._crCtx) ov._crCtx.pool = pool;
  }
  if (document.getElementById('crTagSel')?.value) return; // 1.25: a tag focus took over meanwhile
  if (!pool.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      No recommendations found for this card.
    </div>`;
    return;
  }
  const roleTxt = cardTags.length
    ? ` — sharing its role${cardTags.length > 1 ? 's' : ''} (${cardTags.slice(0, 3).map(escapeHtml).join(', ')})`
    : '';
  box.innerHTML = /* HTML */ `<p class="hint" style="margin:0 0 4px;text-align:center;">
    Cards that play well with ${escapeHtml(card.name)}${edhSecs.length ? '' : roleTxt}, most-played
    first.
  </p>`;
  const groups = edhGroupPool(pool, edhSecs).map((g) => ({ title: trS(g.title), cards: g.cards }));
  const rewire = () => {
    const t = document.getElementById('crTagSel')?.value;
    if (t) cardRecoFocus(card, forDeck, comboKey, t);
    else loadCardReco(card, themes, forDeck, comboKey);
  };
  const crEl = box.closest('.overlay');
  if (groups.length < 2) {
    pagedGrid(
      box,
      pool,
      (c) => searchRowHtml(c, forDeck || null),
      (chunk) => {
        wireResultButtons(pool, forDeck || null, rewire);
        wireOverlayPick(crEl, box, pool);
        loadTilePrices(chunk);
      },
    );
    return;
  }
  // Keep EDHREC's section order and put each heading above its cards.
  const CAP = 12;
  const secHtml = (g, i) =>
    `<div class="edh-sec" data-csec="${i}"><div class="section-label" style="margin-top:14px;">${escapeHtml(g.title)}</div>${g.cards.length > CAP ? `<button class="ghost-btn edh-more" data-csec="${i}" style="width:100%;margin:0 0 6px;">${trS('More')}</button>` : ''}<div class="sr-grid" data-csg="${i}">${g.cards
      .slice(0, CAP)
      .map((c) => searchRowHtml(c, forDeck || null))
      .join('')}</div></div>`;
  box.insertAdjacentHTML(
    'beforeend',
    groups.map(secHtml).join('') +
      `<div class="edh-jump-row insp-jump"><button class="icon-btn edh-jump" id="crJump" title="${trS('Jump to section')}">☰</button></div>`,
  );
  wireResultButtons(pool, forDeck || null, rewire);
  wireOverlayPick(crEl, box, pool); // 1.8
  loadTilePrices(groups.flatMap((g) => g.cards.slice(0, CAP))); // every shown tile (bottom-up: the first section is drawn last)
  box.querySelectorAll('.edh-more[data-csec]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const g = groups[+btn.dataset.csec];
      const gr = box.querySelector(`.sr-grid[data-csg="${btn.dataset.csec}"]`);
      if (!g || !gr) return;
      const have = gr.children.length,
        next = Math.min(g.cards.length, have + CAP);
      gr.insertAdjacentHTML(
        'beforeend',
        g.cards
          .slice(have, next)
          .map((c) => searchRowHtml(c, forDeck || null))
          .join(''),
      );
      wireResultButtons(pool, forDeck || null, rewire);
      wireOverlayPick(crEl, box, pool);
      loadTilePrices(g.cards.slice(have, next));
      if (next >= g.cards.length) btn.remove();
    }),
  );
  document.getElementById('crJump')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTileMenu(
      e.currentTarget,
      groups.map((g, i) => ({
        label: g.title,
        fn: () => {
          box
            .querySelector(`.edh-sec[data-csec="${i}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      })),
    );
  });
}

/* 1.25: Recommendations focused on ONE of the card's function tags: cards
   played with it that do that job first, then the most-played cards with
   that function, in the same colours. */
async function cardRecoFocus(card, forDeck, comboKey, tag) {
  const ov = document.getElementById('cardRecoOverlay');
  const box = document.getElementById('crBody');
  if (!ov || !box) return;
  const ctx = ov._crCtx || {};
  box.innerHTML = '<div class="status"><div class="spinner"></div></div>';
  const first = (ctx.pool || []).filter((c) => {
    try {
      const l = localTagSetSync(c);
      return !!(l && l.has(tag));
    } catch (e) {
      return false;
    }
  });
  let rest = [];
  try {
    const { results } = await searchAndVerifyLegal(
      ['otag:' + tag, ctx.idClause || ''].filter(Boolean).join(' '),
      'edhrec',
      120,
    );
    rest = (results || []).filter((c) => !isBanned(c) && c.name !== card.name);
  } catch (e) {}
  if ((document.getElementById('crTagSel')?.value || '') !== tag) return; // another pick meanwhile
  const b2 = document.getElementById('crBody');
  if (!b2) return;
  const seen = new Set(),
    pool = [];
  first.concat(rest).forEach((c) => {
    if (c && !seen.has(c.name)) {
      seen.add(c.name);
      pool.push(c);
    }
  });

  if (!pool.length) {
    b2.innerHTML = /* HTML */ `<div class="empty-note">
      ${'No cards found for this function.'}
    </div>`;
    return;
  }
  b2.innerHTML = /* HTML */ `<p class="hint" style="margin:0 0 4px;text-align:center;">
    ${'Focused on'}
    <b>${escapeHtml(otagLabel(tag))}</b
    >${first.length ? ' — cards played with ' + escapeHtml(card.name) + ' first' : ''}.
  </p>`;
  const crEl = b2.closest('.overlay');
  const rewire = () => cardRecoFocus(card, forDeck, comboKey, tag);
  pagedGrid(
    b2,
    pool,
    (c) => searchRowHtml(c, forDeck || null),
    (chunk) => {
      wireResultButtons(pool, forDeck || null, rewire);
      wireOverlayPick(crEl, b2, pool);
      loadTilePrices(chunk);
    },
  );
}

function primaryTypeOf(card) {
  const tl = frontFace(card).type_line || '';
  for (const t of [
    'Planeswalker',
    'Creature',
    'Instant',
    'Sorcery',
    'Enchantment',
    'Artifact',
    'Battle',
  ]) {
    if (tl.includes(t)) return t.toLowerCase();
  }
  return '';
}

/* Warm the budget engine quietly while the user reads their deck: oracle tags
   for every pricey card and the per-tag candidate pools land in the session
   caches, so tapping "Budget alternatives" finds the work already done. */
async function prefetchBudgetData(d) {
  try {
    if (!d) return;
    state._budgetPrefetched = state._budgetPrefetched || {};
    if (state._budgetPrefetched[d.id]) return;
    state._budgetPrefetched[d.id] = true;
    const all = deckLeaders(d).concat(d.cards || []);
    // The prefetch mirrors the page's own floor and hard gate — previously it
    // referenced names outside its scope, so it died silently on line one.
    const BUDGET_FLOOR = (() => {
      const v = parseFloat(localStorage.getItem(LS_PREFIX + 'budgetFloor'));
      return v >= 0.1 && v <= 10 ? v : 5;
    })();
    const underLine = (x) => {
      const p = shownEurOf(x);
      return p != null && p <= BUDGET_FLOOR;
    };
    const priced = all.filter((c) => {
      const h = state.priceCache[c.name];
      return h && typeof h.v === 'number' && h.v >= BUDGET_FLOOR;
    });
    if (!priced.length) return;
    const isL = (x) => /\bLand\b/.test(frontFace(x).type_line || '');
    const nonLand = priced.filter((c) => !isL(c));
    const tags = nonLand.length ? await detectOtagsForCards(nonLand, true) : {};
    const idClause = d.admiral ? idClauseForDeck(d) : '';
    const poolCache = (state._budgetPoolCache = state._budgetPoolCache || {});
    const union = new Set();
    Object.values(tags).forEach((a) => a.forEach((t) => union.add(t)));
    await runLimited(
      Array.from(union),
      async (tag) => {
        const ck = 'f' + BUDGET_FLOOR + '|' + idClause + '|' + tag;
        if (poolCache[ck]) return;
        try {
          const r = await searchAndVerifyLegal(
            (idClause + ' eur<=' + BUDGET_FLOOR + ' otag:' + tag).trim(),
            'edhrec',
            60,
          );
          poolCache[ck] = ((r && r.results) || []).filter(
            (x) => isNonlandFront(x) && !isBanned(x) && underLine(x),
          );
        } catch (e) {}
      },
      2,
    );
    if (priced.some(isL)) {
      const ck = 'f' + BUDGET_FLOOR + '|' + idClause + '|land';
      if (!poolCache[ck]) {
        try {
          const r = await searchAndVerifyLegal(
            (idClause + ' t:land eur<=' + BUDGET_FLOOR).trim(),
            'edhrec',
            120,
          );
          poolCache[ck] = ((r && r.results) || []).filter((x) => !isBanned(x) && underLine(x));
        } catch (e) {}
      }
    }
  } catch (e) {}
}

/* Value-over-time foundation: every cheapest-price write leaves a daily
   breadcrumb per card, 30 days deep, saved debounced. The graphs arrive
   next release — the history starts accruing NOW. */
let _phist = null,
  _phistT = null;

function notePrice(name, v, allowZero = false) {
  try {
    if (!(v > 0 || (allowZero && v === 0))) return;
    if (_phist == null) {
      try {
        _phist = JSON.parse(localStorage.getItem(LS_PREFIX + 'priceHist') || '{}');
      } catch (e) {
        _phist = {};
      }
    }
    const k = String(name).toLowerCase();
    const day = new Date().toISOString().slice(0, 10);
    const arr = _phist[k] || (_phist[k] = []);
    const last = arr[arr.length - 1];
    if (last && last[0] === day) {
      last[1] = v;
    } else {
      arr.push([day, v]);
      if (arr.length > 30) arr.splice(0, arr.length - 30);
    }
    clearTimeout(_phistT);
    _phistT = setTimeout(() => {
      try {
        localStorage.setItem(LS_PREFIX + 'priceHist', JSON.stringify(_phist));
      } catch (e) {}
    }, 2000);
  } catch (e) {}
}

/* The euro a card's TILE will actually display: remembered printing first,
   then the shown printing's own price, then the cheap cache. One ladder,
   shared by every price gate, so no cap can ever disagree with the screen. */
function shownEurOf(x) {
  try {
    const pp = printPrefFor(x);
    if (pp && pp.p != null && isFinite(pp.p)) return pp.p;
  } catch (e) {}
  const raw = x && x.prices && (x.prices.eur || x.prices.eur_foil);
  const e = raw ? parseFloat(raw) : NaN;
  if (isFinite(e)) return e;
  const hit = state.priceCache && x && state.priceCache[x.name];
  if (hit && typeof hit.v === 'number' && isFinite(hit.v)) return hit.v;
  return null;
}

async function openBudgetOverlay(d) {
  let el = document.getElementById('budgetOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'budgetOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  pushOverlay('budget', () => {
    document.getElementById('budgetOverlay')?.remove();
  });
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(trS('Budget Alternatives') + ' · ' + d.name)}
    <main>
      <div id="bgBody">
        <div class="status">
          <div class="spinner"></div>
          Weighing the treasure chest…
        </div>
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  loadBudgetAlternatives(d);
}

/* Oracle tags (Scryfall Tagger) we probe for. One batched query per tag
   identifies which of the deck's pricey cards carry it — then budget picks
   must share those very tags (removal begets removal). */
/* The Stef-approved full tag catalog (~170): the weekly Action gathers
   memberships for ALL of these; the picker's catalog shelf, the ⚙
   recommendations, and Similar/Budget's tag ranking read them locally.
   Dead slugs cost one weekly request and self-report as "→ 0 cards". */
const BUDGET_OTAGS = [
  'removal',
  'creature-removal',
  'artifact-removal',
  'enchantment-removal',
  'planeswalker-removal',
  'spot-removal',
  'boardwipe',
  'edict',
  'bounce',
  'tuck',
  'bite',
  'burn',
  'counterspell',
  'threaten',
  'sacrifice-outlet',
  'stifle',
  'ramp',
  'mana-rock',
  'mana-dork',
  'ritual',
  'land-ramp',
  'mana-doubler',
  'mana-sink',
  'untapper',
  'lands-matter',
  'cheat-into-play',
  'draw',
  'cantrip',
  'card-advantage',
  'wheel',
  'impulse',
  'rummage',
  'tutor',
  'peek',
  'draw-engine',
  'mill',
  'self-mill',
  'discard',
  'reanimate',
  'recursion',
  'regrowth',
  'graveyard-hate',
  'token-doubler',
  'anthem',
  'overrun',
  'counters-matter',
  'counter-doubler',
  'protection',
  'fog',
  'prevent-damage',
  'lifegain',
  'tax',
  'hatebear',
  'silence',
  'rule-of-law',
  'pillowfort',
  'damage-doubler',
  'extra-combat',
  'extra-attack',
  'evasion',
  'unblockable',
  'lure',
  'attack-trigger',
  'combat-trick',
  'blink',
  'flicker',
  'clone',
  'copy-spell',
  'copy-permanent',
  'copy-trigger',
  'death-trigger',
  'cast-trigger',
  'group-hug',
  'group-slug',
  'voting',
  'donate',
  'extra-turn',
  'removal-exile',
  'removal-fight',
  'removal-sacrifice',
  'removal-toughness',
  'removal-land',
  'removal-permanent',
  'mass-land-denial',
  'mass-shrink',
  'theft',
  'theft-permanent',
  'repeatable-token-generator',
  'repeatable-creature-tokens',
  'repeatable-artifact-tokens',
  'repeatable-treasures',
  'repeatable-clues',
  'repeatable-food',
  'repeatable-blood',
  'repeatable-gold',
  'affinity-for-tokens',
  'creates-token-of-a-card',
  'counter-fuel',
  'counter-fuel-pt',
  'counter-fuel-any',
  'counter-fuel-energy',
  'counter-fuel-loyalty',
  'tutor-creature',
  'tutor-artifact',
  'tutor-land',
  'tutor-enchantment',
  'tutor-instant',
  'tutor-sorcery',
  'tutor-planeswalker',
  'tutor-battle',
  'tutor-legendary',
  'tutor-color',
  'gives-flying',
  'gives-haste',
  'gives-trample',
  'gives-deathtouch',
  'gives-lifelink',
  'gives-menace',
  'gives-hexproof',
  'gives-indestructible',
  'gives-first-strike',
  'gives-double-strike',
  'gives-vigilance',
  'gives-flash',
  'gives-evasion',
  'gives-unblockable',
  'gives-protection',
  'gives-reach',
  'repeatable-draw',
  'repeatable-card-advantage',
  'repeatable-impulse',
  'repeatable-loot',
  'repeatable-rummage',
  'draw-matters',
  'draw-to-seven',
  'discard-outlet',
  'discard-symmetrical',
  'discard-matters',
  'brainstorm',
  'mana-fix',
  'mana-filter',
  'mana-increaser',
  'mana-producer',
  'mana-storage',
  'utility-land',
  'cost-reducer',
  'cost-reducer-instant-sorcery',
  'cost-reducer-creature',
  'cost-reducer-artifact',
  'free-cast-another',
  'extra-land',
  'extra-untap',
  'extra-combat-phase',
  'extra-draw-step',
  'mana-value-matters',
  'mass-reanimation',
  'reanimate-creature',
  'reanimate-from-any',
  'leaving-graveyard-matters',
  'castable-from-graveyard',
  'sacrifice-matters',
  'opponent-sacrifices',
  'opponent-sacrifice-matters',
  'mutual-sacrifice',
  'free-sacrifice-outlet',
  'repeatable-sacrifice-outlet',
  'opponent-loses-life',
  'life-loss-matters',
  'lifegain-matters',
  'opponent-lifegain',
  'cards-in-exile-matter',
  'castable-from-exile',
  'storm-like',
  'storm-count-matters',
  'magecraft',
  'landfall',
  'land-count-matters',
  'hand-size-matters',
  'monarch-matters',
  'sacrifice-outlet-creature',
  'sacrifice-outlet-artifact',
  'alternate-win-condition',
  'lose-trigger',
  'prevents-win-loss',
];

/* Live probing (cards newer than the weekly file) stays on the core 17 —
   probing 170 tags per unknown card would resurrect the convoy tenfold. */
const CORE_OTAGS = [
  'removal',
  'boardwipe',
  'counterspell',
  'ramp',
  'tutor',
  'burn',
  'lifegain',
  'mill',
  'discard',
  'draw',
  'reanimate',
  'protection',
  'sacrifice-outlet',
  'graveyard-hate',
  'peek',
];
// the living probe core — dead slugs earn no requests
/* 1.25 Tag focus: a drop-up under the card on Similar cards and on a card's
   Recommendations, listing the card's own function tags. Picking one makes
   the page suggest cards for that one job. */
function otagLabel(t) {
  return (
    BUDGET_TAG_LABELS[t] ||
    String(t)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
  );
}

function tagFocusRowFill(rowId, selId, tags, onPick) {
  const row = document.getElementById(rowId);
  if (!row) return;
  if (!tags || !tags.length) {
    row.hidden = true;
    row.innerHTML = '';
    return;
  }

  const cur = document.getElementById(selId)?.value || '';
  row.innerHTML = /* HTML */ `<span class="tf-lbl">${'Focus'}</span
    ><select id="${selId}">
      <option value="">${'All functions'}</option>
      ${tags
        .map(
          (t) =>
            `<option value="${escapeHtml(t)}"${t === cur ? ' selected' : ''}>${escapeHtml(otagLabel(t))}</option>`,
        )
        .join('')}
    </select>`;
  row.hidden = false;
  row.querySelector('select').addEventListener('change', (e) => onPick(e.target.value || ''));
}

const BUDGET_TAG_LABELS = {
  removal: 'Removal',
  boardwipe: 'Board Wipe',
  counterspell: 'Counterspell',
  ramp: 'Ramp',
  tutor: 'Tutor',
  burn: 'Burn',
  lifegain: 'Lifegain',
  mill: 'Mill',
  discard: 'Discard',
  draw: 'Card Draw',
  reanimate: 'Reanimation',
  protection: 'Protection',
  'token-generator': 'Tokens',
  'sacrifice-outlet': 'Sac Outlet',
  'graveyard-hate': 'Grave Hate',
  redirect: 'Redirect',
  peek: 'Peek',
};

/* Oracle tags are near-static (Tagger curates functions, not prices), so the
   per-card tag map persists for a week. It's a few kilobytes of names and
   short strings — parsed lazily on first use, written debounced, invisible to
   boot time and to every other feature. */
const OTAG_TTL = 7 * 24 * 3600 * 1000;

let _otagSaveT = null;

function loadOtagCache() {
  if (state._otagCache) return state._otagCache;
  let m = {};
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PREFIX + 'otags') || 'null');
    if (raw && raw.t && Date.now() - raw.t < OTAG_TTL && raw.map) m = raw.map;
  } catch (e) {}
  return (state._otagCache = m);
}

function saveOtagCache() {
  clearTimeout(_otagSaveT);
  _otagSaveT = setTimeout(() => {
    try {
      localStorage.setItem(
        LS_PREFIX + 'otags',
        JSON.stringify({ t: Date.now(), map: state._otagCache || {} }),
      );
    } catch (e) {}
  }, 500);
}

async function detectOtagsForCards(cards, bg) {
  const cache = loadOtagCache();
  const byName = {};
  cards.forEach((c) => {
    byName[c.name] = cache[c.name] ? cache[c.name].slice() : [];
  });
  let need = cards.filter((c) => !cache[c.name]);
  if (!need.length) return byName;
  // Local-first: the weekly tags file answers instantly for every card it
  // knows — the probe convoy below only rides for cards newer than the
  // file (or until the file first syncs).
  try {
    const ix = await bulkIndexReady();
    if (ix && ix.tagByOid) {
      const still = [];
      for (const c of need) {
        const t = _localTagsDecide(ix, c);
        if (Array.isArray(t)) {
          byName[c.name] = t.slice();
          cache[c.name] = t.slice();
        } else still.push(c);
      }
      if (still.length !== need.length) saveOtagCache();
      need = still;
      if (!need.length) return byName;
    }
  } catch (e) {}
  // Chunked so the query URL stays well inside Scryfall's length limit even
  // when a deck has many pricey cards.
  const groups = chunkArr(need, 22);
  for (const group of groups) {
    const nameClause = '(' + group.map((c) => exactNameClause(c.name)).join(' or ') + ')';
    await runLimited(
      CORE_OTAGS,
      async (tag) => {
        try {
          const res = await sfFetch(
            `${SF_BASE}/cards/search?unique=cards&q=${encodeURIComponent(nameClause + ' otag:' + tag)}`,
            0,
            !!bg,
          );
          if (!res.ok) return; // 404 = none of them carry this tag
          const data = await res.json();
          (data.data || []).forEach((hit) => {
            if (byName[hit.name]) byName[hit.name].push(tag);
          });
        } catch (e) {}
      },
      4,
    );
  }
  need.forEach((c) => {
    cache[c.name] = (byName[c.name] || []).slice();
  });
  saveOtagCache();
  return byName;
}

/* Budget pools straight from the phone's own database: every card under the
   line, in the deck's colours, grouped by the function tags the weekly build
   already carries. One pass over the corpus answers every tag at once -- so
   the page works offline, and online it saves a search per tag. */
function localBudgetPools(tags, ident, ceiling, inDeck) {
  const out = { byTag: {}, lands: [], all: [] };
  let ix = null;
  try {
    ix = _bulkIdx;
  } catch (e) {}
  if (!ix || !ix.cards || !ix.cards.length) return null;
  const want = new Set(tags || []);
  want.forEach((t) => {
    out.byTag[t] = [];
  });
  const ciSet = new Set((ident || []).map((x) => String(x).toUpperCase()));
  for (const bc of ix.cards) {
    if (bc.lg !== 'legal') continue;
    if (bc.eur == null || bc.eur > ceiling) continue;
    if (ciSet.size && ![...(bc.ci || '')].every((ch) => ciSet.has(ch))) continue;
    if (inDeck && inDeck.has(bc.n)) continue;
    const isLand = /\bLand\b/.test(String(bc.tl || '').split('//')[0]);
    const x = bulkToCardish(bc);
    if (!x || isBanned(x)) continue;
    if (isLand) {
      out.lands.push(x);
      continue;
    }
    out.all.push(x);
    if (!want.size) continue;
    let tg = null;
    try {
      tg = ix.tagByOid ? ix.tagByOid.get(bc.o) : null;
    } catch (e) {}
    if (!tg || !tg.length) continue;
    tg.forEach((t) => {
      if (want.has(t)) out.byTag[t].push(x);
    });
  }
  const byRank = (a, b) => (a.edhrec_rank ?? 999999) - (b.edhrec_rank ?? 999999);
  Object.keys(out.byTag).forEach((t) => {
    out.byTag[t].sort(byRank);
    out.byTag[t] = out.byTag[t].slice(0, 60);
  });
  out.lands.sort(byRank);
  out.lands = out.lands.slice(0, 120);
  out.all.sort(byRank);
  out.all = out.all.slice(0, 250);
  return out;
}

async function loadBudgetAlternatives(d) {
  // Moving the slider reopens this page while the previous run is still
  // fetching. Both wrote into the same body, and the older run's spinners
  // never resolved -- that is the page that "kept hanging". A run that is no
  // longer the newest stops at its next checkpoint.
  const mySeq = (state._bgSeq = (state._bgSeq || 0) + 1);
  // One gate for every suggestion: banned in Commander for the commander
  // family, banned OR not legal in the deck's own format for the 60s.
  const _bgBad = (x) => (deckIsConstructed(d) ? !!deckBlockReason(x, d) : isBanned(x));
  const alive = () => mySeq === state._bgSeq && !!document.getElementById('bgBody');
  const all = deckLeaders(d).concat(d.cards || []);
  if (!all.length) {
    const b = document.getElementById('bgBody');
    if (b) b.innerHTML = /* HTML */ `<div class="empty-note">No cards in this deck yet.</div>`;
    return;
  }
  // Same batched pricer the stats tab uses (10 names per request) — the old
  // per-card loop fired one prints-search PER CARD into the serial queue and
  // starved every other page of Scryfall access while it ran.
  await priceDeck(d);
  // Every card at €5 or more, however many that is
  const BUDGET_FLOOR = (() => {
    const v = parseFloat(localStorage.getItem(LS_PREFIX + 'budgetFloor'));
    return v >= 0.1 && v <= 10 ? v : 5;
  })();
  // HARD FACT: a suggestion may only appear if the price its tile will
  // DISPLAY stays at or under the budget line — unknown prices fail.
  const underLine = (x) => {
    const p = shownEurOf(x);
    return p != null && p <= BUDGET_FLOOR;
  };
  const priced = all
    .map((c) => ({
      c,
      v:
        state.priceCache[c.name] && typeof state.priceCache[c.name].v === 'number'
          ? state.priceCache[c.name].v
          : 0,
    }))
    .filter((x) => x.v >= BUDGET_FLOOR)
    .sort((a, b) => b.v - a.v);
  const box = document.getElementById('bgBody');
  if (!box) return;
  // The budget line, adjustable: sticky at the page's foot, live label while
  // dragging, rebuild on release (prices are cached — the redo is instant).
  (() => {
    const mainEl = box.closest('main') || box.parentElement;
    // The slider is a FOOTER of the overlay, not a row of the scroller: the
    // overlay-inner is a normal flex column (cap on top, main scrolling),
    // so appendChild AFTER main pins it flush to the page bottom with
    // nothing scrolling beneath it.
    const host = (mainEl && mainEl.parentElement) || mainEl;
    let row = document.getElementById('bgFloorRow');
    if (!row) {
      row = document.createElement('div');
      row.id = 'bgFloorRow';
      // Since the page carries the real navigation bar, the slider sits
      // between the cards and that bar -- above it, never beneath it. The
      // bar keeps the safe-area padding at the very bottom.
      row.style.cssText =
        'flex:0 0 auto;background:var(--ink);border-top:2px solid var(--line);padding:10px 14px;display:flex;align-items:center;gap:10px;';
      const nav = host.querySelector(':scope > .ov-nav');
      host.insertBefore(row, nav || null);
    }
    row.innerHTML = /* HTML */ `<span
        style="font-size:13.5px;color:var(--sub-text);white-space:nowrap;"
        >${'Budget line'}</span
      >
      <input
        type="range"
        id="bgFloor"
        min="0.1"
        max="10"
        step="0.1"
        value="${BUDGET_FLOOR}"
        style="flex:1;accent-color:var(--brass);"
      />
      <span
        style="font-family:'JetBrains Mono',monospace;color:var(--brass);min-width:56px;text-align:right;"
        id="bgFloorVal"
        >€${BUDGET_FLOOR.toFixed(2)}</span
      >`;
    const sl = row.querySelector('#bgFloor');
    sl.addEventListener('input', () => {
      const v = document.getElementById('bgFloorVal');
      if (v) v.textContent = '€' + parseFloat(sl.value).toFixed(2);
    });
    sl.addEventListener('change', () => {
      try {
        localStorage.setItem(LS_PREFIX + 'budgetFloor', sl.value);
      } catch (e) {}
      openBudgetOverlay(d);
    });
  })();
  if (!priced.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      ${trS('No cards at')} €${BUDGET_FLOOR} ${trS('or more in this deck')} —
      ${trS('it\u2019s already built thrifty.')}
    </div>`;
    return;
  }

  box.innerHTML = /* HTML */ `<p class="hint" style="text-align:center;margin:0 0 8px;">
    ${`${priced.length} card${priced.length > 1 ? 's' : ''} at €${BUDGET_FLOOR}+`}
    ${infoBtnHtml(
      'Every card at €' +
        BUDGET_FLOOR +
        ' or more gets thriftier stand-ins for the same job, each at or under the budget line. Tap + to swap one in.',
    )}
  </p>`;
  // Build ONE shared candidate pool up front — EDHREC's dedicated budget page
  // for this commander (real play data) plus the most-played cheap cards in
  // identity, fetched in parallel — then match every pricey card against it
  // LOCALLY. The old engine ran a hundred-plus serial searches and looked
  // frozen; this one paints in seconds.
  // Progressive: every pricey card appears NOW with its price; the stand-ins
  // stream in beneath once the tag data lands.
  const trioRefs = [];
  for (const { c, v } of priced) {
    const trio = document.createElement('div');
    trio.className = 'budget-trio';
    trio.innerHTML = /* HTML */ ` <div class="budget-star">
        <img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}" />
        <div class="bs-nm">${escapeHtml(c.name)}</div>
        <div class="bs-pr">${fmtEur(v)}</div>
        <div
          class="tag-focus-row"
          id="bgTagRow${trioRefs.length}"
          data-sel="bgTagSel${trioRefs.length}"
          hidden
        ></div>
      </div>
      <div class="sr-grid budget-subs">
        <div class="status" style="grid-column:1/-1;padding:8px 0;">
          <div class="spinner"></div>
        </div>
      </div>`;
    box.appendChild(trio);
    trio.querySelector('.budget-star img').addEventListener('click', () => openCardInfo(c));
    trioRefs.push({ c, v, trio });
  }
  const idClause = d.admiral ? idClauseForDeck(d) : '';
  const inDeck = new Set(all.map((c) => c.name));
  const deckNames = new Set(inDeck); // 1.32: the real deck; inDeck also grows with picks
  const priceOf = (x) => {
    const hit = state.priceCache[x.name];
    if (hit && typeof hit.v === 'number') return hit.v;
    const raw = x.prices && x.prices.eur;
    const e = raw ? parseFloat(raw) : NaN;
    return isNaN(e) ? null : e;
  };
  let pool = [];
  try {
    const lead = deckLeaders(d)[0];
    const budgetNamesP =
      deckKind(d) === 'cmdr' && lead
        ? edhrecFetchJson('/pages/commanders/' + edhrecSlug(lead.name) + '/budget.json')
            .then((j) => (j ? edhrecNamesFrom(j).slice(0, 80) : []))
            .catch(() => [])
        : Promise.resolve([]);
    const staplesP = searchAndVerifyLegal(
      (idClause + ' eur<=' + BUDGET_FLOOR).trim(),
      'edhrec',
      250,
    ).catch(() => ({ results: [] }));
    const [bn, st] = await Promise.all([budgetNamesP, staplesP]);
    let bCards = [];
    if (bn.length) {
      bCards = await resolveEdhrecNames(bn, (x) => isNonlandFront(x) && !_bgBad(x));
    }
    const seen = new Set();
    bCards.concat((st && st.results) || []).forEach((x) => {
      if (!underLine(x)) return; // the hard budget gate, on the merged stream too
      if (seen.has(x.name)) return;
      seen.add(x.name);
      if (!isNonlandFront(x) || _bgBad(x) || inDeck.has(x.name)) return;
      pool.push(x);
    });
  } catch (e) {}
  // Real function data, not keyword guesses: Scryfall Tagger's curated oracle
  // tags for every pricey nonland card, one budget pool per detected tag
  // (removal begets removal), and a dedicated cheap-LAND pool so pricey lands
  // are always answered with lands.
  const isLandC = (x) => /\bLand\b/.test(frontFace(x).type_line || '');
  const landPriced = priced.filter((p) => isLandC(p.c));
  const nonLandPriced = priced.filter((p) => !isLandC(p.c));
  const otagByName = nonLandPriced.length
    ? await detectOtagsForCards(nonLandPriced.map((p) => p.c))
    : {};
  const otagLand = landPriced.length ? await detectOtagsForCards(landPriced.map((p) => p.c)) : {}; // 1.33: as Similar
  // Pools are candidate SOURCES only now (scoring reads local tags), so
  // the fetch fan-out caps at each card's first four tags.
  state._budgetLogOnce = true;
  const tagUnion = new Set();
  Object.values(otagByName).forEach((a) => a.slice(0, 6).forEach((t) => tagUnion.add(t))); // 1.32: six, as Similar
  // Pools are identity-scoped, not deck-scoped — cache them for the session so
  // reopening this page (any deck in the same colours) skips the searches.
  const poolCache = (state._budgetPoolCache = state._budgetPoolCache || {});
  const tagPools = {},
    candTags = {};
  // The phone first: one pass over the local corpus answers every tag, the
  // lands and the general pool at once. Offline that is the whole page;
  // online it means the searches below have little left to do.
  const identList = (d.admiral ? (deckLeaders(d)[0] || {}).color_identity : null) || [];
  let localPools = null;

  try {
    localPools = localBudgetPools(Array.from(tagUnion), identList, BUDGET_FLOOR, inDeck);
  } catch (e) {}
  if (localPools) {
    Object.entries(localPools.byTag).forEach(([t, arr]) => {
      if (arr.length) tagPools[t] = arr.slice();
    });
    if (!pool.length) pool = localPools.all.slice(0, 120);
    try {
      sfJournal('budget: ' + localPools.all.length + ' candidates from the local database');
    } catch (e) {}
  }
  await runLimited(
    Array.from(tagUnion),
    async (tag) => {
      if (tagPools[tag] && tagPools[tag].length >= 20) return; // the phone already answered this one
      const ck = 'f' + BUDGET_FLOOR + '|' + idClause + '|' + tag;
      if (poolCache[ck]) {
        tagPools[tag] = poolCache[ck];
        return;
      }
      try {
        const r = await searchAndVerifyLegal(
          (idClause + ' eur<=' + BUDGET_FLOOR + ' otag:' + tag).trim(),
          'edhrec',
          60,
        );
        tagPools[tag] = ((r && r.results) || []).filter(
          (x) => isNonlandFront(x) && !_bgBad(x) && underLine(x),
        );
        poolCache[ck] = tagPools[tag];
      } catch (e) {
        tagPools[tag] = [];
      }
    },
    4,
  );
  Object.entries(tagPools).forEach(([tag, arr]) =>
    arr.forEach((x) => {
      (candTags[x.name] = candTags[x.name] || new Set()).add(tag);
    }),
  );
  let landPool = localPools && localPools.lands.length ? localPools.lands.slice() : [];
  if (landPriced.length && landPool.length < 20) {
    const ck = 'f' + BUDGET_FLOOR + '|' + idClause + '|land';
    if (poolCache[ck]) landPool = poolCache[ck];
    else
      try {
        const r = await searchAndVerifyLegal(
          (idClause + ' t:land eur<=' + BUDGET_FLOOR).trim(),
          'edhrec',
          120,
        );
        landPool = ((r && r.results) || []).filter((x) => !_bgBad(x) && underLine(x));
        poolCache[ck] = landPool;
      } catch (e) {}
  }
  if (!alive()) return;
  const anyTagged = Object.values(tagPools).some((a) => a.length);
  if (!pool.length && !anyTagged && !landPool.length) {
    box.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-note">Couldn't gather budget candidates — check your connection and reopen this page.</div>`,
    );
    return;
  }
  // A tight line simply has few answers. Say so at the top instead of
  // leaving rows of empty spinners behind.
  try {
    const totalCands = new Set();
    Object.values(tagPools).forEach((a) => a.forEach((x) => totalCands.add(x.name)));
    pool.forEach((x) => totalCands.add(x.name));
    landPool.forEach((x) => totalCands.add(x.name));
    if (totalCands.size < 25) {
      box.insertAdjacentHTML(
        'afterbegin',
        `<p class="hint" style="text-align:center;margin:0 0 8px;color:var(--brass);">` +
          `Few cards under \u20ac${BUDGET_FLOOR} in these colours \u2014 slide the line up for more choice.` +
          `</p>`,
      );
    }
  } catch (e) {}
  const fp = new Map();
  const themesOf = (x) => {
    if (!fp.has(x.name)) fp.set(x.name, new Set(detectCardThemes(x).map((t) => t.key)));
    return fp.get(x.name);
  };
  for (const { c, v, trio } of trioRefs) {
    if (!alive()) return; // closed, or a newer run took over
    if (!trio.isConnected) continue;
    const land = isLandC(c);
    const myTags = land ? [] : otagByName[c.name] || [];
    const roleLabel = land
      ? 'Land'
      : myTags
          .slice(0, 4)
          .map(
            (t) =>
              BUDGET_TAG_LABELS[t] ||
              t.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
          )
          .join(', ');
    const prEl = trio.querySelector('.bs-pr');
    if (prEl && roleLabel) prEl.textContent = `${fmtEur(v)} · ${roleLabel}`;
    const ptype = primaryTypeOf(c);
    // The chosen budget line is the HARD ceiling for every suggestion —
    // no private per-card heuristic may overrule what the slider says.
    const ceiling = BUDGET_FLOOR;
    const scored = [];
    let focusB = null; // 1.32: kept for this card's tag focus
    // TEXT-feature pools — the same first-priority signal Similar cards
    // trusts (the exact rules language the card uses), under the budget
    // ceiling. Cached per feature+identity, so cards sharing language share
    // the one search across the whole page and across reopenings.
    const srcFeatsB = land ? [] : phraseFeats(c);
    const featPools = [];
    const featQs = land
      ? []
      : srcFeatsB
          .filter((f) => f.q)
          .sort((a, b) => b.w - a.w)
          .slice(0, 3); // 1.32: three, as Similar
    if (featQs.length) {
      await runLimited(
        featQs,
        async (f) => {
          const ck = 'f' + BUDGET_FLOOR + '|' + idClause + '|txt:' + f.k;
          if (!poolCache[ck]) {
            try {
              const r = await searchAndVerifyLegal(
                (idClause + ' eur<=' + BUDGET_FLOOR + ' ' + f.q).trim(),
                'edhrec',
                40,
              );
              poolCache[ck] = ((r && r.results) || []).filter(
                (x) => isNonlandFront(x) && !_bgBad(x) && underLine(x),
              );
            } catch (e) {
              poolCache[ck] = [];
            }
          }
          featPools.push(poolCache[ck]);
        },
        2,
      );
      if (!alive()) return; // closed, or superseded, while fetching
    }
    if (land) {
      // Lands answer lands, ranked exactly as Similar cards ranks a land
      // (1.33): the job it does first, then words, tags and colours.
      const srcWordsL = magicWordSet(c);
      const weightsL = await magicWordWeights();
      const tagsL = otagLand[c.name] || [];
      for (let i = 0; i < landPool.length; i++) {
        const x = landPool[i];
        if (inDeck.has(x.name)) continue;
        const pv = priceOf(x);
        if (pv === null || pv > ceiling) continue;
        const sc = similarityScore(c, x, {
          srcWords: srcWordsL,
          weights: weightsL,
          srcTags: tagsL,
          tagHas: (cc, t) => {
            const l = localTagSetSync(cc);
            return l ? l.has(t) : false;
          },
          fallbackPop: i,
        });
        sc.lk = landKinScore(c, x);
        sc.pts += sc.lk;
        sc.eur = pv;
        scored.push({ s: sc, x });
      }
    } else if (myTags.length || featPools.some((a) => a.length)) {
      // Stef's four steps under the budget ceiling — magic words, curated
      // tags, colors, play order — with price as the very last tiebreak.
      const cand = new Map();
      myTags.forEach((t) =>
        (tagPools[t] || []).forEach((x, i) => {
          let e = cand.get(x.name);
          if (!e) {
            e = { x, best: i, tags: new Set() };
            cand.set(x.name, e);
          } else e.best = Math.min(e.best, i);
          e.tags.add(t);
        }),
      );
      featPools.forEach((arr) =>
        arr.forEach((x, i) => {
          const e = cand.get(x.name);
          if (e) {
            e.best = Math.min(e.best, i);
          } else cand.set(x.name, { x, best: i, tags: new Set() });
        }),
      );
      const srcWordsB = magicWordSet(c);
      {
        try {
          const ix = await bulkIndexReady();
          const ciSet = new Set((deckColorIdentity(d) || []).map((x) => String(x).toUpperCase()));
          _bulkSweep(ix, c, srcWordsB, ciSet, ceiling, c.name).forEach((bc) => {
            if (cand.has(bc.n) || inDeck.has(bc.n) || _bgBad({ name: bc.n })) return;
            const x = bulkToCardish(bc);
            if (x) cand.set(bc.n, { x, best: 500, tags: new Set() });
          });
        } catch (e) {}
      }
      const weightsB = await magicWordWeights();
      // 1.32: Budget IS Similar cards under a price line -- the very same
      // points, themes included (week-cached, read from the same card page),
      // one shared three-second deadline for the EDHREC signals.
      const _deadB = new Promise((r) => setTimeout(() => r(null), 3000));
      const _thPB = (async () => {
        const th = await edhrecCardThemes(c);
        const sets = await Promise.all(th.map((t) => edhrecThemeNames(t).catch(() => null)));
        return sets.filter((x) => x && x.size);
      })().catch(() => []);
      const eMapB = (await Promise.race([edhrecPageNames(c), _deadB])) || new Map();
      const themeSetsB = (await Promise.race([_thPB, _deadB])) || [];
      const hasB = (e, t) => {
        const l = localTagSetSync(e.x);
        return (
          (l ? l.has(t) : false) ||
          e.tags.has(t) ||
          !!(candTags[e.x.name] && candTags[e.x.name].has(t))
        );
      };
      const scoreB = (e) => {
        const pv = priceOf(e.x);
        if (pv === null || pv > ceiling) {
          e.s = null;
          return null;
        }
        const sc = similarityScore(c, e.x, {
          srcWords: srcWordsB,
          weights: weightsB,
          eMap: eMapB,
          themeSets: themeSetsB,
          srcTags: myTags,
          tagHas: (cc, t) => hasB(e, t),
          fallbackPop: e.best,
        });
        sc.eur = pv;
        return (e.s = sc);
      };
      for (const e of cand.values()) {
        if (deckNames.has(e.x.name)) continue;
        const sc = scoreB(e);
        if (!sc || inDeck.has(e.x.name)) continue;
        scored.push({ s: sc, x: e.x });
      }
      focusB = { cand, scoreB, hasB, got: {} };
    } else {
      // No curated tags found for this card: fall back to the played-staples
      // pool with the old theme heuristic (labels stay hidden either way).
      const mine = themesOf(c);
      for (let i = 0; i < pool.length; i++) {
        const x = pool[i];
        if (inDeck.has(x.name)) continue;
        const pv = priceOf(x);
        if (pv === null || pv > ceiling) continue;
        let sc = 0;
        sc += phraseOverlapWeight(phraseFeats(c), x) * 2; // the job first
        if (primaryTypeOf(x) === ptype) sc += 3;
        const tx = themesOf(x);
        let shared = 0;
        mine.forEach((k) => {
          if (tx.has(k)) shared++;
        });
        sc += Math.min(3, shared * 1.5);
        sc += Math.max(0, 2 - Math.abs((x.cmc || 0) - (c.cmc || 0))) * 0.5;
        sc -= i * 0.004;
        scored.push([sc, x]);
      }
    }
    scored.sort((a, b) => {
      if (a.s && b.s) return cmpSimilarity(a, b);
      return (b[0] || 0) - (a[0] || 0);
    });
    if (state._budgetLogOnce && scored.length && scored[0].s) {
      state._budgetLogOnce = false;
      const t = scored[0];
      sfJournal(
        'budget top: ' +
          (t.x.name || t.x.n) +
          ' pts:' +
          Math.round(t.s.pts) +
          ' (pg:' +
          t.s.pg +
          ' w:' +
          Math.round(t.s.w) +
          ' tg:' +
          t.s.tg +
          ' c:' +
          t.s.c +
          ' tp:' +
          (t.s.tp || 0) +
          ')' +
          ' for ' +
          c.name,
      );
    }
    const subs = scored.slice(0, 2).map((sx) => sx.x || sx[1]);
    const subsBox = trio.querySelector('.budget-subs');
    if (!subsBox || !subsBox.isConnected) return;
    subs.forEach((x) => inDeck.add(x.name)); // don't recommend the same card twice
    const paintB = (list) => {
      if (!subsBox.isConnected) return;
      if (!list.length) {
        subsBox.innerHTML = /* HTML */ `<div
          class="empty-note"
          style="grid-column:1/-1;padding:6px 0;"
        >
          ${trS('No cheap stand-ins found for this one.')}
        </div>`;
        return;
      }
      subsBox.innerHTML = list
        .map((x) => searchRowHtml(x, d, { showCommanderBtn: false }))
        .join('');
      wireResultButtons(list, d, () => {}, undefined);
      loadTilePrices(list);
    };
    paintB(subs);
    // 1.32: the same tag focus as Similar cards, under the pricey card:
    // pick one of its functions and its cheap stand-ins for that one job
    // appear (four of them), still under the budget line.
    const fRow = trio.querySelector('.tag-focus-row');
    if (focusB && fRow && myTags.length) {
      const fx = focusB,
        selId = fRow.dataset.sel;
      tagFocusRowFill(fRow.id, selId, myTags, async (tag) => {
        if (!tag) {
          paintB(subs);
          return;
        }
        if (!subsBox.isConnected) return;
        subsBox.innerHTML = /* HTML */ `<div class="status" style="grid-column:1/-1;padding:8px 0;">
          <div class="spinner"></div>
        </div>`;
        if (!fx.got[tag]) {
          fx.got[tag] = true;
          let arr = [];
          try {
            const lp = localBudgetPools([tag], identList, BUDGET_FLOOR, deckNames);
            if (lp && lp.byTag[tag]) arr = lp.byTag[tag].filter((x) => !_bgBad(x));
          } catch (e) {}
          if (arr.length < 20) {
            const ck = 'f' + BUDGET_FLOOR + '|' + idClause + '|' + tag;
            if (!poolCache[ck]) {
              try {
                const r = await searchAndVerifyLegal(
                  (idClause + ' eur<=' + BUDGET_FLOOR + ' otag:' + tag).trim(),
                  'edhrec',
                  60,
                );
                poolCache[ck] = ((r && r.results) || []).filter(
                  (x) => isNonlandFront(x) && !_bgBad(x) && underLine(x),
                );
              } catch (e) {
                poolCache[ck] = [];
              }
            }
            arr = arr.concat(poolCache[ck]);
          }
          arr.forEach((x, i) => {
            if (x.name === c.name || deckNames.has(x.name)) return;
            let e = fx.cand.get(x.name);
            if (!e) {
              e = { x, best: i, tags: new Set([tag]) };
              fx.cand.set(x.name, e);
            } else e.tags.add(tag);
            fx.scoreB(e);
          });
        }
        if ((document.getElementById(selId)?.value || '') !== tag) return; // another pick meanwhile
        const list = Array.from(fx.cand.values())
          .filter((e) => e.s && !deckNames.has(e.x.name) && fx.hasB(e, tag))
          .sort(cmpSimilarity)
          .slice(0, 4)
          .map((e) => e.x);
        paintB(list);
      });
    }
  }
}
