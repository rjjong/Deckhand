// pages / inspiration / metagame

/* ================= METAGAME: the 60-card formats =================
   meta.json is built weekly on GitHub from open tournament data
   (MTGODecklistCache: MTGO and Melee events) named with the community's own
   archetype rules (MTGOFormatData) -- see scripts/build-meta.mjs. The app
   reads it from its own site: no scraping, nothing cross-site. */
const META_STYLES = [
  ['aggro', 'Aggro'],
  ['tempo', 'Tempo'],
  ['midrange', 'Midrange'],
  ['control', 'Control'],
  ['combo', 'Combo'],
  ['ramp', 'Ramp'],
];

function metaStyleLabel(k) {
  const x = META_STYLES.find((m) => m[0] === k);
  return x ? trS(x[1]) : '';
}

let _metaData = null,
  _metaP = null;

async function loadMetaData(force) {
  if (_metaData && !force) return _metaData;
  if (_metaP) return _metaP;
  _metaP = (async () => {
    let disk = null;
    try {
      disk = await qdbGet('meta.json');
    } catch (e) {}
    if (disk && disk.v && disk.v.formats) _metaData = disk.v;
    // A week between builds; look for a newer file a few times a day.
    if (
      hasLocalDataFile('meta.json') &&
      (force || !_metaData || Date.now() - ((disk && disk.t) || 0) > 6 * 60 * 60 * 1000)
    ) {
      try {
        const r = await fetch('./meta.json', { cache: 'no-cache' });
        if (r.ok) {
          const j = await r.json();
          if (j && j.formats) {
            _metaData = j;
            qdbSet('meta.json', j);
          }
        }
      } catch (e) {}
    }
    return _metaData;
  })();
  try {
    return await _metaP;
  } finally {
    _metaP = null;
  }
}

function metaFormat(fmt) {
  return (_metaData && _metaData.formats && _metaData.formats[fmt]) || null;
}

/* The key card's art: straight from the phone's card file when it knows
   the card (no request at all), else the shared tile-art resolver. */
function metaKeyArt(name) {
  try {
    const bc = _bulkIdx && _bulkIdx.byName && _bulkIdx.byName.get(String(name || '').toLowerCase());
    if (bc) {
      const c = bulkToCardish(bc);
      if (c) return artCropFrom(cardImageMed(c));
    }
  } catch (e) {}
  const r = _tileArtReady['nm|' + name];
  return (r && r.a) || '';
}

function hydrateMetaArt(root) {
  (root || document).querySelectorAll('.mt-art[data-mtkey]').forEach((el) => {
    if (el.style.backgroundImage) return;
    tileArtResolve('nm|' + el.dataset.mtkey)
      .then((v) => {
        if (v && v.a && el.isConnected) el.style.backgroundImage = `url("${v.a}")`;
      })
      .catch(() => {});
  });
}

function metaDateShort(iso) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(appLang() === 'nl' ? 'nl-NL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch (e) {
    return iso || '';
  }
}

function metaTileHtml(a, i, extra) {
  const art = metaKeyArt(a.key);
  return /* HTML */ `<button
    type="button"
    class="sr-tile meta-tile"
    data-meta="${i}"
    title="${escapeHtml(a.name)}"
  >
    <span
      class="mt-art"
      data-mtkey="${escapeHtml(a.key || '')}"
      ${art ? ` style="background-image:url('${art}')"` : ''}
    ></span>
    <span class="mt-body"
      ><span class="mt-nm">${escapeHtml(a.name)}</span>
      <span class="mt-sub"
        >${a.colors ? manaRowSvg(a.colors, 13) : manaIconSvg('C', 13)}<span class="mt-share"
          >${Number(a.share || 0).toFixed(1)}%</span
        ><span>· ${metaStyleLabel(a.style)}</span></span
      >
      ${extra ? `<span class="mt-extra">${extra}</span>` : ''}</span
    >
  </button>`;
}

function browseIsMeta() {
  return isConstructedFmt(browseFmt());
}

function metaStyleOptions(fmt) {
  const F = metaFormat(fmt);
  return [{ v: '', l: trS('Every archetype'), gen: cardsSvg(22) }].concat(
    META_STYLES.map(([k, l]) => {
      const top = F ? F.archetypes.find((a) => a.style === k) : null;
      return top
        ? { v: k, l: trS(l), art: 'nm|' + top.key }
        : { v: k, l: trS(l), gen: cardsSvg(22) };
    }),
  );
}

function metaBrowseHtml() {
  return /* HTML */ ` <main class="inspiration-page">
    <div class="searchbar page-searchbar sticky-searchbar">
      <input
        id="bsName"
        enterkeyhint="search"
        placeholder="${trS('Find a deck by name or card')}"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        value="${escapeHtml(state.browseNameQ || '')}"
      />
      ${browseFilterButtonHtml()}
    </div>
    <div id="bsAdvSlot">${state.bsAdvOpen ? advancedSearchScreenHtml() : ''}</div>
    <div id="browseResults"></div>
  </main>`;
}

