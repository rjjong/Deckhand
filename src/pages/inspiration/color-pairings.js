// pages / inspiration / color-pairings

/* ---- 1.30: only a colour combination chosen ----
   EDHREC's colour pages come in three: the commanders, the Staples
   (/commanders/<colour>/staples.json) and the Mana Staples. All three show,
   each ending in a More button that adds the next ten above it (bottom-up:
   Commanders at the foot, Staples above, Mana Staples on top). */
function browseColorOnly() {
  const s = state.browseSel;
  return browseCommanderMode() && !!s.combo && !s.theme && !s.tribe;
}

function colorStaplesKey(key) {
  return key + '::staples';
}

/* name + play numbers of every card on an EDHREC list page, in its order */
function edhrecColorStapleList(data) {
  const out = [],
    seen = new Set();
  const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
  lists.forEach((L) =>
    ((L && L.cardviews) || []).forEach((cv) => {
      const n = cv && typeof cv.name === 'string' ? cv.name.trim() : '';
      if (!n || seen.has(n)) return;
      seen.add(n);
      out.push({
        name: n,
        decks: typeof cv.num_decks === 'number' ? cv.num_decks : null,
        potential: typeof cv.potential_decks === 'number' ? cv.potential_decks : null,
      });
    }),
  );
  return out;
}

async function loadColorStaples(key, combo) {
  const sk = colorStaplesKey(key);
  if (state.browseCache[sk] !== undefined) return;
  state.browseCache[sk] = null; // null = loading
  const slugs = EDHREC_COMBO_SLUGS[(combo || '').toLowerCase()] || [];
  const pull = async (subs) => {
    for (const cs of slugs)
      for (const sub of subs) {
        let data = null;
        try {
          data = await edhrecFetchJson('/pages/commanders/' + cs + '/' + sub + '.json');
        } catch (e) {
          data = null;
        }
        const L = edhrecColorStapleList(data);
        if (L.length) return L;
      }
    return [];
  };
  const [stL, manaL] = await Promise.all([
    pull(['staples']),
    pull(['manastaples', 'mana-staples']),
  ]);
  const meta = {};
  stL.concat(manaL).forEach((x) => {
    if (!meta[x.name]) meta[x.name] = { decks: x.decks, potential: x.potential };
  });
  let cards = [];
  try {
    cards = await namesToLegalCards(Array.from(new Set(stL.concat(manaL).map((x) => x.name))));
  } catch (e) {
    cards = [];
  }
  const fmt = browseFmt();
  let ok = null;
  if (fmt !== 'commander' && cards.length) {
    try {
      ok = await filterCardsByFormat(cards, fmt, 'card');
    } catch (e) {
      ok = new Set();
    }
  }
  const byName = new Map();
  cards.forEach((c) => {
    byName.set(c.name, c);
    const cut = c.name.indexOf(' // ');
    if (cut > 0 && !byName.has(c.name.slice(0, cut))) byName.set(c.name.slice(0, cut), c);
  });
  const pick = (L) => {
    const out = [],
      seen = new Set();
    L.forEach((x) => {
      const c = byName.get(x.name);
      if (!c || seen.has(c.name) || isBanned(c)) return;
      if (ok && !ok.has(c.name)) return;
      seen.add(c.name);
      out.push(c);
    });
    return out;
  };
  const res = { staples: pick(stL), mana: pick(manaL), meta };
  state.browseCache[sk] = res.staples.length || res.mana.length ? res : false;
  if (key === browseKey() && state.browseCache[key]) renderBrowseResults(key, true);
}

