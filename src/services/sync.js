// services / sync

/* ---- Backup: one file with everything, kept wherever the player likes ----
   No server of our own: the file goes to Android's share sheet (Google
   Drive, Nextcloud, Dropbox, mail ...) or to Downloads, and comes back in
   through the file picker, which reaches the same clouds. */
/* ===================== 1.26 SYNC BETWEEN DEVICES =====================
   A link code ties devices together; Netlify Blobs (functions/sync.mjs)
   keeps one shared document. Every synced piece -- each deck, the
   collection, folders, tags, printings, settings -- carries the time this
   device last changed it; the newest change wins, piece by piece.
   A probe every few minutes costs a few bytes; data only moves when
   something changed. Caches, prices and device-only switches never sync. */
const SYNC_KEYS = new Set([
  'collection',
  'folders',
  'globalTags',
  'printPrefs',
  'printPrefsPlaced',
  'trade',
  'priceWatch',
  'draftNames',
  'authorName',
  'lang',
  'settings:app',
  'budgetFloor',
  'lifeFmt',
]);

const SYNC_URL = '/.netlify/functions/sync';

let _syncQuiet = 0,
  _syncTimer = null,
  _syncBusy = false,
  _syncMetaT = null;

const _lsSetRaw = Storage.prototype.setItem,
  _lsDelRaw = Storage.prototype.removeItem;

function syncState() {
  if (!state._syncSt) {
    try {
      state._syncSt = JSON.parse(localStorage.getItem(LS_PREFIX + 'syncState') || 'null');
    } catch (e) {}
  }
  return state._syncSt || null;
}

function syncSaveState() {
  try {
    _lsSetRaw.call(localStorage, LS_PREFIX + 'syncState', JSON.stringify(state._syncSt || null));
  } catch (e) {}
}

function syncMeta() {
  if (!state._syncMeta) {
    try {
      state._syncMeta = JSON.parse(localStorage.getItem(LS_PREFIX + 'syncMeta') || '{}') || {};
    } catch (e) {
      state._syncMeta = {};
    }
  }
  return state._syncMeta;
}

function syncSaveMeta() {
  clearTimeout(_syncMetaT);
  _syncMetaT = setTimeout(() => {
    try {
      _lsSetRaw.call(localStorage, LS_PREFIX + 'syncMeta', JSON.stringify(syncMeta()));
    } catch (e) {}
  }, 300);
}

function syncNoteChange(k, del) {
  if (_syncQuiet) return;
  const m = syncMeta();
  m[k] = del ? { t: Date.now(), d: 1 } : { t: Date.now() };
  syncSaveMeta();
  if (syncState()) syncSoon(6000);
}

function syncTouchDeck(id, del) {
  if (id) syncNoteChange('deck:' + id, del);
}

// Every write to a synced key is noted (decks are noted where they are saved).
try {
  Storage.prototype.setItem = function (k, v) {
    _lsSetRaw.call(this, k, v);
    try {
      if (
        this === window.localStorage &&
        typeof k === 'string' &&
        k.indexOf(LS_PREFIX) === 0 &&
        SYNC_KEYS.has(k.slice(LS_PREFIX.length))
      )
        syncNoteChange(k.slice(LS_PREFIX.length), false);
    } catch (e) {}
  };
  Storage.prototype.removeItem = function (k) {
    _lsDelRaw.call(this, k);
    try {
      if (
        this === window.localStorage &&
        typeof k === 'string' &&
        k.indexOf(LS_PREFIX) === 0 &&
        SYNC_KEYS.has(k.slice(LS_PREFIX.length))
      )
        syncNoteChange(k.slice(LS_PREFIX.length), true);
    } catch (e) {}
  };
} catch (e) {}

function syncSoon(ms) {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    syncRun('change');
  }, ms || 6000);
}

function syncNewCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let c = '';
  for (let i = 0; i < 16; i++) c += A[b[i] % 32];
  return c.match(/.{4}/g).join('-');
}

