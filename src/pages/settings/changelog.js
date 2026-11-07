// pages / settings / changelog

function settingsChangelogHtml() {
  return /* HTML */ `<div class="settings-section settings-changelog">
    ${menuCardHtml('settingsChangelogRow', ICONS.list, 'Version &amp; changelog', `Version ${escapeHtml(APP_VERSION)} · ${escapeHtml(changelogDate(APP_DATE))}`)}
    <div id="settingsChangelogBody" class="menu-tool-body" hidden>
      ${changelogListHtml(changelogAll(), true)}
    </div>
  </div>`;
}

function wireSettingsChangelog() {
  const row = document.getElementById('settingsChangelogRow');
  const body = document.getElementById('settingsChangelogBody');
  row?.addEventListener('click', () => foldToggle(body, null, row));
  const setOpen = (button, open) => {
    button.nextElementSibling.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  body?.querySelectorAll('[data-clv]').forEach((button, index) => {
    setOpen(button, index === 0);
    button.addEventListener('click', () => setOpen(button, button.nextElementSibling.hidden));
  });
}
