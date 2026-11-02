// services / reconnect

/* ---- The line is back: pick up what was left hanging -------------------
   Jobs that failed while the line was down are gone -- nothing re-runs them
   by itself, so a page that was loading at that moment keeps its spinner
   for ever. This is the one place that notices, and it only touches pages
   that are actually still waiting: a spinner on screen has nothing to lose
   from a fresh load, and a settled page is left exactly as it is. */
let _netBackT = null;

function netBackRefresh() {
  clearTimeout(_netBackT);
  // A moment's grace: the first request after a handover often still fails.
  _netBackT = setTimeout(() => {
    if (window.DECKHAND_CONFIG?.selfHosted && !state.setsResolved) {
      resolveLegalSets()
        .then(() => {
          if (state.advOpen || state.spAdvOpen || state.colAdvOpen || state.screen === 'spoilers')
            render();
        })
        .catch(() => {});
    }
    try {
      retryMissingArt();
    } catch (e) {}
    try {
      const R = state.reco;
      if (R && (R.error || R.localSourced || R.loading)) {
        try {
          delete state._recoCache[recoCacheKey(R.admiral, R.partner)];
        } catch (e) {}
        R.loading = true;
        R.error = false;
        R.localSourced = false;
        R.pool = [];
        R._mainPool = null;
        R.activeThemeSlug = null;
        sfJournal('net terug: aanbevelingen opnieuw opgehaald');
        renderRecoOverlay();
        loadRecoPool();
        return;
      }
    } catch (e) {}
    try {
      const stuck =
        document.querySelector('.overlay .spinner') || document.querySelector('main .spinner');
      if (stuck) {
        sfJournal('net terug: pagina opnieuw geladen (stond nog te laden)');
        render();
      }
    } catch (e) {}
  }, 1200);
}

try {
  window.addEventListener('online', () => netBackRefresh());
} catch (e) {}

/* Card art that cannot be fetched (offline, or a picture never opened
   before) gets the plate above instead of a broken-image icon. Image errors
   do not bubble, so this listens in the capture phase -- one handler for
   every card picture in the app, present and future. */
document.addEventListener(
  'error',
  (e) => {
    const im = e.target;
    if (!im || im.tagName !== 'IMG') return;
    if (im.classList.contains('art-missing')) return;
    const src = String(im.currentSrc || im.src || '');
    if (!/scryfall\.io/.test(src)) return; // only card art
    let nm = im.getAttribute('alt') || '';
    if (!nm) {
      // Several tiles carry the name on the tile, not on the picture.
      const h = im.closest('[data-name],[data-spn],[data-scn]');
      if (h) {
        nm = h.dataset.spn || h.dataset.scn || '';
        if (!nm && h.dataset.name) {
          try {
            nm = decodeURIComponent(h.dataset.name);
          } catch (err) {
            nm = h.dataset.name;
          }
        }
      }
    }
    im.setAttribute('alt', nm);
    im.dataset.artsrc = src;
    try {
      im.style.setProperty('--sk', _skFor(nm));
    } catch (err) {}
    im.classList.remove('art-pending');
    im.classList.add('art-missing');
    /* A broken picture has no width of its own, so an inline-block holder
     shrinks around nothing and the frame ends up a sliver between the
     chevrons. Tell that holder to keep the room the picture had. */
    try {
      const holder = im.parentElement;
      if (holder && /^inline/.test(getComputedStyle(holder).display))
        holder.classList.add('art-missing-holder');
    } catch (err) {}
  },
  true,
);
