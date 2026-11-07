// pages / settings / backup

function backupPayload() {
  // FULL backup: every piece of app data on this device -- decks, folders,
  // collection, settings, mode, learned catalogs -- as the complete set of

  // files stay readable by earlier versions.
  const ls = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.indexOf(LS_PREFIX) === 0 &&
        k !== LS_PREFIX + 'syncState' &&
        k !== LS_PREFIX + 'syncMeta' &&
        k !== LS_PREFIX + 'workspaceReady' &&
        k !== LS_PREFIX + 'migrationNotice'
      )
        ls['admiral_app:' + k.slice(LS_PREFIX.length)] = localStorage.getItem(k);
    }
  } catch (e) {}
  // Decks live in IndexedDB: written into the same key layout, so the file
  // restores on this version and on older ones alike.
  (state.decksIndex || []).forEach((d) => {
    try {
      const c = {};
      Object.keys(d).forEach((k) => {
        if (k !== '_saveStatus') c[k] = d[k];
      });
      ls['admiral_app:deck:' + d.id] = JSON.stringify(slimDeckForSave(c));
    } catch (e) {}
  });
  ls['admiral_app:lastBackup'] = String(Date.now());
  return {
    app: 'deckhand',
    v: 2,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    decks: state.decksIndex.map((d) => {
      const c = {};
      Object.keys(d).forEach((k) => {
        if (k !== '_saveStatus') c[k] = d[k];
      });
      return c;
    }),
    folders: state.folders || [],
    globalTags: (state.globalTags = state.globalTags || loadGlobalTags()),
    ls,
  };
}

function bkN(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function backupFileName() {
  return 'deckhand-backup-' + new Date().toISOString().slice(0, 10) + '.json';
}

function backupStats() {
  const nDecks = (state.decksIndex || []).length;
  const nCards = ((state.collection && state.collection.items) || []).reduce(
    (a, it) => a + (it.qty || 1),
    0,
  );
  return { nDecks, nCards };
}

function backupMarkDone() {
  try {
    localStorage.setItem(LS_PREFIX + 'lastBackup', String(Date.now()));
    localStorage.removeItem(LS_PREFIX + 'backupSnooze');
  } catch (e) {}
  const l = document.getElementById('lastBackupLine');
  if (l) l.textContent = backupAgeLabel();
  document.getElementById('backupNote')?.remove();
  updateBackupBadges();
}

function backupAgeLabel() {
  let last = 0;
  try {
    last = parseInt(localStorage.getItem(LS_PREFIX + 'lastBackup') || '0', 10);
  } catch (e) {}
  if (!last) return 'No backup made yet';
  const d = new Date(last),
    days = Math.floor((Date.now() - last) / 86400000);
  const when = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return 'Last backup: ' + when + (days >= 1 ? ` (${days} d ago)` : '');
}

// Base64 of a long text, in slices (one giant String.fromCharCode overflows).
function b64OfText(t) {
  const u = new TextEncoder().encode(t);
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000)
    bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* "To your cloud or mail": the Android app's own share bridge (APK 4.1+),
   else the browser's file sharing, else a plain download. */
async function backupShare() {
  const json = JSON.stringify(backupPayload()),
    name = backupFileName();
  try {
    if (window.DeckhandExport && typeof window.DeckhandExport.share === 'function') {
      window.DeckhandExport.share(b64OfText(json), 'application/json', name);
      backupMarkDone();
      return 'bridge';
    }
  } catch (e) {}
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      backupMarkDone();
      toast('Backup shared.');
      return 'share';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancel'; // the player closed the sheet
  }
  toast('Sharing is not available here — the backup goes to Downloads.');
  backupDownload(json, name);
  return 'download';
}

function backupDownload(json, name) {
  json = json || JSON.stringify(backupPayload());
  name = name || backupFileName();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  backupMarkDone();
  const st = backupStats();
  toast(
    `Backup saved — ${bkN(st.nDecks, 'deck', 'decks')} and ${bkN(st.nCards, 'card', 'cards')} in one file.`,
  );
}

// Kept for older callers: a full backup straight to Downloads.
function backupAllDecks() {
  backupDownload();
}

