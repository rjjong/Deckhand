// pages / life / session

/* ---- screen wake lock: keep the phone awake while the life tracker is up ----
   Needs a secure context (https:// or localhost), so it quietly no-ops when the
   file is opened directly from disk. */
let _wakeLock = null;

async function acquireWakeLock() {
  if (_wakeLock) return;
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => {
        _wakeLock = null;
      });
    }
  } catch (e) {
    console.warn('Wake lock unavailable:', e && e.message);
  }
}

function releaseWakeLock() {
  try {
    if (_wakeLock) _wakeLock.release();
  } catch (e) {}
  _wakeLock = null;
}

/* The Android app has no Wake Lock API (its WebView lacks it). Since APK 3.5
   the app itself keeps the screen on and holds this window at 75%
   brightness -- auto-brightness left out -- only while the life counter is
   open. An older app simply lacks the call. */
function nativeTableMode(on) {
  try {
    const n = window.DeckhandNotify;
    if (!n || typeof n.setTableMode !== 'function') return;
    if (on) sendLifeBright(n, lifeBrightPct());
    n.setTableMode(!!on);
  } catch (e) {}
}

/* The counter's brightness, chosen with the slider in the counter's
   settings and remembered between sessions: 0 = the phone decides (the
   start), 5..100 = locked at that position of the phone's own brightness
   slider while the counter is open. No built-in default any more. */
function lifeBrightPct() {
  let v = 0;
  try {
    const x = parseInt(localStorage.getItem(LS_PREFIX + 'lifeBright'), 10);
    if (x >= 0 && x <= 100) v = x;
  } catch (e) {}
  return v;
}

function sendLifeBright(n, v) {
  try {
    if (typeof n.setTableLevel === 'function')
      n.setTableLevel(v); // APK 3.7+
    else if (v > 0 && typeof n.setTableBrightness === 'function') n.setTableBrightness(v); // APK 3.6
  } catch (e) {}
}

function lifeBrightLabel(v) {
  return v > 0 ? v + '%' : 'Phone';
}

function canSetLifeBright() {
  try {
    const n = window.DeckhandNotify;
    return !!(
      n &&
      (typeof n.setTableLevel === 'function' || typeof n.setTableBrightness === 'function')
    );
  } catch (e) {
    return false;
  }
}

// A page (re)loaded with the counter closed never inherits the table mode.
try {
  nativeTableMode(false);
} catch (e) {}

document.addEventListener('visibilitychange', () => {
  // Browsers drop the lock when the tab is backgrounded — take it again on return
  if (document.visibilityState === 'visible' && state.lifeOpen && !_wakeLock) acquireWakeLock();
});

function openLifeOverlay() {
  state.lifeOpen = true;
  acquireWakeLock();
  nativeTableMode(true);
  pushOverlay('life', () => {
    state.lifeOpen = false;
    ['menuOpen', 'toolsOpen', 'historyOpen', 'settingsOpen', 'diceOpen'].forEach(
      (key) => (state.life[key] = false),
    );
    releaseWakeLock();
    nativeTableMode(false);
    // Setup modal isn't its own history entry, so tear it down with the overlay
    if (state.modal && state.modal.type === 'lifeSetup') closeModal();
    document.getElementById('lifeOverlay')?.remove();
  });
  renderLifeOverlay();
  if (!state.life.setupDone) openModal('lifeSetup');
}
