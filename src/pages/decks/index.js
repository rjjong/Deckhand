// pages / decks / index

/* ---------------- HOME / MY DECKS ---------------- */

function deckPriceFromCache(d) {
  const all = deckLeaders(d).concat(d.cards || []);
  const seen = new Set();
  let total = 0;
  let complete = all.length > 0;
  const now = Date.now();
  all.forEach((c) => {
    if (seen.has(c.name)) return;
    seen.add(c.name);
    const hit = state.priceCache[c.name];
    // The same window priceDeck() trusts for display. A card whose price is
    // simply NOT LISTED on Cardmarket (v === null) is a known answer, not a
    // gap -- it adds nothing and leaves the total complete.
    if (hit && now - hit.t < SWR_SERVE) {
      if (typeof hit.v === 'number') total += hit.v;
    } else complete = false;
  });
  return { total, complete };
}

/* The price as it stands right now, ring and all. Rebuilt in place whenever a
   batch lands, so the number climbs while you watch instead of only changing
   after you have been away to a deck and back. */
function priceRingHtml(complete, busy) {
  if (complete) return '';
  const title = busy
    ? appLang() === 'nl'
      ? 'Prijzen worden opgehaald\u2026'
      : 'Fetching prices\u2026'
    : appLang() === 'nl'
      ? 'Nog niet compleet'
      : 'Not complete yet';
  return /* HTML */ `<span class="price-ring${busy ? '' : ' idle'}" title="${title}"></span>`;
}

function deckPriceLabel(d) {
  const p = deckPriceFromCache(d);
  if (!(p.total > 0)) return '';
  if (p.complete) return fmtEur(p.total);
  return fmtEur(p.total) + priceRingHtml(false, state._pricingDeck === d.id);
}

function paintDeckPrice(d) {
  if (!d) return;
  const el = document.querySelector(`[data-deckprice="${d.id}"]`);
  if (el) el.innerHTML = deckPriceLabel(d);
}

/* The card whose art fronts a deck's tile: the one picked by hand (long
   press on the tile -> Cover art), else the leader, else the deck's
   signature card -- the most copies, a creature before a spell, the
   higher mana value on a tie. Basic lands never front a deck. */
function deckCoverCard(d) {
  if (!d) return null;
  const all = deckLeaders(d).concat(d.cards || [], d.maybeboard || []);
  if (d.cover) {
    const c = all.find((x) => x && x.name === d.cover);
    if (c) return c;
  }
  if (d.admiral) return d.admiral;
  const cnt = new Map();
  (d.cards || []).forEach((c) => {
    if (c && c.name && !/Basic Land/.test(c.type_line || ''))
      cnt.set(c.name, (cnt.get(c.name) || 0) + 1);
  });
  let best = null,
    score = -1;
  cnt.forEach((n, name) => {
    const c = d.cards.find((x) => x && x.name === name);
    const sc = n * 100 + (/Creature/.test(c.type_line || '') ? 50 : 0) + (c.cmc || 0);
    if (sc > score) {
      score = sc;
      best = c;
    }
  });
  return best;
}

