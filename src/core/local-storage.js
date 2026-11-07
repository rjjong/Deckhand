// core / local-storage

/* ========================= STORAGE ========================= */
/* Decks are saved in this browser's localStorage — on this device, in this
   browser, permanently until you clear site data (no Claude account or
   published-artifact requirement, but also no cross-device sync). */

/* 1.28 DESK MODE: a screen of 1000 px and wider (PC, laptop, a tablet on
   its side) reads like a web page -- top to bottom: navigation at the top,
   pages opening at their top, menus dropping DOWN. The phone keeps its
   bottom-up design untouched; every desk rule hangs off html.desk. */
function isDesk() {
  return document.documentElement.classList.contains('desk');
}

(function () {
  try {
    const mq = window.matchMedia('(min-width: 1000px)');
    const set = () => document.documentElement.classList.toggle('desk', mq.matches);
    set();
    mq.addEventListener('change', () => {
      set();
      try {
        render();
        pageScroller().scrollTo(0, 0);
      } catch (e) {}
    });
  } catch (e) {}
})();

// Each account has a separate local workspace, including when offline. Signing
// out returns to the guest workspace without erasing either person's data.
const ACCOUNT_OWNER_KEY = 'deckhand:activeAccount';
const ACCOUNT_OWNER = (() => {
  try {
    const value = localStorage.getItem(ACCOUNT_OWNER_KEY);
    return /^[a-f0-9-]{36}$/.test(value || '') ? value : null;
  } catch {
    return null;
  }
})();
const LS_PREFIX = ACCOUNT_OWNER ? 'deckhand_user:' + ACCOUNT_OWNER + ':' : 'admiral_app:';

function accountWorkspaceCurrent() {
  return (localStorage.getItem(ACCOUNT_OWNER_KEY) || null) === ACCOUNT_OWNER;
}
