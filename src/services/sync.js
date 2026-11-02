// Code-only sync with this app's server. SQLite is the shared source; the
// browser remains usable offline. Each deck, collection row, preference,
// folder and saved game is a separate last-change-wins record.
const SYNC_KEYS = new Set(SYNC_SOURCES);
const SYNC_URL = '/api/sync';
const _lsSetRaw = Storage.prototype.setItem;
const _lsDelRaw = Storage.prototype.removeItem;
let _syncQuiet = 0,
  _syncTimer = null,
  _syncBusy = false,
  _syncLinking = false,
  _syncGeneration = 0;
let _syncController = null,
  _syncClock = 0;

function syncState() {
  if (state._syncSt === undefined) {
    try {
      state._syncSt = JSON.parse(localStorage.getItem(LS_PREFIX + 'syncState') || 'null');
    } catch {
      state._syncSt = null;
    }
  }
  return state._syncSt || null;
}

function syncSaveState() {
  _lsSetRaw.call(localStorage, LS_PREFIX + 'syncState', JSON.stringify(state._syncSt || null));
  syncPaintStatus();
}

function syncPaintStatus() {
  const label = document.querySelector('#syncRow .hub-copy > div.l2');
  if (label)
    label.textContent = syncState() ? 'Linked to this server' : 'Link your devices with a code';
}

function syncMeta() {
  if (!state._syncMeta) {
    try {
      state._syncMeta = JSON.parse(localStorage.getItem(LS_PREFIX + 'syncMeta') || '{}');
    } catch {
      state._syncMeta = {};
    }
  }
  return state._syncMeta;
}

function syncSaveMeta() {
  // Merge writes from another tab before storing, and flush immediately so
  // closing the app cannot lose an offline edit's change marker.
  let fresh = {};
  try {
    fresh = JSON.parse(localStorage.getItem(LS_PREFIX + 'syncMeta') || '{}');
  } catch {}
  const meta = syncMeta();
  for (const [key, value] of Object.entries(fresh))
    if (syncRecordAllowed(key) && value.t > (meta[key]?.t || 0)) meta[key] = value;
  _lsSetRaw.call(localStorage, LS_PREFIX + 'syncMeta', JSON.stringify(meta));
}

function syncNoteChanges(changes) {
  if (_syncQuiet || !changes.length) return;
  const meta = syncMeta();
  _syncClock = Math.max(
    Date.now(),
    _syncClock + 1,
    ...changes.map(([key]) => (meta[key]?.t || 0) + 1),
  );
  for (const [key, deleted] of changes)
    if (syncRecordAllowed(key)) meta[key] = deleted ? { t: _syncClock, d: 1 } : { t: _syncClock };
  syncSaveMeta();
  if (syncState()) syncSoon(1500);
}

function syncTouchDeck(id, deleted) {
  if (id) syncNoteChanges([['deck:' + id, deleted]]);
}

function syncTrackStorage(source, before, after) {
  if (_syncQuiet || !SYNC_KEYS.has(source) || before === after) return;
  let old, next;
  try {
    next = syncProjectStorage(source, after);
  } catch {
    // Let the normal loader recover malformed local data; never upload it.
    return;
  }
  try {
    old = syncProjectStorage(source, before);
  } catch {
    old = Object.create(null);
  }
  const rotatingGames =
    source === 'lifeSaves' &&
    Object.keys(next).length >= 10 &&
    Object.keys(next).some((key) => !Object.hasOwn(old, key));
  const changes = [];
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    if (old[key] === next[key]) continue;
    // The Life page keeps the ten most recent games locally. Evicting an
    // older game from that view must not erase another device's save.
    if (rotatingGames && !Object.hasOwn(next, key)) continue;
    changes.push([key, !Object.hasOwn(next, key)]);
  }
  syncNoteChanges(changes);
}