function syncCleanCode(c) {
  return String(c || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function syncNiceCode(c) {
  const x = syncCleanCode(c);
  return (x.match(/.{1,4}/g) || []).join('-');
}

async function syncCall(body) {
  const st = syncState();
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ code: st && st.code }, body)),
      signal: ctl.signal,
      cache: 'no-store',
    });
    let j = null;
    try {
      j = await r.json();
    } catch (e) {}
    if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || 'http ' + r.status);
    return j;
  } finally {
    clearTimeout(to);
  }
}

// The current value of a synced piece on this device (null = gone).
function syncValueOf(k) {
  if (k.indexOf('deck:') === 0) {
    const d = (state.decksIndex || []).find((x) => x.id === k.slice(5));
    if (!d) return null;
    const c = {};
    Object.keys(d).forEach((x) => {
      if (x !== '_saveStatus') c[x] = d[x];
    });
    return JSON.stringify(slimDeckForSave(c));
  }
  try {
    return localStorage.getItem(LS_PREFIX + k);
  } catch (e) {
    return null;
  }
}

function syncPending() {
  const st = syncState(),
    m = syncMeta(),
    out = {};
  if (!st) return out;
  const sent = st.sent || {};
  Object.keys(m).forEach((k) => {
    if (!k.startsWith('deck:') && !SYNC_KEYS.has(k)) return;
    if (!(m[k].t > (sent[k] || 0))) return;
    const v = m[k].d ? null : syncValueOf(k);
    out[k] = v == null ? { t: m[k].t, del: 1 } : { t: m[k].t, v };
  });
  return out;
}

// Note every piece already on this device, so a new link carries it.
// t = 1 (the creator: "old but present"); t = 0.5 for a device that joins, so
// anything the cloud already holds wins, and what only this device has is
// still sent up.
function syncSeed(t) {
  const m = syncMeta();
  (state.decksIndex || []).forEach((d) => {
    const k = 'deck:' + d.id;
    if (!m[k]) m[k] = { t };
  });
  SYNC_KEYS.forEach((k) => {
    try {
      if (!m[k] && localStorage.getItem(LS_PREFIX + k) != null) m[k] = { t };
    } catch (e) {}
  });
  syncSaveMeta();
}

