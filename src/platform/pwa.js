// platform / pwa

let pwaInstallOffer = null;
let pwaInstallBusy = false;
let pwaInstalled = false;
const pwaDisplayMode = window.matchMedia(
  '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)',
);

function pwaIsInstalled() {
  return pwaInstalled || pwaDisplayMode.matches || navigator.standalone === true || inAndroidApp();
}

function pwaInstallCardHtml() {
  if (pwaIsInstalled()) return '';
  return menuCardHtml(
    'menuInstallApp',
    ICONS.phone,
    'Install app',
    'Add Deckhand to your home screen',
  );
}

function updatePwaInstallMenu() {
  const button = document.getElementById('menuInstallApp');
  if (pwaIsInstalled()) {
    button?.remove();
  } else if (button) {
    button.disabled = pwaInstallBusy;
    button.setAttribute('aria-busy', String(pwaInstallBusy));
  } else if (document.querySelector('.menu-page')) {
    render();
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  if (!window.isSecureContext || pwaIsInstalled() || typeof event.prompt !== 'function') return;
  event.preventDefault();
  pwaInstallOffer = event;
  updatePwaInstallMenu();
});

window.addEventListener('appinstalled', () => {
  pwaInstalled = true;
  pwaInstallOffer = null;
  updatePwaInstallMenu();
});
pwaDisplayMode.addEventListener('change', updatePwaInstallMenu);

async function installPwa() {
  if (pwaInstallBusy || pwaIsInstalled()) return;
  if (!window.isSecureContext || !pwaInstallOffer) {
    openModal('installApp', { returnFocus: document.activeElement });
    return;
  }
  // Consume the event once, and call prompt() directly from the user's click.
  const offer = pwaInstallOffer;
  pwaInstallOffer = null;
  pwaInstallBusy = true;
  updatePwaInstallMenu();
  try {
    await offer.prompt();
    await offer.userChoice;
  } catch (e) {
    if (!pwaIsInstalled()) openModal('installApp', { returnFocus: document.activeElement });
  } finally {
    pwaInstallBusy = false;
    updatePwaInstallMenu();
  }
}

function renderPwaInstallHelp(el) {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let title = 'Install Deckhand';
  let message = 'Use your browser’s menu to add Deckhand as an app.';
  let steps = [
    'Open the browser menu (⋮ or …).',
    'Choose Install app or Add to home screen, if offered.',
    'Confirm to add Deckhand. If the option is missing, try Chrome or Edge.',
  ];
  if (!window.isSecureContext) {
    title = 'HTTPS needed';
    message =
      'App installation needs a secure HTTPS address. Set up HTTPS for this server, then open that address and tap Install app again.';
    steps = [];
  } else if (ios) {
    message = 'Add Deckhand to your home screen using Safari.';
    steps = [
      'Open this page in Safari.',
      'Tap Share. If it is hidden, open More (…).',
      'Choose Add to Home Screen. Turn on Open as Web App if shown, then tap Add.',
    ];
  }
  el.innerHTML = /* HTML */ `<div class="modal-backdrop deckpick-scrim" id="mbd">
    <div
      class="deckpick app-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="installHelpTitle"
      aria-describedby="installHelpMessage"
    >
      <span class="hub-icon dialog-icon" aria-hidden="true">${ICONS.phone}</span>
      <h2 id="installHelpTitle">${title}</h2>
      <p class="iac-msg" id="installHelpMessage">${message}</p>
      ${steps.length ? `<ol class="iac-msg install-steps">${steps.map((step) => `<li>${step}</li>`).join('')}</ol>` : ''}
      <div class="dialog-actions">
        <button type="button" class="primary-btn dialog-primary" id="cancelBtn">Got it</button>
      </div>
    </div>
  </div>`;
  wireAppDialogKeys(el, closeModal);
  el.querySelector('#cancelBtn').focus({ preventScroll: true });
}

// Register the service worker for offline/app-like behavior — only when
// hosted (service workers don't exist for file:// pages, and the app must
// keep working when shared as a bare file).
async function updateServiceWorker(reg) {
  if (navigator.onLine === false) return false;
  try {
    await reg.update();
    return true;
  } catch (e) {
    sfJournal('SW update deferred: ' + String(e.message || e).slice(0, 100));
    return false;
  }
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  // No reload when a new service worker takes control: index.html is served
  // network-first, so the page that just booted IS the freshly deployed one —
  // the old reload only produced the double startup (splash, home, splash
  // again). The new worker still activates silently and owns the next launch.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        const promote = (w) => {
          if (w) w.postMessage({ type: 'SKIP_WAITING' });
        };
        if (reg.waiting && navigator.serviceWorker.controller) promote(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (nw)
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) promote(nw);
            });
        });
        // Catch updates that land while the app is open
        setInterval(() => updateServiceWorker(reg), 60 * 60 * 1000);
        window.addEventListener('online', () => updateServiceWorker(reg));
      })
      .catch((e) => console.warn('SW registration failed', e));
  });
}

// Ask the browser to protect our storage from automatic eviction, so decks
// aren't silently cleared when the device runs low on space.

/* Onderdeel A: ask Android to PROTECT this origin's storage (decks,
   collection, caches survive storage pressure). The verdict lands in
   state._persisted and shows under Extras → Backup & Restore; an installed
   WebAPK is granted this automatically, a plain tab often only after use. */
async function ensurePersistentStorage() {
  try {
    if (!(navigator.storage && (navigator.storage.persisted || navigator.storage.persist))) return;
    let ok = false;
    if (navigator.storage.persisted) ok = await navigator.storage.persisted();
    if (!ok && navigator.storage.persist) ok = await navigator.storage.persist();
    state._persisted = !!ok;
    if (state.screen === 'settings') render();
  } catch (e) {}
}

ensurePersistentStorage();

document.addEventListener('gesturestart', (e) => e.preventDefault());

document.addEventListener('gesturechange', (e) => e.preventDefault());

// Two-finger touches are never a gesture this app uses, and any browser
// pinch attempt is what shifts the layout — cancel them outright.
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

/* Long-press = select, in the decklist, the collection and Inspiration. The
   browser's own long-press reactions (a drag of the card image, the image
   menu) must never start: a drag that did not end swallowed every later tap. */
document.addEventListener('dragstart', (e) => e.preventDefault(), true);

document.addEventListener(
  'contextmenu',
  (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,[contenteditable="true"],.sel-text')) return;
    e.preventDefault();
  },
  true,
);

document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

function retireWebPush() {
  if (window.DeckhandNotify) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => (reg && reg.pushManager ? reg.pushManager.getSubscription() : null))
      .then(async (sub) => {
        if (!sub) return;
        try {
          await sub.unsubscribe();
        } catch (e) {}
        try {
          localStorage.setItem(LS_PREFIX + 'pushOn', '0');
        } catch (e) {}
      })
      .catch(() => {});
  } catch (e) {}
}

setTimeout(retireWebPush, 4000);
