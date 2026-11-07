// pages / collection / binders

/* ---------------- BINDER RULES (auto-fill) ----------------
   A binder can carry rules: rarity, colour, card type and a price range.
   Within one kind any choice may match (Rare OR Mythic); across kinds all
   must match (mono blue AND under EUR 5). A card added "automatically" goes
   to the one binder whose rules it meets; fits more than one, the player
   picks. Price ranges of binders that could hold the same card may never
   overlap: a range is (min, max], so 0-5 and 5-10 meet without overlapping
   (5.00 goes in the first, 5.01 in the second). */
const BR_RARITIES = ['common', 'uncommon', 'rare', 'mythic'];

const BR_COLORS = ['C', 'W', 'U', 'B', 'R', 'G', '2c', '3c', '4c', '5c'];
// 'multi' (= 2c-5c) only lives on in older saved rules
const BR_COLOR_ATOMS = {
  C: ['C'],
  W: ['W'],
  U: ['U'],
  B: ['B'],
  R: ['R'],
  G: ['G'],
  '2c': ['2c'],
  '3c': ['3c'],
  '4c': ['4c'],
  '5c': ['5c'],
  multi: ['2c', '3c', '4c', '5c'],
};

const BR_TYPES = [
  'Legendary',
  'Creature',
  'Land',
  'Artifact',
  'Enchantment',
  'Instant',
  'Sorcery',
  'Planeswalker',
  'Battle',
];

const BR_FINISH = ['foil', 'nonfoil'];
// a copy is foil when it.foil is true
function binderHasRules(b) {
  const r = b && b.rules;
  return !!(
    r &&
    ((r.rarity || []).length ||
      (r.color || []).length ||
      (r.type || []).length ||
      (r.finish || []).length ||
      r.price)
  );
}

/* The card's own colours -- not its colour identity: a land that taps for
   red is still a colourless card. Stored as `cc` on new copies; older copies
   look it up in the local card database (and keep the answer), and without
   that a land counts as colourless and anything else falls back to identity. */
function brCardColors(it) {
  if (Array.isArray(it.cc)) return it.cc;
  try {
    const ix = typeof _bulkIdx !== 'undefined' ? _bulkIdx : null;
    if (ix && ix.byName) {
      const nm = String(it.name || '').toLowerCase();
      const bc =
        ix.byName.get(nm) ||
        (nm.indexOf(' // ') > 0 ? ix.byName.get(nm.slice(0, nm.indexOf(' // '))) : null);
      if (bc) {
        const str = bc.c || (bc.f && bc.f[0] && bc.f[0].c) || '';
        it.cc = str.split('').filter((c) => 'WUBRG'.indexOf(c) >= 0);
        return it.cc;
      }
    }
  } catch (e) {}
  if (/\bLand\b/.test(String(it.type_line || '').split('//')[0])) return [];
  return it.colors || [];
}

function brColorAtom(it) {
  const cs = brCardColors(it).filter((c) => 'WUBRG'.indexOf(c) >= 0);
  if (!cs.length) return 'C';
  if (cs.length === 1) return cs[0];
  return cs.length + 'c';
}

function brPriceFits(price, eur) {
  if (eur == null || !isFinite(eur)) return false;
  const lo = price.min || 0;
  if (lo > 0 ? !(eur > lo) : eur < 0) return false;
  return price.max == null || eur <= price.max;
}

function binderRuleMatch(b, it) {
  if (!binderHasRules(b) || !it) return false;
  const r = b.rules;
  if ((r.rarity || []).length && r.rarity.indexOf(String(it.rarity || '').toLowerCase()) < 0)
    return false;
  if ((r.color || []).length) {
    const a = brColorAtom(it);
    if (!r.color.some((v) => (BR_COLOR_ATOMS[v] || []).indexOf(a) >= 0)) return false;
  }
  if ((r.type || []).length) {
    const tl = String(it.type_line || '').split('//')[0];
    if (!r.type.some((t) => new RegExp('\\b' + t + '\\b').test(tl))) return false;
  }
  if ((r.finish || []).length && r.finish.indexOf(it.foil ? 'foil' : 'nonfoil') < 0) return false;
  if (r.price && !brPriceFits(r.price, brItemEur(it))) return false;
  return true;
}

/* A copy's own price, else what the app knows for the card by name: the
   price cache or the daily price file. Some printings (The List, promos)
   carry no price of their own. */
function brItemEur(it) {
  if (it.eur != null && isFinite(it.eur)) return it.eur;
  try {
    const h = state.priceCache && state.priceCache[it.name];
    if (h && typeof h.v === 'number') return h.v;
  } catch (e) {}
  try {
    const v = bulkEurFor(it.name);
    if (typeof v === 'number' && isFinite(v)) return v;
  } catch (e) {}
  return null;
}

// Can no card ever meet both rule sets (price aside)? Rarity and colour can
// rule each other out; card types never do (an Artifact Creature is both).
function binderRulesDisjoint(r1, r2) {
  const a1 = r1.rarity || [],
    a2 = r2.rarity || [];
  if (a1.length && a2.length && !a1.some((x) => a2.indexOf(x) >= 0)) return true;
  const atoms = (v) =>
    [].concat.apply(
      [],
      (v || []).map((x) => BR_COLOR_ATOMS[x] || []),
    );
  const c1 = atoms(r1.color),
    c2 = atoms(r2.color);
  if (c1.length && c2.length && !c1.some((x) => c2.indexOf(x) >= 0)) return true;
  const f1 = r1.finish || [],
    f2 = r2.finish || [];
  if (f1.length && f2.length && !f1.some((x) => f2.indexOf(x) >= 0)) return true;
  return false;
}

function brPriceOverlap(p1, p2) {
  const lo1 = p1.min || 0,
    lo2 = p2.min || 0;
  const hi1 = p1.max == null ? Infinity : p1.max,
    hi2 = p2.max == null ? Infinity : p2.max;
  return lo1 < hi2 && lo2 < hi1;
}

// The binder whose price range would clash with these rules, if any.
function binderPriceClash(rules, selfId, binders) {
  if (!rules || !rules.price) return null;
  return (
    (binders || []).find(
      (b) =>
        b.id !== selfId &&
        binderHasRules(b) &&
        b.rules.price &&
        !binderRulesDisjoint(rules, b.rules) &&
        brPriceOverlap(rules.price, b.rules.price),
    ) || null
  );
}

function brPriceLabel(p) {
  if (!p) return '';
  const f = (v) => '€' + (Math.round(v * 100) / 100).toFixed(v % 1 ? 2 : 0);
  const lo = p.min || 0;
  const loTxt = lo > 0 ? '€' + (lo + 0.01).toFixed(2) : '€0';
  return loTxt + '–' + (p.max == null ? '∞' : f(p.max));
}

function binderRulesSummary(b) {
  if (!binderHasRules(b)) return '';
  const r = b.rules,
    bits = [];
  const CN = {
    C: 'colorless',
    W: 'white',
    U: 'blue',
    B: 'black',
    R: 'red',
    G: 'green',
    '2c': '2 colors',
    '3c': '3 colors',
    '4c': '4 colors',
    '5c': '5 colors',
    multi: 'multicolor',
  };
  if ((r.color || []).length) bits.push(r.color.map((c) => CN[c] || c).join('/'));
  if ((r.rarity || []).length) bits.push(r.rarity.join('/'));
  if ((r.type || []).length) bits.push(r.type.join('/'));
  if ((r.finish || []).length)
    bits.push(r.finish.map((f) => (f === 'foil' ? 'foil' : 'non-foil')).join('/'));
  if (r.price) bits.push(brPriceLabel(r.price));
  return 'auto · ' + bits.join(' · ');
}

