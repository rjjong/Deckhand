// app / start

// Warm recognition after the first page loads. The camera opens on demand or
// when collection scanning is the explicitly selected startup page.
scheduleScannerWarmup();

setTimeout(() => {
  try {
    preloadCotd();
  } catch (e) {}
}, 4000);

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
  syncStart();
  // A share link keeps the splash up until the deck page itself is drawn —
  // flashing the home screen first made receivers doubt the link worked.
  // render() now sends the signal on the first painted frame; this is only a
  // backstop for a start that somehow never paints.
  if (!pendingShareToken()) setTimeout(appReady, 1500);
  maybeShowChangelog();
  // A share link needs the legal-set list before it can resolve any cards
  if (pendingShareToken()) {
    await resolveLegalSets();
    checkShareLink();
  }
});
