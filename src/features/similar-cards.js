// features / similar-cards

/* ============ STEF'S POINT SYSTEM ============
   Additive, capped, tuned in one place. Every rate below is a knob.
     theme pages   5 pts per shared EDHREC theme page (cap 3 pages)
     card page     12 pts in a synergy list on the source's own EDHREC
                   page, 8 pts elsewhere on it
     magic words   2 × rarity per shared word — rarity folds the corpus
                   weighting in, clamped so each word is worth 1..5 (cap 20)
     tags          6 pts per shared Scryfall tag (cap 27)  [1.20]
     colors        +2 identical identity, +1 overlap or colorless
   Ties break on EDHREC page position, then popularity, then price
   (Budget only). Every network signal that's absent scores 0 — the
   ranking never stalls and never punishes offline. */
const SIM_POINTS = {
  themePage: 5,
  themeCap: 3,
  // EDHREC page membership means CO-PLAYED, not same-job — that signal let
  // generic tutor staples crowd out true cousins (the Land Tax case), so
  // its points are cut hard and the text/tag signals carry the ranking.
  pageSynergy: 6,
  pageOther: 3,
  // Rarity is SQUARED now — Stef's call: sharing 'copy' should dwarf
  // sharing 'target'. Common words ≈ 1 pt, mid ≈ 2.7, rare 6–7.
  wordScale: 0.55,
  wordMin: 1,
  wordMax: 7,
  wordCap: 20,
  // Breadth bonus: every shared PAIR of words counts (2→1, 3→3, 4→6,
  // 5→10) — sharing MANY words says "same job" louder than any one word.
  sharedPair: 1,
  sharedCap: 12,
  // Wordiness penalty: every magic word the CANDIDATE carries that the
  // source does NOT costs a little — walls of text stop outranking clean
  // cousins just by touching every mechanic in the game.
  missRate: 0.6,
  missCap: 8, // 1.20: 0.4 -> 0.6
  // The same idea for curated tags, gentler still: a candidate wearing
  // functions the source doesn't have drifts down, softly.
  tagMissRate: 1.0,
  tagMissCap: 9, // 1.20: 0.5 -> 0.7; 1.32: -> 1.0, cap 9
  // 1.20: a shared tag (same function) weighs more: 4 -> 6 a tag, cap 18 -> 27
  // 1.32: heavier still, Stef's call: 10 a tag, cap 50. 1.34: 8 a tag,
  // cap 40 -- four shared functions still outweigh every magic-word point
  tagRate: 8,
  tagCap: 40,
  colorSame: 2,
  colorOverlap: 1,
  // 1.32: Budget ranks with the SAME points as Similar (it is Similar under
  // a price line). The budget* knobs below are kept but no longer used.
  // Same primary TYPE earns points on BOTH profiles now — an instant's
  // cousin should be an instant; Budget (a literal stand-in hunt) weighs
  // it heavier still.
  typeBonus: 5,
  // Budget profile: EDHREC's card page lists cards CO-PLAYED in the same
  // decks, not cards doing the same job — on a stand-in hunt that signal
  // is halved-and-halved.
  budgetPageSynergy: 5,
  budgetPageOther: 2,
  budgetTypeBonus: 8,
};