// The i-button's toast: the name, then "Settings" and one line per kind of
// rule. A kind with every option ticked just says "all".
function binderRulesList(b) {
  if (!binderHasRules(b)) return b ? b.name : '';
  const r = b.rules,
    L = [],
    ALL = 'all';
  const CN = {
    C: 'colorless',
    W: 'white',
    U: 'blue',
    B: 'black',
    R: 'red',
    G: 'green',
    '2c': '2 colors',
    '3c': '3 colors',
    '4c': '4 colors',
    '5c': '5 colors',
  };
  const line = (label, all, picked, name) => {
    const got = all.filter((v) => picked.indexOf(v) >= 0);
    if (got.length)
      L.push('• ' + label + ': ' + (got.length === all.length ? ALL : got.map(name).join(', ')));
  };
  line('Rarity', BR_RARITIES, r.rarity || [], (v) => v);
  const col =
    (r.color || []).indexOf('multi') >= 0
      ? (r.color || []).concat(['2c', '3c', '4c', '5c'])
      : r.color || []; // old 'multi' = 2-5
  line('Colors', BR_COLORS, col, (c) => CN[c] || c);
  line('Card types', BR_TYPES, r.type || [], (t) => t);
  line('Foil', BR_FINISH, r.finish || [], (f) => (f === 'foil' ? 'foil' : 'non-foil'));
  if (r.price) L.push('• ' + 'Price' + ': ' + brPriceLabel(r.price));
  return b.name + '\n' + 'Settings' + '\n' + L.join('\n');
}

/* ---- How a binder shows its cards: grouped by colour, rarity, finish or
   card type, and sorted by name, mana value or price (b.view). The grid is
   bottom-up, so the first group and the first card sit at the foot. */
const BR_GROUPS = ['none', 'color', 'rarity', 'finish', 'type'];

const BR_SORTS = ['name', 'mv', 'price'];

function brViewLabels(view = {}) {
  return {
    group: {
      none: 'No groups',
      color: 'Color(s)',
      rarity: 'Rarity',
      finish: 'Foil / non-foil',
      type: 'Card type',
    },
    sort: {
      name:
        view.sort === 'name' && view.sortDir === 'desc'
          ? 'Alphabetical (Z–A)'
          : 'Alphabetical (A–Z)',
      mv:
        view.sort === 'mv' && view.sortDir === 'desc'
          ? 'Mana value (high–low)'
          : 'Mana value (low–high)',
      price:
        view.sort === 'price' && view.sortDir === 'asc' ? 'Price (low–high)' : 'Price (high–low)',
    },
  };
}

function binderView(b) {
  const v = (b && b.view) || {};
  return {
    group: BR_GROUPS.indexOf(v.group) >= 0 ? v.group : 'none',
    sort: BR_SORTS.indexOf(v.sort) >= 0 ? v.sort : 'name',
    sortDir:
      v.sortDir === 'asc' || v.sortDir === 'desc' ? v.sortDir : v.sort === 'price' ? 'desc' : 'asc',
  };
}

// Mana value: stored on new copies; older ones ask the local card database.
function brItemMv(it) {
  if (typeof it.mv === 'number') return it.mv;
  try {
    const ix = typeof _bulkIdx !== 'undefined' ? _bulkIdx : null;
    const bc = ix && ix.byName && ix.byName.get(String(it.name || '').toLowerCase());
    if (bc && typeof bc.mv === 'number') {
      it.mv = bc.mv;
      return it.mv;
    }
  } catch (e) {}
  return null;
}

function binderSortItems(items, sort, sortDir = sort === 'price' ? 'desc' : 'asc') {
  const nm = (a, b2) => String(a.name || '').localeCompare(String(b2.name || ''));
  const direction = sortDir === 'desc' ? -1 : 1;
  if (sort === 'mv' || sort === 'price')
    return items.sort((a, b2) => {
      const value = sort === 'mv' ? brItemMv : brItemEur;
      const x = value(a),
        y = value(b2);
      if ((x == null) !== (y == null)) return x == null ? 1 : -1;
      return (x == null ? 0 : (x - y) * direction) || nm(a, b2);
    });
  return items.sort((a, b2) => nm(a, b2) * direction);
}

const BR_TYPE_ORDER = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
];

// The group a copy belongs to: [order, key, label].
function binderGroupOf(it, group) {
  if (group === 'color') {
    const cs = brCardColors(it).filter((c) => 'WUBRG'.indexOf(c) >= 0);
    const N = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    if (cs.length === 1)
      return ['WUBRG'.indexOf(cs[0]), cs[0], manaIconSvg(cs[0], 16) + ' ' + N[cs[0]]];
    if (cs.length > 1) return [5, 'M', multiIconSvg(16) + ' ' + 'Multicolor'];
    return [6, 'C', manaIconSvg('C', 16) + ' ' + 'Colorless'];
  }
  if (group === 'rarity') {
    const r = String(it.rarity || '').toLowerCase(),
      i = ['mythic', 'rare', 'uncommon', 'common'].indexOf(r);
    return i >= 0 ? [i, r, r[0].toUpperCase() + r.slice(1)] : [4, 'other', 'Other'];
  }
  if (group === 'finish') return it.foil ? [0, 'foil', '✨ Foil'] : [1, 'nonfoil', 'Non-foil'];
  if (group === 'type') {
    const tl = String(it.type_line || '').split('//')[0];
    const i = BR_TYPE_ORDER.findIndex((t) => new RegExp('\\b' + t + '\\b').test(tl));
    return i >= 0
      ? [i, BR_TYPE_ORDER[i], BR_TYPE_ORDER[i]]
      : [BR_TYPE_ORDER.length, 'other', 'Other'];
  }
  return [0, 'all', ''];
}

/* The collection grid(s). Inside a binder its own view applies: sorted, and
   split into labelled groups. The page is column-reverse, so each label
   follows its grid in the DOM to sit above it. */
function colGridsHtml(items, tileFn) {
  const f = state.colFilter;
  const b =
    f.binder && f.binder !== '__all__' && f.binder !== '__wants__'
      ? (state.collection.binders || []).find((x) => x.id === f.binder)
      : null;
  const choice = collectionSortChoice();
  binderSortItems(items, choice.sort, choice.sortDir);
  if (!b) return /* HTML */ `<div class="col-grid">${items.map(tileFn).join('')}</div>`;
  const v = binderView(b);
  if (v.group === 'none')
    return /* HTML */ `<div class="col-grid">${items.map(tileFn).join('')}</div>`;
  const groups = new Map();
  items.forEach((it) => {
    const g = binderGroupOf(it, v.group);
    if (!groups.has(g[1])) groups.set(g[1], { o: g[0], k: g[1], label: g[2], list: [] });
    groups.get(g[1]).list.push(it);
  });
  return Array.from(groups.values())
    .sort((a, c) => a.o - c.o)
    .map((g) => {
      const n = g.list.reduce((a, it) => a + (it.qty || 1), 0);
      return /* HTML */ `<div class="col-grid col-group" data-colgroup="${escapeHtml(g.k)}">
          ${g.list.map(tileFn).join('')}
        </div>
        <div class="section-label col-group-label">
          ${g.label} <span class="cg-n">· ${n}</span>
        </div>`;
    })
    .join('');
}

