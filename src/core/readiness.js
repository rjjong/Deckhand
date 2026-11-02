// core / readiness

/* The app has no opening screen of its own any more. Inside the Android build
   the launcher's own splash -- the same artwork, drawn by Android -- stays up
   until this fires, so there is one image and it never redraws. In a browser
   this does nothing at all. Sent once; whichever call gets here first wins. */
let _appReadySent = false;

function appReady() {
  if (_appReadySent) return;
  _appReadySent = true;
  try {
    // How long the launcher's icon had to stay up, measured from the moment
    // this page started running. Anything before that is Android's own.
    _bootPaintMs = Math.round(performance.now());
    sfJournal(
      'boot: eerste beeld na ' +
        _bootPaintMs +
        'ms (script ' +
        _bootScriptMs +
        'ms, eerste render ' +
        _bootRenderMs +
        'ms)',
    );
  } catch (e) {}
  try {
    if (window.DeckhandNotify && DeckhandNotify.appReady) DeckhandNotify.appReady();
  } catch (e) {}
}
