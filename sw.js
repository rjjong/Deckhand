/* Deckhand — service worker
   Strategy:
   - The page and startup bundles: the network gets SHELL_WAIT ms to answer, then the
     cached copy wins and the download finishes in the background. A quick
     line still serves the newest deploy at once; a slow one no longer holds
     the launch hostage behind a ~430 kB download.
   - Other shell files (icons, manifest): network-first with cache fallback.
   - Fonts + Scryfall card images: cache-first (they never change for a given
     URL), keeping repeat browsing fast and cheap.
   - Scryfall API responses are NOT cached — searches and prices stay live. */
const VERSION = 'deckhand-local-api-v44';
// Card images and fonts survive app updates: this cache is deliberately
// NOT version-named, so activating a new version never wipes it.
const ASSETS = 'admiral-assets-v1';
// How long the page may wait for a fresh copy before the cached one wins.
// Long enough that a quick connection still serves the newest deploy at once,
// short enough that a slow one never holds the launcher's icon hostage.
const SHELL_WAIT = 1200;
const SHELL = ['./', './index.html', './assets/app.js', './assets/app.css', './assets/images/deckhand-badge.webp', './runtime-config.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Live data must stay live
  if (url.hostname === 'api.scryfall.com') return;
  if (url.pathname.startsWith('/api/')) return;
  // The weekly card database is streamed straight into IndexedDB, and that is
  // where the app reads it when offline. Caching it here only kept a second
  // copy of roughly 11 MB that nothing ever read back.
  if (/\.(jsonl|tsv)\.gz$/.test(url.pathname)) return;

  // Static, immutable assets: cache-first
  const isFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');
  const isCardImage = url.hostname === 'cards.scryfall.io' || url.hostname.endsWith('.scryfall.io');
  if (isFont || isCardImage) {
    e.respondWith(
      caches.open(ASSETS).then(cache =>
        cache.match(e.request).then(hit => hit || fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // App shell: network-first, fall back to cache when offline.
  // The HTML shell and its separate JS/CSS bundles race the network against
  // the clock. Cached startup assets keep a slow connection from delaying
  // launch, while the live request refreshes the next launch in the background.
  if (url.origin === location.origin) {
    const isPage = e.request.mode === 'navigate';
    const isStartupAsset = /\/assets\/app\.(?:js|css)$/.test(url.pathname);
    e.respondWith(
      (async () => {
        const store = caches.open(VERSION);
        const live = fetch(e.request).then(res => {
          if (res && res.ok) { const copy = res.clone(); store.then(c => c.put(e.request, copy)); }
          return res;
        });
        if (isPage || isStartupAsset) {
          const cached = await caches.match(e.request, { ignoreSearch: true })
                      || (isPage ? await caches.match('./index.html') : null);
          if (cached) {
            const waited = await Promise.race([
              live.catch(() => null),
              new Promise(r => setTimeout(() => r('slow'), SHELL_WAIT))
            ]);
            if (waited && waited !== 'slow' && waited.ok) return waited;
            live.catch(() => {});        // keep refreshing the cache in the background
            return cached;
          }
        }
        try {
          const res = await live;
          if (res) return res;
        } catch (err) {}
        return (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match('./index.html'));
      })()
    );
  }
});
