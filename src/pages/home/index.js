// pages / home / index

/* ---------------- HOME / MY DECKS ---------------- */

/* ---------------- HOME (welcome page) ---------------- */

function homePageHtml() {
  return /* HTML */ ` <main class="home-page">
    <div class="home-sea"></div>
    <div class="home-hero-wrap">
      <div class="home-glow"></div>
      <span class="home-logo-clip"
        ><img
          class="home-logo"
          id="homeModeLogo"
          src="${DECKHAND_BADGE}"
          alt="Deckhand"
          title="About this app"
      /></span>
    </div>
    <div class="home-rule">
      <span class="home-rule-line"></span><span class="home-rule-star">⚔</span
      ><span class="home-rule-line"></span>
    </div>
    <p class="home-kicker">Your deck builder for Commander &amp; beyond</p>
    <div class="home-news" id="homeNews"><span class="l2">Loading news…</span></div>
  </main>`;
}

/* About popup: the old home explainer, now behind a tap on the logo. */
function openHomeAbout() {
  if (document.getElementById('homeAboutPop')) return;
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.id = 'homeAboutPop';
  bd.innerHTML = /* HTML */ `<div class="modal-sheet" style="text-align:center;">
    <h3>Deckhand</h3>
    <p class="home-kicker" style="margin:0 0 4px;">Your deck builder for Commander &amp; beyond</p>
    <ul class="home-points" style="margin:8px auto 4px;">
      <li>Build decks with live legality, ban lists and colour identity checked per format</li>
      <li>Track your collection, wants and binders with Cardmarket prices and history</li>
      <li>Find commanders, staples, combos and budget swaps from play data</li>
      <li>Test opening hands, castability and power bracket before you sit down</li>
      <li>Ask the AI judge your rules questions — the official rules come with every answer</li>
      <li>Let the AI suggest lands and your mana base</li>
      <li>Count life, log games and share decks — everything offline-ready</li>
    </ul>
    <button class="ghost-btn" id="homeAboutClose" style="width:100%;margin-top:12px;">Close</button>
  </div>`;
  const close = () => {
    const el = document.getElementById('homeAboutPop');
    if (el) el.remove();
  };
  const closeAndPop = () => {
    close();
    const st = state.overlayStack;
    if (st.length && st[st.length - 1].id === 'homeAbout') st.pop();
  };
  bd.addEventListener('click', (e) => {
    if (e.target === bd) closeAndPop();
  });
  bd.querySelector('#homeAboutClose').addEventListener('click', closeAndPop);
  document.body.appendChild(bd);
  pushOverlay('homeAbout', close);
}

function wireHomePage() {
  state._crossLanded = false; // landing animation classes were baked into this render; don't repeat
  document.getElementById('homeStartBtn')?.addEventListener('click', () => switchPage('browse'));
  document.getElementById('homeReadRules')?.addEventListener('click', () => {
    switchPage('formatrules');
  });
  document.getElementById('homeModeLogo')?.addEventListener('click', openHomeAbout);
  const nb = document.getElementById('homeNews');
  if (nb) loadMtgNews(nb);
  requestAnimationFrame(fitHomeNews);
  setTimeout(fitHomeNews, 300);
  if (!window._homeNewsRs) {
    window._homeNewsRs = true;
    window.addEventListener('resize', () => {
      if (state.screen === 'home') fitHomeNews();
    });
  }
}