async function syncApply(changes) {
  const m = syncMeta(),
    keys = Object.keys(changes || {});
  let decks = 0,
    other = new Set();
  _syncQuiet++;
  try {
    for (const k of keys) {
      const c = changes[k];
      if (m[k] && !(c.t > m[k].t)) continue; // ours is as new or newer
      if (k.indexOf('deck:') === 0) {
        const id = k.slice(5);
        const i = (state.decksIndex || []).findIndex((x) => x.id === id);
        if (c.del) {
          if (i >= 0) dvNoteDeck(state.decksIndex[i], 'deleted');
          if (i >= 0) state.decksIndex.splice(i, 1);
          if (state.activeDeckId === id) state.activeDeckId = null;
          try {
            await deleteDeckStorage(id);
          } catch (e) {}
        } else {
          let d = null;
          try {
            d = JSON.parse(c.v);
          } catch (e) {}
          if (!d || !d.id) continue;
          if (i >= 0) dvNoteDeck(state.decksIndex[i], 'presync'); // 1.27: what was here, kept
          dvNote(d.id, d.name, 'sync', c.v, (d.cards || []).length);
          if (i >= 0) state.decksIndex[i] = d;
          else state.decksIndex.push(d);
          try {
            if (!(await deckDbPutMany([[LS_PREFIX + k, c.v]])))
              localStorage.setItem(LS_PREFIX + k, c.v);
          } catch (e) {}
        }
        decks++;
      } else if (SYNC_KEYS.has(k)) {
        try {
          if (c.del) localStorage.removeItem(LS_PREFIX + k);
          else localStorage.setItem(LS_PREFIX + k, c.v);
        } catch (e) {}
        other.add(k);
      } else continue;
      m[k] = c.del ? { t: c.t, d: 1 } : { t: c.t };
      const st = syncState();
      if (st) {
        st.sent = st.sent || {};
        st.sent[k] = c.t;
      }
    }
  } finally {
    _syncQuiet--;
  }
  syncSaveMeta();
  if (!decks && !other.size) return 0;
  // the app's memory follows its storage
  try {
    if (other.has('collection')) state.collection = loadCollection();
  } catch (e) {}
  try {
    if (other.has('folders')) state.folders = loadFolders();
  } catch (e) {}
  try {
    if (other.has('globalTags')) state.globalTags = loadGlobalTags();
  } catch (e) {}
  try {
    if (other.has('printPrefs')) state._printPrefs = null;
  } catch (e) {}
  try {
    if (other.has('settings:app')) loadSettings();
  } catch (e) {}
  try {
    state._ownedSet = null;
  } catch (e) {}
  if (decks)
    try {
      state.decksIndex.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (e) {}
  return decks + other.size;
}

/* One round: a few-byte probe when nothing changed here; otherwise send
   what changed and take back what changed elsewhere, in pages. */
async function syncRun(why) {
  const st = syncState();
  if (!st || !st.code || _syncBusy) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  _syncBusy = true;
  let got = 0;
  try {
    let pend = syncPending();
    if (!Object.keys(pend).length) {
      const pr = await syncCall({ op: 'probe' });
      if ((pr.rev || 0) === (st.rev || 0)) {
        st.last = Date.now();
        syncSaveState();
        return 0;
      }
    }
    // send in parcels of ~3 MB
    const parcels = [];
    let cur = {},
      size = 0;
    Object.keys(pend).forEach((k) => {
      const len = (pend[k].v ? pend[k].v.length : 0) + 60;
      if (size && size + len > 3000000) {
        parcels.push(cur);
        cur = {};
        size = 0;
      }
      cur[k] = pend[k];
      size += len;
    });
    parcels.push(cur);
    const since = st.rev || 0;
    let res = null;
    for (const parcel of parcels) {
      res = await syncCall({ op: 'sync', since, changes: parcel });
      st.sent = st.sent || {};
      Object.keys(parcel).forEach((k) => {
        st.sent[k] = parcel[k].t;
      });
      got += await syncApply(res.changes);
      syncSaveState();
    }
    let guard = 0;
    while (res && res.more && guard++ < 50) {
      res = await syncCall({ op: 'sync', since, changes: {}, after: res.more });
      got += await syncApply(res.changes);
    }
    st.rev = res ? res.rev || 0 : st.rev;
    st.last = Date.now();
    st.err = null;
    syncSaveState();
    if (got) {
      const typing =
        document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (!state.overlayStack.length && !typing) {
        try {
          render();
        } catch (e) {}
      }
      if (why !== 'start' || got) toast('☁ Updated from your other device.');
    }
    // more changes may have come in while this round ran
    if (Object.keys(syncPending()).length) syncSoon(4000);
    return got;
  } catch (e) {
    st.err = String((e && e.message) || e);
    syncSaveState();
    return null;
  } finally {
    _syncBusy = false;
    const lb = document.getElementById('syncLastLine');
    if (lb) lb.textContent = syncLastLabel();
  }
}

function syncLastLabel() {
  const st = syncState();
  if (!st) return '';
  if (st.err && /code|store|404|http 5/.test(st.err))
    return '⚠ Sync is not working yet (' + st.err + ')';
  if (!st.last) return 'Not synced yet';
  const min = Math.round((Date.now() - st.last) / 60000);
  return (
    'Last synced: ' +
    (min < 1
      ? 'just now'
      : min < 60
        ? min + ' min'
        : new Date(st.last).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }))
  );
}

async function syncLink(code, creator) {
  state._syncSt = { code: syncCleanCode(code), rev: 0, sent: {}, last: 0, at: Date.now() };
  syncSaveState();
  syncSeed(creator ? 1 : 0.5);
  const r = await syncRun('link');
  return r;
}

function syncUnlink() {
  state._syncSt = null;
  try {
    _lsDelRaw.call(localStorage, LS_PREFIX + 'syncState');
  } catch (e) {}
}

