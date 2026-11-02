// pages / inspiration / recommendations

/* Session cache for the recommendations page: the resolved pool and the
   leader's themes, keyed per leader (pair-aware). Without it every visit
   re-resolved ~90 names through the serial Scryfall queue — slow — and a
   lost race on the repeat visit dropped to the synergy fallback, taking
   the theme dropdowns with it. Once earned, both are kept. */
state._recoCache = state._recoCache || {};

function recoCacheKey(a, p) {
  return edhrecSlug(a.name) + (p ? '::' + edhrecSlug(p.name) : '');
}

function openCommanderReco(admiral, partner) {
  // Arriving from a theme or Kindred page: that context IS the request —
  // seed the reco page with it so the first load is the commander-within-
  // theme list, not the generic one reshuffled later.
  const bs = state.browseSel || {};
  const seedTheme =
    state.screen === 'browse'
      ? bs.theme && bs.theme.indexOf('ed:') === 0
        ? bs.theme.slice(3)
        : bs.tribe || null
      : null;
  const recoFmt =
    state.screen === 'browse'
      ? state.browseFormat || 'commander'
      : state.inspireDeckId && getDeck(state.inspireDeckId)
        ? deckFormat(getDeck(state.inspireDeckId))
        : state.searchPinnedDeckId && getDeck(state.searchPinnedDeckId)
          ? deckFormat(getDeck(state.searchPinnedDeckId))
          : 'commander';
  state.reco = {
    admiral,
    partner: partner || null,
    pool: [],
    selected: new Set(),
    loading: true,
    error: false,
    _seedTheme: seedTheme || null,
    format: recoFmt,
  };
  // Served from the session cache: the page is complete on arrival.
  const hit = state._recoCache[recoCacheKey(admiral, partner)];
  if (hit && hit.pool && hit.pool.length) {
    state.reco.pool = hit.pool.slice();
    state.reco._mainPool = state.reco.pool; // the theme loader's revert target
    state.reco.themes = (hit.themes || []).slice();
    state.reco.sections = (hit.sections || []).slice();
    state.reco.edhrecSourced = !!hit.edhrecSourced;
    state.reco.loading = false;
  }
  let el = document.getElementById('recoOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'recoOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  pushOverlay('reco', () => {
    document.getElementById('recoOverlay')?.remove();
    state.reco = null;
  });
  renderRecoOverlay();
  if (state.reco.loading) loadRecoPool();
  else if (state.reco._seedTheme) {
    // Cache served the page whole, so the fresh-load chain never runs —
    // hand the seed to the theme loader from here.
    const R = state.reco,
      t = R._seedTheme;
    R._seedTheme = null;
    // Unconditional, matching the fresh-load chain: the theme loader itself
    // reverts to the main pool with a toast if the page has no such theme.
    loadRecoTheme(t);
  }
}

/* 1.1: the cap of a leader's page names what is chosen -- "Leader - Theme",
   like Inspiration's own cap -- so it stays in view while scrolling. A pick
   made while the list still loads (R._pick) counts too. */
function recoCapTitle(R) {
  const base = R.admiral.name + (R.partner ? ' & ' + R.partner.name : '');
  // 1.3: the Theme/Kindred chosen on Inspiration (the seed) counts from the start
  const sl = R._pick || R._seedTheme || R.activeThemeSlug || '';
  if (!sl) return base;
  const t = (R.themes || []).find((x) => x.slug === sl);
  const lab = t
    ? String(t.label)
    : String(sl)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
  // a no-break space keeps the "-" on the line of the name before it
  return base + '\u00a0- ' + lab;
}

function recoPaintCap() {
  const R = state.reco;
  const t = R && document.querySelector('#recoOverlay .ov-title');
  if (!t) return;
  const want = recoCapTitle(R);
  if (t.textContent !== want) t.textContent = want; // the title fitter refits it
}

/* 1.1: the Theme / Kindred menus, on their own -- painted the moment the
   leader's theme list is known, so a pick can be made while the cards still
   load. Lives in #recoChipsSlot, under the commander card (the page foot). */
function paintRecoMenus() {
  const R = state.reco;
  const slot = document.getElementById('recoChipsSlot');
  if (!R || !slot) return;
  const cachedThemes = (state._recoCache[recoCacheKey(R.admiral, R.partner)] || {}).themes;
  const chipList = (R.themes && R.themes.length ? R.themes : cachedThemes || []).slice();
  const curSl = R._pick || R._seedTheme || R.activeThemeSlug || '';
  if (curSl && !chipList.some((t) => t.slug === curSl)) {
    chipList.unshift({
      label: curSl.replace(/-/g, ' ').replace(/(^|\s)\w/g, (ch) => ch.toUpperCase()),
      slug: curSl,
      count: 0,
    });
  }
  const activeTheme = curSl ? chipList.find((t) => t.slug === curSl) : null;
  // The chip row grew into two Inspiration-style searchable dropdowns —
  // Theme and Kindred — fed by the same commander-page tag list (most
  // played with this leader, in EDHREC's own order). kindredNameSet and the
  // harvest's k flag split the list the same way the browse page does.
  const ks = kindredNameSet();
  const isKin = (t) => !!t.k || ks.has(String(t.label || '').toLowerCase());
  const kinList = chipList.filter(isKin);
  const thList = chipList.filter((t) => !isKin(t));
  const activeIsKin = activeTheme ? isKin(activeTheme) : false;
  // Below the hero: Kindred first (upper), Theme beneath it at the foot.
  slot.innerHTML = chipList.length
    ? `<div class="reco-themes" style="flex-direction:column;align-items:stretch;gap:8px;margin-top:8px;">
        ${kinList.length && !(activeTheme && !activeIsKin) ? cselectHtml('recoKindred', [{ v: '', l: trS('Kindred — none') }].concat(kinList.map((t) => ({ v: t.slug, l: escapeHtml(t.label) }))), activeIsKin ? curSl : '', trS('Kindred — none'), { search: true }) : ''}
        ${thList.length && !activeIsKin ? cselectHtml('recoTheme', [{ v: '', l: trS('Theme — none') }].concat(thList.map((t) => ({ v: t.slug, l: escapeHtml(t.label) }))), activeIsKin ? '' : curSl, trS('Theme — none'), { search: true }) : ''}
      </div>`
    : '';
  // Scoped cselect wiring — the global wireCSelects only binds page elements
  // at page render, and its refresh path repaints the page, not this overlay.
  _csHandlers['recoTheme'] = _csHandlers['recoKindred'] = (v) => {
    const R2 = state.reco;
    if (!R2) return;
    if (R2.loading || R2._streaming) {
      // the list is still on its way: hold the pick, apply it when it lands
      // (a pick -- "none" too -- replaces the choice brought from Inspiration)
      R2._pick = v || null;
      R2._seedTheme = null;
      paintRecoMenus();
      const box = document.getElementById('recoBody');
      if (box)
        box.innerHTML = /* HTML */ `<div class="status">
          <div class="spinner"></div>
          ${R2._pick ? trS('Charting themed recommendations…') : 'Charting recommendations…'}
        </div>`;
      return;
    }
    const cur = R2.activeThemeSlug || '';
    if (v === cur) {
      paintRecoMenus();
      return;
    } // unchanged — just close the panel
    if (!v) {
      loadRecoTheme(cur);
      return;
    } // "none" — same slug toggles back to the main list
    loadRecoTheme(v); // switching loads the new theme directly
  };
  slot.querySelectorAll('[data-cs]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const csId = b.dataset.cs;
      // Same rule as everywhere else: the button you tapped keeps its place.
      keepAnchored(
        b,
        () => {
          state.openCSelect = state.openCSelect === csId ? null : csId;
          paintRecoMenus();
        },
        () => {
          try {
            return document.querySelector('#recoOverlay [data-cs="' + CSS.escape(csId) + '"]');
          } catch (err) {
            return null;
          }
        },
      );
    }),
  );
  slot.querySelectorAll('[data-csopt]').forEach((opt) =>
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = opt.dataset.csopt,
        val = opt.dataset.val;
      state.openCSelect = null;
      const h = _csHandlers[id];
      if (h) h(val);
      else paintRecoMenus();
    }),
  );
  wireCsSearchRows(slot);
  recoPaintCap();
  if (typeof placeRecoJump === 'function') placeRecoJump();
}

