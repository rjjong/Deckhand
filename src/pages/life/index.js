// pages / life / index

function lifePageHtml() {
  const playing = state.life.setupDone && state.life.players?.length;
  return /* HTML */ `<main class="hub-page life-page">
    <section class="hub-intro">
      <span class="hub-eyebrow">READY WHEN YOU ARE</span>
      <h1>Gather your table.</h1>
      <p>Choose your seats, track every turn, and keep your focus on the game.</p>
    </section>
    <section class="hub-actions" aria-label="Life tracker">
      ${playing ? `<button type="button" class="hub-card" id="lifeResume"><span class="hub-icon">${ICONS.heart}</span><span><strong>Resume game</strong><small>${state.life.players.length} players · Turn ${state.life.turnNum || 1}</small></span><span class="hub-arrow" aria-hidden="true">›</span></button>` : ''}
      <button type="button" class="hub-card" id="lifeNewGame">
        <span class="hub-icon">${ICONS.heart}</span
        ><span><strong>New game</strong><small>Pick a format and a table layout</small></span
        ><span class="hub-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" class="hub-card" id="lifeSavedGames">
        <span class="hub-icon">${inlIco('save', 24)}</span
        ><span><strong>Saved games</strong><small>Restore one of your last ten games</small></span
        ><span class="hub-arrow" aria-hidden="true">›</span>
      </button>
    </section>
    <p class="hub-footnote">Life totals stay with you. Games save as you play.</p>
  </main>`;
}

function wireLifePage() {
  document.getElementById('lifeResume')?.addEventListener('click', openLifeOverlay);
  document.getElementById('lifeNewGame')?.addEventListener('click', () => {
    const playing = state.life.setupDone;
    openLifeOverlay();
    if (playing) restartLife();
  });
  document.getElementById('lifeSavedGames')?.addEventListener('click', openLifeRestore);
}
