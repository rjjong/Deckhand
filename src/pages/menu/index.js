// pages / menu / index

function menuPageHtml() {
  return /* HTML */ `<main class="hub-page menu-page">
    <section class="hub-intro">
      <span class="hub-eyebrow">YOUR COMPANION AT THE TABLE</span>
      <h1>Make it yours.</h1>
      <p>A place for your preferences, tools, and everything behind the cards.</p>
    </section>
    <div class="account-warning-slot">${accountWarningHtml()}</div>
    ${menuNoticeHtml()} ${menuToolsHtml()}
    <section class="hub-actions menu-settings" aria-label="Settings">
      ${menuCardHtml('menuAccount', SYNC_ICON, 'Account & sync', escapeHtml(accountStatusLabel()))}
      ${pwaInstallCardHtml()}
      <button type="button" class="hub-card" id="menuSettings">
        <span class="hub-icon">${ICONS.settings}</span
        ><span><strong>Settings</strong><small>Preferences &amp; backups</small></span
        ><span class="hub-arrow" aria-hidden="true">›</span>
      </button>
    </section>
    <p class="hub-footnote">Deckhand · Built for your next game.</p>
  </main>`;
}

function wireMenuPage() {
  document.getElementById('tradeRow')?.addEventListener('click', () => switchPage('trade'));
  wireMenuNotice();
  document.getElementById('menuInstallApp')?.addEventListener('click', installPwa);
  document.getElementById('menuSettings')?.addEventListener('click', () => switchPage('settings'));
  const credits = document.getElementById('appFootNote');
  const cell = document.getElementById('appFootCell');
  if (credits && cell) {
    document.querySelector('.menu-page .hub-footnote')?.before(credits);
    cell.remove();
  }
  wirePreferenceCards();
  wireMenuTools();
}
