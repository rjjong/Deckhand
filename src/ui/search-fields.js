// One search-field treatment for pages, tools, and searchable dropdowns.
// Enhance existing fields in place so their input state and handlers survive.
function enhanceSearchFields(root = document) {
  root
    .querySelectorAll(
      '.searchbar, .deck-search-field, .cselect-search, .tag-drop-search, .cmb-search-row, .cr-qwrap',
    )
    .forEach((field) => {
      const input = field.querySelector(':scope > input, :scope > textarea');
      if (!input) return;
      field.classList.add('app-search-field');
      if (field.classList.contains('cr-qwrap')) return; // Keep the judge's tag mirror aligned.
      let icon = field.querySelector(
        ':scope > .deck-search-icon, :scope > .cs-mag, :scope > .tds-ico, :scope > .app-search-icon',
      );
      if (!icon) {
        icon = document.createElement('span');
        icon.innerHTML = ICONS.search;
        field.insertBefore(icon, input);
      }
      icon.classList.add('app-search-icon');
      icon.setAttribute('aria-hidden', 'true');
    });
}