function metaFilteredList(fmt) {
  const F = metaFormat(fmt);
  if (!F) return null;
  let list = F.archetypes.slice();
  const st = state.browseSel.style || '';
  if (st) list = list.filter((a) => a.style === st);
  const q = (state.browseNameQ || '').trim().toLowerCase();
  if (q)
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.main || []).concat(a.side || []).some(([, n]) => String(n).toLowerCase().includes(q)),
    );
  return list;
}

function renderMetaBrowse(keepScroll) {
  const box = document.getElementById('browseResults');
  if (!box) return;
  const fmt = browseFmt();
  const F = metaFormat(fmt);
  if (!F) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      ${trS('The metagame for this format arrives with the weekly update.')}
    </div>`;
    return;
  }
  const list = metaFilteredList(fmt);
  const all = F.archetypes;
  const foot = `<p class="hint" style="margin:8px 0 0;">${fmtLabelOf(fmt)} · ${F.decks} ${trS('decks')} · ${metaDateShort(_metaData.from)}–${metaDateShort(_metaData.to)} · ${trS('most played at the bottom')}</p>`;
  if (!list.length) {
    box.innerHTML = `<div class="empty-note">${trS('No meta decks match.')}</div>` + foot;
    return;
  }
  // Array order is most played first; the grid is wrap-reverse, so the most
  // played deck lands at the FOOT, next to the menus and the thumb.
  box.innerHTML =
    `<div class="sr-grid">${list.map((a) => metaTileHtml(a, all.indexOf(a))).join('')}</div>` +
    foot;
  box.querySelectorAll('.meta-tile').forEach((t) =>
    t.addEventListener('click', () => {
      const a = all[+t.dataset.meta];
      if (a) openMetaDeck(fmt, a);
    }),
  );
  hydrateMetaArt(box);
  if (!keepScroll) scrollToPageFoot();
}

function wireMetaBrowse() {
  wireBrowseFilters();
  hydrateTileArtReady().then((did) => {
    try {
      if (did && state.screen === 'browse' && state.openCSelect) csRerender();
    } catch (e) {}
  });
  const fmt = browseFmt();
  try {
    ensureFmtBans(fmt);
  } catch (e) {}
  const inp = document.getElementById('bsName');
  let t = null;
  inp?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.browseNameQ = inp.value;
      renderMetaBrowse(true);
    }, 200);
  });
  inp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(t);
      state.browseNameQ = inp.value;
      renderMetaBrowse();
      try {
        inp.blur();
      } catch (err) {}
    }
  });
  // 1.10: the live suggestion list from Search (decks are found by a card in them)
  if (inp)
    wireNameSuggest(inp, allCardNamesFor, (name) => {
      inp.value = name;
      clearTimeout(t);
      state.browseNameQ = name;
      renderMetaBrowse();
      try {
        inp.blur();
      } catch (err) {}
    });
  _csHandlers.bsFmt = (v) => {
    sfDropQueuedFor('browse');
    state.browseFormat = v || 'commander';
    state.browseCache = {};
    render();
  };
  _csHandlers.bsStyle = (v) => {
    state.browseSel.style = v;
    render();
  };
  wireCSelects();
  const box = document.getElementById('browseResults');
  if (!metaFormat(fmt) && box)
    box.innerHTML = /* HTML */ `<div class="status"><div class="spinner"></div></div>`;
  const hadData = !!_metaData;
  loadMetaData().then(() => {
    if (state.screen !== 'browse' || browseFmt() !== fmt) return;
    // First arrival: the archetype menu's tiles need the data too.
    if (!hadData && _metaData) {
      render();
      return;
    }
    renderMetaBrowse();
  });
}

/* One archetype, as a deck page: the key card at the foot with the facts
   and the copy button, the main deck by type above it, the sideboard at
   the top. */
async function openMetaDeck(fmt, a) {
  let el = document.getElementById('metaDeckOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'metaDeckOverlay';
  }
  document.body.appendChild(el);
  pushOverlay('metaDeck', () => {
    document.getElementById('metaDeckOverlay')?.remove();
  });
  const ev = a.event || {};
  const mainN = (a.main || []).reduce((t, [q]) => t + q, 0);
  const sideN = (a.side || []).reduce((t, [q]) => t + q, 0);
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(a.name)}
    <main>
      <div class="reco-admiral md-hero">
        <div id="mdKey"></div>
        <div class="ra-nm">${escapeHtml(a.name)}</div>
        <div class="ra-sub">
          ${fmtLabelOf(fmt)} · ${metaStyleLabel(a.style)} · ${Number(a.share || 0).toFixed(1)}% ·
          ${a.n} ${trS('decks')}
        </div>
        <div class="ra-sub" style="font-size:12.5px;opacity:0.85;">
          ${escapeHtml(ev.result || '')}${ev.name ? ' — ' + escapeHtml(ev.name) : ''}${ev.player ? ' · ' + escapeHtml(ev.player) : ''}${ev.date ? ' · ' + metaDateShort(ev.date) : ''}
        </div>
        <div class="md-actions">
          <button
            type="button"
            class="primary-btn"
            id="mdCopy"
            style="width:auto;margin:0;padding:10px 16px;"
          >
            + ${trS('Copy to my decks')}
          </button>
          ${/^https:\/\//.test(ev.url || '') ? `<a class="ghost-btn" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener" style="width:auto;margin:0;padding:10px 16px;">${trS('Source')} ↗</a>` : ''}
        </div>
        <div class="ra-sub" style="font-size:12px;margin-top:8px;">
          ${trS('Main deck')} ${mainN} · ${trS('Sideboard')} ${sideN}
        </div>
      </div>
      <div id="mdBody">
        <div class="status"><div class="spinner"></div></div>
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  const names = Array.from(new Set((a.main || []).concat(a.side || []).map(([, n]) => n)));
  let cards = [];
  try {
    cards = await namesToLegalCards(names);
  } catch (e) {}
  if (!document.getElementById('metaDeckOverlay')) return;
  const byName = new Map();
  cards.forEach((c) => {
    byName.set(c.name, c);
    const cut = c.name.indexOf(' // ');
    if (cut > 0) byName.set(c.name.slice(0, cut), c);
  });
  const find = (n) => byName.get(n) || byName.get(String(n).split(' // ')[0]) || null;
  const key = find(a.key);
  const kb = document.getElementById('mdKey');
  if (kb && key) {
    kb.innerHTML = `<img class="${wbClass(key)}" src="${cardImageLarge(key)}" alt="${escapeHtml(key.name)}">`;
    kb.querySelector('img').addEventListener('click', () => openCardInfo(key));
  }
  const fake = { format: fmt };
  const groups = {};
  CATS_CMDR.forEach((c) => {
    groups[c] = [];
  });
  const missing = [];
  (a.main || []).forEach(([q, n]) => {
    const c = find(n);
    if (!c) {
      missing.push(q + ' ' + n);
      return;
    }
    groups[categoryOf(c, fake)].push([q, c]);
  });
  const side = [];
  (a.side || []).forEach(([q, n]) => {
    const c = find(n);
    if (c) side.push([q, c]);
    else missing.push('SB ' + q + ' ' + n);
  });
  const tile = ([q, c]) =>
    `<div class="vg-card md-card" data-mdn="${encodeURIComponent(c.name)}"><img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}" loading="lazy">${q > 1 ? `<span class="vg-qty">×${q}</span>` : ''}</div>`;
  const sec = (label, rows) =>
    rows.length
      ? `<div class="md-sec"><div class="section-label">${escapeHtml(trS(label))} · ${rows.reduce((t, [q]) => t + q, 0)}</div><div class="visual-grid">${rows.map(tile).join('')}</div></div>`
      : '';
  // #mdBody is column-reverse: DOM-first sits at the FOOT, right above the
  // key card -- creatures first, lands above them, the sideboard on top.
  const body = document.getElementById('mdBody');
  if (!body) return;
  body.innerHTML =
    CATS_CMDR.map((cat) => sec(cat, groups[cat])).join('') +
    sec('Sideboard', side) +
    (missing.length
      ? `<div class="md-sec"><div class="section-label">${trS('Not found')}</div><div class="md-missing">${missing.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div></div>`
      : '');
  body.querySelectorAll('.md-card').forEach((t) =>
    t.addEventListener('click', () => {
      const c = find(decodeURIComponent(t.dataset.mdn));
      if (c) openCardInfo(c);
    }),
  );
  document.getElementById('mdCopy')?.addEventListener('click', () => copyMetaDeck(fmt, a, find));
}

