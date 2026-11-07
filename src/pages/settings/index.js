// pages / settings / index

function settingsPageHtml() {
  return /* HTML */ `<main class="hub-page settings-page">
    <section class="hub-intro">
      <span class="hub-eyebrow">YOUR PREFERENCES</span>
      <h1>Make it yours.</h1>
      <p>Choose your preferences, manage your data, and keep everything backed up and in sync.</p>
    </section>
    ${menuToolsHtml(true)}
  </main>`;
}

function wireSettingsPage() {
  wirePreferenceCards();
  wirePreferences();
  wireSettingsChangelog();
}

/* ---------------- SETTINGS PAGE ---------------- */

// Native bridge downloads, when available, use this installation's address.
const DECKHAND_SITE = new URL('./', location.href).href;

/* ---- The Android app keeps itself current ----
   APK_LATEST is the Deckhand.apk that sits next to this page on the site:
   raise it whenever a new APK goes into the repo. Inside an older app the
   page offers the update once (again after three days if put off): from APK
   4.3 the app downloads it and opens Android's installer itself; an older
   app hands the download to the browser. Android always asks the person to
   confirm, and the same signature means every deck and card stays. */
const APK_LATEST = '1.0';

/* The APK line restarted at 1.0 too (it was 3.0 ... 5.0). An app from the old
   line is always older than any app from the new one. */
function apkCmp(a, b) {
  const line = (v) => (+String(v || '0').split('.')[0] >= 3 ? 0 : 1);
  const la = line(a),
    lb = line(b);
  if (la !== lb) return la < lb ? -1 : 1;
  return apkVerCmp(a, b);
}