// A pick held while loading goes through the moment the main list is final.
function recoReleasePick(R) {
  if (!R || state.reco !== R || !R._pick) return false;
  const p = R._pick;
  R._pick = null;
  if (R.error) {
    renderRecoBody();
    return true;
  }
  loadRecoTheme(p);
  return true;
}

function renderRecoOverlay() {
  const el = document.getElementById('recoOverlay');
  const R = state.reco;
  if (!el || !R) return;
  const n = R.selected.size;
  const theme = state.browseSel.theme
    ? BROWSE_THEMES.find((t) => t.key === state.browseSel.theme)
    : null;
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(recoCapTitle(R))}
    <main>
      <div class="reco-admiral">
        <div class="ra-hint" style="position:static;border-top:none;margin:0 0 6px;padding:0;">
          tap cards to select
        </div>
        ${
          R.partner
            ? `<div class="reco-pair-grid">
          <img class="${wbClass(R.admiral)}" src="${cardImageLarge(R.admiral)}" id="recoAdmImg" alt="${escapeHtml(R.admiral.name)}">
          <img class="${wbClass(R.partner)}" src="${cardImageLarge(R.partner)}" id="recoAdmImg2" alt="${escapeHtml(R.partner.name)}">
        </div>`
            : `<img class="${wbClass(R.admiral)}" src="${cardImageLarge(R.admiral)}" id="recoAdmImg" alt="${escapeHtml(R.admiral.name)}">`
        }
        <div id="recoChipsSlot"></div>
      </div>
      <div id="recoBody">
        ${R.loading ? `<div class="status"><div class="spinner"></div>${R._seedTheme ? trS('Charting themed recommendations…') : 'Charting recommendations…'}</div>` : ''}
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  document
    .getElementById('recoAdmImg')
    .addEventListener('click', () => openCardInfo(R.admiral, { pool: R.pool }));
  const p2 = document.getElementById('recoAdmImg2');
  if (p2) p2.addEventListener('click', () => openCardInfo(R.partner, { pool: R.pool }));
  if (!document.getElementById('recoCreate')) {
    const fb = document.createElement('button');
    fb.id = 'recoCreate';
    fb.className = 'reco-fab';
    el.appendChild(fb);
  }
  {
    const fb = document.getElementById('recoCreate');
    const n0 = R.selected ? R.selected.size : 0;
    fb.hidden = !n0;
    fb.innerHTML = selFabLabel(n0);
    fb.onclick = openRecoDeckChooser;
  }
  if (!R.loading) renderRecoBody();
  else paintRecoMenus(); // 1.1: the menus are there while the list loads
}