try {
  Storage.prototype.setItem = function (key, value) {
    const tracked =
      this === window.localStorage &&
      typeof key === 'string' &&
      key.startsWith(LS_PREFIX) &&
      SYNC_KEYS.has(key.slice(LS_PREFIX.length));
    const before = tracked ? this.getItem(key) : null;
    _lsSetRaw.call(this, key, value);
    if (tracked) syncTrackStorage(key.slice(LS_PREFIX.length), before, String(value));
  };
  Storage.prototype.removeItem = function (key) {
    const tracked =
      this === window.localStorage &&
      typeof key === 'string' &&
      key.startsWith(LS_PREFIX) &&
      SYNC_KEYS.has(key.slice(LS_PREFIX.length));
    const before = tracked ? this.getItem(key) : null;
    _lsDelRaw.call(this, key);
    if (tracked) syncTrackStorage(key.slice(LS_PREFIX.length), before, null);
  };
} catch {}

function syncSoon(ms = 1500) {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => syncRun('change'), ms);
}

function syncCleanCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');
}
function syncNiceCode(code) {
  return (syncCleanCode(code).match(/.{1,4}/g) || []).join('-');
}

async function syncCall(body, code = syncState()?.code, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 30000);
  try {
    const response = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, ...(code ? { code } : {}) }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'http ' + response.status);
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function syncSnapshot() {
  const out = Object.create(null);
  for (const deck of state.decksIndex || []) {
    const clean = { ...deck };
    delete clean._saveStatus;
    out['deck:' + deck.id] = JSON.stringify(slimDeckForSave(clean));
  }
  for (const source of SYNC_SOURCES) {
    let raw = localStorage.getItem(LS_PREFIX + source);
    if (source === 'settings:app' && raw == null)
      raw = JSON.stringify({
        theme: state.theme,
        guild: state.guild,
        startupPage: state.startupPage,
      });
    Object.assign(out, syncProjectStorage(source, raw));
  }
  return out;
}

async function syncReadSnapshot() {
  let persisted;
  // A local save may finish while IndexedDB is returning an older read.
  // Retry in that case so each value travels with its own change marker.
  for (;;) {
    while (deckStorageJobs.size) await Promise.all([...deckStorageJobs.values()]);
    const before = JSON.stringify(
      Object.entries(syncMeta()).filter(([key]) => key.startsWith('deck:')),
    );
    persisted = await deckDbAll();
    const after = JSON.stringify(
      Object.entries(syncMeta()).filter(([key]) => key.startsWith('deck:')),
    );
    if (!deckStorageJobs.size && before === after) break;
  }
  const snapshot = syncSnapshot();
  // IndexedDB is authoritative for saved decks, including edits from another
  // tab. Do not publish a stale in-memory copy under that tab's new timestamp.
  for (const key of Object.keys(snapshot)) if (key.startsWith('deck:')) delete snapshot[key];
  for (const [key, raw] of Object.entries(persisted || {})) {
    const name = key.startsWith(LS_PREFIX) ? key.slice(LS_PREFIX.length) : key;
    if (name.startsWith('deck:'))
      snapshot[name] = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LS_PREFIX + 'deck:') && snapshot[key.slice(LS_PREFIX.length)] == null)
      snapshot[key.slice(LS_PREFIX.length)] = localStorage.getItem(key);
  }
  return { values: snapshot, meta: JSON.parse(JSON.stringify(syncMeta())) };
}

function syncValueOf(key) {
  return syncSnapshot()[key] ?? null;
}

function syncPending(snapshot = syncSnapshot(), metadata = syncMeta()) {
  const linked = syncState(),
    out = Object.create(null);
  if (!linked) return out;
  for (const [key, meta] of Object.entries(metadata)) {
    if (!syncRecordAllowed(key) || !(meta.t > (linked.sent?.[key] || 0))) continue;
    // A saved game may have aged out of the device's ten-game view.
    if (key.startsWith('saved-game:') && !meta.d && snapshot[key] == null) continue;
    out[key] =
      meta.d || snapshot[key] == null ? { t: meta.t, del: 1 } : { t: meta.t, v: snapshot[key] };
  }
  return out;
}

function syncSeed(t, snapshot = syncSnapshot()) {
  const meta = syncMeta();
  for (const key of Object.keys(snapshot))
    if (syncRecordAllowed(key) && !meta[key]) meta[key] = { t };
  syncSaveMeta();
}