function openCoverPicker(d) {
  document.getElementById('coverPicker')?.remove();
  const seen = new Set(),
    pool = [];
  deckLeaders(d)
    .concat(d.cards || [], d.maybeboard || [])
    .forEach((c) => {
      if (!c || !c.name || seen.has(c.name) || /Basic Land/.test(c.type_line || '')) return;
      seen.add(c.name);
      pool.push(c);
    });
  const nl = appLang() === 'nl';
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'coverPicker';
  el.style.alignItems = 'center';
  // Bottom-up: "Automatic" sits at the foot, the cards climb above it.
  el.innerHTML = /* HTML */ `<div
    class="deckpick"
    style="border-radius:16px;margin:auto;max-width:420px;display:flex;flex-direction:column;"
  >
    <h4>${nl ? 'Deckplaatje' : 'Cover art'}</h4>
    <div class="cover-grid">
      ${pool.map((c, i) => `<button type="button" class="cover-opt ${d.cover === c.name ? 'on' : ''}" data-cover="${i}"><img loading="lazy" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}"></button>`).join('')}
    </div>
    <button class="ghost-btn" id="coverAuto" style="width:100%;margin-top:8px;">
      ${nl ? 'Automatisch' : 'Automatic'}
    </button>
    <button class="dp-cancel" id="coverCancel" style="margin-top:8px;">
      ${nl ? 'Annuleren' : 'Cancel'}
    </button>
  </div>`;
  document.body.appendChild(el);
  const close = () => {
    el.remove();
    const st = state.overlayStack;
    if (st.length && st[st.length - 1].id === 'coverPicker') st.pop();
  };
  pushOverlay(
    'coverPicker',
    () => {
      document.getElementById('coverPicker')?.remove();
    },
    true,
  );
  const set = (name) => {
    if (name) d.cover = name;
    else delete d.cover;
    persistDeck(d);
    close();
    render();
  };
  el.querySelectorAll('[data-cover]').forEach((b) =>
    b.addEventListener('click', () => set(pool[+b.dataset.cover].name)),
  );
  document.getElementById('coverAuto').addEventListener('click', () => set(null));
  document.getElementById('coverCancel').addEventListener('click', close);
  el.addEventListener('click', (ev) => {
    if (ev.target === el) close();
  });
  const g = el.querySelector('.cover-grid');
  if (g) g.scrollTop = g.scrollHeight;
}

/* Tiles or a Moxfield-style list, per page, remembered on this phone. */
function folderView(page) {
  try {
    return localStorage.getItem(LS_PREFIX + page + 'View') === 'list' ? 'list' : 'tiles';
  } catch (e) {
    return 'tiles';
  }
}

function setFolderView(page, v) {
  try {
    localStorage.setItem(LS_PREFIX + page + 'View', v === 'list' ? 'list' : 'tiles');
  } catch (e) {}
}

/* View icons: tiles = four squares, stack = three bold bars, text / list =
   short bullets beside lines. */
const VIEW_ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/></svg>',
  stack:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="17.5" r="1.3" fill="currentColor" stroke="none"/><path d="M9.5 6.5H20M9.5 12H20M9.5 17.5h7"/></svg>',
};

function viewIco(k) {
  return `<span class="ib">${VIEW_ICONS[k]}</span>`;
}

function folderViewToggleLabel(page) {
  return folderView(page) === 'list'
    ? viewIco('grid') + trS('Tile view')
    : viewIco('text') + trS('List view');
}

/* The drop-up menu of a page's big \uFF0B -- My Decks and the collection
   alike: the same small sheet just above the button. Items: [id, html, fn]. */
function openFabMenu(items) {
  const old = document.getElementById('fabMenu');
  if (old) {
    old.remove();
    return;
  }
  const menu = document.createElement('div');
  menu.id = 'fabMenu';
  menu.innerHTML = items
    .map(([id, html]) => `<button id="${id}">${menuLabel(html)}</button>`)
    .join('');
  document.body.appendChild(menu);
  items.forEach(([id, , fn]) =>
    document.getElementById(id).addEventListener('click', () => {
      menu.remove();
      fn();
    }),
  );
  setTimeout(
    () =>
      document.addEventListener('click', function once() {
        menu.remove();
        document.removeEventListener('click', once);
      }),
    0,
  );
}

/* ---- Salt: EDHREC's per-card salt score, kept as a NUMBER per card name
   (never the whole EDHREC page -- that would fill the phone). The salt
   survey runs about once a year, so a score is good for 90 days; a card
   EDHREC doesn't know is asked again after a week. */
const SALT_KEY = LS_PREFIX + 'saltCache';

let _saltStore = null;

function saltStore() {
  if (!_saltStore) {
    try {
      _saltStore = JSON.parse(localStorage.getItem(SALT_KEY) || '{}') || {};
    } catch (e) {
      _saltStore = {};
    }
  }
  return _saltStore;
}

function saltStoreSave() {
  try {
    localStorage.setItem(SALT_KEY, JSON.stringify(saltStore()));
  } catch (e) {}
}

function _saltDay() {
  return Math.floor(Date.now() / 864e5);
}

function cardSaltKnown(name) {
  const r = saltStore()[name];
  if (!r) return undefined;
  const age = _saltDay() - r[0];
  if (r[1] < 0) return age > 7 ? undefined : null;
  return age > 90 ? undefined : r[1];
}

function cardSaltPut(name, v) {
  saltStore()[name] = [
    _saltDay(),
    typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 1000 : -1,
  ];
}

// The cards that count: every distinct nonland card, leaders included.
function deckSaltNames(d) {
  const out = [],
    seen = new Set();
  deckLeaders(d)
    .concat(d.cards || [])
    .forEach((c) => {
      if (!c || !c.name || seen.has(c.name)) return;
      const tl = String(
        c.type_line || (c.card_faces && c.card_faces[0] && c.card_faces[0].type_line) || '',
      ).split('//')[0];
      if (/\bLand\b/.test(tl)) return;
      seen.add(c.name);
      out.push(c.name);
    });
  return out;
}

function deckSalt(d) {
  const names = deckSaltNames(d);
  let sum = 0,
    n = 0,
    pending = 0;
  names.forEach((nm) => {
    const v = cardSaltKnown(nm);
    if (v === undefined) pending++;
    else if (typeof v === 'number') {
      sum += v;
      n++;
    }
  });
  return { avg: n ? sum / n : null, known: n, pending, total: names.length };
}

function deckHasSalt(d) {
  const k = d && deckKind(d);
  return k === 'cmdr';
}

function deckSaltLabel(d) {
  if (!d || !deckHasSalt(d)) return '';
  const s = deckSalt(d);
  // Shown once at least 80% of the deck has been looked up.
  if (s.avg == null || s.pending > s.total * 0.2) return '';
  const t =
    appLang() === 'nl'
      ? 'Gemiddelde salt score (EDHREC) van de kaarten zonder lands'
      : 'Average salt score (EDHREC) of the nonland cards';
  return `<span class="dk-salt" title="${t}">🧂 ${s.avg.toFixed(2)}</span>`;
}

function paintDeckSalts() {
  document.querySelectorAll('[data-decksalt]').forEach((el) => {
    const d = getDeck(el.dataset.decksalt);
    el.innerHTML = deckSaltLabel(d);
  });
}

async function saltFromEdhrec(name) {
  // Network straight, no page cache: only the number is kept.
  const data = await edhrecFetchNetwork('/pages/cards/' + edhrecSlug(name) + '.json');
  if (!data) return undefined;
  const c2 = ((data.container || {}).json_dict || {}).card || {};
  let v = Number(c2.salt);
  if (!isFinite(v)) {
    const m = /"salt":\s*([0-9.]+)/.exec(JSON.stringify(c2) || '');
    v = m ? Number(m[1]) : NaN;
  }
  return isFinite(v) ? v : null;
}

let _saltRun = false;

/* Fills the salt of every Commander deck in the background, one card at a
   time, deck by deck (so whole decks finish early). Stops when the app is
   hidden or EDHREC stops answering; picks up where it left off next time. */
async function saltFillDecks() {
  if (_saltRun) return;
  _saltRun = true;
  try {
    const decks = (state.decksIndex || []).filter(deckHasSalt);
    const todo = [],
      seen = new Set();
    decks.forEach((d) =>
      deckSaltNames(d).forEach((n) => {
        if (!seen.has(n) && cardSaltKnown(n) === undefined) {
          seen.add(n);
          todo.push(n);
        }
      }),
    );
    if (!todo.length) return;
    let misses = 0,
      done = 0;
    for (const n of todo) {
      if (document.hidden || (typeof _netDown !== 'undefined' && _netDown)) break;
      let v;
      try {
        v = await saltFromEdhrec(n);
      } catch (e) {
        v = undefined;
      }
      if (v === undefined) {
        if (++misses >= 8) break;
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      misses = 0;
      cardSaltPut(n, v);
      if (++done % 12 === 0) {
        saltStoreSave();
        paintDeckSalts();
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  } finally {
    _saltRun = false;
    saltStoreSave();
    paintDeckSalts();
  }
}

function deckTileHtml(d) {
  const _cv = deckCoverCard(d);
  const art = _cv ? cardImageLarge(_cv) : '';
  const isActive = state.activeDeckId === d.id;
  const price = deckPriceFromCache(d);
  return /* HTML */ `<div class="deck-tile ${isActive ? 'active-marker' : ''}" data-id="${d.id}">
      <button class="tile-fav ${d.fav ? 'on' : ''}" data-fav="${d.id}" title="${d.fav ? 'Unfavorite' : 'Favorite'}">${d.fav ? '★' : '☆'}</button>
      
      <div class="art" style="${art ? `background-image:url('${art}')` : ''}">${art ? '' : `<div class="ph">${fmtFolderGlyph(deckFormat(d), 34)}</div>`}</div>
      <div class="id-strip" style="background:${identityStripCss(d.admiral && deckColorIdentity(d))}"></div>
      <div class="body">
        <div class="nm">${escapeHtml(d.name || 'Untitled deck')}</div>
        <div class="meta"><span${deckCountState(d) === 'bad' ? ' style="color:var(--count-bad-tile);"' : ''}>${deckCountLabel(d)}${d.primer && d.primer.trim() ? ' · ✎' : ''}</span><span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;"><span class="pips-mini">${d.admiral ? pipsHtml(deckColorIdentity(d), 'sm') : ''}</span>${deckKind(d) === 'cmdr' ? `<span class="bkt-mini" title="Bracket estimate">B${bracketEstimate(d, null).b}</span>` : ''}</span></div>
        <div class="edited"><span data-deckprice="${d.id}">${deckPriceLabel(d)}</span><span data-decksalt="${d.id}">${deckSaltLabel(d)}</span></div>
      </div>
    </div>`;
}

function fmtFolderTileHtml(fmt) {
  const n = fmtFolderDecks(fmt).length,
    sub = childFolders(fmtFolderId(fmt)).length;
  const bits = [];
  if (n) bits.push(n + ' deck' + (n === 1 ? '' : 's'));
  if (sub) bits.push(sub + ' folder' + (sub === 1 ? '' : 's'));
  return /* HTML */ `<div
    class="folder-tile"
    data-folder="${fmtFolderId(fmt)}"
    data-fmtfolder="${fmt}"
  >
    <div class="folder-face" style="font-size:44px;line-height:1;color:var(--brass);">
      ${fmtFolderGlyph(fmt, 40)}
    </div>
    <div class="folder-name">${fmtLabelOf(fmt)}</div>
    <div class="folder-sub">${bits.join(' · ') || 'empty'} · auto</div>
  </div>`;
}

function folderTileHtml(f) {
  const deckN = countFolderDecks(f.id);
  const subN = childFolders(f.id).length;
  const bits = [];
  if (deckN) bits.push(deckN + ' deck' + (deckN > 1 ? 's' : ''));
  if (subN) bits.push(subN + ' folder' + (subN > 1 ? 's' : ''));
  return /* HTML */ `<div class="folder-tile" data-folder="${f.id}">
    <div class="folder-face">${folderIconSvg(f.icon, 56, folderIsNaval(f))}</div>
    <div class="folder-name">${escapeHtml(f.name)}</div>
    <div class="folder-sub">${bits.join(' · ') || 'empty'}</div>
  </div>`;
}

function countFolderDecks(folderId) {
  // decks directly in this folder + all descendant folders, every format.
  let ids = [folderId],
    total = 0;
  while (ids.length) {
    const cur = ids.pop();
    total += decksInFolderMode(cur).length;
    childFolders(cur).forEach((c) => ids.push(c.id));
  }
  return total;
}

function homeHtml() {
  const q = (state.deckFilter || '').trim().toLowerCase();
  const searching = !!q;
  // When searching, flatten across all folders; otherwise show current folder.
  const nav = state.folderNav || null;
  const matchDeck = (d) =>
    (d.name || '').toLowerCase().includes(q) ||
    deckLeaders(d).some((L) => (L.name || '').toLowerCase().includes(q));
  // ONE decks page: every format together, the auto format folders sort them.
  const fmtNav = fmtOfFolder(nav); // inside an auto format folder?
  const favs = searching
    ? []
    : fmtNav
      ? fmtFolderDecks(fmtNav).filter((d) => d.fav)
      : state.decksIndex.filter((d) => d.fav && !d.collected && (d.folderId || null) === nav);
  const shownDecks = searching
    ? state.decksIndex.filter(matchDeck)
    : fmtNav
      ? fmtFolderDecks(fmtNav).filter((d) => !d.fav)
      : nav
        ? decksInFolder(nav).filter((d) => !d.fav && !d.collected)
        : []; // root: unfiled decks live in their format folders
  const fmtFolders =
    searching || nav
      ? []
      : FMT_ORDER.filter((f) => fmtFolderDecks(f).length || childFolders(fmtFolderId(f)).length);
  const fmtTiles = fmtFolders.map(fmtFolderTileHtml).join('');
  // ♥ Collected: decks saved from other players' shared pages — shown on the
  // top level as their own shelf (they can be organised into folders too).
  const collected =
    searching || nav
      ? []
      : state.decksIndex.filter((d) => d.collected && (d.folderId || null) === null);
  const shownFolders = searching ? [] : childFolders(nav); // format folders hold user folders too
  const path = nav ? folderPath(nav) : [];
  const crumb = '';
  const favTiles = favs.map(deckTileHtml).join('');
  const folderTiles = shownFolders.map(folderTileHtml).join('');
  const deckTiles = shownDecks.map(deckTileHtml).join('');
  const hasAny = state.decksIndex.length || (state.folders || []).length;
  const _html = `
  <main class="decks-page">
    <div class="searchbar page-searchbar decks-searchbar">
      <input id="deckFilter" placeholder="Search decks..." value="${escapeHtml(state.deckFilter || '')}">
    </div>
    <button class="deck-fab" id="deckFab" title="New">＋</button>
    ${crumb}
    ${
      !state.homeLoaded
        ? `<div class="status"><div class="spinner"></div>Loading your decks…</div>`
        : favTiles || folderTiles || deckTiles || fmtTiles || collected.length
          ? `
         ${favs.length ? `<div class="section-label">★ Favorites</div><div class="deck-grid">${favTiles}</div>` : ''}
         ${shownFolders.length ? `<div class="section-label">Folders</div><div class="deck-grid">${folderTiles}</div>` : ''}
         ${shownDecks.length ? `${favs.length || shownFolders.length ? `<div class="section-label">${searching ? 'Results' : 'Decks'}</div>` : ''}<div class="deck-grid">${deckTiles}</div>` : ''}
         ${collected.length ? `<div class="section-label">♥ Collected</div><div class="deck-grid">${collected.map(deckTileHtml).join('')}</div>` : ''}
         ${fmtTiles ? `<div class="section-label">Formats</div><div class="deck-grid">${fmtTiles}</div>` : ''}
         ${!favTiles && !folderTiles && !deckTiles && nav ? `<div class="empty-note">${fmtNav ? `No ${fmtLabelOf(fmtNav)} decks yet.` : 'This folder is empty.'}</div>` : ''}
       `
          : searching
            ? `<div class="empty-note">No decks match “${escapeHtml(state.deckFilter)}”.</div>`
            : `<div class="empty-home"><div class="seal lg">${formatSealSvg(false)}</div><p>No decks yet. Start a new deck, pick its format and add your cards.</p><button id="newDeckBtn2">New Deck</button></div>`
    }
  </main>`;
  return folderView('decks') === 'list'
    ? _html.replace(/class="deck-grid"/g, 'class="deck-grid as-list"')
    : _html;
}

/* Gentle persistence guidance: a one-time note that decks live in this
   browser, and a recurring nudge to back up once the collection grows. */
function backupReminder() {
  try {
    const last = parseInt(localStorage.getItem(LS_PREFIX + 'lastBackup') || '0', 10);
    const snooze = parseInt(localStorage.getItem(LS_PREFIX + 'backupSnooze') || '0', 10);
    const week = 7 * 24 * 3600 * 1000;
    const hasData =
      (state.decksIndex || []).length >= 1 || (state.collection?.items || []).length >= 10;
    return hasData && Date.now() - last > week && Date.now() - snooze > week ? { last } : null;
  } catch (e) {
    return null;
  }
}

function backupBadgeHtml() {
  return backupReminder()
    ? '<span class="menu-alert" role="status" aria-label="Backup recommended">!</span>'
    : '';
}

function updateBackupBadges() {
  document.querySelectorAll('[data-app-menu]').forEach((button) => {
    button.querySelector('.menu-alert')?.remove();
    button.insertAdjacentHTML('beforeend', backupBadgeHtml());
  });
}

function menuNoticeHtml() {
  try {
    if (!localStorage.getItem(LS_PREFIX + 'welcomed')) {
      return /* HTML */ `<div class="pin-pill" id="welcomeNote" style="align-items:flex-start;">
        <span class="pp-txt" style="white-space:normal;line-height:1.5;"
          >${modeGlyph()}
          ${
            appLang() === 'nl'
              ? 'Je decks staan <strong>in deze browser, op dit toestel</strong>. Blijf bij één browser — het fijnst als geïnstalleerde app (Chrome ⋮ → App installeren) — en maak af en toe een back-up via Extra\u2019s.'
              : 'Your decks are saved <strong>in this browser, on this device</strong>. Stick to one browser — nicest as the installed app (Chrome ⋮ → Install app) — and back up now and then from Extras.'
          }</span
        >
        <button id="welcomeOk" title="Got it">✕</button>
      </div>`;
    }
    const reminder = backupReminder();
    if (reminder) {
      const { last } = reminder;
      const nl = appLang() === 'nl';
      const days = last ? Math.floor((Date.now() - last) / 86400000) : 0;
      const msg = last
        ? nl
          ? `Je laatste back-up is ${days} dagen oud.`
          : `Your last backup is ${days} days old.`
        : nl
          ? 'Je hebt nog geen back-up van je decks en collectie.'
          : 'You have no backup of your decks and collection yet.';
      return /* HTML */ `<div class="pin-pill" id="backupNote" style="align-items:center;">
        <span class="pp-txt" style="white-space:normal;line-height:1.5;"
          >${inlIco('save', 15)}${msg}</span
        >
        <button type="button" class="bk-now" id="backupNow">${nl ? 'Nu maken' : 'Back up'}</button>
        <button
          id="backupLater"
          aria-label="Snooze backup reminder"
          title="${nl ? 'Later' : 'Later'}"
        >
          ✕
        </button>
      </div>`;
    }
  } catch (e) {}
  return '';
}

function wireMenuNotice() {
  document.getElementById('welcomeOk')?.addEventListener('click', () => {
    try {
      localStorage.setItem(LS_PREFIX + 'welcomed', '1');
    } catch (e) {}
    render();
  });
  document.getElementById('backupLater')?.addEventListener('click', () => {
    try {
      localStorage.setItem(LS_PREFIX + 'backupSnooze', String(Date.now()));
    } catch (e) {}
    render();
  });
  document.getElementById('backupNow')?.addEventListener('click', () => openBackupSheet());
}

/* Walks the decks on screen and finishes their prices, one deck at a time, in
   the background lane -- so anything you tap goes first and this simply waits
   its turn. A generation counter retires the sweep the moment you leave the
   page or the list is rebuilt. */
let _deckSweepGen = 0;

async function sweepDeckPrices() {
  const gen = ++_deckSweepGen;
  await new Promise((r) => setTimeout(r, 400)); // let the page settle first
  if (gen !== _deckSweepGen || state.screen !== 'decks') return;
  const ids = Array.from(document.querySelectorAll('[data-deckprice]')).map(
    (e) => e.dataset.deckprice,
  );
  for (const id of ids) {
    if (gen !== _deckSweepGen || state.screen !== 'decks') return;
    if (state._priceHoldUntil && Date.now() < state._priceHoldUntil) return; // Scryfall is pushing back
    if (state._pricingDeck) return; // a deck page is already at it
    const d = (state.decksIndex || []).find((x) => x.id === id);
    if (!d || deckPriceFromCache(d).complete) continue;
    state._pricingDeck = d.id;
    paintDeckPrice(d); // ring starts turning
    try {
      await priceDeck(
        d,
        () => {
          if (gen === _deckSweepGen) paintDeckPrice(d);
        },
        true,
      );
    } catch (e) {}
    state._pricingDeck = null;
    if (gen !== _deckSweepGen) return;
    paintDeckPrice(d); // ring stops
    await new Promise((r) => setTimeout(r, 600)); // breathe between decks
  }
}

function wireHome() {
  sweepDeckPrices();
  setTimeout(() => {
    if (state.screen === 'decks') saltFillDecks();
  }, 2500);
  document.getElementById('newDeckBtn2')?.addEventListener('click', () => openModal('newdeck'));
  document
    .querySelector('[data-opencollection]')
    ?.addEventListener('click', () => switchPage('collection'));
  const fab = document.getElementById('deckFab');
  if (fab) {
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      openFabMenu([
        ['fabNewDeck', '⚔ New deck', () => openModal('newdeck')],
        [
          'fabNewFolder',
          `<span class="ib">${ICONS.decks}</span>New folder`,
          () => openNewFolderPrompt(state.folderNav || null),
        ],
        // One Import: the sheet takes a pasted list AND loads a .txt file.
        ['fabImportDeck', mIco('file') + trS('Import'), () => openPasteListSheet()],
        [
          'fabView',
          folderViewToggleLabel('decks'),
          () => {
            setFolderView('decks', folderView('decks') === 'list' ? 'tiles' : 'list');
            render();
            scrollToPageFoot();
          },
        ],
      ]);
    });
  }
  // Open a deck (but not when a tile button was tapped)
  // Long-press = the tile's menu, exactly like binders; a plain tap opens.
  const wireLp = (t, onOpen, onTap) => {
    let lpT = null,
      lpFired = false;
    const arm = () => {
      lpFired = false;
      clearTimeout(lpT);
      lpT = setTimeout(() => {
        lpFired = true;
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (err) {}
        onOpen();
      }, 480);
    };
    const disarm = () => clearTimeout(lpT);
    t.addEventListener('pointerdown', arm);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => t.addEventListener(ev, disarm));
    t.addEventListener('contextmenu', (e) => e.preventDefault());
    t.addEventListener('click', (e) => {
      if (lpFired) {
        lpFired = false;
        e.preventDefault();
        return;
      }
      onTap(e);
    });
  };
  document.querySelectorAll('.deck-tile').forEach((t) =>
    wireLp(
      t,
      () => openDeckTileMenu(t.dataset.id, t),
      (e) => {
        if (e.target.closest('.tile-fav')) return;
        openDeck(t.dataset.id);
      },
    ),
  );
  document.querySelectorAll('.folder-tile').forEach((t) => {
    if (!t.dataset.folder) return; // only true deck folders — binder tiles keep their own wiring
    wireLp(
      t,
      () => openFolderMenu(t.dataset.folder, t),
      () => navToFolder(t.dataset.folder),
    );
  });
  document.querySelectorAll('[data-fav]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = getDeck(b.dataset.fav);
      if (d) {
        d.fav = !d.fav;
        persistDeck(d);
        render();
      }
    }),
  );
  document.querySelectorAll('[data-menu]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeckTileMenu(b.dataset.menu, b);
    }),
  );
  document.querySelectorAll('[data-foldermenu]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openFolderMenu(b.dataset.foldermenu, b);
    }),
  );
  document.querySelectorAll('[data-gofolder]').forEach((b) =>
    b.addEventListener('click', () => {
      navToFolder(b.dataset.gofolder === 'root' ? null : b.dataset.gofolder);
    }),
  );
  const f = document.getElementById('deckFilter');
  if (f) {
    f.addEventListener('input', () => {
      state.deckFilter = f.value;
      render();
      // Re-rendering replaces the input element, which would blur it and close
      // the phone keyboard mid-word. Hand focus straight back with the caret
      // at the end so typing continues uninterrupted.
      const nf = document.getElementById('deckFilter');
      if (nf) {
        nf.focus();
        const len = nf.value.length;
        try {
          nf.setSelectionRange(len, len);
        } catch (err) {}
      }
    });
  }
  if (!state.homeLoaded) loadDecksIndex().then(render);
}

function navToFolder(id) {
  state.folderNav = id || null;
  // Push a history entry tagged with this folder so the hardware back button
  // steps up the folder tree before leaving My Decks.
  try {
    history.pushState({ screen: 'decks', folder: state.folderNav }, '', '#decks');
  } catch (e) {}
  render();
  scrollToPageFoot();
}

function openNewFolderPrompt(parentId) {
  openInAppPrompt('New folder', 'Folder name', '', (name) => {
    if (name && name.trim()) {
      createFolder(name.trim(), parentId || null);
      render();
    }
  });
}

function openDeckTileMenu(id, anchorEl) {
  const d = getDeck(id);
  if (!d) return;
  openTileMenu(anchorEl, [
    { label: mIco('folder') + trS('Move to…'), fn: () => openFolderPicker(d) },
    { label: '⚔ Set format…', fn: () => openFormatPicker(d) },
    {
      label: mIco('image') + (appLang() === 'nl' ? 'Deckplaatje…' : 'Cover art…'),
      fn: () => openCoverPicker(d),
    },
    {
      label: mIco('copy') + trS('Duplicate deck'),
      fn: () => {
        duplicateDeck(d);
      },
    },
    { label: mIco('share') + trS('Share deck'), fn: () => shareDeck(d) },
    {
      label: mIco('trash') + trS('Delete deck'),
      danger: true,
      fn: () => {
        state.activeDeckId = d.id;
        openModal('delete');
      },
    },
  ]);
}

function openFolderMenu(id, anchorEl) {
  const f = (state.folders || []).find((x) => x.id === id);
  if (!f) return;
  openTileMenu(anchorEl, [
    // One order for every long-press menu (deck, folder, binder): Move to…
    // first, then the name / format, then the picture, then the extras, and
    // Delete last behind its rule.
    { label: mIco('folder') + trS('Move to…'), fn: () => openFolderPicker(f, { folder: true }) },
    {
      label: mIco('edit') + trS('Rename'),
      fn: () =>
        openInAppPrompt('Rename folder', 'Folder name', f.name, (v) => {
          if (v && v.trim()) {
            f.name = v.trim();
            saveFolders();
            render();
          }
        }),
    },
    {
      label: modeGlyph() + ' ' + (appLang() === 'nl' ? 'Icoon wijzigen' : 'Change icon'),
      fn: () => openFolderIconPicker(f),
    },
    { label: mIco('folderPlus') + trS('New subfolder'), fn: () => openNewFolderPrompt(f.id) },
    {
      label: mIco('trash') + trS('Delete folder'),
      danger: true,
      fn: () => {
        openModal('deleteFolder', { folderId: f.id });
      },
    },
  ]);
}

function openFolderIconPicker(f) {
  let el = document.getElementById('iconPicker');
  if (!el) {
    el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'iconPicker';
  }
  brSheetOpen(el, 'iconPicker'); // back closes it (and it rises above anything opened before)
  el.style.alignItems = 'center';
  el.innerHTML = /* HTML */ `<div
    class="deckpick"
    style="border-radius:16px;margin:auto;max-width:340px;"
  >
    <h4>Folder icon</h4>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 12px;">
      ${FOLDER_ICONS.map((ic) => `<button class="icon-choice ${f.icon === ic ? 'sel' : ''}" data-ic="${ic}" style="display:flex;align-items:center;justify-content:center;padding:12px 0;background:var(--ink-2);border:1px solid ${f.icon === ic ? 'var(--brass)' : 'var(--line)'};border-radius:10px;color:var(--brass);">${folderIconSvg(ic, 32, folderIsNaval(f))}</button>`).join('')}
    </div>
    <button class="dp-cancel" id="icCancel" style="margin:0;">Close</button>
  </div>`;
  const close = () => brSheetClose('iconPicker');
  document.getElementById('icCancel').addEventListener('click', close);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelectorAll('[data-ic]').forEach((b) =>
    b.addEventListener('click', () => {
      f.icon = b.dataset.ic;
      saveFolders();
      close();
      render();
    }),
  );
}

/* Cascading folder picker: start at the top level, tap a folder to descend
   (its subfolders then appear), tap "Move here" to commit at the current
   level. Handles duplicate names across branches because you navigate the
   tree rather than pick from one flat list. */
/* Format picker: relabel a deck's format. The deck stays where it is if
   user-placed; an unfiled deck simply re-files under the new format. */
function setDeckFormat(d, fmt) {
  if (!FMT_LABELS[fmt] || deckFormat(d) === fmt) return;
  // The folder decides the rules, so a new format means a new home: out of
  // the old format's folder, into the new format's own folder.
  if (d.folderId && fmtAncestorOf(d.folderId)) d.folderId = null;
  d.format = fmt;
  d.updatedAt = Date.now();
  persistDeck(d);
  toast(`${escapeHtml(d.name)} is now a ${fmtLabelOf(fmt)} deck.`);
  render();
  if (state.screen === 'decklist') {
    try {
      refreshLegality(d);
      updateDeckMeter(d);
    } catch (e) {}
  }
}

function openFormatPicker(d) {
  let el = document.getElementById('formatPicker');
  if (!el) {
    el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'formatPicker';
  }
  brSheetOpen(el, 'formatPicker');
  el.style.alignItems = 'center';
  const cur = deckFormat(d);
  el.innerHTML = /* HTML */ `<div
    class="deckpick"
    style="border-radius:16px;margin:auto;max-width:340px;"
  >
    <h4>Format of “${escapeHtml(d.name)}”</h4>
    <div class="deckpick-list" style="max-height:46vh;">
      ${FMT_ORDER.map((f) => `<button class="dp-row ${f === cur ? 'active' : ''}" data-setfmt="${f}"><span style="color:var(--brass);display:inline-flex;vertical-align:middle;margin-right:8px;">${fmtFolderGlyph(f, 20)}</span><span class="dp-txt" style="display:inline;">${fmtLabelOf(f)}${f === cur ? ' <span style="color:var(--sub-text);">· current</span>' : ''}</span></button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="dp-cancel" id="fmtpCancel" style="flex:1;margin:0;">Cancel</button>
    </div>
  </div>`;
  const close = () => brSheetClose('formatPicker');
  document.getElementById('fmtpCancel').addEventListener('click', close);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelectorAll('[data-setfmt]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      setDeckFormat(d, b.dataset.setfmt);
    }),
  );
}