function similarityScore(src, cand, opts) {
  const o = opts || {};
  const P = SIM_POINTS;
  const nm = cand.name || cand.n;
  const sw = o.srcWords || magicWordSet(src);
  const cw = magicWordSet(cand);
  let w = 0,
    shared = 0;
  sw.forEach((k) => {
    if (cw.has(k)) {
      shared++;
      const mww = mwWeight(k, o.weights);
      w += Math.min(P.wordMax, Math.max(P.wordMin, P.wordScale * mww * mww));
    }
  });
  w = Math.min(P.wordCap, w);
  const wb = Math.min(P.sharedCap, (P.sharedPair * shared * (shared - 1)) / 2);
  let missN = 0;
  cw.forEach((k) => {
    if (!sw.has(k)) missN++;
  });
  const ms = Math.min(P.missCap, P.missRate * missN);
  const st = o.srcTags || [];
  let tShared = 0;
  if (o.tagHas)
    st.forEach((t) => {
      if (o.tagHas(cand, t)) tShared++;
    });
  const tg = Math.min(P.tagCap, P.tagRate * tShared);
  // Off-role tags: candidate functions the source card doesn't share.
  let tMissN = 0;
  try {
    const cl = localTagSetSync(cand);
    if (cl && cl.size) {
      const stSet = new Set(st);
      cl.forEach((t) => {
        if (!stSet.has(t)) tMissN++;
      });
    }
  } catch (e) {}
  const tms = Math.min(P.tagMissCap, P.tagMissRate * tMissN);
  let th = 0;
  if (nm && o.themeSets && o.themeSets.length) {
    let hits = 0;
    o.themeSets.forEach((setN) => {
      if (setN && setN.has && setN.has(nm)) hits++;
    });
    th = P.themePage * Math.min(P.themeCap, hits);
  }
  let pg = 0,
    eIdx = 99999;
  if (nm && o.eMap && o.eMap.size && o.eMap.has(nm)) {
    const e = o.eMap.get(nm);
    eIdx = e.i;
    pg = o.budget
      ? e.syn
        ? P.budgetPageSynergy
        : P.budgetPageOther
      : e.syn
        ? P.pageSynergy
        : P.pageOther;
  }
  const tp =
    primaryTypeOf(src) && primaryTypeOf(src) === primaryTypeOf(cand)
      ? o.budget
        ? P.budgetTypeBonus
        : P.typeBonus
      : 0;
  const sci = colorIdOf(src),
    cci = colorIdOf(cand);
  const c =
    sci === cci
      ? P.colorSame
      : cci === '' || sci === '' || [...cci].some((ch) => sci.includes(ch))
        ? P.colorOverlap
        : 0;
  const pop = cand.edhrec_rank || cand.rk || (o.fallbackPop != null ? 1e6 + o.fallbackPop : 999999);
  return {
    pts: th + pg + w + wb + tg + c + tp - ms - tms,
    th,
    pg,
    w,
    wb,
    ms,
    tg,
    tms,
    c,
    tp,
    shared,
    tShared,
    eIdx,
    pop,
  };
}

function cmpSimilarity(a, b) {
  return (
    b.s.pts - a.s.pts || a.s.eIdx - b.s.eIdx || a.s.pop - b.s.pop || (a.s.eur || 0) - (b.s.eur || 0)
  );
}

/* A slim local-database card dressed as a Scryfall card, so tiles, prices,
   and card sheets treat it like any search result. */
function bulkToCardish(c) {
  if (!c || !c.id) return null;
  const img = (size) =>
    'https://cards.scryfall.io/' + size + '/front/' + c.id[0] + '/' + c.id[1] + '/' + c.id + '.jpg';
  return {
    name: c.n,
    id: c.id,
    oracle_id: c.o,
    mana_cost: c.mc || '',
    cmc: c.mv || 0,
    type_line: c.tl || '',
    oracle_text: c.ot || '',
    colors: (c.c || '').split('').filter(Boolean),
    color_identity: (c.ci || '').split('').filter(Boolean),
    keywords: c.kw || [],
    layout: c.ly,
    set: c.st,
    set_name: c.sn,
    collector_number: c.cn,
    rarity: c.r,
    edhrec_rank: c.rk,
    power: c.pw,
    toughness: c.tg,
    prices: {
      eur: c.eur != null ? String(c.eur) : null,
      eur_foil: c.eurf != null ? String(c.eurf) : null,
    },
    legalities: Object.assign(
      { commander: c.lg || 'legal' },
      c.lx
        ? LX_FORMATS.reduce((o, f, i) => {
            o[f] = LX_WORD[c.lx[i]] || 'not_legal';
            return o;
          }, {})
        : {},
    ),
    image_uris: { small: img('small'), normal: img('normal'), large: img('large') },
    card_faces:
      c.f && c.f.length
        ? c.f.map((fc) => ({
            name: fc.name,
            mana_cost: fc.mc || '',
            type_line: fc.tl || '',
            oracle_text: fc.ot || '',
            colors: (fc.c || '').split('').filter(Boolean),
            power: fc.pw,
            toughness: fc.tg,
          }))
        : undefined,
  };
}

/* Every commander-legal, identity-fitting card in the local corpus that
   shares at least one magic word — the complete offline candidate sweep. */
function _bulkSweep(ix, src, srcWords, ciSet, maxEur, skipName) {
  const out = [];
  if (!ix || !ix.cards || !srcWords.size) return out;
  for (const bc of ix.cards) {
    if (bc.lg !== 'legal' || bc.n === skipName) continue;
    if (maxEur != null && (bc.eur == null || bc.eur > maxEur)) continue;
    if (ciSet && ![...(bc.ci || '')].every((ch) => ciSet.has(ch))) continue;
    if (/\bLand\b/.test(String(bc.tl || '').split('//')[0])) continue;
    const cw = magicWordSet(bc);
    let sh = 0;
    srcWords.forEach((k) => {
      if (cw.has(k)) sh++;
    });
    if (sh) out.push(bc);
  }
  return out;
}

