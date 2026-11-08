function collectionSettingsHtml() {
  return `<div class="settings-section">
    ${menuCardHtml('collectionSettingsRow', ICONS.collection, 'Collection', 'Binder and folder display')}
    <div id="collectionSettingsBody" class="menu-tool-body scanner-settings" hidden>
      <label class="scanner-setting-toggle" for="hideCollectionFolderPrices">
        <span><strong>Hide binder and folder prices</strong><small>Show card counts without total values on collection tiles.</small></span>
        <input type="checkbox" id="hideCollectionFolderPrices" ${state.hideCollectionFolderPrices ? 'checked' : ''}>
      </label>
    </div>
  </div>`;
}

function wireCollectionSettings() {
  const row = document.getElementById('collectionSettingsRow');
  const body = document.getElementById('collectionSettingsBody');
  row?.addEventListener('click', () => foldToggle(body, null, row));
  document.getElementById('hideCollectionFolderPrices')?.addEventListener('change', (event) => {
    state.hideCollectionFolderPrices = event.target.checked;
    persistSettings();
  });
}
