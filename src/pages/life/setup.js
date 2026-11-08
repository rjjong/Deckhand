// pages / life / setup

function renderLifeSetup(el, m) {
  let picked = m.lifeLayout || state.life.layout;
  if (!LIFE_LAYOUTS.some((x) => x.id === picked)) picked = '4q';
  const thumb = (lay, index) => {
    const tcols = lay.areas[0].split(' ').length;
    const trows = lay.areas.length;
    // Two-row tables get taller cells so their tiles read as upright
    // rectangles in line with the rest, not squat squares.
    const rh = trows <= 2 ? 38 : 26;
    const th = trows * rh + (trows - 1) * 3;
    const gtA = lay.areas.map((r) => `&quot;${r}&quot;`).join(' ');
    return `<button type="button" class="llay ${picked === lay.id ? 'on' : ''}" data-setup-lay="${lay.id}" aria-pressed="${picked === lay.id}" aria-label="${lay.count} ${'players, arrangement'} ${index + 1}">
        <span class="llay-grid" style="grid-template-columns:repeat(${tcols},1fr);grid-template-rows:repeat(${trows},1fr);height:${th}px;grid-template-areas:${gtA};">
          ${lay.rot.map((r, i) => `<i style="grid-area:${'abcdefgh'[i]};"><b style="transform:rotate(${r}deg);">${lifeStart(lay.count)}</b></i>`).join('')}
        </span>
        <span class="llay-n">${lay.count} ${'players'}</span>
      </button>`;
  };
  el.innerHTML = /* HTML */ `<div
    class="overlay life-setup-screen"
    id="lifeSetupScreen"
    role="dialog"
    aria-modal="true"
    aria-label="${'New game'}"
  >
    ${overlayCapHtml('New game', lifePopupCloseHtml('lifeSetupCancel', trS('Cancel')))}
    <div class="life-setup-body tab-viewport">
      <main class="hub-page tools-page life-setup-page">
        <section class="hub-intro">
          <span class="hub-eyebrow">LIFE TRACKER</span>
          <h1>${'Set your table.'}</h1>
          <p>${'Choose your format and an arrangement that matches where everyone sits.'}</p>
        </section>
        <section class="hub-actions tool-sections">
          <section class="panel-card">
            ${toolPanelHeadingHtml(ICONS.shield, 'Format', 'Starting life and damage rules')}
            <div class="life-format-grid">
              ${LIFE_FMTS.map((f) => `<button type="button" class="hub-card life-format-card ${lifeFmt() === f ? 'active' : ''}" data-lifefmt="${f}" aria-pressed="${lifeFmt() === f}"><strong>${escapeHtml(lifeFmtLabel(f))}</strong><small>${fmtSpec(f === 'constructed' ? 'standard' : f).life} ${'starting life'}</small></button>`).join('')}
            </div>
          </section>
          <section class="panel-card">
            ${toolPanelHeadingHtml(ICONS.draft, 'Table layout', 'Choose how your players are seated')}
            <div class="life-layout-grid">${LIFE_LAYOUTS.map(thumb).join('')}</div>
          </section>
        </section>
        <p class="hub-footnote">
          ${'You can change player names during the game. Your game saves automatically.'}
        </p>
      </main>
    </div>
    <div class="life-setup-footer">
      <button type="button" class="hub-card life-start-button" id="startGameBtn">
        <span class="hub-icon" aria-hidden="true">${ICONS.dice}</span
        ><span class="hub-copy"
          ><strong>${'Start game'}</strong><small>${'Spin to choose the first player'}</small></span
        ><span class="hub-arrow" aria-hidden="true">›</span>
      </button>
    </div>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  el.querySelector('#lifeSetupCancel').addEventListener('click', cancelLifeSetup);
  el.querySelector('#lifeSetupScreen').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelLifeSetup();
    }
  });
  document.querySelectorAll('[data-lifefmt]').forEach((b) =>
    b.addEventListener('click', () => {
      try {
        localStorage.setItem(LS_PREFIX + 'lifeFmt', b.dataset.lifefmt);
      } catch (e) {}
      document.querySelectorAll('[data-lifefmt]').forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      // every seat preview shows the new starting life at once
      document.querySelectorAll('.llay-grid b').forEach((x) => {
        x.textContent = String(lifeStart());
      });
    }),
  );
  document.querySelectorAll('[data-setup-lay]').forEach((b) => {
    b.addEventListener('click', () => {
      picked = b.dataset.setupLay;
      m.lifeLayout = picked;
      document.querySelectorAll('[data-setup-lay]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });
  document.getElementById('startGameBtn').addEventListener('click', () => {
    const lay =
      LIFE_LAYOUTS.find((x) => x.id === picked) || LIFE_LAYOUTS.find((x) => x.id === '4q');
    state.life.layout = lay.id;
    state.life.count = lay.count;
    state.life.expandedIdx = null;
    state.life.setupDone = true;
    state.life.rotate = true; // a chosen arrangement means facing seats is the point
    // The format may have changed since the seats were filled: every
    // player starts at this format's life.
    (state.life.players || []).forEach((p) => {
      p.life = lifeStart(state.life.count);
      p.poison = 0;
      p.dmg = [];
      p.defeated = false;
      p.defeatMsg = '';
      p.monarch = false;
      p.initiative = false;
      p.counters = lifeDefaultCounters();
    });
    closeModal();
    renderLifeOverlay();
    animatedHighRoll();
  });
}

function cancelLifeSetup() {
  closeModal();
  dismissAllOverlays();
  render();
}