const PHRASE_FEATS = [
  {
    k: 'gy-to-hand',
    w: 6,
    re: /return[^.]{0,60}from (your|a) graveyard to (your|its owner's) hand/,
    q: 'o:"from your graveyard to your hand"',
  },
  {
    k: 'reanimate',
    w: 6,
    re: /return[^.]{0,60}from (your|a) graveyard[^.]{0,50}battlefield/,
    q: 'o:"from your graveyard" o:"the battlefield"',
  },
  { k: 'spells-matter', w: 4, re: /instant (or|and) sorcery/, q: 'o:"instant or sorcery"' },
  { k: 'counterspell', w: 6, re: /counter target/, q: 'o:"counter target"' },
  { k: 'tutor', w: 5, re: /search your library/, q: 'o:"search your library"' },
  {
    k: 'wipe',
    w: 6,
    re: /destroy all|exile all|each creature gets -|deals? \d+ damage to each creature/,
    q: '(o:"destroy all creatures" or o:"exile all creatures" or o:"damage to each creature")',
  },
  { k: 'removal-destroy', w: 3, re: /destroy target/, q: 'o:"destroy target"' },
  { k: 'removal-exile', w: 3, re: /exile target/, q: 'o:"exile target"' },
  {
    k: 'bounce',
    w: 4,
    re: /return target[^.]{0,50}to (its|their) owner's hand/,
    q: 'o:"to its owner\'s hand"',
  },
  {
    k: 'draw-matters',
    w: 5,
    re: /whenever you draw|whenever an opponent draws/,
    q: '(o:"whenever you draw" or o:"whenever an opponent draws")',
  },
  { k: 'draw', w: 2, re: /draws? (a|two|three|x|that many) cards?/, q: 'o:"draw a card"' },
  {
    k: 'mill',
    w: 5,
    re: /\bmills? |puts? the top [^.]{0,30}library into (their|your|his or her) graveyard/,
    q: 'o:mill',
  },
  { k: 'tokens', w: 3, re: /creates? [^.]{0,40}token/, q: 'o:create o:token' },
  { k: 'counters-grow', w: 3, re: /\+1\/\+1 counter/, q: 'o:"+1/+1 counter"' },
  { k: 'proliferate', w: 6, re: /proliferate/, q: 'o:proliferate' },
  {
    k: 'ramp',
    w: 4,
    re: /add \{|search your library for (a|up to two) (basic )?land/,
    q: '(o:"add {c}" or o:"basic land card")',
  },
  { k: 'sac-outlet', w: 4, re: /sacrifice (a|another) creature/, q: 'o:"sacrifice a creature"' },
  { k: 'discard', w: 3, re: /discards? (a|two|that) card/, q: 'o:discard' },
  { k: 'lifegain', w: 2, re: /gains? \d+ life|gain that much life/, q: 'o:gain o:life' },
  { k: 'drain', w: 3, re: /loses? \d+ life/, q: 'o:"loses" o:"life"' },
  { k: 'dies-trigger', w: 3, re: /when(ever)? [^.]{0,40}dies/, q: 'o:dies' },
  { k: 'cast-trigger', w: 3, re: /whenever you cast/, q: 'o:"whenever you cast"' },
  { k: 'attack-trigger', w: 2, re: /whenever [^.]{0,40}attacks/, q: 'o:whenever o:attacks' },
  { k: 'copy', w: 5, re: /copy target|create a copy/, q: 'o:"copy target"' },
  {
    k: 'blink',
    w: 5,
    re: /exile [^.]{0,60}return (it|that card) to the battlefield/,
    q: 'o:exile o:"return it to the battlefield"',
  },
  { k: 'extra-turn', w: 6, re: /extra turn/, q: 'o:"extra turn"' },
  {
    k: 'redirect',
    w: 6,
    re: /choose new targets?|change the targets? of/,
    q: 'o:"choose new targets"',
  },
  {
    k: 'free-spell',
    w: 5,
    re: /without paying (its|their) mana costs?/,
    q: 'o:"without paying its mana cost"',
  },
  {
    k: 'peek-hand',
    w: 6,
    re: /look at (target|that|each|an) (player|opponent)'s hand|play(s)? with (his or her|their) hands? revealed/,
    q: 'o:"look at target player\'s hand"',
  },
  {
    k: 'landfall',
    w: 5,
    re: /landfall|whenever a land (you control )?enters/,
    q: 'o:"whenever a land"',
  },
  { k: 'etb', w: 1, re: /when(ever)? [^.]{0,40}enters/, q: null },
];

/* 1.33: lands are judged by the JOB they do, not by popularity alone.
   Gaea's Cradle's kin are the lands that make mana that SCALES (Serra's
   Sanctum, Three Tree City, Cabal Coffers, Nykthos), not the most played
   fetchland. Shared jobs earn points, jobs the source lacks cost some, and
   lands that make the same colours get a small nudge. One table for
   Similar cards AND Budget. */
const LAND_FEATS = [
  {
    k: 'scale',
    w: 24,
    re: /add [^.]*\b(for each|equal to)\b|add an amount of|\badd x\b|devotion/,
    q: '(o:"for each" or o:"equal to" or o:devotion)',
  },
  {
    k: 'double',
    w: 10,
    re: /add \{[wubrgc]\}\{[wubrgc]\}|add (two|three) mana/,
    q: '(o:"{c}{c}" or o:"add two mana")',
  },
  {
    k: 'fetch',
    w: 16,
    re: /search your library for [^.]*\b(lands?|plains|island|swamp|mountain|forest|gates?)\b/,
    q: 'o:"search your library"',
  },
  {
    k: 'anycolor',
    w: 8,
    re: /mana of any (one )?colou?r|any combination of colou?rs|colou?r identity/,
    q: 'o:"any color"',
  },
  { k: 'manland', w: 16, re: /becomes? an? [^.]*\bcreature\b/, q: 'o:becomes o:creature' },
  { k: 'draw', w: 12, re: /draws? (a|two|three|x) cards?|\binvestigate\b/, q: 'o:draw' },
  {
    k: 'removal',
    w: 14,
    re: /(destroy|exile) target|deals? \d+ damage to (any|target)|gets? -\d+\/-\d+/,
    q: '(o:"destroy target" or o:"exile target")',
  },
  {
    k: 'recursion',
    w: 12,
    re: /from your graveyard to (your hand|the battlefield)|return target [^.]*card from your graveyard/,
    q: 'o:"from your graveyard"',
  },
  { k: 'tokens', w: 12, re: /create [^.]*\btokens?\b/, q: 'o:create o:token' },
  { k: 'untap', w: 10, re: /\buntap (target|all|up to|another)/, q: 'o:untap' },
  { k: 'protect', w: 10, re: /\bhexproof\b|\bindestructible\b|protection from/, q: null },
  { k: 'channel', w: 8, re: /\bchannel\b/, q: 'o:channel' },
  { k: 'bounceland', w: 8, re: /return a land you control to its owner's hand/, q: null },
  { k: 'nomaxhand', w: 6, re: /no maximum hand size/, q: null },
  { k: 'cycling', w: 5, re: /\bcycling\b/, q: null },
  { k: 'pain', w: 3, re: /deals? 1 damage to you|pay \d+ life/, q: null },
  { k: 'tapped', w: 2, re: /enters (the battlefield )?tapped/, q: null },
];

const LAND_FEAT_W = LAND_FEATS.reduce(
  (o, f) => {
    o[f.k] = f.w;
    return o;
  },
  { typed: 4 },
);

function landFeats(card) {
  const faces = card.card_faces && card.card_faces.length ? card.card_faces : [card];
  const t = faces
    .map((f) => f.oracle_text || '')
    .join(' ')
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\([^)]*\)/g, ' ');
  return LAND_FEATS.filter((f) => f.re.test(t));
}

function landFeatKeys(card) {
  if (card._lfk) return card._lfk;
  const out = new Set(landFeats(card).map((f) => f.k));
  const tl = String(card.type_line || '').split('//')[0];
  if (
    /\b(Plains|Island|Swamp|Mountain|Forest)\b/.test(tl.split('\u2014')[1] || '') &&
    !/\bBasic\b/.test(tl)
  )
    out.add('typed');
  try {
    card._lfk = out;
  } catch (e) {}
  return out;
}

function landKinScore(src, cand) {
  const a = landFeatKeys(src),
    b = landFeatKeys(cand);
  let p = 0,
    miss = 0;
  a.forEach((k) => {
    if (b.has(k)) p += LAND_FEAT_W[k] || 0;
  });
  b.forEach((k) => {
    if (!a.has(k) && (LAND_FEAT_W[k] || 0) >= 5) miss++;
  });
  const pa = producedManaOf(src).filter((x) => x !== 'C');
  const pb = new Set(producedManaOf(cand).filter((x) => x !== 'C'));
  let same = 0;
  pa.forEach((k) => {
    if (pb.has(k)) same++;
  });
  p += Math.min(6, same * 2);
  return p - Math.min(12, miss * 4);
}

function phraseFeats(card) {
  const faces = card.card_faces && card.card_faces.length ? card.card_faces : [card];
  const t = faces
    .map((f) => f.oracle_text || '')
    .join(' ')
    .toLowerCase()
    .replace(/\u2019/g, "'");
  const out = [];
  for (const f of PHRASE_FEATS) {
    if (f.re.test(t)) out.push(f);
  }
  return out;
}

function phraseOverlapWeight(srcFeats, cand) {
  const ck = new Set(phraseFeats(cand).map((f) => f.k));
  let p = 0;
  srcFeats.forEach((f) => {
    if (ck.has(f.k)) p += f.w;
  });
  return p;
}

/* Shared MTG-language vocabulary: keywords, zones, and game verbs. Pure
   client-side string matching on candidates already in hand — adds no
   network time to Similar cards. */
const MTG_LANG = [
  'whenever',
  'when',
  'each opponent',
  'opponent',
  'each player',
  'you control',
  'cast',
  'noncreature',
  'creature',
  'draw',
  'discard',
  'exile',
  'destroy',
  'counter target',
  'sacrifice',
  'search your library',
  'return',
  'create',
  'copy',
  'scry',
  'surveil',
  'mill',
  'tap',
  'untap',
  'attack',
  'block',
  'pay',
  'token',
  'treasure',
  'clue',
  'graveyard',
  'battlefield',
  'library',
  'hand',
  'damage',
  'gain life',
  'life',
  '+1/+1',
  '-1/-1',
  'proliferate',
  'flying',
  'first strike',
  'double strike',
  'deathtouch',
  'lifelink',
  'haste',
  'vigilance',
  'trample',
  'menace',
  'reach',
  'defender',
  'hexproof',
  'ward',
  'indestructible',
  'flash',
  'prowess',
  'landfall',
  'cascade',
  'equip',
  'enchant',
  'add {',
];

async function openSimilarCards(card, colorScope) {
  // 1.9: colorScope may be a DECK (opened from its card sheet): then the
  // deck's colour identity is the ceiling, nothing else of the deck
  const scopeDeck =
    colorScope && typeof colorScope === 'object' && deckLeaders(colorScope).length
      ? colorScope
      : null;
  if (colorScope && typeof colorScope === 'object' && !scopeDeck) colorScope = false;
  // A Similar page opened OVER an earlier Similar page (via a card sheet in
  // between) must not hijack the earlier one's element — the singleton
  // reuse replaced the first list's content with the second's, so backing
  // up showed the wrong list on the wrong card. The earlier page steps
  // aside under a private id (its inner ids stripped so async writers and
  // lookups can't reach into it), its stack entry re-bound to its own
  // element — the same dance stacked card sheets already do.
  {
    const ex = document.getElementById('similarOverlay');
    const topId = state.overlayStack.length
      ? state.overlayStack[state.overlayStack.length - 1].id
      : null;
    if (ex && topId !== 'similar') {
      window._simBgSeq = (window._simBgSeq || 0) + 1;
      ex.id = 'similarOverlay_bg' + window._simBgSeq;
      ex.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      const bgEl = ex;
      const oldEntry = state.overlayStack
        .slice()
        .reverse()
        .find((e) => e.id === 'similar');
      if (oldEntry)
        oldEntry.closeFn = () => {
          try {
            bgEl.remove();
          } catch (e) {}
        };
    }
  }
  pushOverlay('similar', () => {
    document.getElementById('similarOverlay')?.remove();
  });
  let el = document.getElementById('similarOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'similarOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(card.name)}
    <main>
      <div class="tag-focus-row" id="simTagRow" hidden></div>
      <div class="reco-admiral">
        <img
          class="${wbClass(card)}"
          src="${cardImageLarge(card)}"
          id="simCardImg"
          alt="${escapeHtml(card.name)}"
        />
      </div>
      <p class="hint" style="text-align:center;margin:0 0 8px;">
        ${trS('Similar cards')} — ${trS('cards that do the same job')}, ${trS('most played first.')}
      </p>
      ${deckColorNoteHtml(scopeDeck)}
      <div id="simBody">
        <div class="status"><div class="spinner"></div></div>
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  document
    .getElementById('simCardImg')
    ?.addEventListener('click', () => showCardPreview(card, cardImageLarge(card)));
  // 1.25: the list painter is shared by the full list and the tag focus
  let simCtx = null;
  const simPaint = (ranked, note) => {
    const box = document.getElementById('simBody');
    if (!box) return;
    ranked = ranked.slice(0, 40);
    if (!ranked.length) {
      box.innerHTML = /* HTML */ `<div class="empty-note">${trS('No similar cards found.')}</div>`;
      return;
    }
    // 1.36: the house tile with its green + (and the red − once it is in)
    box.innerHTML =
      (note ? `<p class="hint" style="text-align:center;margin:0 0 8px;">${note}</p>` : '') +
      `<div class="sr-grid">${ranked.map((c) => searchRowHtml(c, scopeDeck || null)).join('')}</div>`;
    // 1.8: the house multi-select; a plain tap opens the card
    wireOverlayPick(box.closest('.overlay'), box, ranked, (nm) => {
      const i = ranked.findIndex((x) => x.name === nm);
      if (i >= 0) openCardInfo(ranked[i], { pool: ranked, poolIdx: i });
    });
    wireResultButtons(ranked, scopeDeck || null, () => simPaint(ranked, note));
    loadTilePrices(ranked);
  };
  const simFocus = async (tag) => {
    if (!simCtx) return;
    if (!tag) {
      simPaint(simCtx.base, simCtx.baseNote);
      return;
    }
    const box = document.getElementById('simBody');
    if (!box) return;
    box.innerHTML = '<div class="status"><div class="spinner"></div></div>';
    const key = 'otag:' + tag;
    if (!simCtx.pools[key]) {
      let got = [];
      try {
        const r = await searchAndVerifyLegal(
          (simCtx.idClause + (simCtx.land ? 't:land ' : '') + 'otag:' + tag).trim(),
          'edhrec',
          60,
        );
        got = ((r && r.results) || []).filter(
          (x) => (simCtx.land ? !isNonlandFront(x) : isNonlandFront(x)) && !isBanned(x),
        );
      } catch (e) {}
      simCtx.pools[key] = got;
      got.forEach((x, i) => {
        if (x.name === card.name) return;
        let e = simCtx.cand.get(x.name);
        if (!e) {
          e = { x, best: i, tags: new Set([tag]) };
          simCtx.cand.set(x.name, e);
          simCtx.scoreE(e);
        } else e.tags.add(tag);
      });
    }
    if ((document.getElementById('simTagSel')?.value || '') !== tag) return; // another pick meanwhile
    const list = Array.from(simCtx.cand.values())
      .filter((e) => simCtx.has(e, tag))
      .sort(cmpSimilarity)
      .slice(0, 20)
      .map((e) => e.x);
    simPaint(list, 'Focused on ' + '<b>' + escapeHtml(otagLabel(tag)) + '</b>');
  };
  try {
    const f = frontFace(card);
    const isLand = /\bLand\b/.test(f.type_line || '');
    const ci = scopeDeck ? deckColorIdentity(scopeDeck) : card.color_identity || [];
    const idClause = scopeDeck
      ? idClauseForDeck(scopeDeck) + ' '
      : colorScope && ci.length
        ? 'id<=' + ci.join('').toLowerCase() + ' '
        : '';
    let ranked = [],
      typeFallback = false;
    if (isLand) {
      // 1.33: real kin for lands. Every legal land in the phone's corpus is
      // a candidate (scoring decides, not popularity), plus online pools:
      // the most played lands, one per land job, one per function tag.
      const _eMapPL = edhrecPageNames(card);
      const mL = await detectOtagsForCards([card]);
      const tagsAllL = mL[card.name] || [];
      const ciSetL =
        scopeDeck || (colorScope && ci.length)
          ? new Set(ci.map((x) => String(x).toUpperCase()))
          : null;
      const cand = new Map();
      const addC = (x, i, tag) => {
        if (!x || x.name === card.name || isNonlandFront(x) || isBanned(x)) return;
        let e = cand.get(x.name);
        if (!e) {
          e = { x, best: i, tags: new Set() };
          cand.set(x.name, e);
        } else e.best = Math.min(e.best, i);
        if (tag) e.tags.add(tag);
      };
      let _corpusL = 0;
      try {
        const ix = await bulkIndexReady();
        if (ix && ix.cards)
          for (const bc of ix.cards) {
            if (bc.lg !== 'legal' || bc.n === card.name) continue;
            if (!/\bLand\b/.test(String(bc.tl || '').split('//')[0])) continue;
            if (ciSetL && ![...(bc.ci || '')].every((ch) => ciSetL.has(ch))) continue;
            if (isBanned({ name: bc.n })) continue;
            addC(bulkToCardish(bc), 500);
            _corpusL++;
          }
      } catch (e) {}
      const lqs = [['top', (idClause + 't:land').trim()]];
      landFeats(card)
        .filter((f) => f.q)
        .forEach((f) => lqs.push(['lf:' + f.k, (idClause + 't:land ' + f.q).trim()]));
      tagsAllL
        .slice(0, 3)
        .forEach((t) => lqs.push(['otag:' + t, (idClause + 't:land otag:' + t).trim()]));
      const poolsL = {};
      await runLimited(
        lqs,
        async (pair) => {
          try {
            const r = await searchAndVerifyLegal(pair[1], 'edhrec', 60);
            poolsL[pair[0]] = (r && r.results) || [];
          } catch (e) {
            poolsL[pair[0]] = [];
          }
        },
        3,
      );
      Object.entries(poolsL).forEach(([k, arr]) =>
        arr.forEach((x, i) => addC(x, i, k.startsWith('otag:') ? k.slice(5) : null)),
      );
      const _eRL = await Promise.race([
        _eMapPL,
        new Promise((r) => setTimeout(() => r('late'), 3000)),
      ]);
      const eMapL = _eRL && _eRL !== 'late' ? _eRL : new Map();
      const srcWordsL = magicWordSet(card);
      const weightsL = await magicWordWeights();
      const hasL = (e, t) => {
        const l = localTagSetSync(e.x);
        return (l ? l.has(t) : false) || e.tags.has(t);
      };
      const scoreL = (e) => {
        e.s = similarityScore(card, e.x, {
          srcWords: srcWordsL,
          weights: weightsL,
          srcTags: tagsAllL,
          eMap: eMapL,
          tagHas: (cc, t) => hasL(e, t),
          fallbackPop: e.best,
        });
        e.s.lk = landKinScore(card, e.x);
        e.s.pts += e.s.lk;
      };
      cand.forEach(scoreL);
      simCtx = {
        cand,
        pools: poolsL,
        idClause,
        tagsAll: tagsAllL,
        land: true,
        scoreE: scoreL,
        has: hasL,
      };
      const _allL = Array.from(cand.values()).sort(cmpSimilarity);
      ranked = _allL.slice(0, 20).map((e) => e.x);
      sfJournal(
        'similar land: ' +
          card.name +
          ' · corpus:' +
          _corpusL +
          ' cand:' +
          cand.size +
          ' feats[' +
          Array.from(landFeatKeys(card)).join(',') +
          ']' +
          (_allL.length
            ? ' top: ' +
              _allL[0].x.name +
              ' pts:' +
              Math.round(_allL[0].s.pts) +
              ' lk:' +
              _allL[0].s.lk
            : ''),
      );
    } else {
      const srcFeats = phraseFeats(card);
      const _eMapP = edhrecPageNames(card); // in flight while the pools load
      const _themesP = (async () => {
        const th = await edhrecCardThemes(card);
        const sets = await Promise.all(th.map((t) => edhrecThemeNames(t).catch(() => null)));
        return sets.filter((x) => x && x.size);
      })().catch(() => []);
      const m = await detectOtagsForCards([card]);
      const tagsAll = m[card.name] || [];
      const tags = tagsAll.slice(0, 6);
      // Candidate pools, in Stef's priority order: TEXT features first (the
      // exact rules-language the card uses), curated function tags second.
      const queries = [];
      srcFeats
        .filter((f) => f.q)
        .sort((a, b) => b.w - a.w)
        .slice(0, 3)
        .forEach((f) => queries.push(['txt:' + f.k, (idClause + f.q).trim()]));
      tags.forEach((tag) => queries.push(['otag:' + tag, (idClause + 'otag:' + tag).trim()]));
      const pools = {};
      if (queries.length) {
        await runLimited(
          queries,
          async (pair) => {
            try {
              const r = await searchAndVerifyLegal(pair[1], 'edhrec', 60);
              pools[pair[0]] = ((r && r.results) || []).filter(
                (x) => isNonlandFront(x) && !isBanned(x),
              );
            } catch (e) {
              pools[pair[0]] = [];
            }
          },
          3,
        );
      }
      // ---- Stef's ranking, four steps, lexicographic: magic words, then
      // curated tags, then colors, then EDHREC play. Pool members carry
      // their tag memberships; the local corpus sweep (Commander only —

      // shares at least one word with the source.
      {
        const cand = new Map();
        Object.entries(pools).forEach(([key, arr]) =>
          arr.forEach((x, i) => {
            if (x.name === card.name) return;
            let e = cand.get(x.name);
            if (!e) {
              e = { x, best: i, tags: new Set() };
              cand.set(x.name, e);
            } else e.best = Math.min(e.best, i);
            if (key.startsWith('otag:')) e.tags.add(key.slice(5));
          }),
        );
        const srcWords = magicWordSet(card);
        const _poolCand = cand.size;
        let _corpusOk = false;
        {
          try {
            const ix = await bulkIndexReady();
            _corpusOk = !!(ix && ix.cards && ix.cards.length);
            const ciSet = scopeDeck
              ? new Set(ci.map((x) => String(x).toUpperCase()))
              : colorScope && ci.length
                ? new Set(ci.map((x) => String(x).toUpperCase()))
                : null;
            _bulkSweep(ix, card, srcWords, ciSet, null, card.name).forEach((bc) => {
              if (cand.has(bc.n) || isBanned({ name: bc.n })) return;
              const x = bulkToCardish(bc);
              if (x) cand.set(bc.n, { x, best: 500, tags: new Set() });
            });
          } catch (e) {}
        }
        // One shared three-second deadline for ALL EDHREC signals — a deep
        // research dive must not stall behind huge pages. Late arrivals
        // still land in the week cache for the next open.
        const _deadline = new Promise((r) => setTimeout(() => r('late'), 3000));
        const _eRaced = await Promise.race([_eMapP, _deadline]);
        const eMap = _eRaced && _eRaced !== 'late' ? _eRaced : new Map();
        const _thRaced = await Promise.race([_themesP, _deadline]);
        const themeSets = Array.isArray(_thRaced) ? _thRaced : [];
        sfJournal(
          'similar: ' +
            card.name +
            ' · words[' +
            srcWords.size +
            '] pools:' +
            _poolCand +
            (' corpus:' + (_corpusOk ? '+' + (cand.size - _poolCand) : 'ABSENT')) +
            ' edh:' +
            (_eRaced === 'late' ? 'late' : eMap.size) +
            ' themes:' +
            (_thRaced === 'late' ? 'late' : themeSets.length),
        );
        const weights = await magicWordWeights();
        cand.forEach((e) => {
          e.s = similarityScore(card, e.x, {
            srcWords,
            weights,
            srcTags: tagsAll,
            eMap,
            themeSets,
            tagHas: (cc, t) => {
              const l = localTagSetSync(cc);
              return (l ? l.has(t) : false) || e.tags.has(t);
            },
            fallbackPop: e.best,
          });
        });
        // 1.25: kept for the tag focus -- the same candidates, the same points
        simCtx = {
          cand,
          pools,
          idClause,
          tagsAll,
          scoreE: (e) => {
            e.s = similarityScore(card, e.x, {
              srcWords,
              weights,
              srcTags: tagsAll,
              eMap,
              themeSets,
              tagHas: (cc, t) => {
                const l = localTagSetSync(cc);
                return (l ? l.has(t) : false) || e.tags.has(t);
              },
              fallbackPop: e.best,
            });
          },
          has: (e, t) => {
            const l = localTagSetSync(e.x);
            return (l ? l.has(t) : false) || e.tags.has(t);
          },
        };
        const _all = Array.from(cand.values()).sort(cmpSimilarity);
        ranked = _all.slice(0, 20).map((e) => e.x); // the 20 best earn their place — more is noise
        if (_all.length) {
          const t = _all[0];
          sfJournal(
            'top: ' +
              (t.x.name || t.x.n) +
              ' pts:' +
              Math.round(t.s.pts) +
              ' (th:' +
              t.s.th +
              ' pg:' +
              t.s.pg +
              ' w:' +
              Math.round(t.s.w) +
              ' wb:' +
              Math.round(t.s.wb || 0) +
              ' ms:-' +
              Math.round(t.s.ms || 0) +
              ' tg:' +
              t.s.tg +
              ' tms:-' +
              Math.round(t.s.tms || 0) +
              ' c:' +
              t.s.c +
              ')',
          );
        }
      }
      if (!ranked.length) {
        // No curated tags for this one — fall back to its closest kin by type.
        typeFallback = true;
        const tm = (f.type_line || '').match(
          /Creature|Instant|Sorcery|Artifact|Enchantment|Planeswalker|Battle/,
        );
        if (tm) {
          const r = await searchAndVerifyLegal(
            (idClause + 't:' + tm[0].toLowerCase()).trim(),
            'edhrec',
            80,
          ).catch(() => ({ results: [] }));
          ranked = ((r && r.results) || []).filter((x) => !isBanned(x) && x.name !== card.name);
        }
      }
    }
    const box = document.getElementById('simBody');
    if (!box) return; // overlay closed while loading
    const baseNote = typeFallback ? trS('Function unknown — showing its closest kin by type.') : '';
    if (simCtx) {
      simCtx.base = ranked.slice();
      simCtx.baseNote = baseNote;
      tagFocusRowFill('simTagRow', 'simTagSel', simCtx.tagsAll, simFocus);
    }
    simPaint(ranked, baseNote);
  } catch (e) {
    _noteCrash(
      'similar FAILED',
      e && (e.message || e),
      e && e.stack ? String(e.stack).split('\n')[1] : '',
    );
    const box = document.getElementById('simBody');
    if (box)
      box.innerHTML = /* HTML */ `<div class="error-note">
        Couldn't reach Scryfall. Check your connection and try again.
      </div>`;
  }
}
