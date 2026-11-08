// app / bootstrap

/* ========================= INIT ========================= */
// Load the launch preference before the first page is drawn. Explicit links
// and launcher shortcuts still open their requested destinations afterwards.
const initialSettings = loadSettings();

const scannerLaunchQuery = new URLSearchParams(location.search);
const launchCollectionScanner =
  state.startupPage === 'scan-collection' &&
  !pendingShareToken() &&
  !accountIncomingLink &&
  !['card', 'go', 'share_text', 'share_url', 'share_title'].some((key) =>
    scannerLaunchQuery.has(key),
  );
state.screen = state.startupPage === 'scan-collection' ? 'collection' : state.startupPage;

state.navLadder = state.screen === 'home' ? ['home'] : ['home', state.screen];

try {
  // Exit guard: a sentinel entry sits beneath the app's own history. When the
  // hardware back button unwinds all the way down to it, the app asks before
  // letting the system close it — Cancel re-arms the guard.
  history.replaceState({ exitGuard: true }, '', '#home');
  history.pushState({ screen: state.screen }, '', '#' + state.screen);
} catch (e) {}

// Chrome's hardware back skips history entries created without a user
// gesture — the whole boot-time stack qualifies, so back could leap past
// the exit guard and close the app unasked. The first real touch therefore
// pushes a GUARD entry and the current screen, both activation-backed:
// hardware back must land on that guard and gets the confirm dialog, while
// the Exit drain (JS history.back()) ignores skippability entirely.
window.addEventListener(
  'pointerdown',
  () => {
    try {
      history.pushState({ exitGuard: true }, '', '#home');
      history.pushState(
        { screen: state.screen || 'home', folder: state.folderNav || null },
        '',
        '#' + (state.screen || 'home'),
      );
    } catch (e) {}
  },
  { once: true, capture: true },
);

/* Chrome marks history entries pushed WITHOUT user activation — which is
   every consumed-back re-arm, since those happen inside popstate handlers —
   as SKIPPABLE, and a back press cascades straight through them. That is
   how "back" from a folder overview could sail past every guard and close
   the app. The cure: a CloseWatcher absorbs the press BEFORE history moves,
   and WE run the exact same decision chain (appBackStep). A watcher is
   spent after each press; every tap re-arms it with fresh activation, and
   in the brief window between a press and the next tap the history
   machinery still stands guard with its stack largely intact. */
(function () {
  if (typeof CloseWatcher === 'undefined') return;
  let cw = null;
  const arm = () => {
    if (cw || state._exiting) return;
    try {
      cw = new CloseWatcher();
    } catch (e) {
      cw = null;
      return;
    }
    cw.onclose = () => {
      cw = null;
      if (state._exiting) return;
      // Re-arm IMMEDIATELY: a spent watcher leaves the stack empty, and one
      // activation-less watcher is always permitted then — so SEQUENTIAL
      // hardware presses are each intercepted. (3-button nav sends no
      // pointer events between presses.)
      arm();
      if (appBackStep(false)) return;
      // Home floor: PARK FOR EXIT. window.close() is refused for a tab the
      // app didn't open, so the only reliable exit is the native one — a
      // system back with nothing in its way. Drain history to the bottom
      // and stand the watcher down BEFORE asking: while the question is
      // showing, one hardware back press closes the app natively. Cancel
      // restores every guard.
      if (state._exitAsk) return;
      state._exitAsk = true;
      state._exiting = true; // keeps popstate inert while go() settles
      try {
        if (cw && cw.destroy) cw.destroy();
      } catch (err) {}
      cw = null;
      try {
        const depth = history.length - 1;
        if (depth > 0) history.go(-depth);
      } catch (err) {}
      openInAppConfirm(
        trS('Exit this app?'),
        (ok) => {
          state._exitAsk = false;
          if (ok) {
            try {
              window.close();
            } catch (err) {}
            setTimeout(() => {
              if (document.hidden) return;
              // Chrome refuses close() for windows it didn't open. Re-opening
              // the window ONTO ITSELF makes it script-owned — after which
              // close() is honored. Only if even that is refused does the
              // toast concede: parked at the bottom, one system back closes.
              try {
                const w = window.open('', '_self');
                if (w) w.close();
              } catch (err) {}
              setTimeout(() => {
                if (!document.hidden) {
                  try {
                    toast(trS('Press back once more to close.'));
                  } catch (err) {}
                }
              }, 180);
            }, 80);
          } else {
            state._exiting = false;
            arm(); // the Cancel tap carries fresh activation
            try {
              history.pushState({ screen: 'home' }, '', '#home');
            } catch (err) {}
          }
        },
        { ok: trS('Exit') },
      );
    };
  };
  arm();
  document.addEventListener('pointerdown', () => arm(), { capture: true, passive: true });
})();

// Shared card links (…/?card=Name) open that card once the app settles;
// the query is stripped immediately so a refresh doesn't reopen it.
try {
  const _cardParam = new URLSearchParams(location.search).get('card');
  if (_cardParam) {
    try {
      history.replaceState(history.state, '', location.pathname + location.hash);
    } catch (e) {}
    setTimeout(async () => {
      try {
        let r = await sfFetch(`${SF_BASE}/cards/named?exact=${encodeURIComponent(_cardParam)}`);
        if (!r.ok)
          r = await sfFetch(`${SF_BASE}/cards/named?fuzzy=${encodeURIComponent(_cardParam)}`);
        if (r.ok) openCardInfo(await r.json());
      } catch (e) {}
    }, 900);
  }
} catch (e) {}