function syncSessionValid(linked, generation) {
  if (syncState() !== linked || generation !== _syncGeneration) throw new Error('cancelled');
}

async function syncApply(changes, linked = syncState(), generation = _syncGeneration) {
  if (!linked) return 0;
  const meta = syncMeta();
  let applied = 0;
  const rest = {};
  for (const [key, change] of Object.entries(changes || {})) {
    if (
      !syncRecordAllowed(key) ||
      !change ||
      !Number.isFinite(change.t) ||
      (!change.del && !syncRecordValid(key, change.v))
    )
      continue;
    syncSessionValid(linked, generation);
    if ((meta[key]?.t || 0) > change.t) continue;
    if (!key.startsWith('deck:')) {
      rest[key] = change;
      continue;
    }
    const id = key.slice(5);
    await syncFlushDeck(id);
    syncSessionValid(linked, generation);
    if ((meta[key]?.t || 0) > change.t) continue;
    const index = state.decksIndex.findIndex((deck) => deck.id === id);
    const deck = index >= 0 ? state.decksIndex[index] : null;
    const value = change.del ? null : JSON.parse(change.v);
    const clean = deck ? { ...deck } : null;
    if (clean) delete clean._saveStatus;
    const identical = !change.del && clean && JSON.stringify(slimDeckForSave(clean)) === change.v;
    if (!identical) {
      if (deck) await dvNoteDeck(deck, change.del ? 'deleted' : 'presync');
      syncSessionValid(linked, generation);
      if ((meta[key]?.t || 0) > change.t) continue;
      if (change.del) {
        await deckDbDelete(LS_PREFIX + key);
        _lsDelRaw.call(localStorage, LS_PREFIX + key);
        await syncFlushDeck(id);
        syncSessionValid(linked, generation);
        if ((meta[key]?.t || 0) > change.t) {
          const latest = state.decksIndex.find((item) => item.id === id);
          if (latest) await persistDeck(latest);
          continue;
        }
        const currentIndex = state.decksIndex.findIndex((item) => item.id === id);
        if (currentIndex >= 0) state.decksIndex.splice(currentIndex, 1);
        if (state.activeDeckId === id) state.activeDeckId = null;
      } else {
        if (!(await deckDbPutMany([[LS_PREFIX + key, change.v]])))
          _lsSetRaw.call(localStorage, LS_PREFIX + key, change.v);
        await syncFlushDeck(id);
        syncSessionValid(linked, generation);
        if ((meta[key]?.t || 0) > change.t) {
          const latest = state.decksIndex.find((item) => item.id === id);
          if (latest) await persistDeck(latest);
          else await deckDbDelete(LS_PREFIX + key);
          continue;
        }
        const currentIndex = state.decksIndex.findIndex((item) => item.id === id);
        if (currentIndex >= 0) state.decksIndex[currentIndex] = value;
        else state.decksIndex.push(value);
      }
      applied++;
    }
    meta[key] = change.del ? { t: change.t, d: 1 } : { t: change.t };
    linked.sent[key] = change.t;
  }
  // Re-read after asynchronous deck writes so an edit made while they were
  // saving is considered before applying collection/settings/game records.
  const snapshot = syncSnapshot(),
    sources = new Set();
  for (const [key, change] of Object.entries(rest)) {
    syncSessionValid(linked, generation);
    if ((meta[key]?.t || 0) > change.t) continue;
    const value = change.del ? undefined : change.v;
    if (snapshot[key] !== value) {
      if (change.del) delete snapshot[key];
      else snapshot[key] = value;
      sources.add(syncRecordSource(key));
      applied++;
    }
  }
  for (const source of sources) {
    const value = syncRestoreStorage(source, snapshot, localStorage.getItem(LS_PREFIX + source));
    if (value == null) _lsDelRaw.call(localStorage, LS_PREFIX + source);
    else _lsSetRaw.call(localStorage, LS_PREFIX + source, value);
  }
  for (const [key, change] of Object.entries(rest)) {
    if ((meta[key]?.t || 0) > change.t) continue;
    meta[key] = change.del ? { t: change.t, d: 1 } : { t: change.t };
    linked.sent[key] = change.t;
  }
  if (sources.has('collection')) state.collection = loadCollection();
  if (sources.has('folders')) state.folders = loadFolders();
  if (sources.has('globalTags')) state.globalTags = loadGlobalTags();
  if (sources.has('printPrefs')) state._printPrefs = null;
  if (sources.has('trade')) {
    state.trade = null;
    loadTrade();
  }
  if (sources.has('priceWatch')) state._pw = null;
  if (sources.has('settings:app')) {
    state.theme = 'dark';
    state.guild = 'izzet';
    await loadSettings();
  }
  state._ownedSet = null;
  state.decksIndex.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  syncSaveMeta();
  return applied;
}