const BR_GLYPHS = [
  'W',
  'U',
  'B',
  'R',
  'G',
  'C',
  'multi',
  'rC',
  'rU',
  'rR',
  'rM',
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Battle',
  'Land',
  'token',
  'foil',
];

function brGlyphHtml(k, px) {
  px = px || 14;
  if ('WUBRGC'.indexOf(k) >= 0 && k.length === 1) return manaIconSvg(k, px);
  if (k === 'multi') return multiIconSvg(px);
  if (/^r[CURM]$/.test(k)) return /* HTML */ `<span class="rar-dot rar-${k[1]}"></span>`;
  if (k === 'token') return /* HTML */ `<span class="tok-ico">${ICONS.token}</span>`;
  if (k === 'foil') return '<span style="color:var(--head-ink);">✦</span>';
  return (typeof DOCK_TYPE_ICONS !== 'undefined' && DOCK_TYPE_ICONS[k]) || '';
}

// The tile's icons: the player's own pick, else the old guess from the name.
function binderTileGlyphs(b) {
  if (Array.isArray(b.glyphs))
    return b.glyphs.length
      ? `<span class="binder-glyphs">${b.glyphs.map((k) => brGlyphHtml(k, 14)).join('')}</span>`
      : '';
  return binderGlyphsHtml(b.name);
}

function brSheetOpen(el, id, onClose, noHist) {
  document.body.appendChild(el);
  const fn = () => {
    el.remove();
    if (onClose) onClose();
  };
  // noHist: a popup the app opens by itself at start-up. The history entries
  // made before the first touch are skipped by Chrome, so a history.back()
  // from it would sail past the home page onto the exit guard. It stays out
  // of history: its buttons close it directly, and back (appBackStep) still
  // finds it on the overlay stack.
  if (noHist) {
    const top = state.overlayStack[state.overlayStack.length - 1];
    if (top && top.id === id) top.closeFn = fn;
    else state.overlayStack.push({ id, closeFn: fn, pushed: false, noHist: true });
    return;
  }
  pushOverlay(id, fn);
}

function brSheetClose(id) {
  const st = state.overlayStack,
    top = st[st.length - 1];
  if (top && top.id === id) closeTopOverlay();
  else document.getElementById(id)?.remove();
}

// Resolves once the pending history back-step (a sheet that just closed) has
// landed, so the next sheet is not mistaken for the one being closed.
function brAfterPop() {
  return new Promise((res) => {
    let fin = false;
    const f = () => {
      if (fin) return;
      fin = true;
      window.removeEventListener('popstate', f);
      setTimeout(res, 30);
    };
    window.addEventListener('popstate', f);
    setTimeout(f, 450);
  });
}

function ruledBinders() {
  return (state.collection.binders || []).filter(binderHasRules);
}

function binderCandidates(it) {
  return ruledBinders().filter((b) => binderRuleMatch(b, it));
}

/* Fits more than one binder: the player picks. "Same choice for the rest"
   remembers the pick for every later card with the very same candidates. */
function openBinderConflict(it, cands, o) {
  o = o || {};
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    document.getElementById('binderConflict')?.remove();
    const el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'binderConflict';
    el.style.zIndex = Math.max(210, o.zIndex || 0);
    el.style.alignItems = 'flex-end';
    // column-reverse sheet: the first binder sits at the foot, by the thumb.
    el.innerHTML = /* HTML */ `<div class="deckpick bc-sheet">
      ${cands.map((b) => `<button type="button" class="primary-btn bc-opt" data-bc="${b.id}"><b>${escapeHtml(b.name)}</b><small>${escapeHtml(binderRulesSummary(b))}</small></button>`).join('')}
      <button type="button" class="ghost-btn bc-opt" data-bc="">${'No binder'}</button>
      ${o.noneFit ? '' : `<label class="bc-rem"><input type="checkbox" id="bcRemember"> ${'Same choice for the rest of these cards'}</label>`}
      <div class="bc-head">
        ${it.img ? `<img src="${it.img}" alt="">` : ''}
        <div>
          <b>${escapeHtml(it.name)}</b
          ><span
            >${
              o.noneFit
                ? 'fits no binder with rules. Where should it go?'
                : 'fits more than one binder. Where should it go?'
            }</span
          >
        </div>
      </div>
    </div>`;
    // The answer is handed over only once the sheet's history entry is gone,
    // so a next sheet can never be closed by this one's late back-step.
    let pick = { id: null, remember: false }; // back = no binder
    brSheetOpen(el, 'binderConflict', () => setTimeout(() => done(pick), 0));
    el.querySelectorAll('[data-bc]').forEach((btn) =>
      btn.addEventListener('click', () => {
        pick = {
          id: btn.dataset.bc || null,
          remember: !!(document.getElementById('bcRemember') || {}).checked,
        };
        brSheetClose('binderConflict');
      }),
    );
  });
}

async function routeBinder(it, memo, options) {
  const c = binderCandidates(it);
  if (!c.length) return null;
  if (c.length === 1) return c[0].id;
  const key = c
    .map((b) => b.id)
    .sort()
    .join('|');
  if (memo && Object.prototype.hasOwnProperty.call(memo, key)) return memo[key];
  const r = await openBinderConflict(it, c, options);
  if (memo && r.remember) memo[key] = r.id;
  return r.id;
}

// Move one stack into a binder, merging with the same printing already there.
function moveItemToBinder(it, bid) {
  const items = state.collection.items;
  const same = items.find(
    (x) =>
      x !== it &&
      x.name === it.name &&
      x.set === it.set &&
      (x.cn || '') === (it.cn || '') &&
      x.cond === it.cond &&
      !!x.foil === !!it.foil &&
      (x.binder || null) === (bid || null),
  );
  if (same) {
    same.qty += it.qty || 1;
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
  } else it.binder = bid || null;
}

function brBinderName(id) {
  if (!id) return 'No binder';
  const b = (state.collection.binders || []).find((x) => x.id === id);
  return b ? b.name : '?';
}

/* After saving rules the binder is put right at once: cards in it that no
   longer fit leave (to another binder with rules they fit, else loose), and
   cards you own that fit it and are not yet in a binder with rules -- loose
   ones and ones in standard binders -- move in. A list shows what moved. */
async function binderApplyRules(b) {
  if (!binderHasRules(b)) return;
  const memo = {},
    moved = [];
  for (const it of state.collection.items.slice()) {
    const cur = it.binder ? (state.collection.binders || []).find((x) => x.id === it.binder) : null;
    let to;
    if (it.binder === b.id) {
      if (binderRuleMatch(b, it)) continue;
      to = await routeBinder(it, memo); // b is no candidate any more
    } else {
      if (cur && binderHasRules(cur)) continue; // already in a binder with rules
      if (!binderRuleMatch(b, it)) continue;
      to = await routeBinder(it, memo);
      if (!to) continue;
    }
    if ((to || null) === (it.binder || null)) continue;
    moved.push({
      name: it.name,
      qty: it.qty || 1,
      from: brBinderName(it.binder),
      to: brBinderName(to),
    });
    moveItemToBinder(it, to);
  }
  if (!moved.length) return;
  saveCollection();
  render();
  brMovedSheet(moved);
}