function openFolderPicker(d, opts) {
  state._fpDeck = d;
  state._fpIsFolder = !!(opts && opts.folder); // moving a FOLDER, not a deck
  state._fpNav = null; // current level being shown
  renderFolderPicker();
}

function folderDescendantIds(id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    (state.folders || []).forEach((f) => {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    });
  }
  return out;
}

/* The Move picker shows the same tiles as My Decks -- format folders with
   their glyph, your folders with their own icon and counts -- two across,
   bottom-up like the page (first tile at the foot, the list opens at its
   foot). Tap a tile to step into it; "Move to …" commits at the level shown.
   The first tile makes a new folder right here. Back closes the picker. */
function fpTileHtml(kind, id) {
  const t =
    kind === 'fmt'
      ? fmtFolderTileHtml(id)
      : folderTileHtml((state.folders || []).find((f) => f.id === id));
  // Same face, own wiring: the page's .folder-tile handlers look for data-folder.
  return t
    .replace(/class="folder-tile"/, 'class="folder-tile fp-tile"')
    .replace(/ data-folder="([^"]+)"( data-fmtfolder="[^"]+")?/, ' data-fpinto="$1"');
}

function renderFolderPicker() {
  const d = state._fpDeck;
  if (!d) return;
  const NL = appLang() === 'nl';
  let el = document.getElementById('folderPicker');
  if (!el) {
    el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'folderPicker';
  }
  brSheetOpen(el, 'folderPicker', () => {
    state._fpDeck = null;
  }); // back closes the picker
  el.style.alignItems = 'center';
  const nav = state._fpNav;
  const mvFolder = state._fpIsFolder;
  const banned = mvFolder ? folderDescendantIds(d.id) : new Set(); // a folder can't move into itself
  const here = childFolders(nav).filter((f) => !banned.has(f.id));
  const path = nav ? folderPath(nav) : [];
  const fmtAnc = fmtAncestorOf(nav);
  const crumb =
    `<button class="fp-crumb" data-fp="root">${modeGlyph()} Top</button>` +
    (fmtAnc
      ? `<span class="fc-sep">›</span><button class="fp-crumb" data-fp="${fmtFolderId(fmtAnc)}">${fmtLabelOf(fmtAnc)}</button>`
      : '') +
    path
      .map(
        (f) =>
          `<span class="fc-sep">›</span><button class="fp-crumb" data-fp="${f.id}">${escapeHtml(f.name)}</button>`,
      )
      .join('');
  const curName = isFmtFolder(nav)
    ? fmtLabelOf(fmtOfFolder(nav))
    : nav
      ? folderPath(nav).slice(-1)[0].name
      : mvFolder
        ? 'Top level'
        : 'Top level (auto-filed by format)';
  const newTile = `<button type="button" class="folder-tile fp-tile fp-new" id="fpNewSub"><div class="folder-face">${ICONS.folderPlus || '＋'}</div><div class="folder-name">${NL ? 'Nieuwe map' : 'New folder'}</div><div class="folder-sub">${NL ? 'hier' : 'here'}</div></button>`;
  const tiles =
    newTile +
    (!nav ? FMT_ORDER.map((f) => fpTileHtml('fmt', f)).join('') : '') +
    here.map((f) => fpTileHtml('folder', f.id)).join('');
  el.innerHTML = /* HTML */ `<div
    class="deckpick fp-sheet"
    style="border-radius:16px;margin:auto;max-width:400px;"
  >
    <h4>Move “${escapeHtml(d.name)}”</h4>
    <div class="fp-crumbs">${crumb}</div>
    <div class="fp-scroll"><div class="fp-grid">${tiles}</div></div>
    <div class="fp-actions">
      <button class="dp-cancel" id="fpCancel">Cancel</button>
      <button class="primary-btn" id="fpHere">Move to ${escapeHtml(curName)}</button>
    </div>
  </div>`;
  // Bottom-up: the grid opens at its foot, where the first tiles are.
  const sc = el.querySelector('.fp-scroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
  const close = () => brSheetClose('folderPicker');
  document.getElementById('fpCancel').addEventListener('click', close);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelectorAll('[data-fpinto]').forEach((b) =>
    b.addEventListener('click', () => {
      state._fpNav = b.dataset.fpinto;
      renderFolderPicker();
    }),
  );
  el.querySelectorAll('[data-fp]').forEach((b) =>
    b.addEventListener('click', () => {
      state._fpNav = b.dataset.fp === 'root' ? null : b.dataset.fp;
      renderFolderPicker();
    }),
  );
  document.getElementById('fpNewSub').addEventListener('click', () => {
    openInAppPrompt(
      NL ? 'Nieuwe map' : 'New folder',
      NL ? 'Naam van de map' : 'Folder name',
      '',
      (name) => {
        if (name && name.trim()) {
          const f = createFolder(name.trim(), state._fpNav || null);
          state._fpNav = f.id;
          renderFolderPicker();
        }
      },
    );
  });
  document.getElementById('fpHere').addEventListener('click', () => {
    const dest = state._fpNav || null;
    if (mvFolder) {
      d.parentId = dest; // a format folder id is a legal parent for a FOLDER
      saveFolders();
      (state.decksIndex || []).forEach((x) => {
        const was = x.format;
        if (deckFormat(x) !== was) persistDeck(x);
      });
      close();
      toast(`Moved to ${curName}.`);
      render();
      return;
    }
    if (isFmtFolder(dest)) {
      // Into an auto folder: unfile the deck and give it that folder's format.
      const fmt = fmtOfFolder(dest);
      d.folderId = null;
      close();
      if (deckFormat(d) !== fmt) setDeckFormat(d, fmt);
      else {
        persistDeck(d);
        toast(`Moved to ${fmtLabelOf(fmt)}.`);
        render();
      }
      return;
    }
    const _was = deckFormat(d);
    d.folderId = dest;
    const _now = deckFormat(d); // the folder's format takes over
    persistDeck(d);
    const where = dest
      ? folderPath(dest).slice(-1)[0].name
      : fmtLabelOf(deckFormat(d)) + ' (auto folder)';
    close();
    if (_now !== _was)
      setTimeout(() => {
        try {
          toast(`${d.name}: ${fmtLabelOf(_now)}`);
        } catch (e) {}
      }, 1200);
    toast(`Moved to ${where}.`);
    render();
  });
}

/* Lightweight anchored popup menu for tile ⋯ buttons. */
/* The gold selection button's face: ＋ while one card is picked, the count
   itself from two up -- the number REPLACES the ＋, never sits on its rim. */
function selFabLabel(n) {
  n = +n || 0;
  if (n < 2) return '\uFF0B';
  const t = String(n);
  return `<span class="fab-count${t.length > 2 ? ' long' : ''}">${t}</span>`;
}

/* A menu label's icon column: a line icon (<span class="ib">) stays as it
   is; a leading text glyph (⚔ ✎ ⧉ ↗ …) goes into the same 20px box, so
   every label in a menu starts at the same place. Translated first, whole. */
function menuLabel(h) {
  h = String(h == null ? '' : h);
  if (/^\s*</.test(h)) return h;
  const t = trS(h);
  const m = t.match(/^(\S{1,2})\s+([\s\S]+)$/);
  if (m && !/[A-Za-z0-9\u20AC\u00C0-\u024F]/.test(m[1]))
    return `<span class="ib ib-t">${m[1]}</span>${m[2]}`;
  return t;
}

function mIco(name) {
  return `<span class="ib">${ICONS[name] || ''}</span>`;
}

/* Lazy healing: decks saved before the live flags existed refresh a few
   cards per visit on the quiet lane — game_changer and current legalities
   flow in, and meaningful changes get said out loud. A week of normal use
   and every stored card carries live credentials. */
const _healedDecks = new Set();

async function healDeckCardFlags(d) {
  if (!d || _healedDecks.has(d.id)) return;
  _healedDecks.add(d.id);
  const stale = (d.cards || []).filter((c) => c && typeof c.game_changer !== 'boolean').slice(0, 6);
  if (!stale.length) return;
  let touched = false;
  for (const c of stale) {
    try {
      const res = await sfFetch(
        SF_BASE + '/cards/named?exact=' + encodeURIComponent(c.name),
        0,
        true,
      );
      if (!res || !res.ok) continue;
      const f = await res.json();
      const wasGC = isGameChanger(c); // the fallback list's verdict, pre-flag
      if (typeof f.game_changer === 'boolean') c.game_changer = f.game_changer;
      if (f.legalities) {
        const wasBanned = c.legalities && c.legalities.commander === 'banned';
        c.legalities = { commander: f.legalities.commander, standard: f.legalities.standard };
        if (!wasBanned && c.legalities.commander === 'banned')
          toast(`${c.name} is now banned in Commander.`);
      }
      if (typeof c.game_changer === 'boolean') {
        if (wasGC && !c.game_changer) toast(`${c.name} is no longer a Game Changer.`);
        if (!wasGC && c.game_changer) toast(`${c.name} is now a Game Changer.`);
      }
      touched = true;
    } catch (e) {}
  }
  if (touched) scheduleSave(d);
}

function openDeck(id) {
  state.activeDeckId = id;
  state.dockSet = 0; // the tools bar is home base — every visit starts there
  if (!state.searchDeckId) state.searchDeckId = id;
  if (!state.inspireDeckId) state.inspireDeckId = id;
  state.builderTab = 'list';
  state.dlPanel = null;
  switchPage('decklist');
  try {
    const d = getDeck(id);
    if (d)
      setTimeout(() => {
        healDeckCardFlags(d);
      }, 1200);
  } catch (e) {}
  try {
    const d2 = getDeck(id);
    if (d2)
      setTimeout(() => {
        ensureDeckOtags(d2);
      }, 1500);
  } catch (e) {}
}

function openPasteListSheet(opts) {
  opts = opts || {};
  setTimeout(() => {
    document.getElementById('appointOverlay')?.remove();
    const el = document.createElement('div');
    el.id = 'appointOverlay';
    el.innerHTML = /* HTML */ ` <div class="appoint-sheet" style="max-width:480px;">
      <div class="appoint-head">
        <span>${modeGlyph()} ${trS('Import')}</span
        ><button class="icon-btn" id="appointClose" style="flex:none;">
          ${ICONS.close || '✕'}
        </button>
      </div>
      <p class="hint" style="margin:0 0 8px;">
        ${
          appLang() === 'nl'
            ? `Een eerste regel <span style="font-family:'JetBrains Mono',monospace;">${leaderLineLabel({ format: 'commander' })}: Kaartnaam</span> wijst de leider aan — anders kies je er later een uit het deck.`
            : `A first line <span style="font-family:'JetBrains Mono',monospace;">${leaderLineLabel({ format: 'commander' })}: Card Name</span> appoints the leader — otherwise appoint one later from the deck.`
        }
      </p>
      <input
        id="pasteDeckName"
        style="width:100%;margin:0 0 8px;box-sizing:border-box;background:var(--field);border:1.5px solid var(--field-line);border-radius:8px;color:var(--ink-text);padding:9px 10px;font-family:Inter;font-size:15px;"
        value=""
        placeholder="Deck name"
      />
      <textarea
        id="pasteDeckText"
        class="bulk-textarea"
        style="min-height:180px;"
        placeholder="${appLang() === 'nl' ? '1 Kaartnaam&#10;1 Nog een kaart&#10;…' : '1 Card Name&#10;1 Another Card&#10;…'}"
      ></textarea>
      <input type="file" id="pasteDeckFile" accept=".txt,.dec,text/plain" style="display:none;" />
      <button class="ghost-btn" id="pasteDeckFileBtn" style="width:100%;margin-top:8px;">
        ${inlIco('file')}${trS('Load a .txt file')}
      </button>
      <button class="primary-btn" id="pasteCreateBtn" style="margin-top:10px;">Create deck</button>
    </div>`;
    document.body.appendChild(el);
    pushOverlay('appoint', () => {
      document.getElementById('appointOverlay')?.remove();
    });
    // 1.26: a list pasted with Ctrl+V arrives filled in
    if (opts.text) {
      const ta0 = document.getElementById('pasteDeckText');
      if (ta0) ta0.value = String(opts.text);
    }
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.appoint-sheet')) closeTopOverlay();
    });
    document.getElementById('appointClose').addEventListener('click', () => closeTopOverlay());
    document
      .getElementById('pasteDeckFileBtn')
      ?.addEventListener('click', () => document.getElementById('pasteDeckFile')?.click());
    document.getElementById('pasteDeckFile')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const ta = document.getElementById('pasteDeckText');
        if (ta) {
          ta.value = text;
          ta.scrollTop = 0;
        }
        const nmEl = document.getElementById('pasteDeckName');
        if (nmEl && !nmEl.value.trim()) nmEl.value = f.name.replace(/\.[^.]+$/, '');
        toast(`${f.name} ${trS('loaded — press Create deck when ready.')}`);
      } catch (err) {
        console.error(err);
        toast(trS('Could not read that file.'));
      }
      e.target.value = '';
    });
    document.getElementById('pasteCreateBtn').addEventListener('click', () => {
      const nm = (document.getElementById('pasteDeckName').value || '').trim() || 'Untitled deck';
      const listText = document.getElementById('pasteDeckText').value || '';
      closeOverlayThen(() => {
        createNewDeck(nm);
        const d = getDeck(state.activeDeckId);
        if (!d) return;
        if (!listText.trim()) {
          render();
          return;
        }
        state.dlPanel = 'import';
        renderBuilderBody(d);
        setTimeout(() => {
          const ta = document.getElementById('importText');
          if (ta) ta.value = listText;
          applyTextToDeck(d, listText, 'importReport', true);
        }, 60);
      });
    });
    // From "Import from file": the sheet opens with its file button marked,
    // and the person taps it -- the phone's file picker never pops up by itself.
    if (opts.pickFile) {
      const fb = document.getElementById('pasteDeckFileBtn');
      if (fb) fb.classList.add('fb-lead');
    } else
      setTimeout(() => {
        try {
          document.getElementById('pasteDeckName').focus();
        } catch (e) {}
      }, 40);
  }, 60);
}

function createNewDeck(name, fmt, cmd, partner) {
  // Born where you stand: creating a deck while inside a folder files it there.
  const homeFolder =
    state.screen === 'decks' && !isFmtFolder(state.folderNav) ? state.folderNav || null : null;
  const d = {
    id: uid(),
    name: name || 'Untitled deck',
    admiral: null,
    cards: [],
    maybeboard: [],
    tags: {},
    primer: '',
    format: fmt || fmtAncestorOf(state.screen === 'decks' ? state.folderNav : null) || 'commander',
    folderId: homeFolder,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (cmd) {
    d.admiral = cmd;
    logDeckChange(d, { type: 'add', name: cmd.name, card: cmd });
  }
  if (cmd && partner) {
    d.partner = partner;
    logDeckChange(d, { type: 'add', name: partner.name, card: partner });
  }
  state.decksIndex.unshift(d);
  persistDeck(d);
  openDeck(d.id);
}