async function syncFlushDeck(id) {
  await waitForDeckStorage(id);
  const deck = state.decksIndex.find((item) => item.id === id);
  if (deck?._saveStatus === 'saving') {
    clearTimeout(saveTimers[id]);
    await persistDeck(deck);
    deck._saveStatus = 'saved';
  }
}

async function syncFlushDecks() {
  for (const deck of state.decksIndex || []) await syncFlushDeck(deck.id);
}

async function syncRun(why = 'manual') {
  const linked = syncState(),
    generation = _syncGeneration;
  if (!linked?.code || _syncBusy || !state.homeLoaded || navigator.onLine === false) return null;
  _syncBusy = true;
  _syncController = new AbortController();
  let applied = 0;
  try {
    await syncFlushDecks();
    const captured = await syncReadSnapshot();
    const snapshot = captured.values;
    syncSessionValid(linked, generation);
    if (linked.protocol !== 2) {
      const old = syncMeta();
      state._syncMeta = {};
      // Old links keep their code and data, but restart the revision stream
      // after converting monolithic collection/settings records.
      for (const key of Object.keys(snapshot))
        state._syncMeta[key] = { t: old[key]?.t || old[syncRecordSource(key)]?.t || 1 };
      for (const [key, entry] of Object.entries(old))
        if (syncRecordAllowed(key) && entry.d) state._syncMeta[key] = entry;
      _lsSetRaw.call(localStorage, LS_PREFIX + 'syncMeta', JSON.stringify(state._syncMeta));
      linked.protocol = 2;
      linked.rev = 0;
      linked.sent = {};
      captured.meta = JSON.parse(JSON.stringify(syncMeta()));
    }
    const pending = syncPending(snapshot, captured.meta);
    if (!Object.keys(pending).length) {
      const probe = await syncCall({ op: 'probe' }, linked.code, _syncController.signal);
      syncSessionValid(linked, generation);
      if (probe.rev === linked.rev) {
        linked.last = Date.now();
        linked.err = null;
        syncSaveState();
        if (Object.keys(syncPending()).length) syncSoon(1500);
        return 0;
      }
    }
    const parcels = [];
    let parcel = {},
      bytes = 0;
    for (const [key, value] of Object.entries(pending)) {
      const length = new TextEncoder().encode(JSON.stringify(value)).length + key.length;
      if (bytes && bytes + length > 3_000_000) {
        parcels.push(parcel);
        parcel = {};
        bytes = 0;
      }
      parcel[key] = value;
      bytes += length;
    }
    parcels.push(parcel);
    const since = linked.rev || 0;
    let response;
    for (const changes of parcels) {
      response = await syncCall(
        { op: 'sync', since, changes },
        linked.code,
        _syncController.signal,
      );
      syncSessionValid(linked, generation);
      applied += await syncApply({ ...response.changes, ...response.current }, linked, generation);
      for (const [key, value] of Object.entries(changes))
        linked.sent[key] = Math.max(linked.sent[key] || 0, value.t);
      syncSaveState();
    }
    let pages = 0;
    while (response.more) {
      if (++pages > 100) throw new Error('pagination');
      response = await syncCall(
        { op: 'sync', since, after: response.more },
        linked.code,
        _syncController.signal,
      );
      syncSessionValid(linked, generation);
      applied += await syncApply(response.changes, linked, generation);
      syncSaveState();
    }
    linked.rev = response.rev;
    linked.last = Date.now();
    linked.err = null;
    syncSaveState();
    if (
      applied &&
      !state.overlayStack.length &&
      !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)
    )
      render();
    if (Object.keys(syncPending()).length) syncSoon(1500);
    return applied;
  } catch (error) {
    if (generation === _syncGeneration && syncState() === linked) {
      linked.err = error.name === 'AbortError' ? 'connection' : error.message;
      syncSaveState();
    }
    return null;
  } finally {
    _syncBusy = false;
    _syncController = null;
    const label = document.getElementById('syncLastLine');
    if (label) label.textContent = syncLastLabel();
  }
}