function edhrecSlug(name) {
  return String(name)
    .split('//')[0]
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SWR_SERVE = 14 * 24 * 3600 * 1000;
// serve anything younger than two weeks instantly
const SWR_FRESH = 2 * 24 * 3600 * 1000;
// …but past two days, quietly refresh it for next time
const _edhRevalidating = new Set();

async function edhrecFetchNetwork(path) {
  // Try a same-origin EDHREC proxy when one is configured, then fetch directly.
  const urls = ['/edhrec' + path, 'https://json.edhrec.com' + path];
  for (const u of urls) {
    const ctrl = new AbortController();
    // The most popular commanders carry the biggest pages — multi-megabyte
    // JSON that a 5G evening won't move in nine seconds. One success caches
    // for a week, so a patient first load is the right trade.
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        // Only a real EDHREC page passes: blocked/error responses (Access
        // Denied pages and friends) parse as JSON too, and one cached for a
        // week once fed garbage "card names" into Scryfall searches.
        if (data && data.container && data.container.json_dict) return data;
      }
    } catch (e) {
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function edhrecFetchJson(path) {
  // Deck building happens a little every day: EDHREC pages persist for a week
  // and serve instantly, refreshing in the background once a day old — so
  // Inspiration, deck counts, and recommendations open at cache speed while
  // staying at most a day behind the live site.
  const key = 'edh|' + path;
  const disk = await qdbGet(key);
  if (disk && disk.v && Date.now() - (disk.t || 0) < SWR_SERVE) {
    if (Date.now() - (disk.t || 0) > SWR_FRESH && !_edhRevalidating.has(key)) {
      _edhRevalidating.add(key);
      edhrecFetchNetwork(path)
        .then((fresh) => {
          if (fresh) qdbSet(key, fresh);
        })
        .finally(() => _edhRevalidating.delete(key));
    }
    return disk.v;
  }
  const data = await edhrecFetchNetwork(path);
  if (data) qdbSet(key, data); // failures are never stored — a bad day can't poison a week; qdbSet adds the {t,v} wrap
  return data;
}

/* EDHREC's card-type sections, in EDHREC's own page order. (\x7b is '{' --
   written so for the source-reading tests.) A card that no
   list of the page names (a stand-in, a fallback pick) joins the section of
   its own type under EDHREC's name for it -- there is no "Other" pile. */
const EDH_SECTION_ORDER = [
  'New Cards',
  'High Synergy Cards',
  'Top Cards',
  'Game Changers',
  'Creatures',
  'Instants',
  'Sorceries',
  'Utility Artifacts',
  'Enchantments',
  'Battles',
  'Planeswalkers',
  'Utility Lands',
  'Mana Artifacts',
  'Lands',
];

function edhNameKey(n) {
  return String(n || '')
    .split(' // ')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function edhTypeHeader(c) {
  const f = frontFace(c) || c;
  const tl = String(f.type_line || c.type_line || '');
  const ot = String(f.oracle_text || c.oracle_text || '');
  const makesMana =
    /add \x7b|add one mana|add two mana|add three mana|mana of any|add an amount of/i.test(ot);
  if (/Creature/.test(tl)) return 'Creatures';
  if (/Planeswalker/.test(tl)) return 'Planeswalkers';
  if (/Battle/.test(tl)) return 'Battles';
  if (/Instant/.test(tl)) return 'Instants';
  if (/Sorcery/.test(tl)) return 'Sorceries';
  if (/Land/.test(tl)) {
    if (/Basic/.test(tl)) return 'Lands';
    // A land that only makes mana (tapped or not, fetching a basic) is a
    // Land; anything with a further ability is a Utility Land, as on EDHREC.
    const lines = ot
      .replace(/\([^)]*\)/g, '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const plain = lines.every((l) =>
      /add \x7b|add one mana|add two mana|mana of any|enters( the battlefield)? tapped|as .{0,40} enters|you may pay \d+ life|you may reveal|search your library for an? (basic )?[a-z ]*land|sacrifice [^:]*: search|choose a (color|basic land type)/i.test(
        l,
      ),
    );
    return plain ? 'Lands' : 'Utility Lands';
  }
  if (/Enchantment/.test(tl)) return 'Enchantments';
  if (/Artifact/.test(tl)) return makesMana ? 'Mana Artifacts' : 'Utility Artifacts';
  const w = tl.split(' — ')[0].trim().split(/\s+/).pop() || 'Card';
  return /y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's';
}

/* The pool into EDHREC's sections: each list keeps every card of the pool it
   names (a card can sit in High Synergy AND in its type list, exactly like on
   EDHREC); what no list names goes to its type section, which is created in
   EDHREC's order when the page had none. Returns [{title, cards}]. */
function edhGroupPool(pool, sections) {
  const byKey = new Map();
  (pool || []).forEach((c) => {
    const k = edhNameKey(c.name);
    if (!byKey.has(k)) byKey.set(k, c);
  });
  const named = new Set(),
    groups = [];
  (sections || []).forEach((sec) => {
    const seen = new Set(),
      cards = [];
    (sec.names || []).forEach((n) => {
      const c = byKey.get(edhNameKey(n));
      if (c && !seen.has(c.name)) {
        seen.add(c.name);
        named.add(c.name);
        cards.push(c);
      }
    });
    if (!cards.length) return;
    const same = groups.find((g) => g.title === sec.header);
    if (same)
      cards.forEach((c) => {
        if (!same.cards.includes(c)) same.cards.push(c);
      });
    else groups.push({ title: sec.header, cards });
  });
  const rank = (t) => {
    const i = EDH_SECTION_ORDER.indexOf(t);
    return i < 0 ? 99 : i;
  };
  const added = [];
  (pool || []).forEach((c) => {
    if (named.has(c.name)) return;
    named.add(c.name);
    const h = edhTypeHeader(c);
    let g = groups.find((x) => x.title === h) || added.find((x) => x.title === h);
    if (!g) {
      g = { title: h, cards: [] };
      added.push(g);
    }
    g.cards.push(c);
  });
  added
    .sort((a, b) => rank(a.title) - rank(b.title))
    .forEach((g) => {
      let at = groups.length;
      for (let i = 0; i < groups.length; i++) {
        const r = rank(groups[i].title);
        if (r !== 99 && r > rank(g.title)) {
          at = i;
          break;
        }
      }
      groups.splice(at, 0, g);
    });
  return groups;
}

function edhrecSectionsFrom(data) {
  // EDHREC's own section headers, in page order: Top Cards, High Synergy
  // Cards, New Cards, Creatures, Instants, … Names only — kept slim so the
  // session cache carries them for free.
  const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
  return lists
    .map((L) => ({
      header: String(L.header || '').trim(),
      names: (L.cardviews || []).map((cv) => cv && cv.name).filter((nm) => _edhNameOk(nm)),
    }))
    .filter((s) => s.header && s.names.length);
}

/* Per card on a leader's page: how often it is played with that leader
   (num_decks / potential_decks) and EDHREC's synergy score. Lower-case name
   -> [rate 0..1, synergy -1..1]. The average-deck parachute has neither. */
function edhrecStatsFrom(data) {
  const out = {};
  const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
  for (const L of lists) {
    for (const cv of L.cardviews || []) {
      if (!cv || !cv.name) continue;
      const n = Number(cv.num_decks != null ? cv.num_decks : cv.inclusion),
        pot = Number(cv.potential_decks);
      if (!(pot > 0) || !isFinite(n)) continue;
      const k = String(cv.name).toLowerCase();
      if (out[k]) continue;
      out[k] = [
        Math.max(0, Math.min(1, n / pot)),
        isFinite(Number(cv.synergy)) ? Number(cv.synergy) : 0,
      ];
    }
  }
  return out;
}

function edhrecNamesFrom(data) {
  const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
  const seen = new Set(),
    out = [];
  for (const L of lists) {
    for (const cv of L.cardviews || []) {
      if (cv && cv.name && _edhNameOk(cv.name) && !seen.has(cv.name)) {
        seen.add(cv.name);
        out.push(cv.name);
      }
    }
  }
  return out;
}

function edhrecThemesFrom(data) {
  // The leader's page carries its own community theme list (Aikido, Storm,
  // Spellslinger, …). Shapes vary a little between pages, so read both known
  // homes for it and normalise to {label, slug, count}.
  try {
    const dict = ((data || {}).container || {}).json_dict || {};
    const tl = ((data || {}).panels || {}).taglinks || (dict.panels || {}).taglinks || [];
    let out = [];
    if (Array.isArray(tl) && tl.length) {
      out = tl
        .map((t) => ({
          label: t.value || t.tag || '',
          slug: t.slug || edhrecSlug(t.value || t.tag || ''),
          count: t.count || 0,
        }))
        .filter((t) => t.label);
    } else {
      const tc = dict.tag_counts || (data || {}).tag_counts || {};
      out = Object.keys(tc).map((k) => ({ label: k, slug: edhrecSlug(k), count: tc[k] || 0 }));
    }
    // EVERY theme and kindred this commander's page lists, most played with
    // THIS commander first -- the old top-10 cut left the Kindred menu empty.
    const seen = new Set();
    out = out.filter((t) => {
      const k = String(t.slug || '').toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    out.sort((a, b) => (b.count || 0) - (a.count || 0));
    return out;
  } catch (e) {
    return [];
  }
}

async function edhrecPairPage(a, b) {
  // EDHREC's pairing pages live at slug(a)-slug(b) in THEIR canonical order,
  // which varies (Doctors lead companions; many partners sit alphabetically) —
  // so both orders are tried, then the lead card's own page as a last resort.
  for (const sl of [
    edhrecSlug(a.name) + '-' + edhrecSlug(b.name),
    edhrecSlug(b.name) + '-' + edhrecSlug(a.name),
  ]) {
    const data = await edhrecFetchJson('/pages/commanders/' + sl + '.json');
    if (data) {
      const names = edhrecNamesFrom(data);
      if (names.length)
        return {
          names,
          themes: edhrecThemesFrom(data),
          sections: edhrecSectionsFrom(data),
          stats: edhrecStatsFrom(data),
        };
    }
  }
  return edhrecCommanderPage(a);
}

async function edhrecCommanderPage(card) {
  const slug = edhrecSlug(card.name);
  let data = await edhrecFetchJson('/pages/commanders/' + slug + '.json');
  // The most-played commanders (Ur-Dragon, Kenrith, Jodah…) carry the
  // biggest pages on EDHREC — too big for a weak connection even with a
  // patient timeout. The average-deck page is a fraction of the size and
  // carries the same core signal: the most-played hundred. A parachute.
  if (!data) data = await edhrecFetchJson('/pages/average-decks/' + slug + '.json');
  if (!data) return { names: [], themes: [], sections: [] };
  return {
    names: edhrecNamesFrom(data),
    themes: edhrecThemesFrom(data),
    sections: edhrecSectionsFrom(data),
    stats: edhrecStatsFrom(data),
  };
}

async function edhrecThemePage(card, themeSlug) {
  const data = await edhrecFetchJson(
    '/pages/commanders/' + edhrecSlug(card.name) + '/' + themeSlug + '.json',
  );
  return data
    ? {
        names: edhrecNamesFrom(data),
        sections: edhrecSectionsFrom(data),
        stats: edhrecStatsFrom(data),
      }
    : { names: [], sections: [] };
}

async function edhrecPairThemePage(a, b, themeSlug) {
  // The pairing's own theme page, both slug orders; the lead card's solo page
  // is the last resort (many partner halves have no solo page at all).
  for (const sl of [
    edhrecSlug(a.name) + '-' + edhrecSlug(b.name),
    edhrecSlug(b.name) + '-' + edhrecSlug(a.name),
  ]) {
    const data = await edhrecFetchJson('/pages/commanders/' + sl + '/' + themeSlug + '.json');
    if (data) {
      const names = edhrecNamesFrom(data);
      if (names.length)
        return { names, sections: edhrecSectionsFrom(data), stats: edhrecStatsFrom(data) };
    }
  }
  return edhrecThemePage(a, themeSlug);
}

function edhNamesLocalFirst(names, rank) {
  let local = new Map();
  try {
    local = namesFromLocalDb(names);
  } catch (e) {
    local = new Map();
  }
  const cards = [],
    seen = new Set();
  local.forEach((c, n) => {
    if (rank && rank.has(n) && !rank.has(c.name)) rank.set(c.name, rank.get(n)); // "Front // Back" keeps the front face's place
    if (!seen.has(c.name)) {
      seen.add(c.name);
      cards.push(c);
    }
  });
  const ask = names.filter((n) => !local.has(n));
  try {
    if (local.size)
      sfJournal(
        'edhrec list: ' + local.size + ' from the local database, ' + ask.length + ' asked',
      );
  } catch (e) {}
  return { cards, ask };
}

async function resolveEdhrecNames(names, keep) {
  const rank = new Map(names.map((n, i) => [n, i]));
  const lf = edhNamesLocalFirst(names, rank);
  const chunks = chunkArr(lf.ask, 30);
  const settled = await Promise.all(
    chunks.map((ch) =>
      searchAndVerifyLegal(
        '(' + ch.map((n) => exactNameClause(n)).join(' or ') + ')',
        'name',
        ch.length,
      ).catch(() => ({ results: [] })),
    ),
  );
  const seenN = new Set();
  const got = [];
  lf.cards.forEach((c) => {
    seenN.add(c.name);
    got.push(c);
  });
  settled.forEach((r) =>
    (r.results || []).forEach((c) => {
      if (!seenN.has(c.name)) {
        seenN.add(c.name);
        got.push(c);
      }
    }),
  );
  return got
    .filter(keep)
    .sort(
      (a, b) =>
        (rank.has(a.name) ? rank.get(a.name) : 999) - (rank.has(b.name) ? rank.get(b.name) : 999),
    );
}

/* Reads a leader's OWN oracle text for its specific hooks — the tribes it
   names, the mechanics it triggers on — and turns each into a precise search
   clause. Entirely local: no network. This is what separates two "token
   leaders" whose actual games look nothing alike. */
const RECO_TRIBES = [
  'Spirit',
  'Goblin',
  'Elf',
  'Zombie',
  'Vampire',
  'Dragon',
  'Angel',
  'Demon',
  'Wizard',
  'Warrior',
  'Soldier',
  'Human',
  'Merfolk',
  'Sliver',
  'Dinosaur',
  'Cat',
  'Dog',
  'Bird',
  'Rat',
  'Squirrel',
  'Pirate',
  'Knight',
  'Rogue',
  'Cleric',
  'Elemental',
  'Beast',
  'Hydra',
  'Sphinx',
  'Faerie',
  'Treefolk',
  'Giant',
  'Dwarf',
  'Samurai',
  'Ninja',
  'Eldrazi',
  'Insect',
  'Spider',
  'Snake',
  'Fox',
  'Monk',
  'Shaman',
  'Druid',
  'Artificer',
  'Wolf',
  'Wraith',
  'Skeleton',
  'Horror',
  'Illusion',
  'Kraken',
  'Serpent',
  'Phoenix',
  'Ox',
  'Frog',
  'Turtle',
  'Crab',
  'Golem',
  'Myr',
  'Thopter',
  'Construct',
  'Assassin',
  'Mercenary',
  'Berserker',
  'Aetherborn',
  'Vedalken',
  'Kor',
  'Leonin',
  'Loxodon',
  'Viashino',
  'Minotaur',
  'Centaur',
  'Satyr',
  'Dryad',
  'Nymph',
  'Zubera',
  'Moonfolk',
  'Kirin',
  'Otter',
  'Raccoon',
  'Bat',
  'Lizard',
  'Scorpion',
  'Plant',
  'Fungus',
  'Saproling',
  'Ooze',
  'Elk',
  'Boar',
  'Badger',
  'Rabbit',
  'Mouse',
  'Weird',
  'Devil',
  'Imp',
  'Nightmare',
  'Specter',
  'Shade',
  'Gorgon',
  'Naga',
  'Ape',
  'Monkey',
];

const RECO_MECHANICS = [
  [
    /whenever you cast a (?:noncreature|instant or sorcery)|instant or sorcery spell|prowess|magecraft/i,
    '(o:"instant or sorcery" or kw:prowess or o:magecraft)',
  ],
  [
    /sacrifice (?:a|another) creature|whenever .{0,40}dies/i,
    '(o:"sacrifice a creature" or o:"sacrifice another" or o:"whenever" o:"dies")',
  ],
  [/\+1\/\+1 counter/i, 'o:"+1/+1 counter"'],
  [/treasure token/i, 'o:"treasure token"'],
  [
    /landfall|land enters the battlefield|land you control enters/i,
    '(kw:landfall or o:"land enters")',
  ],
  [
    /you gain life|lifelink|life you.{0,20}gain/i,
    '(o:"you gain life" or kw:lifelink or o:"whenever you gain life")',
  ],
  [/whenever you draw|draws? your second card/i, '(o:"whenever you draw" or o:"second card")'],
  [
    /return .{0,40}from your graveyard|from your graveyard to the battlefield/i,
    '(o:"from your graveyard to the battlefield" or o:"return target creature card")',
  ],
  [/mill|puts? the top .{0,30}library into .{0,20}graveyard/i, '(kw:mill or o:mills)'],
  [/discards? a card|whenever .{0,30}discard/i, '(o:"discards a card" or o:madness)'],
  [/creature token/i, '(o:"create" o:"creature token")'],
  [/equipment|equip |attach/i, '(t:equipment or o:"attached")'],
  [/aura|enchanted creature/i, '(t:aura or o:"enchanted creature")'],
  [/energy counter/i, 'o:"energy counter"'],
  [/artifact (?:enters|you control|spell)/i, '(t:artifact or o:"artifacts you control")'],
  [
    /enchantment (?:enters|you control|spell)|constellation/i,
    '(t:enchantment or o:"enchantments you control")',
  ],
  [
    /whenever .{0,30}attacks|combat damage to a player/i,
    '(o:"whenever" o:"attacks" or o:"combat damage to a player")',
  ],
  [/flying/i, '(kw:flying o:"flying")'],
  [
    /from exile|exiles? .{0,30}(?:card|creature)|impulse/i,
    '(o:"exile the top" or o:"you may play")',
  ],
  [/counter target .{0,20}spell/i, 'o:"counter target"'],
  [/copy (?:target|a|that) (?:spell|instant|sorcery)/i, '(o:"copy target" or o:"copy that spell")'],
  [/party|cleric.{0,30}rogue.{0,30}warrior.{0,30}wizard/i, 'o:"your party"'],
  [/the ring tempts you|amass|surveil/i, '(o:"the ring tempts you" or kw:surveil or o:amass)'],
  [/venture into the dungeon|initiative/i, '(o:"venture into" or o:initiative)'],
  [/food token/i, 'o:"food token"'],
  [/clue|investigate/i, '(o:investigate or o:"clue token")'],
  [/blood token/i, 'o:"blood token"'],
  [/modif(?:y|ied)|reconfigure|backup/i, '(o:modified or kw:backup)'],
  [/deathtouch|whenever .{0,30}deals damage to a creature/i, '(kw:deathtouch o:deathtouch)'],
  [
    /storm|you.?ve cast .{0,20}this turn|casts? (?:your|their) (?:second|first) spell/i,
    '(o:"second spell" or kw:storm or o:"cast this turn")',
  ],
];

function leaderSignals(card) {
  const f = frontFace(card);
  const txt =
    (f.oracle_text || '') +
    ' ' +
    (card.card_faces && card.card_faces[1] ? card.card_faces[1].oracle_text || '' : '');
  const out = [];
  for (const t of RECO_TRIBES) {
    if (new RegExp('\\b' + t + 's?\\b').test(txt)) out.push('t:' + t.toLowerCase());
    if (out.length >= 3) break; // a leader rarely truly supports more tribes
  }
  for (const [re, clause] of RECO_MECHANICS) {
    if (re.test(txt)) out.push(clause);
    if (out.length >= 8) break; // keep the query compact and fast
  }
  return out;
}

async function localRecoPool(R) {
  if (!R || !R.admiral) return null;
  let ix = null;
  try {
    ix = await bulkIndexReady();
  } catch (e) {
    return null;
  }
  if (!ix || !ix.cards || !ix.cards.length) return null;
  const ident = R.partner
    ? Array.from(new Set([].concat(R.admiral.color_identity || [], R.partner.color_identity || [])))
    : R.admiral.color_identity || [];
  const ciSet = new Set(ident.map((x) => String(x).toUpperCase()));
  const skip = new Set([R.admiral.name, R.partner ? R.partner.name : '\u0000']);
  const srcWords = magicWordSet(R.admiral);
  let weights = null;
  try {
    weights = await magicWordWeights();
  } catch (e) {}
  const rank = (rk) => Math.max(0, 6 - Math.log10(Math.max(1, rk || 99999))); // most-played lifts
  // 1. Everything that shares at least one magic word with this leader,
  //    scored on how telling those shared words are.
  const scored = [];
  _bulkSweep(ix, R.admiral, srcWords, ciSet, null, R.admiral.name).forEach((bc) => {
    if (skip.has(bc.n)) return;
    const cw = magicWordSet(bc);
    let s = 0;
    srcWords.forEach((k) => {
      if (cw.has(k)) s += Math.min(6, Math.max(1, 2 * mwWeight(k, weights) * mwWeight(k, weights)));
    });
    scored.push({ bc, s: s + rank(bc.rk) });
  });
  scored.sort((a, b) => b.s - a.s || (a.bc.rk || 999999) - (b.bc.rk || 999999));
  const out = [],
    seen = new Set();
  const take = (bc) => {
    if (seen.has(bc.n) || skip.has(bc.n)) return;
    const x = bulkToCardish(bc);
    if (!x || isBanned(x)) return;
    seen.add(bc.n);
    out.push(x);
  };
  for (const e of scored) {
    if (out.length >= 140) break;
    take(e.bc);
  }
  // 2. A short staple tail behind the leader's own package, most played first.
  const staples = [];
  for (const bc of ix.cards) {
    if (bc.lg !== 'legal' || !bc.rk || seen.has(bc.n) || skip.has(bc.n)) continue;
    if (![...(bc.ci || '')].every((ch) => ciSet.has(ch))) continue;
    staples.push(bc);
  }
  staples.sort((a, b) => (a.rk || 999999) - (b.rk || 999999));
  for (const bc of staples) {
    if (out.length >= 180) break;
    take(bc);
  }
  try {
    sfJournal('reco: offline pool for ' + R.admiral.name + ' -> ' + out.length + ' cards');
  } catch (e) {}
  return out;
}

/* The page must ALWAYS settle. Whatever goes wrong below -- a dead line, a
   malformed answer -- the spinner comes down and something usable is shown. */
async function loadRecoPool() {
  const R = state.reco;
  if (!R) return;
  /* Relief valve: after eight seconds of nothing the phone's own database
     fills the page. A late online answer still replaces it -- the person
     just never stares at a spinner that has already lost. */
  let reliefRan = false;
  const doRelief = async () => {
    if (reliefRan) return;
    reliefRan = true;
    if (!state.reco || state.reco !== R || !R.loading) return;
    let local = null;
    try {
      local = await localRecoPool(R);
    } catch (e) {}
    if (!state.reco || state.reco !== R || !R.loading) return;
    if (local && local.length >= 10) {
      R.loading = false;
      R.pool = local;
      R._mainPool = local;
      R.localSourced = true;
      renderRecoBody();
      recoReleasePick(R);
    } else if (_netDown) {
      // No database to fall back on and the line is down: say so now rather
      // than spinning through another half minute of doomed retries.
      R.loading = false;
      R.error = true;
      renderRecoBody();
    }
  };
  // The moment the line is KNOWN dead there is nothing left to wait for.
  const watch = setInterval(() => {
    if (!state.reco || state.reco !== R || !R.loading || reliefRan) {
      clearInterval(watch);
      return;
    }
    if (_netDown) {
      clearInterval(watch);
      doRelief();
    }
  }, 700);
  const relief = setTimeout(doRelief, 8000);
  try {
    await _loadRecoPoolOnline();
  } catch (e) {
    console.error('loadRecoPool failed', e);
    if (!state.reco || state.reco !== R) return;
    R.loading = false;
    let local = null;
    try {
      local = await localRecoPool(R);
    } catch (e2) {}
    if (!state.reco || state.reco !== R) return;
    if (local && local.length >= 10) {
      R.pool = local;
      R._mainPool = local;
      R.localSourced = true;
    } else if (!R.pool.length) R.error = true;
    R._streaming = false;
    renderRecoBody();
    recoReleasePick(R);
  } finally {
    clearTimeout(relief);
    clearInterval(watch);
  }
}

async function _loadRecoPoolOnline() {
  const R = state.reco;
  if (!R) return;
  const theme = state.browseSel.theme
    ? BROWSE_THEMES.find((t) => t.key === state.browseSel.theme)
    : null;
  const themeClause = theme ? theme.clause + ' ' : '';
  const idClause = R.partner
    ? idClauseFor({
        color_identity: Array.from(
          new Set([].concat(R.admiral.color_identity || [], R.partner.color_identity || [])),
        ),
      })
    : idClauseFor(R.admiral);
  const keep = (c) =>
    !isBanned(c, R.format) &&
    c.name !== R.admiral.name &&
    (!R.partner || c.name !== R.partner.name);
  // What does this leader actually DO? Detected LOCALLY from its own oracle
  // text and type line (no extra network round-trips) — those theme clauses
  // form the synergy signal, and colour staples only fill in behind. Both
  // searches run in parallel, so this is as fast as a single lookup.
  // 1) EDHREC first: the cards most played with THIS leader, in play-rate
  //    order. Skipped when a browse theme filter is active (theme wins then).
  if (!theme) {
    try {
      const page = R.partner
        ? await edhrecPairPage(R.admiral, R.partner)
        : await edhrecCommanderPage(R.admiral);
      if (!state.reco || state.reco !== R) return;
      R.themes = page.themes || [];
      R.sections = page.sections || [];
      mergeEdhrecTags(R.themes);
      paintRecoMenus(); // 1.1: choose a theme while the cards still load
      // Every card EDHREC lists, not the first 90: those ran out halfway
      // (Instants), so Enchantments, Lands and the rest never showed.
      const names = (page.names || []).slice(0, 400);
      if (names.length >= 20) {
        R._streaming = true; // the first cards may show before the list is final
        const rank = new Map(names.map((n, i) => [n, i]));
        const byRank = (a, b) =>
          (rank.has(a.name) ? rank.get(a.name) : 999) - (rank.has(b.name) ? rank.get(b.name) : 999);
        // The Scryfall queue is strictly serial, so fewer, larger name chunks
        // matter — and the page renders the moment the FIRST chunk (the very
        // most-played cards) resolves, with the rest streaming in behind.
        const lf = edhNamesLocalFirst(names, rank); // 1.4: the phone first
        const chunks = chunkArr(lf.ask, 30);
        const proms = chunks.map((ch) =>
          searchAndVerifyLegal(
            '(' + ch.map((n) => exactNameClause(n)).join(' or ') + ')',
            'name',
            ch.length,
          ).catch(() => ({ results: [] })),
        );
        const seenN = new Set();
        const got = [];
        lf.cards.forEach((c) => {
          seenN.add(c.name);
          got.push(c);
        });
        const absorb = (r) =>
          (r.results || []).forEach((c) => {
            if (!seenN.has(c.name)) {
              seenN.add(c.name);
              got.push(c);
            }
          });
        if (proms.length) absorb(await proms[0]);
        if (!state.reco || state.reco !== R) return;
        let pool = got.filter(keep).sort(byRank);
        if (pool.length >= 10) {
          R.loading = false;
          R.edhrecSourced = true;
          R.pool = pool.slice(0, 400);
          renderRecoBody();
        }
        (await Promise.all(proms.slice(1))).forEach(absorb);
        if (!state.reco || state.reco !== R) return;
        R._streaming = false;
        pool = got.filter(keep).sort(byRank);
        if (pool.length >= 10)
          state._recoCache[recoCacheKey(R.admiral, R.partner)] = {
            pool: pool.slice(0, 400),
            themes: (R.themes || []).slice(),
            sections: (R.sections || []).slice(),
            edhrecSourced: true,
          };
        if (pool.length >= 10) {
          R.loading = false;
          R.edhrecSourced = true;
          R.pool = pool.slice(0, 400);
          R._mainPool = R.pool;
          renderRecoBody();
          // A theme picked while the list loaded wins over any browse seed.
          if (recoReleasePick(R)) {
            R._seedTheme = null;
            return;
          }
          // Arrived here from a play-data theme on the browse page? Follow
          // through: pre-select that same theme chip for this leader. The
          // seed is released FIRST — the themed render itself must never be
          // held back by the seed-pending choke in renderRecoBody.
          // 1.3: the seed itself (Theme, or Kindred: that creature type's own
          // theme page carries the tribal build) -- not browseSel, which a
          // "none" picked while loading could not override
          const seed = R._seedTheme;
          R._seedTheme = null;
          if (seed) loadRecoTheme(seed);
          return;
        }
      }
    } catch (e) {}
    R._streaming = false;
    if (!state.reco || state.reco !== R) return;
  }
  // 2) Fallback: this leader's own hooks, detected locally from its card text.
  const parts = new Set();
  leaderSignals(R.admiral).forEach((cl) => parts.add(cl)); // this leader's OWN hooks first
  detectCardThemes(R.admiral).forEach((t) => {
    if (t.clause) parts.add(t.clause);
  });
  const synPromise = parts.size
    ? searchAndVerifyLegal(
        themeClause + '(' + Array.from(parts).join(' or ') + ') ' + idClause,
        'edhrec',
        200,
      )
    : Promise.resolve({ results: [] });
  const staplePromise = searchAndVerifyLegal(themeClause + idClause, 'edhrec', 250);
  const [r1, r2] = await Promise.all([synPromise, staplePromise]);
  if (!state.reco || state.reco !== R) return; // overlay closed or replaced meanwhile
  R.loading = false;
  const synergy = (r1.results || []).filter(keep);
  if (r2.error && !synergy.length) {
    const local = await localRecoPool(R);
    if (!state.reco || state.reco !== R) return;
    if (local && local.length >= 10) {
      R.pool = local;
      R._mainPool = local;
      R.localSourced = true;
      renderRecoBody();
      recoReleasePick(R);
      return;
    }
    R.error = true;
    R._pick = null;
    renderRecoBody();
    return;
  }
  const seen = new Set(synergy.map((c) => c.name));
  // Staples are a short tail behind the leader's own package, never the bulk
  // of the page — that sameness was exactly what made every page feel alike.
  const stapleRoom = Math.max(30, 180 - synergy.length);
  const staples = (r2.results || [])
    .filter((c) => keep(c) && !seen.has(c.name))
    .slice(0, Math.min(stapleRoom, 60));
  // Both lists arrive from Scryfall already in play-popularity order — keep it.
  // (The old colour/cost re-sort is what made pages read white-then-blue-then-red.)
  const built = synergy.slice(0, 180 - staples.length).concat(staples);
  if (!built.length && R.localSourced && R.pool.length) return; // keep what the phone served
  R.pool = built;
  R.localSourced = false;
  renderRecoBody();
  if (recoReleasePick(R)) {
    R._seedTheme = null;
    return;
  }
  // Seeded from a theme/Kindred page: chain straight into that theme's own
  // list — its page is already in the cache from the browse just left, so
  // the scoped recommendations are the first settled view.
  if (R._seedTheme) {
    const t = R._seedTheme;
    R._seedTheme = null;
    if ((R.themes || []).some((x) => x.slug === t)) loadRecoTheme(t);
    else renderRecoBody(); // seed released — the suppressed pool paints now
  }
}

async function loadRecoTheme(slug) {
  const R = state.reco;
  if (!R || R.loading) return;
  if (R.activeThemeSlug === slug) {
    // Tapping the active theme again returns to the leader's main list.
    R.activeThemeSlug = null;
    R.themeSections = null;
    if (R._mainPool) {
      R.pool = R._mainPool;
    }
    renderRecoBody();
    return;
  }
  if (!R._mainPool) R._mainPool = (R.pool || []).slice();
  R.activeThemeSlug = slug;
  recoPaintCap();
  const box = document.getElementById('recoBody');
  if (box)
    box.innerHTML = /* HTML */ `<div class="status">
      <div class="spinner"></div>
      ${trS('Charting themed recommendations…')}
    </div>`;
  try {
    const tp = R.partner
      ? await edhrecPairThemePage(R.admiral, R.partner, slug)
      : await edhrecThemePage(R.admiral, slug);
    const names = (tp.names || []).slice(0, 400);
    if (!state.reco || state.reco !== R || R.activeThemeSlug !== slug) return;
    const keep = (c) =>
      !isBanned(c, R.format) &&
      c.name !== R.admiral.name &&
      (!R.partner || c.name !== R.partner.name);
    const pool = names.length ? await resolveEdhrecNames(names, keep) : [];
    if (!state.reco || state.reco !== R || R.activeThemeSlug !== slug) return;
    if (pool.length >= 8) {
      R.pool = pool.slice(0, 400);
      R.themeSections = tp.sections || []; // the theme page's own headers, for the sectioned view
    } else {
      // 1.4: EDHREC HAS the list when it named enough cards -- then it was the
      // card lookup that failed, and that is what the player is told
      toast(
        names.length >= 8
          ? trS('Couldn\u2019t load the cards right now \u2014 try again in a moment.')
          : trS('No themed play data for this leader.'),
      );
      R.activeThemeSlug = null;
      R.themeSections = null;
      R.pool = R._mainPool || R.pool;
    }
  } catch (e) {
    toast(trS('Couldn\u2019t load the cards right now \u2014 try again in a moment.'));
    R.activeThemeSlug = null;
    R.themeSections = null;
    R.pool = R._mainPool || R.pool;
  }
  renderRecoBody();
}

/* The \u2630 on a commander's recommendations page rests just above the
   Theme / Kindred menus at the page foot and, as those scroll away, sinks to
   its usual spot over the nav (higher while the selection \uFF0B shows). */
function placeRecoJump() {
  const ov = document.getElementById('recoOverlay');
  const row = ov && ov.querySelector('.edh-jump-row');
  if (!row) return;
  const navH =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 66;
  const fab = document.getElementById('recoCreate');
  const base = navH + (fab && !fab.hidden ? 96 : 52) + (_safeBottomPx || 0);
  const menus = ov.querySelector('#recoChipsSlot .reco-themes');
  let b = base;
  if (menus && menus.offsetHeight) {
    const top = menus.getBoundingClientRect().top;
    if (top > 0) b = Math.max(base, window.innerHeight - top + 8);
  }
  row.style.transition = 'none';
  row.style.bottom = Math.round(b) + 'px';
}

function bindRecoJump() {
  const ov = document.getElementById('recoOverlay');
  const sc = ov && ov.querySelector('main');
  if (sc && !sc.dataset.jumpBound) {
    sc.dataset.jumpBound = '1';
    let raf = 0;
    sc.addEventListener(
      'scroll',
      () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          placeRecoJump();
        });
      },
      { passive: true },
    );
  }
  placeRecoJump();
  requestAnimationFrame(placeRecoJump);
}

function renderRecoBody() {
  const box = document.getElementById('recoBody');
  const R = state.reco;
  if (!box || !R) return;
  // Seeded from a theme page: the general list is never the requested view,
  // so while the seed is pending every render holds the themed spinner —
  // one choke point instead of hunting each early render in the pool loader.
  if ((R._seedTheme || R._pick) && !R.error) {
    box.innerHTML = /* HTML */ `<div class="status">
      <div class="spinner"></div>
      ${trS('Charting themed recommendations…')}
    </div>`;
    paintRecoMenus();
    return;
  }
  if (R.error) {
    // A dead end needs a way out: this branch returns before the page's own
    // wiring runs, so the button is wired right here.
    box.innerHTML =
      `<div class="error-note">${trS("Couldn't reach Scryfall. Check your connection and try again.")}</div>` +
      `<button class="ghost-btn" id="recoRetryDead" style="width:100%;margin-top:8px;">\u21bb ${trS('Try again')}</button>`;
    document.getElementById('recoRetryDead')?.addEventListener('click', () => {
      const R2 = state.reco;
      if (!R2) return;
      try {
        delete state._recoCache[recoCacheKey(R2.admiral, R2.partner)];
      } catch (e) {}
      R2.loading = true;
      R2.error = false;
      R2.localSourced = false;
      R2.pool = [];
      R2._mainPool = null;
      renderRecoOverlay();
      loadRecoPool();
    });
    return;
  }
  if (!R.pool.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      No recommendations found for this combination.
    </div>`;
    return;
  }
  // Any format but Commander: every recommended card passes that format's
  // rules and ban list before it shows. Theme loads swap the pool, so the
  // check covers whatever names are on the page right now.
  const rfmt = R.format || 'commander';
  if (rfmt !== 'commander') {
    const want = R.pool.map((c) => c.name);
    const chk = R._fmtOk && R._fmtOk.fmt === rfmt ? R._fmtOk : null;
    if (!chk || want.some((n) => !chk.checked.has(n))) {
      box.innerHTML = /* HTML */ `<div class="status">
        <div class="spinner"></div>
        Checking ${fmtLabelOf(rfmt)} legality…
      </div>`;
      const seq = (R._fmtSeq = (R._fmtSeq || 0) + 1);
      filterCardsByFormat(R.pool, rfmt, 'card').then((ok) => {
        if (state.reco !== R || seq !== R._fmtSeq) return;
        const prev = chk || { fmt: rfmt, ok: new Set(), checked: new Set() };
        ok.forEach((n) => prev.ok.add(n));
        want.forEach((n) => prev.checked.add(n));
        R._fmtOk = prev;
        renderRecoBody();
      });
      return;
    }
  }
  const pool =
    rfmt !== 'commander' && R._fmtOk ? R.pool.filter((c) => R._fmtOk.ok.has(c.name)) : R.pool;
  if (!pool.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      None of these recommendations is legal in ${fmtLabelOf(rfmt)}.
    </div>`;
    return;
  }
  const cachedThemes = (state._recoCache[recoCacheKey(R.admiral, R.partner)] || {}).themes;
  const chipList = (R.themes && R.themes.length ? R.themes : cachedThemes || []).slice();
  if (R.activeThemeSlug && !chipList.some((t) => t.slug === R.activeThemeSlug)) {
    chipList.unshift({
      label: R.activeThemeSlug.replace(/-/g, ' ').replace(/(^|\s)\w/g, (ch) => ch.toUpperCase()),
      slug: R.activeThemeSlug,
      count: 0,
    });
  }
  const activeTheme = R.activeThemeSlug ? chipList.find((t) => t.slug === R.activeThemeSlug) : null;
  // An active theme is announced loudly — a brass banner, not a footnote.
  const themeBanner = activeTheme
    ? `<div class="reco-theme-banner">${escapeHtml(activeTheme.label)} — ${trS('theme recommendations')}</div>`
    : '';
  const hint =
    R.edhrecSourced && !activeTheme
      ? `<p class="hint" style="text-align:center;margin:0 0 8px;">Most played with this ${fmtName()}, sorted on popularity.</p>`
      : '';
  // The silent fallback was a mystery: EDHREC failing quietly meant no
  // dropdowns and no clue why. Say it plainly, and offer the road back.
  // Offline: the picks came from the phone's own database. Say so plainly —
  // a page that looks live but is a week old is worse than one that admits it.
  const fallbackNote =
    R.localSourced && !activeTheme
      ? `<div style="text-align:center;margin:0 0 8px;"><p class="hint" style="margin:0 0 6px;">${trS('No connection — these picks come from the card database on your phone.')}</p><button class="ghost-btn" id="recoRetryEdh" style="width:100%;">↻ ${trS('Try again')}</button></div>`
      : !R.edhrecSourced && !activeTheme
        ? `<div style="text-align:center;margin:0 0 8px;"><p class="hint" style="margin:0 0 6px;">${trS("EDHREC play data didn't load — showing the app's own synergy picks.")}</p><button class="ghost-btn" id="recoRetryEdh" style="width:100%;">↻ ${trS('Try EDHREC again')}</button></div>`
        : '';
  // (the Theme / Kindred menus: paintRecoMenus, 1.1)
  box.innerHTML = themeBanner + hint + fallbackNote;
  const recoTile = (c) => {
    const sel = R.selected.has(c.name);
    return `<div class="sr-tile selectable ${sel ? 'selected' : ''}" data-name="${encodeURIComponent(c.name)}">
      <span class="sel-check">✓</span>
      <img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}" loading="lazy">${cardBadgesHtml(c)}
      <div class="st-body">
        <div class="st-meta-row">
          <div class="st-price st-price-lg" data-pricecard="${encodeURIComponent(c.name)}">…</div>
        </div>
      </div>
    </div>`;
  };
  // EDHREC's own sections, browse-style: sticky section labels, a ☰ jump
  // menu, and Show-all caps per section. Theme views and synergy fallbacks
  // keep the flat popularity grid.
  const groups = [];
  // Theme views carry EDHREC's own section headers too (New Cards, Top
  // Cards, Creatures, …) — same layout and ☰ jump menu as the main list.
  const secSrc = activeTheme ? R.themeSections || [] : (R.edhrecSourced && R.sections) || [];
  // EDHREC's own sections (all of them), and whatever no list names in its
  // type section -- also for the app's own synergy picks when EDHREC is out.
  const _eg = edhGroupPool(pool, secSrc);
  if (_eg.length >= 2) {
    _eg.forEach((g) => groups.push({ title: trS(g.title), cards: g.cards }));
  }
  if (groups.length >= 2) {
    const CAP = 10;
    R._shown = R._shown || {};
    const shownOf = (g) => Math.min(g.cards.length, R._shown[g.title] || CAP);
    box.insertAdjacentHTML(
      'beforeend',
      `<div class="edh-jump-row"><button class="icon-btn edh-jump" id="recoJump" title="${trS('Jump to section')}">☰</button></div>` +
        groups
          .map((g, i) => {
            const n = shownOf(g);
            // Ten most-played first; the More button rides at the section's TOP
            // (just under the previous stripe, bottom-up) and deals ten more.
            return `<div class="edh-sec" data-si="${i}"><div class="section-label" style="margin-top:14px;">${escapeHtml(g.title)}</div>${g.cards.length > n ? `<button class="ghost-btn edh-more" data-si="${i}" style="width:100%;margin:0 0 6px;">${trS('More')}</button>` : ''}<div class="sr-grid" data-sg="${i}">${g.cards.slice(0, n).map(recoTile).join('')}</div></div>`;
          })
          .join(''),
    );
    wireRecoChunk();
    loadTilePrices(groups.flatMap((g) => g.cards.slice(0, shownOf(g)))); // every shown tile, More included
    const jb = box.querySelector('#recoJump');
    if (jb)
      jb.addEventListener('click', (e) => {
        e.stopPropagation();
        openTileMenu(
          jb,
          groups.map((g, i) => ({
            label: g.title,
            fn: () => {
              const s = box.querySelector(`.edh-sec[data-si="${i}"]`);
              if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
          })),
        );
      });
    box.querySelectorAll('.edh-more').forEach((btn) =>
      btn.addEventListener('click', () => {
        const g = groups[+btn.dataset.si];
        if (!g) return;
        const already = Math.min(g.cards.length, R._shown[g.title] || CAP);
        const next = Math.min(g.cards.length, already + 10);
        R._shown[g.title] = next;
        const gr = box.querySelector(`.sr-grid[data-sg="${btn.dataset.si}"]`);
        if (gr) {
          const _a0 = gr.firstElementChild
            ? gr.firstElementChild.getBoundingClientRect().top
            : null;
          gr.innerHTML = g.cards.slice(0, next).map(recoTile).join('');
          if (_a0 !== null && gr.firstElementChild) {
            const _dy = gr.firstElementChild.getBoundingClientRect().top - _a0;
            if (_dy) {
              const _m = btn.closest('main');
              const _sc = _m && _m.scrollHeight > _m.clientHeight ? _m : pageScroller();
              _sc.scrollTop += _dy;
            }
          }
          wireRecoChunk();
          loadTilePrices(g.cards.slice(already, next));
        }
        if (next >= g.cards.length) btn.remove();
      }),
    );
  } else {
    pagedGrid(box, pool, recoTile, (chunk) => {
      wireRecoChunk();
      loadTilePrices(chunk);
    });
  }
  // The Theme / Kindred menus live in the hero's slot, directly below the
  // commander card (1.1: painted and wired by paintRecoMenus).
  paintRecoMenus();
  bindRecoJump();
  wireCsSearchRows(box);
  document.getElementById('recoRetryEdh')?.addEventListener('click', () => {
    const R2 = state.reco;
    if (!R2) return;
    delete state._recoCache[recoCacheKey(R2.admiral, R2.partner)];
    R2.loading = true;
    R2.pool = [];
    R2.themes = [];
    R2.edhrecSourced = false;
    R2.localSourced = false;
    R2.error = false;
    R2.activeThemeSlug = null;
    R2._mainPool = null;
    renderRecoOverlay();
    loadRecoPool();
  });
  function wireRecoChunk() {
    // Standard gestures, like the decklist: TAP opens the card's detail
    // view; LONG-PRESS toggles selection for the ＋ add flow.
    box.querySelectorAll('.sr-tile.selectable').forEach((tile) => {
      if (tile.dataset.w) return;
      tile.dataset.w = '1';
      let lpT = null,
        lpFired = false;
      const name = () => decodeURIComponent(tile.dataset.name);
      const toggle = () => {
        const nm = name();
        if (R.selected.has(nm)) R.selected.delete(nm);
        else R.selected.add(nm);
        tile.classList.toggle('selected', R.selected.has(nm));
        const btn = document.getElementById('recoCreate');
        const n = R.selected.size;
        if (btn) {
          btn.hidden = !n;
          btn.innerHTML = selFabLabel(n);
        }
        placeRecoJump();
      };
      const arm = () => {
        lpFired = false;
        clearTimeout(lpT);
        lpT = setTimeout(() => {
          lpFired = true;
          try {
            navigator.vibrate && navigator.vibrate(8);
          } catch (err) {}
          toggle();
        }, 480);
      };
      const disarm = () => clearTimeout(lpT);
      tile.addEventListener('pointerdown', arm);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        tile.addEventListener(ev, disarm),
      );
      tile.addEventListener('contextmenu', (e) => e.preventDefault());
      tile.addEventListener('click', () => {
        if (lpFired) {
          lpFired = false;
          return;
        }
        if (R.selected.size) {
          toggle();
          return;
        } // selection active: taps keep selecting
        const c = R.pool.find((x) => x.name === name());
        if (c) openCardInfo(c, { pool: R.pool });
      });
    });
  }
}

function openRecoDeckChooser() {
  const R = state.reco;
  if (!R || !R.selected.size) return;
  let el = document.getElementById('deckPickPopup');
  if (!el) {
    el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'deckPickPopup';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  const n = R.selected.size;
  el.innerHTML = /* HTML */ `<div class="deckpick">
    <h4>Add ${n} card${n > 1 ? 's' : ''} to…</h4>
    <p class="dp-sub">
      ${escapeHtml(R.admiral.name)}${R.partner ? ` & ${escapeHtml(R.partner.name)}` : ''}
      recommendations
    </p>
    <div class="deckpick-list">
      <button class="dp-row" data-newdeck="1">
        <div class="dp-txt">
          ${fmtFolderGlyph(R.format || 'commander', 13)} New deck led by
          ${escapeHtml(R.admiral.name)}${R.partner ? ` & ${escapeHtml(R.partner.name.split(',')[0])}` : ''}
          <div class="dp-meta">Creates the deck with your ${n} picks aboard</div>
        </div>
      </button>
      ${state.decksIndex
        .map(
          (d) => `<button class="dp-row" data-deck="${d.id}">
        <div class="dp-txt">${escapeHtml(d.name)}<div class="dp-meta">${d.cards.length} cards${d.admiral ? ` · ${escapeHtml(d.admiral.name)}` : ` · no ${fmtName(d)} yet`}</div></div>
        ${dpPipsHtml(d)}
      </button>`,
        )
        .join('')}
    </div>
    <button class="dp-cancel" id="dpCancel">Cancel</button>
  </div>`;
  const close = () => el.remove();
  document.getElementById('dpCancel').addEventListener('click', close);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelector('[data-newdeck]').addEventListener('click', () => {
    close();
    createDeckFromReco();
  });
  el.querySelectorAll('.dp-row[data-deck]').forEach((row) => {
    row.addEventListener('click', () => {
      close();
      addRecoPicksToDeck(getDeck(row.dataset.deck));
    });
  });
}

function addRecoPicksToDeck(d) {
  const R = state.reco;
  if (!R || !d) return;
  const picks = R.pool.filter((c) => R.selected.has(c.name));

  let admiralSet = false;
  if (!d.admiral) {
    d.admiral = R.admiral;
    if (R.partner) {
      d.partner = R.partner;
      logDeckChange(d, { type: 'admiral', name: R.partner.name, card: R.partner, prev: null });
    }
    logDeckChange(d, { type: 'admiral', name: R.admiral.name, card: R.admiral, prev: null });
    admiralSet = true;
  }
  let added = 0,
    offColor = 0,
    dupes = 0;
  picks.forEach((c) => {
    if (d.cards.some((x) => x.name === c.name) || (d.admiral && d.admiral.name === c.name)) {
      dupes++;
      return;
    }
    if (d.admiral && !colorIdentityOkDeck(c, d)) {
      offColor++;
      return;
    }
    d.cards.push(c);
    logDeckChange(d, { type: 'add', name: c.name, card: c });
    added++;
  });
  persistDeck(d);
  const bits = [`${added} added to ${d.name}`];
  if (admiralSet) bits.unshift(`${R.admiral.name} takes the helm`);
  if (offColor) bits.push(`${offColor} outside its colors`);
  if (dupes) bits.push(`${dupes} already in the deck`);
  toast(bits.join(' · ') + '.');
  if (added || admiralSet) {
    closeTopOverlay();
    openDeck(d.id);
  }
}

function createDeckFromReco() {
  const R = state.reco;
  if (!R || !R.selected.size) return;
  openInAppPrompt('Name your new deck', 'Deck name', R.admiral.name, (name) => {
    if (name === null) return; // cancelled
    const picks = R.pool.filter((c) => R.selected.has(c.name));
    const d = {
      id: uid(),
      name: name.trim() || R.admiral.name,
      admiral: R.admiral,
      partner: R.partner || null,
      cards: [],
      maybeboard: [],
      tags: {},
      primer: '',
      format: R.format || state.browseFormat || 'commander',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.decksIndex.unshift(d);
    logDeckChange(d, { type: 'admiral', name: R.admiral.name, card: R.admiral, prev: null });
    if (R.partner)
      logDeckChange(d, { type: 'admiral', name: R.partner.name, card: R.partner, prev: null });
    picks.forEach((c) => {
      d.cards.push(c);
      logDeckChange(d, { type: 'add', name: c.name, card: c });
    });
    persistDeck(d);
    toast(`${d.name} launched with ${picks.length + 1} cards.`);
    closeTopOverlay();
    openDeck(d.id);
  });
}