/* Keep visible Inspiration cards in place while streamed content grows. */
function holdBrowseView(box) {
  if (!box || box._holdView || !window.ResizeObserver) return;
  box._holdView = true;
  const sc = box.closest('.tab-viewport') || pageScroller();
  let anchor = null,
    top = 0,
    position = 0,
    frame = 0;
  const pick = () => {
    const bounds = sc.getBoundingClientRect();
    position = sc.scrollTop;
    anchor =
      [...box.querySelectorAll('.sr-grid > *, .section-label')].find((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > bounds.top && r.top < bounds.bottom;
      }) || null;
    top = anchor ? anchor.getBoundingClientRect().top : 0;
  };
  const onScroll = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        pick();
      });
  };
  const observer = new ResizeObserver(() => {
    if (!box.isConnected) {
      observer.disconnect();
      sc.removeEventListener('scroll', onScroll);
      return;
    }
    if (Math.abs(sc.scrollTop - position) > 1) {
      pick();
      return;
    }
    if (anchor?.isConnected) {
      const delta = anchor.getBoundingClientRect().top - top;
      if (Math.abs(delta) > 0.5) sc.scrollTop += delta;
    }
    pick();
  });
  observer.observe(box);
  sc.addEventListener('scroll', onScroll, { passive: true });
  pick();
}