function syncLastLabel() {
  const linked = syncState();
  if (!linked) return 'Not linked';
  if (linked.err === 'code_not_found') return 'This code was not found on this server.';
  if (linked.err) return 'Sync could not connect. Your local changes are kept for retry.';
  if (!linked.last) return 'Not synced yet';
  return 'Last synced: ' + new Date(linked.last).toLocaleString('en-GB');
}

async function syncLink(code, creator = false) {
  if (_syncBusy || _syncLinking) throw new Error('Sync is already running.');
  if (!creator && !/^[A-Z0-9]{16,40}$/.test(syncCleanCode(code))) throw new Error('code');
  _syncLinking = true;
  const generation = _syncGeneration;
  try {
    if (!state.homeLoaded) await loadDecksIndex();
    await syncFlushDecks();
    const response = await syncCall(
      { op: creator ? 'create' : 'probe' },
      creator ? null : syncCleanCode(code),
    );
    const { values: snapshot } = await syncReadSnapshot();
    if (_syncGeneration !== generation) throw new Error('cancelled');
    _syncGeneration++;
    state._syncSt = {
      protocol: 2,
      code: syncCleanCode(creator ? response.code : code),
      rev: 0,
      sent: {},
      last: 0,
    };
    state._syncMeta = {};
    _lsSetRaw.call(localStorage, LS_PREFIX + 'syncMeta', '{}');
    syncSeed(creator ? 1 : 0.5, { ...snapshot, ...syncSnapshot() });
    syncSaveState();
    return await syncRun('link');
  } finally {
    _syncLinking = false;
  }
}

function syncUnlink() {
  _syncGeneration++;
  clearTimeout(_syncTimer);
  _syncController?.abort();
  state._syncSt = null;
  _lsDelRaw.call(localStorage, LS_PREFIX + 'syncState');
  syncPaintStatus();
}

async function syncStart() {
  if (syncState()) return syncRun('start');
}
setInterval(() => {
  if (document.visibilityState === 'visible' && syncState()) syncRun('tick');
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && syncState()) syncSoon(500);
});
window.addEventListener('online', () => {
  if (syncState()) syncSoon(500);
});
window.addEventListener('storage', (event) => {
  if (event.key === LS_PREFIX + 'syncMeta') {
    let incoming = {};
    try {
      incoming = JSON.parse(event.newValue || '{}');
    } catch {}
    const meta = syncMeta();
    for (const [key, entry] of Object.entries(incoming || {}))
      if (syncRecordAllowed(key) && entry.t > (meta[key]?.t || 0)) meta[key] = entry;
    if (syncState()) syncSoon(1000);
  }
  if (event.key === LS_PREFIX + 'syncState') {
    let linked = null;
    try {
      linked = JSON.parse(event.newValue || 'null');
    } catch {}
    if ((linked?.code || null) !== (syncState()?.code || null)) {
      _syncGeneration++;
      _syncController?.abort();
      state._syncSt = linked;
      state._syncMeta = null;
      syncPaintStatus();
      if (linked) syncSoon(1000);
    }
  }
});