function apkVerCmp(a, b) {
  const x = String(a || '0')
      .split('.')
      .map(Number),
    y = String(b || '0')
      .split('.')
      .map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// The installed Android app's version, or null in a plain browser. Apps from
// before 4.3 do not say it, so their features give them away.
function apkInstalled() {
  try {
    const n = window.DeckhandNotify;
    if (!n) return null;
    if (typeof n.appVersion === 'function') {
      const v = String(n.appVersion() || '');
      if (v) return v;
    }
    if (typeof n.setPriceWatch === 'function') return '4.2';
    if (window.DeckhandExport && typeof window.DeckhandExport.share === 'function') return '4.1';
    if (typeof n.markSpoilersSeen === 'function') return '4.0';
    return '3.0';
  } catch (e) {
    return null;
  }
}

function apkOutdated() {
  const v = apkInstalled();
  return !!(v && apkCmp(v, APK_LATEST) < 0);
}

function apkUpdateNow() {
  const url = DECKHAND_SITE + 'Deckhand.apk?v=' + APK_LATEST;
  const n = window.DeckhandNotify;
  if (n && typeof n.installUpdate === 'function') {
    n.installUpdate(url);
    return 'self';
  }
  // An older app: the page asks for the file, the app hands the download to
  // the browser, and the browser saves it -- tap it there to install.
  toast('Your browser downloads the new app. Tap the download, then Install.');
  try {
    location.href = url;
  } catch (e) {}
  return 'browser';
}

window.dhUpdateState = function (st) {
  const M = {
    downloading: 'Downloading the new app…',
    permission: 'Allow Deckhand to install apps, then come back.',
    installing: 'Confirm the install on Android\u2019s screen.',
    error: 'Download failed — try again later.',
  };
  if (M[st]) toast(M[st]);
};

function openApkUpdateSheet() {
  const cur = apkInstalled();
  if (!cur) return;
  document.getElementById('apkSheet')?.remove();
  const self = !!(
    window.DeckhandNotify && typeof window.DeckhandNotify.installUpdate === 'function'
  );
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'apkSheet';
  el.style.zIndex = 215;
  el.style.alignItems = 'flex-end';
  // column-reverse sheet: Install at the foot, by the thumb.
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet apk-sheet">
    <div class="br-actions">
      <button type="button" class="primary-btn" id="apkNow">${'Install now'}</button>
      <button type="button" class="ghost-btn" id="apkLater">${'Later'}</button>
    </div>
    <div class="bk-hint">
      ${
        self
          ? 'The app downloads the new version and Android asks you to confirm.'
          : 'Your browser downloads the new version. Tap the download, then <b>Install</b>. Android may first ask whether the browser may install apps.'
      }
      ${' Your decks, collection and settings stay as they are.'}
    </div>
    <div class="br-title">
      <b>${inlIco('phone', 16)}${'New Android app'} — ${APK_LATEST}</b
      ><span
        >${`You have version ${escapeHtml(cur)}. New in ${APK_LATEST}: ${escapeHtml(((APK_NOTES[APK_LATEST] || {}).en || []).join(' · '))}.`}</span
      >
    </div>
  </div>`;
  let after = null;
  brSheetOpen(
    el,
    'apkSheet',
    () => {
      if (after) {
        const f = after;
        after = null;
        setTimeout(f, 0);
      }
    },
    true,
  );
  const close = () => brSheetClose('apkSheet');
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelector('#apkLater').addEventListener('click', () => {
    try {
      localStorage.setItem(
        LS_PREFIX + 'apkSnooze',
        JSON.stringify({ v: APK_LATEST, t: Date.now() }),
      );
    } catch (e) {}
    close();
  });
  el.querySelector('#apkNow').addEventListener('click', () => {
    after = () => apkUpdateNow();
    close();
  });
}

// At start-up: once per new APK, again three days after "Later".
function apkUpdateCheck() {
  try {
    if (!apkOutdated()) return;
    let sz = null;
    try {
      sz = JSON.parse(localStorage.getItem(LS_PREFIX + 'apkSnooze') || 'null');
    } catch (e) {}
    if (sz && sz.v === APK_LATEST && Date.now() - (sz.t || 0) < 3 * 86400000) return;
    if (document.getElementById('inAppConfirm') || (state.overlayStack || []).length) return; // never on top of something
    openApkUpdateSheet();
  } catch (e) {}
}

function inAndroidApp() {
  try {
    return typeof window.DeckhandExport !== 'undefined';
  } catch (e) {
    return false;
  }
}

function ndFmtBtnHtml(f) {
  // The New! sits by the arrow, on the menu -- not by the chosen format's
  // name, where it would read as "Commander is new".
  return `${FMT_LABELS[f] || f} <span style="float:right;display:inline-flex;align-items:center;gap:2px;"><span style="opacity:0.6;margin-left:6px;">▾</span></span>`;
}

/* An icon inline with text: the app's line icons at text size, in the
   text's own ink -- never a coloured emoji. */
function inlIco(name, px) {
  return `<span class="inl-ico" style="--ii:${px || 15}px;">${ICONS[name] || ''}</span>`;
}

/* 1.36: a fold of an Extras tile floats over the tiles. One at a time; it
   sits above its tile when there is more room above, else below; a scrim
   behind it closes it on a tap (back closes it too, like every fold). The
   observer in wireSettingsPage calls this whenever a fold opens or shuts. */
function xtPlace(body) {
  const main = body.closest('main'),
    sec = body.parentElement;
  if (!main || !sec) return;
  // 1.37: every fold opens the same way -- a sheet over the tiles, its foot
  // just above the nav bar, as wide as the tiles, as tall as its content
  // (up to the title bar), with its tile's name on top.
  const l1 = sec.querySelector('.xt-tile .l1');
  if (l1) {
    const c = l1.cloneNode(true);
    c.querySelectorAll('.new-pill').forEach((x) => x.remove());
    body.dataset.xtTitle = c.textContent.replace(/\u00ad/g, '').trim();
  }
  let left = Infinity,
    right = -Infinity;
  main.querySelectorAll(':scope > .settings-section').forEach((x) => {
    const q = x.getBoundingClientRect();
    left = Math.min(left, q.left);
    right = Math.max(right, q.right);
  });
  const cap = document.querySelector('.page-cap'),
    nav = document.querySelector('.brand-banner');
  const topLim = cap ? Math.max(0, cap.getBoundingClientRect().bottom) : 0;
  const botLim = nav
    ? Math.min(window.innerHeight, nav.getBoundingClientRect().top)
    : window.innerHeight;
  const gap = 10;
  body.style.left = Math.round(left) + 'px';
  body.style.width = Math.round(right - left) + 'px';
  if (isDesk()) {
    body.style.top = Math.round(topLim + gap) + 'px';
    body.style.bottom = 'auto';
    body.style.maxHeight = Math.max(160, Math.round(window.innerHeight - topLim - 2 * gap)) + 'px';
    body.dataset.side = 'down';
    return;
  }
  body.style.top = 'auto';
  body.style.bottom = Math.round(window.innerHeight - botLim + gap) + 'px';
  body.style.maxHeight = Math.max(160, Math.round(botLim - topLim - 2 * gap)) + 'px';
  body.dataset.side = 'up';
}

function xtCloseAll() {
  document
    .querySelectorAll('main.xt-tiles > .settings-section > .xt-body:not([hidden])')
    .forEach((b) => foldSet(b, false));
}

function xtSync() {
  const main = document.querySelector('main.xt-tiles');
  if (!main) return;
  const open = Array.from(
    main.querySelectorAll(':scope > .settings-section > .xt-body:not([hidden])'),
  );
  if (open.length > 1) {
    let keep = null;
    for (let i = _folds.length - 1; i >= 0 && !keep; i--)
      if (open.indexOf(_folds[i].body) >= 0) keep = _folds[i].body;
    keep = keep || open[open.length - 1];
    open.forEach((b) => {
      if (b !== keep) foldSet(b, false);
    });
    return;
  }
  let scrim = main.querySelector(':scope > .xt-scrim');
  if (!open.length) {
    if (scrim) scrim.remove();
    return;
  }
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'xt-scrim';
    scrim.addEventListener('click', (e) => {
      e.stopPropagation();
      xtCloseAll();
    });
    // position:fixed -- its place among the reversed tiles does not matter
    main.appendChild(scrim);
  }
  xtPlace(open[0]);
}

window.addEventListener('resize', () => {
  try {
    xtSync();
  } catch (e) {}
});

/* Extras: the folds that hold long reading (format rules, ban lists, About)
   open DOWNWARD and read top to bottom. Once open, the row moves up to sit
   just under the page title, so the text runs down the screen from there.
   1.36: a tile's fold floats instead -- nothing to move; inside a floating
   fold the fold itself scrolls the opened part to its top. */
function dropReveal(row) {
  if (row && row.classList && row.classList.contains('xt-tile')) return;
  const pop = row && row.closest ? row.closest('main.xt-tiles .xt-body') : null;
  if (pop) {
    requestAnimationFrame(() => {
      try {
        pop.scrollTop += row.getBoundingClientRect().top - pop.getBoundingClientRect().top - 6;
      } catch (e) {}
    });
    return;
  }
  requestAnimationFrame(() => {
    try {
      const top = document.elementFromPoint(window.innerWidth / 2, 4);
      const bar =
        top && top.closest
          ? top.closest('header, .topbar, .page-cap, .app-top, [class*="cap"]')
          : null;
      const br = bar ? bar.getBoundingClientRect().bottom : 0;
      const off = (br > 20 && br < 200 ? br : 90) + 8;
      const r = row.getBoundingClientRect();
      pageScroller().scrollBy(0, r.top - off);
    } catch (err) {}
  });
}

const EXTRAS_FMT_ORDER = [
  'commander',
  'paupercommander',
  'duel',
  'predh',
  'standard',
  'pauper',
  'modern',
  'legacy',
  'vintage',
  'premodern',
];

function startupPageOptions() {
  return [{ k: 'home', l: 'Home', i: ICONS.home }].concat(
    primaryNavItems().map((item) => ({
      ...item,
      l: item.l,
    })),
  );
}

function menuToolsHtml(preferences = false) {
  const hints = {
    lifeRow: 'Start or resume a game',
    tradeRow: 'Compare cards and confirm a trade',
    draftRow: 'Seats, timers, pairings and standings',
    crRow: 'Look up rules and ask a question',
    dataSourcesRow: 'Local library, catalogues and refresh controls',
    guildRow: 'Pick your colors',
    fmtRulesRow: 'Read the rules for each format',
    banListsRow: 'Check banned and restricted cards',
    syncRow: 'Keep your devices in sync',
    backupRow: 'Save, restore and recover your decks',
    apkBtn: 'Get the Android app',
  };
  const tile = (id, ico, title, extra) => menuCardHtml(id, ico, title, hints[id], extra);
  const g = GUILDS.find((x) => x.k === state.guild) || GUILDS[0];
  const browser = !(window.matchMedia('(display-mode: standalone)').matches || inAndroidApp());
  if (preferences)
    return /* HTML */ ` <section class="menu-tools hub-actions" aria-label="Preferences">
      <div class="settings-section">
        ${menuCardHtml('startupRow', ICONS.home, 'Startup page', startupPageOptions().find((item) => item.k === state.startupPage)?.l || 'Home')}
        <div id="startupBody" class="menu-tool-body" hidden>
          <p class="hint startup-hint">${'Choose which page opens when you launch the app.'}</p>
          <div class="startup-options" role="group" aria-label="${'Startup page'}">
            ${startupPageOptions()
              .map(
                (item) =>
                  `<label class="startup-option"><input type="radio" name="startupPage" value="${item.k}"${state.startupPage === item.k ? ' checked' : ''}><span class="startup-icon" aria-hidden="true">${item.i}</span><span>${item.l}</span></label>`,
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="settings-section">
        ${tile('dataSourcesRow', ICONS.library, 'Data sources')}
        <div id="dataSourcesBody" class="menu-tool-body" hidden>${dataSourcesHtml()}</div>
      </div>
      ${scannerSettingsHtml()}
      <div class="settings-section">
        <div id="guildBody" class="guild-list xt-body" hidden>
          ${GUILDS.map((x) => `<button type="button" class="guild-opt ${x.k === state.guild ? 'sel' : ''}" data-guild="${x.k}"><span class="guild-swatch" style="--gm:${GUILD_SWATCH[x.main][0]};--gs:${GUILD_SWATCH[x.side][1]};"></span>${manaIconSvg(x.main, 16)}${manaIconSvg(x.side, 16)}<span>${x.n}</span></button>`).join('')}
        </div>
        ${tile('guildRow', `<span id="guildCur">${manaIconSvg(g.main, 22)}${manaIconSvg(g.side, 22)}</span>`, 'Color scheme')}
      </div>
      <div class="settings-section">
        ${tile('syncRow', SYNC_ICON, 'Account & sync', `<div class="l2">${escapeHtml(accountStatusLabel())}</div>`)}
      </div>
      <div class="settings-section">
        <div id="backupBody" class="acc-up xt-body" hidden style="padding:4px 14px 2px;">
          <div class="l2">
            ${'Decks, collection and settings in one file — keep it in your own cloud.'}
          </div>
          <div class="l2" id="lastBackupLine" style="margin-top:5px;">${backupAgeLabel()}</div>
          <div class="l2" style="margin-top:5px;">
            ${
              state._persisted === true
                ? inlIco('shield', 14) + 'Storage protected'
                : state._persisted === false
                  ? inlIco('warn', 14) + 'Storage unprotected — install the app and back up'
                  : 'Checking storage…'
            }
          </div>
          <div style="display:flex;gap:8px;margin:10px 0 4px;">
            <button class="ghost-btn" id="backupBtn" style="padding:9px 12px;font-size:13px;">
              ${inlIco('save')}${'Make a backup'}
            </button>
            <button class="ghost-btn" id="restoreBtn" style="padding:9px 12px;font-size:13px;">
              ${inlIco('restore')}${'Restore'}
            </button>
          </div>
          <button
            class="ghost-btn"
            id="deletedDecksBtn"
            style="padding:9px 12px;font-size:13px;margin:0 0 6px;"
          >
            ${inlIco('restore')}${'Deleted decks'}
          </button>
          <input
            type="file"
            id="restoreFile"
            accept="application/json,.json,application/octet-stream,text/plain"
            style="display:none;"
          />
        </div>
        ${tile('backupRow', ICONS.shield, 'Backup')}
      </div>
      ${settingsChangelogHtml()}
    </section>`;
  return /* HTML */ ` <section class="menu-tools hub-actions" aria-label="Tools">
    <div class="settings-section">${tile('lifeRow', ICONS.heart, 'Life tracker')}</div>
    <div class="settings-section">${tile('tradeRow', ICONS.trade, 'Trade')}</div>
    <div class="settings-section">${tile('draftRow', ICONS.draft, 'Draft tools')}</div>
    <div class="settings-section">${tile('crRow', ICONS.gavel, 'Ask AI judge')}</div>
    <div class="settings-section">${tile('fmtRulesRow', ICONS.library, 'Format rules')}</div>
    <div class="settings-section">${tile('banListsRow', ICONS.ban, 'Ban lists')}</div>
    ${browser && !window.DECKHAND_CONFIG?.selfHosted && /Android/i.test(navigator.userAgent) ? `<div class="settings-section" id="apkRow">${tile('apkBtn', ICONS.phone, 'Android app', '<div class="l2" id="apkNote"></div>')}</div>` : ''}
    <div class="settings-section" id="appFootCell">
      <p class="hint" id="appFootNote" style="text-align:center;line-height:1.45;font-size:11px;">
        Deckhand v${APP_VERSION} · ${'cards'}
        <a href="https://scryfall.com" target="_blank" rel="noopener" style="color:var(--head-ink);"
          >Scryfall</a
        >
        · ${'themes'}
        <a href="https://edhrec.com" target="_blank" rel="noopener" style="color:var(--head-ink);"
          >EDHREC</a
        >
        · ${'prices'} Cardmarket<br />Unofficial Fan Content under the Fan Content Policy. Not
        approved/endorsed by Wizards. © Wizards of the Coast LLC.
      </p>
    </div>
  </section>`;
}

function commanderQuickRulesHtml() {
  return /* HTML */ `<div class="rules-text">
    <ul>
      <li><strong>A four-player format</strong> — free-for-all multiplayer is the default.</li>
      <li>
        <strong>Your Commander</strong> — a legendary creature. Every card in your deck must fit
        within its color identity.
      </li>
      <li>
        <strong>Exactly 100 cards</strong> including the Commander, singleton — except basic lands,
        which are unlimited.
      </li>
      <li>
        <strong>The Commander starts in the command zone</strong> — cast it from there for {2} more
        per previous cast, and it may return there instead of other zones.
      </li>
      <li>
        <strong>Start at 40 life.</strong> Free first mulligan is customary. 21 combat damage from
        one Commander defeats a player.
      </li>
      <li>
        <strong>Legality:</strong> Commander has a wide card pool — almost every standard
        black-bordered card is legal (joke sets like Unhinged aren't), minus the official Commander
        banned list (see the Banned tab — always current).
      </li>
    </ul>
  </div>`;
}

function commanderFullRulesHtml() {
  return /* HTML */ `<div class="rules-text">
    <p>
      <strong>Commander</strong> is a four-player multiplayer format: free-for-all games built
      around a legendary leader.
    </p>
    <p>
      <strong>Your Commander.</strong> A legendary creature. It begins the game in the command zone,
      and you may cast it from there — paying {2} more for each time it was previously cast from the
      command zone this game. If your Commander would leave the battlefield or change zones, you may
      return it to the command zone instead.
    </p>
    <p>
      <strong>Deckbuilding.</strong> Exactly 100 cards including your Commander. Apart from basic
      lands, no two cards may share a name. Every card's color identity — mana symbols in its cost
      and rules text — must fall within your Commander's color identity.
    </p>
    <p>
      <strong>Legality.</strong> Commander has a very wide card pool — almost every standard
      black-bordered card ever printed in paper is legal. Silver-bordered joke cards (Un-sets such
      as Unhinged) and playtest cards are not, and neither are the cards on the official Commander
      banned list — see the Banned List tab, which is fetched live and always current.
    </p>
    <p>
      <strong>Playing.</strong> Players begin at 40 life. The customary free first mulligan applies.
      All normal ways to win and lose apply — and in addition, a player who has been dealt 21 or
      more combat damage by the same Commander over the course of the game loses.
    </p>
    <p>
      <strong>The spirit of the format.</strong> Commander is a social format: talk with your table
      about power level before the game, and aim for games everyone enjoys.
    </p>
  </div>`;
}

function rulesTextHtml() {
  return commanderFullRulesHtml();
}