/* cmd = { items, tile(it, idx) -> html, after(chunk) } for the commanders. */
function renderColorBrowse(box, key, cmd, keepScroll) {
  holdBrowseView(box);
  // 1.7: the loose Inspiration page has no tie to any deck (that is what the
  // deck's own Inspiration button is for) -- no pinned deck here
  const pinned = null;
  const CAP = 10;
  const shownK = key + '::shown';
  const shown = state.browseCache[shownK] || (state.browseCache[shownK] = {});
  const st = state.browseCache[colorStaplesKey(key)];
  const meta = (st && st.meta) || {};
  const subOf = (c) => {
    const cut = c.name.indexOf(' // ');
    const m = meta[c.name] || (cut > 0 ? meta[c.name.slice(0, cut)] : null);
    if (!m || typeof m.decks !== 'number') return {};
    let t = m.decks.toLocaleString() + ' deck' + (m.decks === 1 ? '' : 's');
    if (m.potential) t += ' · ' + Math.round((1000 * m.decks) / m.potential) / 10 + '%';
    return { sub: t };
  };
  const cardSec = (id, title, list) => ({
    id,
    title,
    items: list,
    html: (part) => part.map((c) => searchRowHtml(c, pinned, Object.assign({}, subOf(c)))).join(''), // 1.36: + again
    after: (chunk, all) => {
      wireResultButtons(all, pinned, () => renderBrowseResults(key, true), {});
      loadTilePrices(chunk);
    },
  });
  // reading order: Commanders first (the foot), then Staples, then Mana Staples
  const secs = [
    {
      id: 'cmd',
      title: trS('Top') + ' ' + leaderNoun(browseFmt(), true),
      items: cmd.items,
      html: (part) => part.map((it, i) => cmd.tile(it, i)).join(''),
      after: (chunk) => cmd.after(chunk),
    },
  ]
    .concat(
      st && st.staples && st.staples.length ? [cardSec('st', trS('Staples'), st.staples)] : [],
    )
    .concat(st && st.mana && st.mana.length ? [cardSec('mana', trS('Mana Staples'), st.mana)] : []);
  const nOf = (sx) => Math.min(sx.items.length, Math.max(CAP, shown[sx.id] || 0));
  const moreBtn = (sx) =>
    `<button class="ghost-btn edh-more" data-csk="${sx.id}" style="width:100%;margin:0 0 6px;">${trS('More')}</button>`;
  // keep the commanders where the reader has them when sections arrive above
  const anc = keepScroll ? box.querySelector('.edh-sec[data-csk="cmd"]') : null;
  const y0 = anc ? anc.getBoundingClientRect().bottom : null;
  box.innerHTML =
    `<div class="edh-jump-row insp-jump"><button class="icon-btn edh-jump" id="colJump" title="${trS('Jump to section')}">☰</button></div>` +
    secs
      .map(
        (sx) =>
          `<div class="edh-sec" data-csk="${sx.id}"><div class="section-label" style="margin-top:14px;">${escapeHtml(sx.title)}</div>${sx.items.length > nOf(sx) ? moreBtn(sx) : ''}<div class="sr-grid">${sx.html(sx.items.slice(0, nOf(sx)))}</div></div>`,
      )
      .join('');
  secs.forEach((sx) => {
    const n = nOf(sx);
    sx.after(sx.items.slice(0, n), sx.items.slice(0, n));
  });
  if (y0 !== null) {
    const now = box.querySelector('.edh-sec[data-csk="cmd"]');
    if (now) {
      const dy = now.getBoundingClientRect().bottom - y0;
      if (dy) {
        const se = pageScroller();
        se.scrollTop += dy;
      }
    }
  }
  // More: the next ten, ABOVE the ones already there; the reader's cards stay put
  box.querySelectorAll('.edh-more[data-csk]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const sx = secs.find((x) => x.id === btn.dataset.csk);
      const wrap = btn.closest('.edh-sec');
      if (!sx || !wrap) return;
      const already = nOf(sx);
      const next = Math.min(sx.items.length, already + 10);
      shown[sx.id] = next;
      const g = wrap.querySelector('.sr-grid');
      const a0 = g && g.firstElementChild ? g.firstElementChild.getBoundingClientRect().top : null;
      if (g) g.innerHTML = sx.html(sx.items.slice(0, next));
      if (a0 !== null && g && g.firstElementChild) {
        const dy = g.firstElementChild.getBoundingClientRect().top - a0;
        if (dy) {
          const se = pageScroller();
          se.scrollTop += dy;
        }
      }
      if (next >= sx.items.length) btn.remove();
      sx.after(sx.items.slice(already, next), sx.items.slice(0, next));
    }),
  );
  const jb = box.querySelector('#colJump');
  if (jb) {
    if (secs.length < 2) jb.closest('.edh-jump-row').style.display = 'none';
    jb.addEventListener('click', (e) => {
      e.stopPropagation();
      openTileMenu(
        jb,
        secs.map((sx) => ({
          label: sx.title,
          fn: () => {
            const el = box.querySelector(`.edh-sec[data-csk="${sx.id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        })),
      );
    });
    bindInspJump();
  }
  if (!keepScroll) {
    // 1.2: straight to the foot in this very frame -- waiting for the next
    // frames flashed the top of the list first
    try {
      const se = pageScroller();
      se.scrollTop = 0;
    } catch (e) {}
    scrollToPageFoot();
  }
}

/* ---- Two-commander pairings for a chosen color combination ---- */
function pairsCacheKey(key) {
  return key + '::pairs';
}

/* ---- EDHREC deck counts for this colour combination ----
   EDHREC's colour pages (/commanders/jeskai.json etc.) rank every commander
   AND every partner pairing by real deck counts — the ground truth for
   "most played". One fetch per combination orders the whole results list. */
function edhrecDeckCountsKey(key) {
  return key + '::edecks';
}

async function loadEdhrecDeckCounts(key, combo, tagSlug) {
  const dk = edhrecDeckCountsKey(key);
  if (state.browseCache[dk] !== undefined) return;
  state.browseCache[dk] = null; // null = loading
  let map = false; // false = unavailable
  const slugs = EDHREC_COMBO_SLUGS[(combo || '').toLowerCase()] || [];
  for (const cs of slugs) {
    // With a theme or Kindred selected, popularity means "within that tag, in
    // these colours" — EDHREC's /tags/<tag>/<colour> page. Without one, it's
    // the colour page itself. No cross-fallback: if the tag page is missing,
    // the pool's own order (already the tag's play order) is the truth.
    let data = null;
    if (tagSlug) {
      for (const root of ['/pages/tags/', '/pages/themes/', '/pages/typal/']) {
        // themes and kindred live in their own namespaces
        data = await edhrecFetchJson(root + tagSlug + '/' + cs + '.json');
        if (data) break;
      }
    } else {
      data = await edhrecFetchJson('/pages/commanders/' + cs + '.json');
    }
    if (!data) continue;
    const m = edhrecDeckCountsFrom(data);
    if (Object.keys(m).length) {
      map = m;
      break;
    }
  }
  state.browseCache[dk] = map;
  // Re-render only if the pool itself has landed. Firing before that wiped
  // the loading spinner: with pairs already in, the render skipped the
  // still-loading branch and painted the caption over an empty page.
  // 1.2: late extras (pairs, deck counts) keep the reader where they are once the list shows
  if (key === browseKey() && state.browseCache[key])
    renderBrowseResults(key, !!document.querySelector('#browseResults .sr-grid'));
}

function edhrecDeckCountsFrom(data) {
  // Walk the page JSON for anything carrying a name and a num_decks. Partner
  // pairings arrive either as a combined "A // B" name or a names array —
  // record the joined spelling too so lookups in either order can hit.
  const map = {};
  const put = (n, d) => {
    if (!n) return;
    const k = String(n).trim();
    if (!(map[k] >= d)) map[k] = d;
  };
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (typeof o.num_decks === 'number' && o.num_decks > 0) {
      if (typeof o.name === 'string') put(o.name, o.num_decks);
      if (Array.isArray(o.names) && o.names.length) put(o.names.join(' // '), o.num_decks);
    }
    for (const k in o) walk(o[k]);
  };
  walk(data);
  return map;
}

async function loadLeaderPairs(key, combo, theme) {
  const pk = pairsCacheKey(key);
  if (state.browseCache[pk] !== undefined) return;
  state.browseCache[pk] = null; // null = loading
  const colClause = combo === 'c' ? 'id=c' : 'id<=' + combo;
  let results = [];
  try {
    const themeClause = theme ? themeQueryClause(theme, true) : '';
    const r = await searchAndVerifyLegal(
      [
        browseFmt() === 'paupercommander' ? 't:creature r:uncommon' : 't:legendary',
        colClause,
        ANY_PAIR_CLAUSE,
        themeClause,
      ]
        .filter(Boolean)
        .join(' '),
      'edhrec',
      350,
      browseSfOpts(),
    );
    results = r.results || [];
  } catch (e) {}
  const cands = results.filter(
    (c) => isNonlandFront(c) && leaderTypeOk(c) && !isBanned(c) && pairAbility(c),
  );
  state.browseCache[pk] = computeLeaderPairs(cands, combo);
  // 1.2: late extras (pairs, deck counts) keep the reader where they are once the list shows
  if (key === browseKey() && state.browseCache[key])
    renderBrowseResults(key, !!document.querySelector('#browseResults .sr-grid'));
}

function computeLeaderPairs(cands, combo) {
  const want = combo === 'c' ? '' : combo.toUpperCase().split('').sort().join('');
  cands = cands.slice().sort((a, b) => (a.edhrec_rank || 99999) - (b.edhrec_rank || 99999));
  const abil = new Map(cands.map((c) => [c.id || c.name, pairAbility(c)]));
  const pairs = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i],
        b = cands[j];
      if (!abil.get(a.id || a.name) || !abil.get(b.id || b.name)) continue;
      if (!canPair(a, b)) continue;
      const u = Array.from(new Set([].concat(a.color_identity || [], b.color_identity || [])))
        .sort()
        .join('');
      if (u !== want) continue;
      pairs.push(orderPair(a, b));
    }
  }
  // Most-played pairings first: rank each pair by both cards' combined EDHREC
  // popularity — the same play-data ordering the single-commander results use —
  // so two well-played partners outrank one superstar tied to an obscure card.
  pairs.sort(
    (p, q) =>
      (p[0].edhrec_rank || 99999) +
      (p[1].edhrec_rank || 99999) -
      ((q[0].edhrec_rank || 99999) + (q[1].edhrec_rank || 99999)),
  );
  return pairs.slice(0, 120);
}

/* First seat goes to the "chooser" of the pairing (Doctor, Choose-a-Background
   card); the enabler (companion, Background) sits second. */
function orderPair(a, b) {
  const ka = (pairAbility(a) || {}).kind;
  if (ka === 'background' || ka === 'companion') return [b, a];
  return [a, b];
}

/* One ranking for singles and pairs alike. Anything EDHREC's colour page
   lists is sorted by its true deck count, most-played first. Anything the
   page doesn't carry (it stops where play falls off) goes below, singles in
   their existing order with unlisted pairs interleaved by average card rank
   against the singles' suffix-minimum — so curated seeds keep their place. */
/* Deck-count lookups against an EDHREC counts map — shared by the ordering
   and the "x decks" captions on the tiles themselves. */
function singlePlayDecks(c, edecks) {
  if (!edecks) return undefined;
  let v = edecks[c.name];
  if (v === undefined && c.name.includes(' // ')) v = edecks[c.name.split(' // ')[0].trim()];
  return v;
}

function pairPlayDecks(pr, edecks) {
  if (!edecks) return undefined;
  const k1 = pr[0].name + ' // ' + pr[1].name,
    k2 = pr[1].name + ' // ' + pr[0].name;
  return edecks[k1] !== undefined ? edecks[k1] : edecks[k2];
}

function decksNoteHtml(n) {
  if (typeof n !== 'number') return '';
  return /* HTML */ `<div class="st-decks">${n.toLocaleString()} deck${n === 1 ? '' : 's'}</div>`;
}

function orderBrowseMerged(pool, pairs, edecks) {
  const singleDecks = (c) => singlePlayDecks(c, edecks);
  const pairDecks = (pr) => pairPlayDecks(pr, edecks);
  const known = [],
    unkS = [],
    unkP = [];
  pool.forEach((c) => {
    const d = singleDecks(c);
    if (d !== undefined) known.push({ it: c, d });
    else unkS.push(c);
  });
  pairs.forEach((pr) => {
    const d = pairDecks(pr);
    if (d !== undefined) known.push({ it: { _pair: pr }, d });
    else unkP.push(pr);
  });
  known.sort((a, b) => b.d - a.d);
  const R = (c) => c.edhrec_rank || 99999;
  const prank = (pr) => (R(pr[0]) + R(pr[1])) / 2;
  const sufMin = new Array(unkS.length);
  for (let i = unkS.length - 1; i >= 0; i--)
    sufMin[i] = Math.min(R(unkS[i]), i + 1 < unkS.length ? sufMin[i + 1] : Infinity);
  const rest = [];
  let i = 0,
    j = 0;
  while (i < unkS.length || j < unkP.length) {
    const s = i < unkS.length ? sufMin[i] : Infinity;
    const p = j < unkP.length ? prank(unkP[j]) : Infinity;
    if (s <= p) rest.push(unkS[i++]);
    else rest.push({ _pair: unkP[j++] });
  }
  return known.map((x) => x.it).concat(rest);
}

/* 1.21: two linked rings -- "shares command with" */
var PAIR_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg>';

/* The pairings of one card, in a popup: every card it can share command
   with (Partner, Partner with, Friends forever, Background, Doctor), legal in
   the page's format, most played first -- the same pair tiles as Inspiration,
   with the same actions (tap = the pair's recommendations, the leader button
   = command of a deck, + = both into a deck). Bottom-up: the card itself at
   the foot, the pairs above it, the most played lowest. */
async function openPairPopup(card) {
  const A = pairAbility(card);
  if (!A) return;

  pushOverlay('pairPop', () => {
    document.getElementById('pairPopOverlay')?.remove();
  });
  let el = document.getElementById('pairPopOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'pairPopOverlay';
  }
  document.body.appendChild(el);
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(card.name)}
    <main>
      <div class="reco-admiral">
        <img
          class="${wbClass(card)}"
          src="${cardImageLarge(card)}"
          alt="${escapeHtml(card.name)}"
        />
      </div>
      <p class="hint" style="text-align:center;margin:0 0 8px;">
        ${'Partner pairings'} — ${escapeHtml(A.label)}${A.with ? ' ' + escapeHtml(A.with) : ''}
      </p>
      <div id="pairPopBody">
        <div class="status"><div class="spinner"></div></div>
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  const fmt =
    state.screen === 'browse'
      ? state.browseFormat || 'commander'
      : state.searchFormat && state.searchFormat !== 'any'
        ? state.searchFormat
        : 'commander';
  const clause = pairSearchClause(card);
  let list = [];
  try {
    const r = await searchAndVerifyLegal(clause, 'edhrec', 300, {
      format: fmt === 'paupercommander' ? 'any' : fmt,
    });
    list = (r && r.results) || [];
  } catch (e) {}
  const box = document.getElementById('pairPopBody');
  if (!box || !document.getElementById('pairPopOverlay')) return;
  list = list.filter(
    (c) =>
      canPair(card, c) && !isBanned(c) && (fmt !== 'commander' || commanderVerdict(c) !== 'banned'),
  );
  if (!list.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">${'No pairings found.'}</div>`;
    return;
  }
  // the commander in front: a Background or a Doctor's companion sits behind its lead
  const lead = (c) => (A.kind === 'background' || A.kind === 'companion' ? [c, card] : [card, c]);
  const merged = list.map((c) => ({ _pair: lead(c) }));
  // the count under the grid, next to the card: in view where the page opens
  box.innerHTML = /* HTML */ `<div class="sr-grid">
      ${merged.map((it, i) => pairTileHtml(it._pair, i, null)).join('')}
    </div>
    <p class="hint" style="text-align:center;margin:8px 0 4px;">
      ${list.length} ${list.length === 1 ? 'pairing' : 'pairings'} · ${'most played at the bottom'}
    </p>`;
  const pinned =
    state.screen === 'search' && state.searchPinnedDeckId
      ? getDeck(state.searchPinnedDeckId)
      : null;
  wireMergedPairTiles(merged, pinned, null);
  loadTilePrices(list.concat([card]));
}

document.addEventListener(
  'click',
  (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-pairpop]');
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    const c = (window._pairPopReg || new Map()).get(decodeURIComponent(b.dataset.pairpop));
    if (c) openPairPopup(c);
  },
  true,
);

/* A pairing rendered as a tile inside the main results grid — EDHREC-style
   overlap (lead card in front, partner peeking out behind) and the same two
   actions a single-commander tile offers. idx addresses the merged array. */
function pairTileHtml(pr, idx, decks) {
  return /* HTML */ `<div class="pair-cell">
    <div class="pair-imgs">
      <img
        loading="lazy"
        class="${wbClass(pr[0])}"
        src="${cardImageMed(pr[0])}"
        data-mpcard="${idx}:0"
        alt="${escapeHtml(pr[0].name)}"
      />
      <img
        loading="lazy"
        class="${wbClass(pr[1])}"
        src="${cardImageMed(pr[1])}"
        data-mpcard="${idx}:1"
        alt="${escapeHtml(pr[1].name)}"
      />
    </div>
    <div class="st-meta-row">
      <span class="pair-prices"
        ><span class="st-price" data-pricecard="${encodeURIComponent(pr[0].name)}">…</span
        ><span class="pp-plus">+</span
        ><span class="st-price" data-pricecard="${encodeURIComponent(pr[1].name)}">…</span></span
      >
      <span class="pair-btns">
        <button class="add-btn" data-mpairadm="${idx}" title="Set as ${fmtName()}s">
          ${modeGlyph()}
        </button>
        <button class="add-btn" data-mpairadd="${idx}" title="Add both to Deck">+</button>
      </span>
    </div>
    ${decksNoteHtml(decks)}
  </div>`;
}

function wireMergedPairTiles(merged, pinned, refreshFn) {
  // Tapping either card behaves exactly like tapping a single commander in
  // this view: it opens that leader's recommendations page.
  document.querySelectorAll('img[data-mpcard]').forEach((img) => {
    if (img.dataset.w) return;
    img.dataset.w = '1';
    img.addEventListener('click', () => {
      const [i, j] = img.dataset.mpcard.split(':').map(Number);
      const pr = merged[i] && merged[i]._pair;
      if (pr) openCommanderReco(pr[0], pr[1]);
    });
  });
  document.querySelectorAll('.add-btn[data-mpairadm]').forEach((btn) => {
    if (btn.dataset.w) return;
    btn.dataset.w = '1';
    btn.addEventListener('click', () => {
      const it = merged[+btn.dataset.mpairadm];
      if (!it || !it._pair) return;
      if (pinned) setPairValidated(pinned, it._pair, refreshFn);
      else openDeckPickPopup(it._pair[0], 'admiral', refreshFn, it._pair[1]);
    });
  });
  document.querySelectorAll('.add-btn[data-mpairadd]').forEach((btn) => {
    if (btn.dataset.w) return;
    btn.dataset.w = '1';
    btn.addEventListener('click', () => {
      const it = merged[+btn.dataset.mpairadd];
      if (!it || !it._pair) return;
      if (pinned) addPairToDeckValidated(pinned, it._pair, refreshFn);
      else openDeckPickPopup(it._pair[0], 'main', refreshFn, it._pair[1]);
    });
  });
}

/* Seat a pairing in command of an existing deck: the lead takes the first
   seat (any sitting leader steps down into the deck), the partner the second. */
function setPairValidated(d, pr, refreshFn) {
  const go = () => {
    promoteToCommander(d, pr[0]);
    const dup = d.cards.findIndex((x) => x.name === pr[1].name);
    const existing = dup >= 0 ? d.cards[dup] : null;
    if (dup >= 0) d.cards.splice(dup, 1);
    d.partner = existing
      ? { ...pr[1], proxy: !!existing.proxy, _playingOwned: existing._playingOwned }
      : playingDeckCopy(pr[1]);
    if (!existing) ensurePlayingOwnership(d, [d.partner]);
    logDeckChange(d, { type: 'admiral', name: pr[1].name, card: pr[1], prev: null });
    scheduleSave(d);
    toast(`${pr[0].name} and ${pr[1].name} take joint command of ${d.name}.`);
    if (refreshFn) refreshFn();
  };
  if (d.admiral) {
    openInAppConfirm(
      `Put ${pr[0].name} and ${pr[1].name} in command of ${d.name}? ${d.admiral.name} will step down into the main deck.`,
      (ok) => {
        if (ok) go();
      },
    );
    return true;
  }
  go();
  return true;
}

function addPairToDeckValidated(d, pr, refreshFn) {
  const a = addCardToDeckValidated(d, pr[0], null);
  const b = addCardToDeckValidated(d, pr[1], null);
  if (refreshFn && (a || b)) refreshFn();
  return a && b;
}

/* Batch POSTs share the card API queue and its cooldown. Their timeout starts
   when dispatched, so waiting behind other lookups cannot abort them early. */
async function postWithTimeout(url, body, ms) {
  return sfPost(url, body, ms);
}

async function resolveNameChunk(chunk) {
  if (!chunk.length) return [];
  // Commander mode: one POST to Scryfall's /cards/collection resolves the
  // whole chunk. That endpoint is BUILT for name lists — it accepts
  // front-face names natively (double-faced leaders included, from the
  // source) and replaces up to ten paged searches with a single request:
  // faster, and far kinder to a shaky connection. Commander legality rides
  // the returned card itself. If the batch endpoint is down, fall through
  // to the search path below.
  {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await postWithTimeout(
          `${SF_BASE}/cards/collection`,
          { identifiers: chunk.map((n) => ({ name: n })) },
          6000,
        );
        if (r.ok) {
          const d = await r.json();
          const found = (d.data || []).filter(
            (c) => c.legalities && c.legalities.commander && c.legalities.commander !== 'not_legal',
          );
          // EDHREC lists double-faced leaders by their FRONT face name only
          // (verified on their own pages). Whatever the batch endpoint
          // couldn't place under that spelling goes through /cards/named —
          // the lenient lookup deck imports already trust for exactly these
          // shapes. A handful of extra requests at most, only for leftovers.
          const have = new Set();
          found.forEach((c) => {
            have.add(c.name);
            const cut = c.name.indexOf(' // ');
            if (cut > 0) have.add(c.name.slice(0, cut));
          });
          const missing = chunk.filter((n) => !have.has(n));
          for (const nm of missing) {
            try {
              const rr = await sfFetch(`${SF_BASE}/cards/named?fuzzy=${encodeURIComponent(nm)}`);
              if (rr.ok) {
                const c = await rr.json();
                if (
                  c &&
                  c.legalities &&
                  c.legalities.commander &&
                  c.legalities.commander !== 'not_legal'
                )
                  found.push(c);
              }
            } catch (err) {}
          }
          return found;
        }
      } catch (e) {
        console.error('collection chunk failed', e);
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  const clause =
    '(' +
    chunk.flatMap((n) => [exactNameClause(n), 'name:"' + n.replace(/"/g, '') + '"']).join(' or ') +
    ')';
  const { results, error } = await searchAndVerifyLegal(clause, 'edhrec', 100).catch(() => ({
    results: [],
    error: true,
  }));
  if (!error || chunk.length <= 2) return results || [];
  // Splitting is for a query the SERVER choked on -- too long, too complex.
  // A line that refused the request refuses both halves too, and the split
  // doubles the traffic each round: measured on Stef's phone as dozens of
  // single-name queries, each retried, none of them ever going to succeed.
  // Nothing is asked twice for the same failure any more.
  if (error !== 'badquery') {
    try {
      sfJournal('names: line refused ' + chunk.length + ' names \u2014 not splitting');
    } catch (e) {}
    return results || [];
  }
  const mid = Math.ceil(chunk.length / 2);
  const halves = await Promise.all([
    resolveNameChunk(chunk.slice(0, mid)),
    resolveNameChunk(chunk.slice(mid)),
  ]);
  return halves.flat();
}

/* The names this phone can answer by itself. The weekly database holds every
   card with its Commander legality, so a list of leader names does not need
   the network at all -- and whatever it cannot place is all that is asked. */
function namesFromLocalDb(names) {
  const out = new Map();
  let ix = null;
  try {
    ix = _bulkIdx;
  } catch (e) {}
  if (!ix || !ix.byName) return out;
  names.forEach((n) => {
    const bc = ix.byName.get(String(n).toLowerCase());
    if (!bc || (bc.lg && bc.lg === 'not_legal')) return;
    const c = bulkToCardish(bc);
    if (c) out.set(n, c);
  });
  return out;
}

async function namesToLegalCards(names) {
  // The batch endpoint takes up to 75 identifiers per POST — big chunks in

  const wanted = names.slice(0, 600);
  // The phone first: every name the local database knows costs no request,
  // works offline, and keeps the list short enough that Scryfall never has
  // reason to refuse it.
  const local = namesFromLocalDb(wanted);
  const askFor = wanted.filter((n) => !local.has(n));
  try {
    if (local.size)
      sfJournal('names: ' + local.size + ' from the local database, ' + askFor.length + ' asked');
  } catch (e) {}
  const chunks = chunkArr(askFor, 70);
  const settled = chunks.length ? await Promise.all(chunks.map(resolveNameChunk)) : [];
  const byName = new Map();
  local.forEach((c, n) => {
    byName.set(n, c);
    if (c.name && !byName.has(c.name)) byName.set(c.name, c);
  });
  settled.flat().forEach((c) => {
    if (!byName.has(c.name)) byName.set(c.name, c);
    // Double-faced cards: EDHREC lists carry the FRONT face's name while
    // Scryfall answers "Front // Back" — alias the front so the lookup
    // below can't drop them (King T'Challa, Heliod, and every other
    // transforming leader used to vanish exactly here).
    const cut = c.name.indexOf(' // ');
    if (cut > 0) {
      const front = c.name.slice(0, cut);
      if (!byName.has(front)) byName.set(front, c);
    }
  });
  // EDHREC partner/Background pages name the PAIR ("Burakos, Party Leader
  // // Haunted One") while Scryfall answers single cards — the mirror case
  // of the DFC alias above. Fall back to either half of a pair name, so
  // partner leaders stop going missing from theme and kindred lists.
  const lookup = (n) => {
    let c = byName.get(n);
    if (!c) {
      const cut = n.indexOf(' // ');
      if (cut > 0) c = byName.get(n.slice(0, cut).trim()) || byName.get(n.slice(cut + 4).trim());
    }
    return c || null;
  };
  // Ground truth for anything that still slips through: the EXACT strings,
  // character for character, that no resolved card answered to — plus what
  // Scryfall did send back for the same chunks. One remote-debug glance at
  // this beats any amount of theorizing about invisible characters.
  const unresolved = names.filter((n) => !lookup(n));
  if (unresolved.length) {
    const diag = {
      t: new Date().toISOString(),
      unresolved: unresolved.slice(0, 12),
      resolvedSample: settled
        .flat()
        .slice(0, 12)
        .map((c) => c.name),
    };
    state._inspoDiag = diag; // surfaced in Settings → Diagnostics, copyable
    console.warn('inspiration: unresolved names', JSON.stringify(diag.unresolved));
    console.warn('inspiration: resolved sample', JSON.stringify(diag.resolvedSample));
  }
  return names.map(lookup).filter(Boolean);
}

function colorIdentityExact(card, combo) {
  if (combo === 'c') return (card.color_identity || []).length === 0;
  const want = combo.toLowerCase().split('').sort().join('');
  const have = (card.color_identity || [])
    .map((c) => c.toLowerCase())
    .sort()
    .join('');
  return want === have;
}