function openSyncSheet() {
  const linked = syncState();
  document.getElementById('syncSheet')?.remove();
  const root = document.createElement('div');
  root.id = 'syncSheet';
  root.className = 'deckpick-scrim';
  root.innerHTML = /* HTML */ `<section
    class="deckpick transfer-dialog sync-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Sync devices"
  >
    ${transferHeaderHtml('Sync devices', 'Decks, collection, settings, and saved games.', 'syncClose')}
    <div class="transfer-body">
      <p>Your devices sync through this Deckhand server. No account or password is needed.</p>
      ${
        linked
          ? `<p id="syncLastLine" role="status">${escapeHtml(syncLastLabel())}</p>
        <div class="sync-code" id="syncCodeTxt">${escapeHtml(syncNiceCode(linked.code))}</div>
        <p class="hint">Enter this code on another device running this server. Anyone with the code can access the synced data.</p>
        <div class="sync-actions"><button type="button" class="primary-btn" id="syncNow">Sync now</button>
        <button type="button" class="ghost-btn" id="syncShare">Copy sync code</button>
        <button type="button" class="ghost-btn" id="syncOff">Unlink this device</button></div>`
          : `<p>Create a code on your first device. On your other devices, join with that same code. Matching records from the server take precedence when joining; local-only cards, decks, and games are added.</p>
        <div class="sync-actions"><button type="button" class="primary-btn" id="syncNew">Create sync code</button>
        <button type="button" class="ghost-btn" id="syncJoin">I already have a code</button></div>`
      }
      <p class="hint sync-status" id="syncActionStatus" role="status"></p>
    </div>
  </section>`;
  brSheetOpen(root, 'syncSheet', () => {
    if (state.screen === 'settings') render();
  });
  const close = () => brSheetClose('syncSheet');
  root.querySelector('#syncClose').addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
  wireAppDialogKeys(root, close);
  root.querySelector('#syncClose').focus({ preventScroll: true });
  const run = async (button, task, reopen = false) => {
    if (!button) return;
    const activeSheet = document.getElementById('syncSheet');
    const buttons = activeSheet.querySelectorAll('.sync-actions button:not(#syncOff)');
    buttons.forEach((item) => {
      item.disabled = true;
    });
    const status = document.getElementById('syncActionStatus');
    status.textContent = 'Syncing…';
    try {
      const result = await task();
      if (result === null) throw new Error(syncState()?.err || 'connection');
      status.textContent = 'Synced with this server.';
      if (
        reopen &&
        activeSheet.isConnected &&
        document.getElementById('syncSheet') === activeSheet
      ) {
        close();
        await brAfterPop();
        openSyncSheet();
      }
    } catch (error) {
      status.textContent =
        error.message === 'code_not_found'
          ? 'Code not found. Check the code and that both devices use the same server.'
          : error.message === 'code'
            ? 'Enter the sync code shown on your other device.'
            : 'Sync failed. Local changes are kept for retry when this server is available.';
      if (
        reopen &&
        syncState() &&
        activeSheet.isConnected &&
        document.getElementById('syncSheet') === activeSheet
      ) {
        close();
        await brAfterPop();
        openSyncSheet();
      }
    } finally {
      buttons.forEach((item) => {
        item.disabled = false;
      });
    }
  };
  root
    .querySelector('#syncNew')
    ?.addEventListener('click', (event) =>
      run(event.currentTarget, () => syncLink(null, true), true),
    );
  root
    .querySelector('#syncNow')
    ?.addEventListener('click', (event) => run(event.currentTarget, () => syncRun('manual')));
  root.querySelector('#syncJoin')?.addEventListener('click', async () => {
    close();
    await brAfterPop();
    openInAppPrompt('Sync code', 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', '', async (value) => {
      if (value == null) return;
      openSyncSheet();
      const button = document.getElementById('syncJoin');
      await run(button, () => syncLink(value, false), true);
    });
  });
  root.querySelector('#syncShare')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(syncNiceCode(syncState().code));
      toast('Sync code copied.');
    } catch {
      toast('Select the sync code to copy it.');
    }
  });
  root.querySelector('#syncOff')?.addEventListener('click', () =>
    openInAppConfirm(
      'This device will stop syncing. Data already saved here stays on this device.',
      (confirmed) => {
        if (confirmed) {
          syncUnlink();
          close();
        }
      },
      { title: 'Unlink device', ok: 'Unlink' },
    ),
  );
}