function copyMetaDeck(fmt, a, find) {
  openInAppPrompt(trS('Name your new deck'), trS('Deck name'), a.name, (name) => {
    if (name === null) return;
    const ev = a.event || {};
    const d = {
      id: uid(),
      name: name.trim() || a.name,
      admiral: null,
      partner: null,
      cards: [],
      maybeboard: [],
      tags: {},
      primer: '',
      format: fmt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      description: `${a.name} — ${fmtLabelOf(fmt)} ${trS('metagame')}${ev.name ? ', ' + ev.result + ' ' + ev.name : ''}${ev.date ? ' (' + ev.date + ')' : ''}.`,
    };
    let miss = 0;
    const put = (list, into) =>
      (list || []).forEach(([q, n]) => {
        const c = find(n);
        if (!c) {
          miss += q;
          return;
        }
        for (let i = 0; i < q; i++) into.push(JSON.parse(JSON.stringify(c)));
      });
    put(a.main, d.cards);
    put(a.side, d.maybeboard);
    state.decksIndex.unshift(d);
    logDeckChange(d, { type: 'bulk', name: `${trS('Copied from the metagame')}: ${a.name}` });
    persistDeck(d);
    toast(
      miss
        ? `${d.name}: ${d.cards.length + d.maybeboard.length} ${trS('cards copied')}, ${miss} ${trS('not found')}.`
        : `${d.name}: ${d.cards.length}+${d.maybeboard.length} ${trS('cards copied')}.`,
    );
    dismissAllOverlays();
    openDeck(d.id);
  });
}
