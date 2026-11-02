// services / image-warmer

/* ---------------- IDLE IMAGE WARMER ----------------
   Quietly fills the browser's HTTP cache with the images the person is most
   likely to look at: the open deck's list first, then every other deck,
   then the collection tiles, and finally the open deck's sheet-size art.
   HARD RULES — the user always wins:
   • one image at a time, a breath (250ms) between each;
   • nothing moves until 2.5s after the last touch/key/scroll;
   • stands down whenever the fast Scryfall lane has work (something the
     user just tapped), when the app is hidden, offline, or Data Saver is on;
   • images come from Scryfall's CDN — the rate-limited API queue is never
     touched, so warming can never delay rulings, prices, or searches. */
let _warmLastInput = Date.now();

let _warmStarted = false;

let _inputListenersOn = false;

function _noteInputListeners() {
  if (_inputListenersOn) return;
  _inputListenersOn = true;
  const note = () => {
    _warmLastInput = Date.now();
  };
  ['touchstart', 'pointerdown', 'keydown', 'wheel', 'scroll'].forEach((ev) => {
    try {
      window.addEventListener(ev, note, { passive: true, capture: true });
    } catch (e) {}
  });
}

function buildWarmQueue() {
  const seen = new Set(),
    urls = [];
  const push = (u) => {
    if (u && typeof u === 'string' && !u.startsWith('data:') && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  };
  const act = getDeck(state.activeDeckId);
  const decks = [];
  if (act) decks.push(act);
  (state.decksIndex || []).forEach((d) => {
    if (!act || d.id !== act.id) decks.push(d);
  });
  decks.forEach((d) => {
    try {
      deckLeaders(d)
        .concat(d.cards || [], d.maybeboard || [])
        .forEach((c) => push(cardImage(c)));
    } catch (e) {}
  });
  ((state.collection || {}).items || []).forEach((it) => {
    if (it) push(it.img);
  });
  if (act) {
    try {
      deckLeaders(act)
        .concat(act.cards || [])
        .forEach((c) => push(cardImageLarge(c)));
    } catch (e) {}
  }
  return urls;
}

function _warmGateClosed() {
  const conn = navigator.connection;
  const apiBusy = !!(typeof _sfQ === 'object' && _sfQ && _sfQ.hi && _sfQ.hi.length);
  return (
    _bulkSyncing ||
    document.hidden ||
    navigator.onLine === false ||
    !!(conn && conn.saveData) ||
    apiBusy ||
    Date.now() - _warmLastInput < 2500
  );
}

function startImageWarmer() {
  if (_warmStarted) return;
  _warmStarted = true;
  _noteInputListeners();
  const warmed = new Set();
  let queue = [];
  let colSeen = ((state.collection || {}).items || []).length > 0;
  let idlePolls = 0;
  const refill = () => {
    try {
      queue = buildWarmQueue().filter((u) => !warmed.has(u));
    } catch (e) {
      queue = [];
    }
  };
  refill();
  const step = () => {
    if (!queue.length) {
      // The collection loads from IndexedDB and can appear after the first
      // build — refill once when it lands, then the session's pass is done.
      const haveCol = ((state.collection || {}).items || []).length > 0;
      if (!colSeen && haveCol) {
        colSeen = true;
        refill();
      }
      if (!queue.length) {
        if (colSeen || ++idlePolls > 60) return; // finished (or nothing to wait for)
        setTimeout(step, 10000);
        return;
      }
    }
    if (_warmGateClosed()) {
      setTimeout(step, 1500);
      return;
    }
    const u = queue.shift();
    warmed.add(u);
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      setTimeout(step, 250);
    };
    const im = new Image();
    im.onload = next;
    im.onerror = next;
    im.src = u;
    setTimeout(next, 15000); // a hung load never stalls the queue
  };
  setTimeout(step, 8000); // let boot and the first page settle first
}

window.addEventListener('load', () => {
  setTimeout(startImageWarmer, 8000);
});