function brMovedSheet(moved) {
  document.getElementById('binderResortSheet')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'binderResortSheet';
  el.style.zIndex = 205;
  el.style.alignItems = 'flex-end';
  const n = moved.reduce((a, m) => a + m.qty, 0);
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet">
    <div class="br-actions"><button type="button" class="primary-btn" id="brsOk">OK</button></div>
    <div class="brs-list">
      ${moved.map((m) => `<div class="brs-row"><b>${escapeHtml(m.name)}${m.qty > 1 ? ' ×' + m.qty : ''}</b><span>${escapeHtml(m.from)} → ${escapeHtml(m.to)}</span></div>`).join('')}
    </div>
    <div class="br-title">
      <b>${`${n} card${n === 1 ? '' : 's'} moved`}</b>
    </div>
  </div>`;
  brSheetOpen(el, 'binderResortSheet');
  const close = () => brSheetClose('binderResortSheet');
  el.querySelector('#brsOk').addEventListener('click', close);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
}

/* "Re-sort binders": cards in a binder with rules that no longer fit it
   (prices move every day), and loose cards that fit one, go where they
   belong now. Standard binders are never touched. A list shows what moved. */
async function binderResort() {
  if (!ruledBinders().length) {
    toast('No binders with rules.');
    return;
  }
  const memo = {},
    moved = [];
  const list = state.collection.items.slice();
  for (const it of list) {
    const cur = it.binder ? (state.collection.binders || []).find((x) => x.id === it.binder) : null;
    if (cur && !binderHasRules(cur)) continue; // standard binder: hands off
    if (cur && binderRuleMatch(cur, it)) continue; // already where it belongs
    const to = await routeBinder(it, memo);
    if ((to || null) === (it.binder || null)) continue;
    moved.push({
      name: it.name,
      qty: it.qty || 1,
      from: brBinderName(it.binder),
      to: brBinderName(to),
    });
    moveItemToBinder(it, to);
  }
  if (!moved.length) {
    toast('Everything is already in the right binder.');
    return;
  }
  saveCollection();
  render();
  brMovedSheet(moved);
}

function binderTileHtml(b) {
  const items = state.collection.items.filter((it) => it.binder === b.id);
  const first = items.find((it) => it.img);
  const qty = items.reduce((a, it) => a + (it.qty || 1), 0);
  const eur = items.reduce((a, it) => a + (it.eur != null ? it.eur : 0) * (it.qty || 1), 0);
  const face = b.face || (first ? artCropFrom(first.img) : null);
  return /* HTML */ `<div class="folder-tile binder-tile" data-binderopen="${b.id}">
    <div class="binder-glyph-row">${binderTileGlyphs(b)}</div>
    ${binderHasRules(b) ? `<button type="button" class="br-info" data-brinfo="${b.id}" aria-label="Auto-fill">i</button>` : ''}
    <div class="folder-face">
      ${face ? `<img loading="lazy" src="${face}" alt="">` : `<span class="big-ico">${ICONS.binder}</span>`}
    </div>
    <div class="folder-name">${escapeHtml(b.name)}</div>
    <div class="folder-sub">
      ${qty} card${qty === 1 ? '' : 's'}${eur ? ` · €${eur.toFixed(2)}` : ''}
    </div>
  </div>`;
}

function collectionBindersGridHtml() {
  const binders = state.collection.binders;
  const qtyAll = state.collection.items.reduce((a, it) => a + (it.qty || 1), 0);
  const eurAll = state.collection.items.reduce(
    (a, it) => a + (it.eur != null ? it.eur : 0) * (it.qty || 1),
    0,
  );
  // Wants are computed, not stored — same tally as the wants view itself.
  let qtyW = 0,
    eurW = 0;
  try {
    computeWants().forEach((it) => {
      qtyW += it.qty || 1;
      eurW += (it.eur != null ? it.eur : 0) * (it.qty || 1);
    });
  } catch (e) {}
  // Automatic folders are computed views, not stored lists: All cards is
  // simply every card you own — filed or loose — so filing a card into any
  // binder "adds" it here by definition, and nothing can ever desync.
  const allTile = `<div class="folder-tile binder-tile" data-binderopen="__all__">
      <div class="folder-face colfold-ico">${ICONS.collection}</div>
      <div class="folder-name">All cards</div>
      <div class="folder-sub">${qtyAll} card${qtyAll === 1 ? '' : 's'}${eurAll ? ` · €${eurAll.toFixed(2)}` : ''}</div>
    </div>`;
  const wantsTile = `<div class="folder-tile binder-tile" data-binderopen="__wants__">
      <div class="folder-face"><span style="font-size:44px;line-height:1;">🔖</span></div>
      <div class="folder-name">Wants</div>
      <div class="folder-sub">${qtyW} card${qtyW === 1 ? '' : 's'}${eurW ? ` · €${eurW.toFixed(2)}` : ''}</div>
    </div>`;
  const _gc = folderView('col') === 'list' ? 'deck-grid as-list' : 'deck-grid';
  return `<section class="collection-folder-section" aria-labelledby="collectionBindersTitle">
    <h2 class="section-label" id="collectionBindersTitle">Binders</h2>
    ${binders.length ? `<div class="${_gc}">${binders.map(binderTileHtml).join('')}</div>` : '<p class="empty-note">Use + to create your first binder.</p>'}
  </section>
  <section class="collection-folder-section" aria-labelledby="collectionAutomaticTitle">
    <h2 class="section-label" id="collectionAutomaticTitle">Automatic folders</h2>
    <div class="${_gc}">${allTile}${wantsTile}</div>
  </section>
  <button class="deck-fab" id="colFab" title="Add cards or binder">＋</button>`;
}

function openBinderIn(id) {
  colSelClear();
  state.colFilter.binder = id;
  try {
    history.pushState({ screen: 'collection', binder: id }, '', '#collection');
  } catch (e) {}
  render();
  scrollToPageFoot();
}

/* A binder's cover, once derived, is written down for good — it never shifts
   when cards move, and it survives until the binder is deleted. */
function ensureBinderFaces() {
  let dirty = false;
  state.collection.binders.forEach((b) => {
    if (b.face) return;
    const first = state.collection.items.find((it) => it.binder === b.id && it.img);
    if (first) {
      b.face = artCropFrom(first.img);
      dirty = true;
    }
  });
  if (dirty) saveCollection();
}

function openBinderLongMenu(binder, x, y) {
  document.getElementById('binderLongPop')?.remove();
  const pop = document.createElement('div');
  pop.id = 'binderLongPop';
  pop.style.cssText =
    'position:fixed;z-index:120;background:var(--pop-bg);border:1.5px solid var(--pop-line);border-radius:12px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.5);display:flex;flex-direction:column;min-width:200px;';
  pop.innerHTML = /* HTML */ `<button data-a="ren">${mIco('edit')}${trS('Rename')}</button
    ><button data-a="del" style="color:var(--danger);">
      ${mIco('trash')}${trS('Delete binder')}
    </button>`;
  pop
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.style.cssText +=
          ';background:none;border:none;color:inherit;padding:12px 16px;font-size:15px;text-align:left;cursor:pointer;border-bottom:2px solid var(--line);'),
    );
  document.body.appendChild(pop);
  pop.style.left =
    Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, x - pop.offsetWidth / 2)) + 'px';
  pop.style.top = Math.max(8, Math.min(window.innerHeight - pop.offsetHeight - 8, y)) + 'px';
  pop.querySelector('[data-a="ren"]').addEventListener('click', () => {
    pop.remove();
    openInAppPrompt('Rename binder', 'New binder name', binder.name, (name) => {
      if (name && name.trim()) {
        binder.name = name.trim();
        saveCollection();
        render();
      }
    });
  });
  pop.querySelector('[data-a="del"]').addEventListener('click', () => {
    pop.remove();
    const q = `Delete the binder "${binder.name}"? Its cards stay in your collection, just unfiled.`;
    openInAppConfirm(
      q,
      (ok) => {
        if (!ok) return;
        state.collection.items.forEach((it) => {
          if (it.binder === binder.id) it.binder = null;
        });
        state.collection.binders = state.collection.binders.filter((b) => b.id !== binder.id);
        saveCollection();
        render();
      },
      { danger: true, ok: trS('Delete') },
    );
  });
  setTimeout(
    () =>
      document.addEventListener('click', function once(ev) {
        if (!pop.contains(ev.target)) {
          pop.remove();
          document.removeEventListener('click', once);
        }
      }),
    0,
  );
}

/* Long collection lists skip drawing the tiles that are off screen, holding
   their place with a guessed height. The guess was a fixed 330px; the real
   tile is taller or shorter per phone, so every row that came into view
   while scrolling UP (this page grows upward) changed height above the
   reader and the list jerked. The guess is now the measured height of a
   real tile on this screen. */
function fitColTileHeight() {
  try {
    const grid = document.querySelector('.col-grid');
    if (!grid) return;
    let h = 0;
    for (const t of grid.children) {
      const r = t.getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
        h = Math.max(h, r.height);
      }
      if (h && r.top > window.innerHeight) break;
    }
    // The placeholder size is the CONTENT box: borders and padding come on top.
    const t0 = grid.firstElementChild,
      cs = t0 ? getComputedStyle(t0) : null;
    const extra = cs
      ? ['borderTopWidth', 'borderBottomWidth', 'paddingTop', 'paddingBottom'].reduce(
          (a, k) => a + (parseFloat(cs[k]) || 0),
          0,
        )
      : 0;
    if (h > 60)
      document
        .querySelectorAll('.col-grid')
        .forEach((g) => g.style.setProperty('--col-tile-h', (h - extra).toFixed(2) + 'px'));
  } catch (e) {}
}

window.addEventListener('resize', () => {
  if (state.screen === 'collection') fitColTileHeight();
});

/* Read a binder's name and show matching symbols in front of it: mana pips for
   colours (same icons as the advanced filter), a rarity dot or a type glyph, or
   a folder as a generic fallback when the name follows none of these. */
function binderGlyphsHtml(name) {
  const toks = new Set(
    norm(name)
      .replace(/[^a-z]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
  const out = [];
  // COLORS — single color words give single symbols; a GUILD name gives the
  // real two-color HYBRID symbol; three-color names spell their three.
  const colorWords = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: 'C' };
  const singles = [];
  Object.keys(colorWords).forEach((w) => {
    if (toks.has(w) && !singles.includes(colorWords[w])) singles.push(colorWords[w]);
  });
  const combos = {
    azorius: 'WU',
    dimir: 'UB',
    rakdos: 'BR',
    gruul: 'RG',
    selesnya: 'GW',
    orzhov: 'WB',
    izzet: 'UR',
    golgari: 'BG',
    boros: 'RW',
    simic: 'GU',
    bant: 'GWU',
    esper: 'WUB',
    grixis: 'UBR',
    jund: 'BRG',
    naya: 'RGW',
    mardu: 'RWB',
    temur: 'GUR',
    abzan: 'WBG',
    jeskai: 'URW',
    sultai: 'BGU',
    wubrg: 'WUBRG',
    rainbow: 'WUBRG',
    fivecolor: 'WUBRG',
  };
  Object.keys(combos).forEach((k) => {
    if (!toks.has(k)) return;
    const cs = combos[k];
    if (cs.length === 2) out.push(hybridManaSvg(cs[0], cs[1], 14));
    else
      cs.split('').forEach((c) => {
        if (!singles.includes(c)) singles.push(c);
      });
  });
  if (singles.length) {
    const order = 'WUBRGC';
    singles.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    singles.forEach((c) => out.push(manaIconSvg(c, 14)));
  }
  if (
    toks.has('multicolor') ||
    toks.has('multicolour') ||
    toks.has('multicolored') ||
    toks.has('gold')
  )
    out.push(multiIconSvg(14));
  // RARITY — every mentioned rarity gets its dot
  const rar = {
    mythic: 'M',
    mythics: 'M',
    rare: 'R',
    rares: 'R',
    uncommon: 'U',
    uncommons: 'U',
    common: 'C',
    commons: 'C',
  };
  const dots = [];
  for (const w in rar) {
    if (toks.has(w) && !dots.includes(rar[w])) dots.push(rar[w]);
  }
  ['C', 'U', 'R', 'M'].forEach((r) => {
    if (dots.includes(r)) out.push(`<span class="rar-dot rar-${r}"></span>`);
  });
  // TYPES wear the dock's icons; token and foil ride along. ALL categories
  // STACK — "Colorless Lands Foils" earns its three glyphs side by side.
  const typeWord = {
    creature: 'Creature',
    creatures: 'Creature',
    instant: 'Instant',
    instants: 'Instant',
    sorcery: 'Sorcery',
    sorceries: 'Sorcery',
    artifact: 'Artifact',
    artifacts: 'Artifact',
    enchantment: 'Enchantment',
    enchantments: 'Enchantment',
    planeswalker: 'Planeswalker',
    planeswalkers: 'Planeswalker',
    battle: 'Battle',
    battles: 'Battle',
    land: 'Land',
    lands: 'Land',
  };
  const kinds = [];
  for (const w in typeWord) {
    if (toks.has(w) && !kinds.includes(typeWord[w])) kinds.push(typeWord[w]);
  }
  const order2 = [
    'Creature',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Planeswalker',
    'Battle',
    'Land',
  ];
  kinds.sort((a, b) => order2.indexOf(a) - order2.indexOf(b));
  kinds.forEach((k) => out.push(DOCK_TYPE_ICONS[k] || ''));
  if (toks.has('token') || toks.has('tokens')) out.push(ICONS.token);
  if (toks.has('foil') || toks.has('foils') || toks.has('foiled'))
    out.push('<span style="color:var(--head-ink);">✦</span>');
  if (out.length) return /* HTML */ `<span class="binder-glyphs">${out.join('')}</span>`;
  return /* HTML */ `<span class="binder-glyphs">${ICONS.binder}</span>`;
}

function hybridManaSvg(a, b, px) {
  // The real Magic hybrid symbol: one circle split on the diagonal — first
  // color upper-left, second lower-right, each half wearing its own glyph.
  px = px || 14;
  const A = MANA_GLYPHS[a],
    B = MANA_GLYPHS[b];
  if (!A || !B) return manaIconSvg(a, px) + manaIconSvg(b, px);
  return (
    `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="${a}/${b}">` +
    `<path d="M26.6 5.4 A15 15 0 0 0 5.4 26.6 Z" fill="${A.bg}"/>` +
    `<path d="M26.6 5.4 A15 15 0 0 1 5.4 26.6 Z" fill="${B.bg}"/>` +
    `<circle cx="16" cy="16" r="15" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>` +
    `<g transform="translate(1.5,1.5) scale(0.44)"><path d="${A.d}" fill="rgba(0,0,0,0.72)"/></g>` +
    `<g transform="translate(16.5,16.5) scale(0.44)"><path d="${B.d}" fill="rgba(0,0,0,0.72)"/></g>` +
    `</svg>`
  );
}

function multiIconSvg(px) {
  // Multicolor: the five-color pie behind one clean ring.
  px = px || 14;
  const cs = ['W', 'U', 'B', 'R', 'G'].map((c) => (MANA_GLYPHS[c] || {}).bg || '#c9a24b');
  const R = 15,
    cx = 16,
    cy = 16;
  const wedge = (i) => {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 5,
      a1 = a0 + (2 * Math.PI) / 5;
    const x0 = cx + R * Math.cos(a0),
      y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1),
      y1 = cy + R * Math.sin(a1);
    return `<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${cs[i]}"/>`;
  };
  return `<svg class="mana-ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-label="multicolor">${[0, 1, 2, 3, 4].map(wedge).join('')}<circle cx="16" cy="16" r="15" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/></svg>`;
}