/* The choice sheet: cloud/mail first (by the thumb), Downloads second. */
function openBackupSheet() {
  const st = backupStats();
  document.getElementById('backupSheet')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'backupSheet';
  el.style.zIndex = 205;
  el.style.alignItems = 'flex-end';
  // column-reverse sheet: DOM-first = foot.
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet bk-sheet">
    <div class="br-actions bk-actions">
      <button type="button" class="primary-btn" id="bkShare">☁ ${'To your cloud or mail'}</button>
      <button type="button" class="ghost-btn" id="bkSave">⬇ ${'Save to Downloads'}</button>
    </div>
    <div class="bk-hint">
      ${'In the share menu pick, for example, <b>Google Drive</b>, <b>Nextcloud</b>, <b>Dropbox</b> or your <b>mail</b>. To restore: Menu → Settings → Backup → Restore, and pick the file — straight from your cloud too.'}
    </div>
    <div class="br-title">
      <b>${inlIco('save', 16)}${'Make a backup'}</b
      ><span
        >${`${bkN(st.nDecks, 'deck', 'decks')}, ${bkN(st.nCards, 'card', 'cards')} in your collection, binders, Wants, tags and settings — all in one file.`}</span
      ><span>${escapeHtml(backupAgeLabel())}</span>
    </div>
  </div>`;
  brSheetOpen(el, 'backupSheet');
  const close = () => brSheetClose('backupSheet');
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelector('#bkShare').addEventListener('click', async () => {
    close();
    await brAfterPop();
    backupShare();
  });
  el.querySelector('#bkSave').addEventListener('click', async () => {
    close();
    await brAfterPop();
    backupDownload();
  });
}

async function restoreFromFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (e) {
    toast("That file isn't valid JSON.");
    return;
  }
  if (payload && payload.ls && typeof payload.ls === 'object' && !Array.isArray(payload.ls)) {
    // Backup files use the original portable key layout, never an account's
    // local namespace or session credentials. Restore into the current space.
    const portable = {};
    for (const [key, value] of Object.entries(payload.ls)) {
      if (!key.startsWith('admiral_app:')) continue;
      const name = key.slice('admiral_app:'.length);
      if (['syncState', 'syncMeta', 'workspaceReady', 'migrationNotice'].includes(name)) continue;
      portable[LS_PREFIX + name] = value;
    }
    payload.ls = portable;
    // Full backup: replace this device's app data wholesale, then reboot the
    // app so every screen rebuilds from the restored storage.
    const keys = Object.keys(payload.ls).filter((k) => k.indexOf(LS_PREFIX) === 0);

    if (!keys.length) {
      toast('That backup file looks empty.');
      return;
    }
    const when = payload.exportedAt
      ? new Date(payload.exportedAt).toLocaleString('en-GB')
      : 'an unknown date';
    const nDecks = keys.filter((k) => k.indexOf(LS_PREFIX + 'deck:') === 0).length;
    let nCards = 0;
    try {
      const col = JSON.parse(payload.ls[LS_PREFIX + 'collection'] || 'null');
      nCards = ((col && col.items) || []).reduce((a, it) => a + (it.qty || 1), 0);
    } catch (e) {}
    const okFull = await new Promise((res) =>
      openInAppConfirm(
        `Full backup from ${when} — ${bkN(nDecks, 'deck', 'decks')} and ${bkN(nCards, 'card', 'cards')}, plus binders and settings.\n\nRestoring REPLACES everything currently in this app on this device.${ACCOUNT_OWNER ? ' Restored records will sync to your account; cloud-only records are retained.' : ''}`,
        res,
        { danger: true, ok: trS('Restore'), must: true },
      ),
    );
    if (!okFull) return;
    syncUnlink();
    _syncQuiet++;
    try {
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) drop.push(k);
      }
      drop.forEach((k) => localStorage.removeItem(k));
      // Decks go to the deck store (any number fits); everything else back
      // into localStorage. Without IndexedDB, decks fall back to localStorage.
      const deckKeys = keys.filter((k) => k.indexOf(LS_PREFIX + 'deck:') === 0);
      const otherKeys = keys.filter((k) => k.indexOf(LS_PREFIX + 'deck:') !== 0);
      const inDb =
        (await deckDbClear()) && (await deckDbPutMany(deckKeys.map((k) => [k, payload.ls[k]])));
      (inDb ? otherKeys : keys).forEach((k) => localStorage.setItem(k, payload.ls[k]));
      if (ACCOUNT_OWNER) {
        const values = {};
        for (const key of deckKeys) values[key.slice(LS_PREFIX.length)] = payload.ls[key];
        for (const source of SYNC_SOURCES)
          Object.assign(
            values,
            syncProjectStorage(source, localStorage.getItem(LS_PREFIX + source)),
          );
        const restoredAt = Object.values(syncMeta()).reduce(
          (latest, entry) => Math.max(latest, (entry.t || 0) + 1),
          Math.max(Date.now(), _syncClock + 1),
        );
        const meta = Object.fromEntries(Object.keys(values).map((key) => [key, { t: restoredAt }]));
        _lsSetRaw.call(localStorage, LS_PREFIX + 'syncMeta', JSON.stringify(meta));
        _lsSetRaw.call(
          localStorage,
          LS_PREFIX + 'syncState',
          JSON.stringify({
            protocol: 2,
            accountId: ACCOUNT_OWNER,
            email: accountSession?.user?.email || '',
            rev: 0,
            sent: {},
            last: 0,
          }),
        );
      }
    } catch (e) {
      toast('Restore hit a storage error — free some space and try again.');
      return;
    } finally {
      _syncQuiet--;
    }
    toast('Everything restored — reloading…');
    setTimeout(() => {
      try {
        location.reload();
      } catch (e) {}
    }, 700);
    return;
  }
  const decks = Array.isArray(payload) ? payload : payload.decks;
  if (!Array.isArray(decks) || !decks.length) {
    toast('No decks found in that file.');
    return;
  }
  const importedFolders =
    !Array.isArray(payload) && Array.isArray(payload.folders) ? payload.folders : [];
  if (!Array.isArray(payload) && payload.globalTags && typeof payload.globalTags === 'object') {
    const g = ensureGlobalTags();
    Object.entries(payload.globalTags).forEach(([name, list]) => {
      const cur = g[name] || (g[name] = []);
      (Array.isArray(list) ? list : []).forEach((t) => {
        if (t && !cur.some((x) => x.toLowerCase() === String(t).toLowerCase())) cur.push(String(t));
      });
    });
    saveGlobalTags();
  }
  const valid = decks.filter((d) => d && typeof d.name === 'string' && Array.isArray(d.cards));
  if (!valid.length) {
    toast("That file doesn't look like a Deckhand backup.");
    return;
  }
  const replace = state.decksIndex.length
    ? await new Promise((res) =>
        openInAppConfirm(
          `Restore ${valid.length} deck${valid.length > 1 ? 's' : ''} from this file.`,
          res,
          { must: true, ok: trS('Replace all'), cancel: trS('Add alongside') },
        ),
      )
    : true;
  if (replace) {
    await Promise.all(state.decksIndex.map((x) => deleteDeckStorage(x.id)));
    state.decksIndex = [];
    state.activeDeckId = state.searchDeckId = state.inspireDeckId = null;
    state.folders = importedFolders.slice();
    saveFolders();
  } else if (importedFolders.length) {
    const have = new Set((state.folders || []).map((f) => f.id));
    importedFolders.forEach((f) => {
      if (!have.has(f.id)) state.folders.push(f);
    });
    saveFolders();
  }
  const existingIds = new Set(state.decksIndex.map((d) => d.id));
  for (const d of valid) {
    const deck = Object.assign(
      { maybeboard: [], tags: {}, primer: '', admiral: null, createdAt: Date.now() },
      d,
    );
    if (!deck.id || existingIds.has(deck.id)) deck.id = uid(); // avoid clobbering a deck we already have
    existingIds.add(deck.id);
    deck.updatedAt = deck.updatedAt || Date.now();
    delete deck._saveStatus;
    state.decksIndex.push(deck);
    await persistDeck(deck);
  }
  state.decksIndex.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  toast(`Restored ${valid.length} deck${valid.length > 1 ? 's' : ''}.`);
  switchPage('decks');
}

function wirePreferences() {
  wireBackupAndSync();
  wireDataSources();
  document.querySelectorAll('input[name="startupPage"]').forEach((input) =>
    input.addEventListener('change', () => {
      if (!input.checked || !STARTUP_PAGES.includes(input.value)) return;
      state.startupPage = input.value;
      persistSettings();
      const label = startupPageOptions().find((item) => item.k === state.startupPage)?.l;
      const detail = document.querySelector('#startupRow .l2');
      if (detail) detail.textContent = label;
    }),
  );
  document.querySelectorAll('[data-theme-choice]').forEach((b) => {
    b.addEventListener('click', () => {
      state.theme = b.dataset.themeChoice;
      applyTheme();
      persistSettings();
      document
        .querySelectorAll('[data-theme-choice]')
        .forEach((x) => x.classList.toggle('active', x === b));
    });
  });
}

function wireBackupAndSync() {
  document.getElementById('backupBtn').addEventListener('click', () => openBackupSheet());
  document
    .getElementById('restoreBtn')
    .addEventListener('click', () => document.getElementById('restoreFile').click());
  document.getElementById('restoreFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) restoreFromFile(f);
    e.target.value = ''; // let the same file be picked again
  });
  [['backupRow', 'backupBody']].forEach(([r, b]) => {
    const row = document.getElementById(r),
      body = document.getElementById(b);
    if (row && body)
      row.addEventListener('click', (e) => {
        const control = e.target.closest('button, input, label, select');
        if (control && control !== row) return;
        keepAnchored(
          row,
          () => foldToggle(body, null, row),
          () => (row.isConnected ? row : null),
        );
      });
  });
  document.getElementById('syncRow')?.addEventListener('click', () => openSyncSheet());
  document.getElementById('deletedDecksBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeckVersions(null);
  });
}

function wireMenuTools() {
  // A long press on the credits copies the diagnostics (no button needed).
  {
    const fn = document.getElementById('appFootNote');
    if (fn)
      wireTapHold(
        fn,
        () => {},
        () => {
          copyDiagnostics();
        },
        900,
      );
  }
  document.getElementById('diagCopy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(state._inspoDiag, null, 2) +
          '\n\n— App v' +
          APP_VERSION +
          ' — network journal (newest last) —\n' +
          (_sfLog.length ? _sfLog.join('\n') : '(empty)') +
          '\nQueue: hi=' +
          _sfQ.hi.length +
          ' lo=' +
          _sfQ.lo.length +
          ' working=' +
          _sfWorking +
          ' beatAge=' +
          (Date.now() - _sfBeat) +
          'ms',
      );
      toast(trS('Copied.'));
    } catch (e) {
      // Clipboard can be denied — the text is selectable right above as a fallback.
      toast(trS('Could not copy — select the text above instead.'));
    }
  });
  ensureCmdrBans(!((state.cmdrBans || {}).names || []).length);
  document.getElementById('apkUpdBtn')?.addEventListener('click', () => openApkUpdateSheet());
  document.getElementById('lifeRow')?.addEventListener('click', () => switchPage('life'));
  document.getElementById('draftRow')?.addEventListener('click', () => switchPage('draft'));
  document.getElementById('crRow')?.addEventListener('click', openCROverlay);
  document.getElementById('fullRulesToggle')?.addEventListener('click', () => {
    state.settingsFullRulesOpen = !state.settingsFullRulesOpen;
    document.getElementById('fullRulesBody').innerHTML = state.settingsFullRulesOpen
      ? rulesTextHtml()
      : '';
    document.getElementById('fullRulesToggle').textContent =
      (state.settingsFullRulesOpen ? '▾' : '▸') + ' Read the full rules — every mechanic in detail';
  });
  document.querySelectorAll('.ban-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = decodeURIComponent(btn.dataset.name);
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Loading…';
      try {
        const res = await sfFetch(SF_BASE + '/cards/named?fuzzy=' + encodeURIComponent(name));
        if (res.ok) {
          const card = await res.json();
          showPreview(cardImageLarge(card), card.border_color === 'white');
        } else toast("Couldn't find that card on Scryfall.");
      } catch (e) {
        toast("Couldn't reach Scryfall.");
      }
      btn.disabled = false;
      btn.textContent = orig;
    });
  });
  document.querySelectorAll('[data-expand]').forEach((row) => {
    row.addEventListener('click', () => {
      const key = row.dataset.expand === 'rules' ? 'settingsRulesOpen' : 'settingsBanOpen';
      state[key] = !state[key];
      document
        .getElementById(row.dataset.expand === 'rules' ? 'rulesBody' : 'banBody')
        .classList.toggle('collapsed');
      if (
        row.dataset.expand === 'banlist' &&
        (!state.cmdrBans || !state.cmdrBans.names || !state.cmdrBans.names.length)
      )
        ensureCmdrBans(true);
    });
  });
  document.getElementById('apkBtn')?.addEventListener('click', async () => {
    const note = document.getElementById('apkNote');
    if (note && note.textContent && /\u2026$/.test(note.textContent)) return; // already checking

    if (note) note.textContent = 'Checking the file is there\u2026';
    let ok = false,
      ct = '';
    try {
      const r = await fetch('./Deckhand.apk', { method: 'HEAD', cache: 'no-store' });
      ok = r.ok;
      ct = r.headers.get('content-type') || '';
    } catch (e) {}
    if (!ok || /text\/html/i.test(ct)) {
      if (note)
        note.textContent =
          '\u26a0 The APK is not on the site yet \u2014 put Deckhand.apk in the repo root.';
      return;
    }
    if (note)
      note.textContent =
        'Download started \u2014 open the file and allow \u201cunknown apps\u201d once.';
    const a = document.createElement('a');
    a.href = './Deckhand.apk';
    a.download = 'Deckhand.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}
