// platform / pwa

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
          await fetch('/.netlify/functions/push-subscribe', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        } catch (e) {}
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
