// app / start

setTimeout(() => {
  try {
    preloadCotd();
  } catch (e) {}
}, 4000);

/* The page may have been served from the cache to keep the launch quick, so
   the newest deploy can be one start behind. Only noted in the journal --
   no toast: the next start picks the new version up by itself. */
setTimeout(async () => {
  try {
    if (!/^https:/.test(location.protocol)) return;
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r || !r.ok) return;
    const v = await r.json();
    if (v && v.version && v.version !== APP_VERSION) {
      sfJournal('update: v' + v.version + ' staat klaar (deze sessie draait v' + APP_VERSION + ')');
    }
  } catch (e) {}
}, 6000);

// Safety: the shell may never be left holding an icon over a working app.
// Later than it was -- the point is to lose to the real signal, not beat it.
setTimeout(appReady, pendingShareToken() ? 6000 : 5000);

setTimeout(() => {
  try {
    if (!localStorage.getItem(LS_PREFIX + 'slimmed1')) {
      compactAllDecks(null); // shrink legacy fat saves once
      localStorage.setItem(LS_PREFIX + 'slimmed1', '1');
    }
  } catch (e) {}
}, 2500);

qdbPrune();

// Tile-art warm-up joins the app's background start-up work: hydrate the
// stored set immediately, then walk the full key list while the request
// queue is idle -- by the time Inspiration opens, the grids are dressed.
setTimeout(() => {
  try {
    hydrateTileArtReady();
  } catch (e) {}
}, 1500);

setTimeout(() => {
  try {
    preloadBrowseTileArt();
  } catch (e) {}
}, 6000);

resolveLegalSets()
  .then(() => checkForNewSets())
  .catch(() => {});

loadDecksIndex().then(async () => {
  if (state.screen === 'decks') render();
  // A share link keeps the splash up until the deck page itself is drawn —
  // flashing the home screen first made receivers doubt the link worked.
  // render() now sends the signal on the first painted frame; this is only a
  // backstop for a start that somehow never paints.
  if (!pendingShareToken()) setTimeout(appReady, 1500);
  if (!maybeShowWelcome()) maybeShowChangelog();
  // A share link needs the legal-set list before it can resolve any cards
  if (pendingShareToken()) {
    await resolveLegalSets();
    checkShareLink();
  }
});