// Background rhythm: at start, when the app comes back into view, and a
// tiny probe every three minutes while it is open.
setInterval(() => {
  if (document.visibilityState === 'visible' && syncState()) syncRun('tick');
}, 180000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && syncState()) syncSoon(800);
});

window.addEventListener('online', () => {
  if (syncState()) syncSoon(1500);
});

/* Extras -> Sync: link this device, show the code, sync now, unlink. */
function openSyncSheet() {
  const st = syncState();
  document.getElementById('syncSheet')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'syncSheet';
  el.style.zIndex = 205;
  el.style.alignItems = 'flex-end';
  const body = st
    ? `
    <div class="br-actions bk-actions">
      <button type="button" class="primary-btn" id="syncNow">↻ ${'Sync now'}</button>
      <button type="button" class="ghost-btn" id="syncShare">${'Share or copy the code'}</button>
      <button type="button" class="ghost-btn" id="syncOff">${'Unlink this device'}</button>
    </div>
    <div class="bk-hint">${'Enter this code on your other device: Menu → Settings → Sync → <b>I already have a code</b>. Keep it to yourself: whoever has it sees your decks and collection.'}</div>
    <div class="sync-code" id="syncCodeTxt">${escapeHtml(syncNiceCode(st.code))}</div>
    <div class="br-title"><b>☁ ${'Linked'}</b><span id="syncLastLine">${escapeHtml(syncLastLabel())}</span></div>`
    : `
    <div class="br-actions bk-actions">
      <button type="button" class="primary-btn" id="syncNew">＋ ${'Start a new link'}</button>
      <button type="button" class="ghost-btn" id="syncJoin">${'I already have a code'}</button>
    </div>
    <div class="bk-hint">${'<b>First device:</b> start a new link — you get a code.<br><b>Next devices:</b> choose “I already have a code”. There, what the cloud already holds wins; decks that exist only on that device are kept. Make a backup first, to be safe.'}</div>
    <div class="br-title"><b>☁ ${'Sync between devices'}</b><span>${'Decks, collection, binders, tags and settings — on your phone, tablet and PC at once.'}</span></div>`;
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet bk-sheet">${body}</div>`;
  brSheetOpen(el, 'syncSheet');
  const close = () => brSheetClose('syncSheet');
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  const busy = (b, on) => {
    if (b) {
      b.disabled = on;
      b.style.opacity = on ? '0.6' : '';
    }
  };
  const report = (r) => {
    const s2 = syncState();
    if (r === null && s2 && s2.err) toast('⚠ Sync failed: ' + s2.err);
    else toast('☁ Synced.');
  };
  el.querySelector('#syncNew')?.addEventListener('click', async (e) => {
    busy(e.currentTarget, true);
    const r = await syncLink(syncNewCode(), true);
    report(r);
    close();
    await brAfterPop();
    openSyncSheet();
  });
  el.querySelector('#syncJoin')?.addEventListener('click', async () => {
    close();
    await brAfterPop();
    openInAppPrompt('Link code', 'XXXX-XXXX-XXXX-XXXX', '', async (v) => {
      if (v == null) return;
      if (syncCleanCode(v).length !== 16) {
        toast('That code is not right — 16 characters.');
        return;
      }
      toast('☁ Linking…');
      const r = await syncLink(v, false);
      report(r);
      openSyncSheet();
    });
  });
  el.querySelector('#syncNow')?.addEventListener('click', async (e) => {
    busy(e.currentTarget, true);
    const r = await syncRun('manual');
    busy(e.currentTarget, false);
    report(r);
  });
  el.querySelector('#syncShare')?.addEventListener('click', async () => {
    const code = syncNiceCode(syncState().code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Deckhand sync', text: code });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast('Code copied.');
    } catch (err) {
      toast(code);
    }
  });
  el.querySelector('#syncOff')?.addEventListener('click', () => {
    openInAppConfirm(
      'This device stops syncing. Everything on it now stays.',
      (ok) => {
        if (!ok) return;
        syncUnlink();
        close();
        toast('Unlinked.');
      },
      { ok: 'Unlink' },
    );
  });
}
