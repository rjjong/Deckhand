// Credentials stay in HttpOnly cookies; only account identity and sync
// bookkeeping are saved in the browser's account-specific workspace.
let accountSession = null;
let accountEmailReady = false;
let accountRefreshing = null;
let accountChanging = false;
let accountSessionGeneration = 0;
function accountReadIncomingLink() {
  const values = new URLSearchParams(location.hash.slice(1));
  for (const kind of ['verify', 'reset']) {
    const token = values.get('account-' + kind);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      history.replaceState(null, '', location.pathname + location.search);
      return { kind, token };
    }
  }
  return null;
}
const accountIncomingLink = accountReadIncomingLink();
let accountIncomingShown = false;
window.addEventListener('hashchange', () => {
  const link = accountReadIncomingLink();
  if (link) openAccountSheet(link.kind, link.token, true);
});

async function accountCall(body) {
  const response = await fetch('/api/account', {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body
      ? { 'content-type': 'application/json', 'x-csrf-token': accountSession?.csrf || '' }
      : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'connection');
  return result;
}

async function accountRefresh() {
  if (accountRefreshing) return accountRefreshing;
  accountRefreshing = (async () => {
    const generation = accountSessionGeneration;
    try {
      const result = await accountCall();
      if (generation !== accountSessionGeneration) return accountSession;
      accountSession = result.user ? result : null;
      accountEmailReady = result.emailReady;
      if (!result.user && syncState()?.accountId) {
        syncState().err = 'signin_required';
        syncSaveState();
      }
    } catch {
      // An offline account keeps its private local workspace and change log.
    } finally {
      accountRefreshing = null;
      syncPaintStatus();
      if (accountIncomingLink && !accountIncomingShown) {
        accountIncomingShown = true;
        openAccountSheet(accountIncomingLink.kind, accountIncomingLink.token, true);
      }
    }
    return accountSession;
  })();
  return accountRefreshing;
}

async function accountBindSync() {
  const user = accountSession?.user;
  if (!user || user.id !== ACCOUNT_OWNER || !accountWorkspaceCurrent()) return;
  if (syncState()?.accountId === user.id) return;
  _syncGeneration++;
  state._syncSt = { protocol: 2, accountId: user.id, email: user.email, rev: 0, sent: {}, last: 0 };
  state._syncMeta = {};
  _lsSetRaw.call(localStorage, LS_PREFIX + 'syncMeta', '{}');
  // Cloud records win on the initial join. Data found only on this device is
  // added, and all later offline edits retain their actual timestamps.
  syncSeed(0.5, (await syncReadSnapshot()).values);
  syncSaveState();
}

async function accountPrepareWorkspace(user, includeLocal) {
  clearTimeout(_syncTimer);
  _syncController?.abort();
  await syncFlushDecks();
  if (ACCOUNT_OWNER === user.id) {
    await accountBindSync();
    await syncRun('login');
    return false;
  }
  const target = 'deckhand_user:' + user.id + ':';
  if (!ACCOUNT_OWNER && includeLocal && !localStorage.getItem(target + 'workspaceReady')) {
    const snapshot = await syncReadSnapshot();
    const entries = Object.entries(snapshot.values)
      .filter(([key]) => key.startsWith('deck:'))
      .map(([key, value]) => [target + key, value]);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('deckhand-decks-' + user.id, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('decks');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('storage'));
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('decks', 'readwrite');
        for (const [key, value] of entries) tx.objectStore('decks').put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(new Error('storage'));
      });
    } finally {
      db.close();
    }
    for (const key of SYNC_SOURCES) {
      const value = localStorage.getItem(LS_PREFIX + key);
      if (value !== null) _lsSetRaw.call(localStorage, target + key, value);
    }
    const oldCode = syncState()?.code;
    if (oldCode) {
      try {
        await accountCall({ op: 'migrate', code: oldCode });
        const meta = {};
        for (const key of Object.keys(snapshot.values))
          meta[key] = snapshot.meta[key] || snapshot.meta[syncRecordSource(key)] || { t: 0.5 };
        for (const [key, entry] of Object.entries(snapshot.meta))
          if (syncRecordAllowed(key) && entry.d) meta[key] = entry;
        _lsSetRaw.call(localStorage, target + 'syncMeta', JSON.stringify(meta));
        _lsSetRaw.call(
          localStorage,
          target + 'syncState',
          JSON.stringify({
            protocol: 2,
            accountId: user.id,
            email: user.email,
            rev: 0,
            sent: {},
            last: 0,
          }),
        );
      } catch {
        _lsSetRaw.call(
          localStorage,
          target + 'migrationNotice',
          'Your local data was copied. Import your old sync code here to recover any additional server data.',
        );
      }
    }
  }
  _lsSetRaw.call(localStorage, target + 'workspaceReady', '1');
  _lsSetRaw.call(localStorage, ACCOUNT_OWNER_KEY, user.id);
  location.reload();
  return true;
}

function accountStatusLabel() {
  if (!ACCOUNT_OWNER) return 'Optional account for cloud saving';
  const linked = syncState();
  if (accountSession?.user?.id !== ACCOUNT_OWNER) return 'Sign in to resume cloud saving';
  if (linked?.err) return 'Cloud sync needs attention';
  return linked?.last ? 'Signed in as ' + accountSession.user.email : 'Waiting for first sync';
}

function accountWarningHtml() {
  const linked = syncState();
  if (ACCOUNT_OWNER && accountSession?.user?.id === ACCOUNT_OWNER && linked?.last && !linked.err)
    return '';
  const guest = !ACCOUNT_OWNER;
  return /* HTML */ `<aside class="account-warning" role="note">
    <strong>${guest ? 'Stored only on this device' : 'Cloud saving needs attention'}</strong>
    <p>
      ${guest ? 'Your decks and collection are not saved in the cloud. They can be lost if this device or browser data is cleared. Sign in to sync, or keep your own backups.' : 'Your latest changes may only be on this device. Sign in or reconnect to resume syncing, and keep a backup until sync completes.'}
    </p>
    <div>
      <button type="button" class="ghost-btn" data-account-open>
        ${guest ? 'Sign in' : 'Account & sync'}
      </button>
      <button type="button" class="ghost-btn" data-account-backup>Make a backup</button>
    </div>
  </aside>`;
}

function paintAccountWarnings() {
  document.querySelectorAll('.account-warning-slot').forEach((el) => {
    el.innerHTML = accountWarningHtml();
  });
  document
    .querySelector('#menuAccount .l2')
    ?.replaceChildren(document.createTextNode(accountStatusLabel()));
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-account-open], #menuAccount')) openAccountSheet();
  if (event.target.closest('[data-account-backup]')) openBackupSheet();
});
window.addEventListener('storage', (event) => {
  if (event.key === ACCOUNT_OWNER_KEY && !accountWorkspaceCurrent()) {
    _syncGeneration++;
    _syncController?.abort();
    location.reload();
  }
});
window.addEventListener('pageshow', () => {
  if (!accountWorkspaceCurrent()) location.reload();
});
window.addEventListener('online', () => accountRefresh().then(() => syncSoon(500)));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') accountRefresh().then(() => syncSoon(500));
});