function openBindersPop(anchorEl, onPick, includeAll) {
  document.getElementById('bindersPop')?.remove();
  const pop = document.createElement('div');
  pop.id = 'bindersPop';
  const rows = [];
  if (includeAll) {
    rows.push(
      `<button data-pick="" ><span class="ib">${ICONS.collection}</span>All binders</button>`,
    );
    rows.push(
      `<button data-pick="__wants__">🔖 Wants <span style="font-size:11.5px;color:var(--sub-text-2);">· auto</span></button>`,
    );
  } else rows.push(`<button data-pick="">— No binder —</button>`);
  state.collection.binders.forEach((b) =>
    rows.push(
      `<div class="bp-row"><button data-pick="${b.id}">${binderGlyphsHtml(b.name)} ${escapeHtml(b.name)}</button><button class="bp-edit" data-ed="${b.id}" title="Rename">✎</button></div>`,
    ),
  );
  rows.push(`<button data-newb="1" style="color:var(--head-ink);">＋ New binder</button>`);
  pop.innerHTML = rows.join('');
  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  // Fixed positioning in viewport coordinates: the pop must sit ABOVE full
  // screen overlays (Manage copy) and never depend on page scroll. Flip above
  // the anchor when there's no room below, and clamp to the right edge.
  pop.style.top = r.bottom + 6 + 'px';
  pop.style.left = Math.max(8, r.left) + 'px';
  if (r.bottom + 6 + pop.offsetHeight > window.innerHeight - 8) {
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px';
  }
  if (r.left + pop.offsetWidth > window.innerWidth - 8) {
    pop.style.left = Math.max(8, window.innerWidth - pop.offsetWidth - 8) + 'px';
  }
  const close = () => pop.remove();
  pop.querySelectorAll('button[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      onPick(b.dataset.pick || null);
    }),
  );
  pop.querySelectorAll('.bp-edit').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const binder = state.collection.binders.find((x) => x.id === b.dataset.ed);
      if (!binder) return;
      openInAppPrompt('Rename binder', 'New binder name', binder.name, (name) => {
        if (name && name.trim()) {
          binder.name = name.trim();
          saveCollection();
          close();
          render();
        }
      });
    }),
  );
  pop.querySelector('button[data-newb]').addEventListener('click', () => {
    openInAppPrompt('New binder name', 'Binder name', '', (name) => {
      if (name && name.trim()) {
        const b = { id: 'bnd_' + Date.now().toString(36), name: name.trim() };
        state.collection.binders.push(b);
        saveCollection();
        close();
        onPick(b.id);
      }
    });
  });
  setTimeout(
    () =>
      document.addEventListener('click', function once(ev) {
        if (!pop.contains(ev.target)) {
          close();
          document.removeEventListener('click', once);
        }
      }),
    0,
  );
}

/* ---- printings dropdown with set symbols (shared by collection UIs) ---- */
/* Set symbols as the card wears them: the official set SVG, tinted by the
   printing's rarity. Rendered as an image (loads without CORS), with hard
   sizing no surrounding rule can override; a set-code chip only appears if
   the image genuinely fails to load. */
function setIcoHtml(code, rarity) {
  if (!code) return '';
  const c = String(code).toLowerCase();
  if (!state.setIconMap) {
    try {
      state.setIconMap = JSON.parse(localStorage.getItem(LS_PREFIX + 'setIcons') || '{}');
    } catch (e) {
      state.setIconMap = {};
    }
  }
  const url = state.setIconMap[c] || `https://svgs.scryfall.io/sets/${c}.svg`;
  const r = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'].includes(rarity)
    ? rarity
    : 'common';
  return `<img class="set-ico r-${r}" src="${url}" alt="" loading="lazy" data-c="${escapeHtml(c.toUpperCase())}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'set-chip',textContent:this.dataset.c}))">`;
}

function printEur(p) {
  return p && p.prices
    ? parseFloat(p.prices.eur) || parseFloat(p.prices.eur_foil) || null
    : p && p.eur != null
      ? p.eur
      : null;
}

function printLabelHtml(p) {
  const eur = printEur(p);
  return `${setIcoHtml(p.set, p.rarity)}<span class="pd-l">${escapeHtml(String(p.set || '').toUpperCase())}${eur != null ? ` · <span style="color:var(--brass);font-family:'JetBrains Mono',monospace;">€${eur.toFixed(2)}</span>` : ''}</span>`;
}

function printsDropdownHtml(id, prints, sel, loading) {
  const cur = prints[sel];
  return /* HTML */ `<div class="pd" id="${id}">
    <button class="pd-btn" type="button">
      ${cur ? printLabelHtml(cur) : '<span class="pd-l">Choose printing…</span>'}<span
        class="cs-car"
        >▾</span
      >
    </button>
    <div class="pd-panel" hidden>
      ${loading ? '<div class="status" style="padding:10px;"><div class="spinner"></div>Fetching printings…</div>' : prints.map((q, i) => `<button class="pd-opt ${i === sel ? 'sel' : ''}" type="button" data-pi="${i}">${printLabelHtml(q)}</button>`).join('')}
    </div>
  </div>`;
}

function wirePrintsDropdown(rootEl, id, onPick) {
  const pd = rootEl.querySelector('#' + id);
  if (!pd) return;
  const btn = pd.querySelector('.pd-btn'),
    panel = pd.querySelector('.pd-panel');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  pd.querySelectorAll('.pd-opt').forEach((o) =>
    o.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = true;
      onPick(+o.dataset.pi);
    }),
  );
  // Outside-tap closing (with swallow) is handled by the document gatekeeper.
}

/* The card behind a Wants tile, fastest source first: the copy in your deck
   (instant), then the offline card database, and only then Scryfall -- at
   the head of the queue, because the person is waiting for it. */
/* "wanted in: Deck A, Deck B" -- two lines at most, flowing round the price
   that sits at the right of the second line. */
function wantInLabel(it) {
  const decks = (it.decks || []).map((n) => escapeHtml(n));
  if (decks.length) return `<span class="wi-k">${'wanted in:'}</span> ${decks.join(', ')}`;
  return 'wanted · added by you';
}

/* "I got it" on a Wants tile: pick the printing you have (the normal Change
   printing screen), then it joins the collection -- in the binder whose rules
   it meets, the player choosing if several fit, or if none does. */
async function wantGotIt(name) {
  const card = await wantCardFor(name);
  if (!card) {
    toast('Card not found.');
    return;
  }
  openPrintingGrid(
    card,
    async (chosen) => {
      await brAfterPop();
      const slim = slimForCollection(chosen || card);
      const it = Object.assign({}, slim, { cond: 'NM', qty: 1 });
      const binders = state.collection.binders || [];
      let bid = null;
      if (binders.length) {
        const cands = binderCandidates(it);
        if (cands.length === 1) bid = cands[0].id;
        else if (cands.length > 1) bid = (await openBinderConflict(it, cands)).id;
        else bid = (await openBinderConflict(it, binders, { noneFit: true })).id;
      }
      const same = state.collection.items.find(
        (x) =>
          x.name === slim.name &&
          x.set === slim.set &&
          x.cn === slim.cn &&
          x.cond === 'NM' &&
          !!x.foil === !!slim.foil &&
          (x.binder || null) === (bid || null),
      );
      if (same) same.qty += 1;
      else
        state.collection.items.unshift(
          Object.assign({}, slim, { cond: 'NM', qty: 1, binder: bid, addedAt: Date.now() }),
        );
      state.collection.wantsManual = (state.collection.wantsManual || []).filter(
        (w) => w.name !== slim.name,
      );
      saveCollection();
      if (pwAll()[slim.name]) {
        delete pwAll()[slim.name];
        pwSave();
      }
      toast(`${slim.name} \u2192 ${brBinderName(bid)}`);
      if (state.screen === 'collection') render();
    },
    { noCustom: true },
  );
}

async function wantCardFor(name) {
  const own = state._wantsSrc && state._wantsSrc.get(name);
  if (own) return own;
  const url = `${SF_BASE}/cards/named?exact=${encodeURIComponent(name)}`;
  try {
    const b = await _bulkNamedServe(url);
    if (b && b.ok) {
      const c = await b.json();
      if (c && c.name) return c;
    }
  } catch (e) {}
  try {
    const r = await sfFetch(url, 0, false, false, true);
    if (r && r.ok) return await r.json();
  } catch (e) {}
  return null;
}

function openWantSheet(name) {
  pushOverlay('wantSheet', () => document.getElementById('wantSheetOverlay')?.remove());
  let el = document.getElementById('wantSheetOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'wantSheetOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  el.innerHTML = /* HTML */ `<div class="overlay-inner" style="max-width:340px;">
    <main style="padding:14px;">
      <div class="panel-card">
        <div class="panel-h">🔖 ${escapeHtml(name)}</div>
        <p class="hint">On your Wants list.</p>
        <button class="ghost-btn" id="wsView" style="width:100%;margin-bottom:8px;">
          ${inlIco('search')}${trS('View card')}
        </button>
        <button
          class="ghost-btn"
          id="wsRemove"
          style="width:100%;color:var(--danger);border-color:var(--danger);margin-bottom:8px;"
        >
          Remove from Wants
        </button>
        <button class="ghost-btn" id="wsClose" style="width:100%;">Close</button>
      </div>
    </main>
  </div>`;
  el.querySelector('#wsView').addEventListener('click', async () => {
    try {
      const r = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(name)}`);
      if (r.ok) openCardInfo(await r.json());
    } catch (e) {}
  });
  el.querySelector('#wsRemove').addEventListener('click', () => {
    state.collection.wantsExclude.push(name);
    state.collection.wantsManual = state.collection.wantsManual.filter((w) => w.name !== name);
    saveCollection();
    toast(name + ' removed from Wants.');
    closeTopOverlay();
    render();
  });
  el.querySelector('#wsClose').addEventListener('click', closeTopOverlay);
}

function colSlimCard(it) {
  return {
    name: it.name,
    set: it.set || '',
    set_name: it.set_name || (it.set || '').toUpperCase(),
    collector_number: it.cn || '',
    border_color: it.border_color,
    image_uris: { small: it.img, normal: it.img, large: it.img },
  };
}

async function refreshColCardSheet(idx) {
  // After Manage copy changes something, the card page beneath must show the
  // copy as it now is — instantly from stored data, then the full card.
  const it = state.collection.items[idx];
  if (!it || !document.getElementById('cardSheetOverlay') || state._colSheetIdx !== idx) return;
  const colOpts = { colIdx: idx, _replace: true };
  if (it.img) openCardInfo(colSlimCard(it), colOpts);
  try {
    let r =
      it.set && it.cn
        ? await sfFetch(`${SF_BASE}/cards/${it.set}/${encodeURIComponent(it.cn)}`)
        : { ok: false };
    if (!r.ok) r = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(it.name)}`);
    if (r.ok && document.getElementById('cardSheetOverlay') && state._colSheetIdx === idx) {
      const full = await r.json();
      // Heal older copies whose stored art was poisoned by the preference
      // override: the image must always match the copy's own set/number.
      const rawImg = cardImageMedRaw(full);
      if (rawImg && it.img !== rawImg) {
        it.img = rawImg;
        it.border_color = full.border_color || '';
        saveCollection();
        state._colDirty = true;
      }
      openCardInfo(full, colOpts);
    }
  } catch (e) {}
}

async function openCollectionCard(idx, pool) {
  const it = state.collection.items[idx];
  if (!it) return;
  const colOpts = {
    colIdx: idx,
    collectionItem: it,
    colItems: Array.isArray(pool)
      ? pool.map((index) => state.collection.items[index]).filter(Boolean)
      : null,
    colPool: Array.isArray(pool) ? pool : null,
    colPoolIdx: Array.isArray(pool) ? pool.indexOf(idx) : -1,
  };
  // Open INSTANTLY from what the copy already knows — name, art, set line —
  // then upgrade in place when the full card arrives. The first tap of a
  // session used to wait behind the whole startup fetch queue in silence.
  if (it.img) {
    openCardInfo(colSlimCard(it), colOpts);
  }
  let card = null;
  try {
    if (it.set && it.cn) {
      const r = await sfFetch(`${SF_BASE}/cards/${it.set}/${encodeURIComponent(it.cn)}`);
      if (r.ok) card = await r.json();
    }
    if (!card) {
      const r2 = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(it.name)}`);
      if (r2.ok) card = await r2.json();
    }
  } catch (e) {}
  if (card) {
    // Only upgrade if the sheet is still showing this copy.
    if (!it.img || document.getElementById('cardSheetOverlay')?._collectionItem === it)
      openCardInfo(card, Object.assign({}, colOpts, it.img ? { _replace: true } : {}));
  } else if (!it.img) openColItemSheet(idx); // offline / not found — fall back to the manage sheet
}

function openColItemSheet(idx) {
  const it = state.collection.items[idx];
  if (!it) return;
  // The collection page repaints on close ONLY if the sheet changed something
  // — an untouched Close is instant instead of re-rendering the whole grid.
  pushOverlay('colItem', () => {
    document.getElementById('colItemOverlay')?.remove();
    const dirty = state._colDirty;
    if (dirty && state.screen === 'collection') {
      state._colDirty = false;
      render();
    }
    if (dirty) refreshColCardSheet(idx); // Save and back-press alike
  });
  renderColItemSheet(idx);
}

function renderColItemSheet(idx) {
  const it = state.collection.items[idx];
  if (!it) return;
  let el = document.getElementById('colItemOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'colItemOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  const condName = (COL_CONDS.find((c) => c[0] === it.cond) || ['', it.cond])[1];
  el.innerHTML = /* HTML */ `<div class="overlay-inner" style="max-width:380px;">
    <main style="padding:14px 14px 30px;">
      <div class="panel-card">
        <div style="text-align:center;margin-bottom:8px;">
          <img
            class="${it.border_color === 'white' ? 'wb-card' : ''}"
            src="${it.img}"
            alt="${escapeHtml(it.name)}"
            id="ciSheetImg"
            style="width:190px;cursor:pointer;"
          />
        </div>
        <div class="panel-h" style="text-align:center;">${escapeHtml(it.name)}</div>
        <p class="hint" style="text-align:center;">
          ${escapeHtml(it.set_name || it.set || '')}${it.cn ? ' · #' + escapeHtml(it.cn) : ''} ·
          ${escapeHtml(condName)}${it.binder ? ' · ' + escapeHtml(binderName(it.binder) || '') : ''}
        </p>
        <div class="action-row" style="margin:10px 0;">
          <button class="ghost-btn" id="ciQminus">−</button>
          <span
            style="align-self:center;min-width:44px;text-align:center;font-family:'JetBrains Mono',monospace;"
            >×${it.qty}</span
          >
          <button class="ghost-btn" id="ciQplus">＋</button>
        </div>
        <div class="adv-row" style="margin-bottom:8px;">
          <label>Printing</label>
          <div id="ciPdBox">
            ${printsDropdownHtml('ciPd', state._colPrints && state._colPrints.name === it.name ? state._colPrints.list : [], -1, !(state._colPrints && state._colPrints.name === it.name))}
          </div>
        </div>
        <div class="cs-actions-grid" style="margin-bottom:8px;">
          <button class="ghost-btn" id="ciMoveB">
            ${inlIco('binder')}${escapeHtml(it.binder ? binderName(it.binder) || 'Binder' : 'No binder')}
          </button>
          <button
            class="ghost-btn"
            id="ciDel"
            style="color:var(--danger);border-color:var(--danger);"
          >
            Remove
          </button>
          <button
            class="ghost-btn${it.foil ? ' ci-foil-on' : ''}"
            id="ciFoil"
            style="grid-column:1/-1;"
          >
            ✨ Foil: ${it.foil ? 'yes' : 'no'}
          </button>
        </div>
        <button
          class="ghost-btn"
          id="ciCloseSheet"
          style="width:100%;color:var(--brass);border-color:var(--brass);"
        >
          ${trS('Save')}
        </button>
      </div>
    </main>
  </div>`;
  const paintPd = () => {
    const have = state._colPrints && state._colPrints.name === it.name;
    const list = have ? state._colPrints.list : [];
    const sel = have ? list.findIndex((p) => p.set === it.set && p.collector_number === it.cn) : -1;
    const box = el.querySelector('#ciPdBox');
    box.innerHTML = printsDropdownHtml('ciPd', list, sel, !have);
    wirePrintsDropdown(box, 'ciPd', (i) => {
      const p = list[i];
      it.set = p.set;
      it.set_name = p.set_name || '';
      it.cn = p.collector_number || '';
      // Raw art, always: cardImageMed applies the remembered-printing override,
      // which once stored another printing's art under this copy's set line.
      it.img = cardImageMedRaw(p);
      it.eur = printEur(p);
      it.border_color = p.border_color || '';
      saveCollection();
      state._colDirty = true;
      renderColItemSheet(idx);
    });
  };
  paintPd();
  if (!(state._colPrints && state._colPrints.name === it.name)) {
    (async () => {
      try {
        const r = await sfFetch(
          `${SF_BASE}/cards/search?unique=prints&order=released&q=${encodeURIComponent('!"' + it.name + '" game:paper')}`,
        );
        if (r.ok) {
          const d = await r.json();
          state._colPrints = { name: it.name, list: (d.data || []).slice(0, 30) };
        } else state._colPrints = { name: it.name, list: [] };
      } catch (e) {
        state._colPrints = { name: it.name, list: [] };
      }
      if (document.getElementById('colItemOverlay')) paintPd();
    })();
  }
  el.querySelector('#ciSheetImg').addEventListener('click', async () => {
    try {
      const r = await sfFetch(`${SF_BASE}/cards/${it.set}/${encodeURIComponent(it.cn)}`);
      if (r.ok) {
        openCardInfo(await r.json());
        return;
      }
    } catch (e) {}
    try {
      const r2 = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(it.name)}`);
      if (r2.ok) openCardInfo(await r2.json());
    } catch (e) {}
  });
  el.querySelector('#ciQplus').addEventListener('click', () => {
    it.qty++;
    saveCollection();
    state._colDirty = true;
    renderColItemSheet(idx);
  });
  el.querySelector('#ciQminus').addEventListener('click', () => {
    if (it.qty > 1) {
      it.qty--;
      saveCollection();
      state._colDirty = true;
      renderColItemSheet(idx);
    }
  });
  el.querySelector('#ciMoveB').addEventListener('click', (e) => {
    e.stopPropagation();
    openBindersPop(
      e.currentTarget,
      (bid) => {
        const dest = bid || null;
        if ((it.binder || null) === dest) return; // same place — nothing to do
        const fromName = it.binder ? binderName(it.binder) || 'binder' : null;
        const destName = dest ? binderName(dest) || 'binder' : null;
        const q = `Move ${it.name} ${destName ? 'to ' + destName : 'out of ' + (fromName || 'its binder') + ' (no binder)'}?`;
        openInAppConfirm(
          q,
          (ok) => {
            if (!ok) return;
            it.binder = dest;
            // If the destination already holds an identical stack (same printing
            // and condition), fold this copy into it — the card leaves where it
            // was and exists exactly once where it landed.
            const twin = state.collection.items.find(
              (x) =>
                x !== it &&
                x.name === it.name &&
                x.set === it.set &&
                (x.cn || '') === (it.cn || '') &&
                x.cond === it.cond &&
                !!x.foil === !!it.foil &&
                (x.binder || null) === dest,
            );
            let survivor = it;
            if (twin) {
              twin.qty += it.qty;
              const i0 = state.collection.items.indexOf(it);
              if (i0 >= 0) state.collection.items.splice(i0, 1);
              survivor = twin;
            }
            saveCollection();
            state._colDirty = true;
            toast(trS('Moved.'));
            renderColItemSheet(state.collection.items.indexOf(survivor));
          },
          { ok: trS('Move') },
        );
      },
      false,
    );
  });
  el.querySelector('#ciFoil').addEventListener('click', () => {
    it.foil = it.foil ? undefined : true;
    const pl = state._colPrints && state._colPrints.name === it.name ? state._colPrints.list : [];
    const pr = pl.find((p) => p.set === it.set && p.collector_number === it.cn);
    if (pr && pr.prices) {
      const v = parseFloat(
        it.foil ? pr.prices.eur_foil || pr.prices.eur : pr.prices.eur || pr.prices.eur_foil,
      );
      if (isFinite(v)) it.eur = v;
    }
    // An identical stack with the same finish takes this copy in.
    const twin = state.collection.items.find(
      (x) =>
        x !== it &&
        x.name === it.name &&
        x.set === it.set &&
        (x.cn || '') === (it.cn || '') &&
        x.cond === it.cond &&
        !!x.foil === !!it.foil &&
        (x.binder || null) === (it.binder || null),
    );
    let survivor = it;
    if (twin) {
      twin.qty += it.qty;
      state.collection.items.splice(state.collection.items.indexOf(it), 1);
      survivor = twin;
    }
    saveCollection();
    state._colDirty = true;
    renderColItemSheet(state.collection.items.indexOf(survivor));
  });
  el.querySelector('#ciDel').addEventListener('click', () => {
    const q = 'Remove ' + it.name + ' from your collection?';
    openInAppConfirm(
      q,
      (ok) => {
        if (!ok) return;
        state.collection.items.splice(idx, 1);
        saveCollection();
        state._colDirty = true;
        closeTopOverlay();
      },
      { danger: true, ok: trS('Delete') },
    );
  });
  el.querySelector('#ciCloseSheet').addEventListener('click', closeTopOverlay);
}
