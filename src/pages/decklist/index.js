// pages / decklist / index

/* ---------------- DECKLIST PAGE ---------------- */

/* Card-type glyphs from "Mana" by Andrew Gioia (SIL OFL 1.1) — the
   official-style MTG symbology. Battle keeps the house shield: the pack
   has no battle icon. Stef's gift, v2.51.331. */
const DOCK_TYPE_ICONS = {
  Creature:
    '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M23.537 1.823h1.456c-1.451 1.276-3.218 1.65-4.807 2.514-2.125 0.933-3.74 2.641-5.553 4.033-1.708 1.36-3.619 2.498-5.034 4.193-1.405 1.669-2.95 3.304-3.794 5.349 0.354 0.79 0.656 1.602 0.918 2.428 4.9-4.47 9.863-9.134 16.063-11.746 2.998-1.198 5.922-2.81 9.198-3.090-0.637 1.096-1.663 1.529-2.596 2.017-3.944 1.889-7.748 4.199-10.819 7.35-2.918 3.243-6.531 5.757-9.589 8.86-1.265 1.281-2.24 2.835-3.613 4.008-0.883 0.768-2.115-0.36-1.896-1.354 0.134-1.555 0.841-3.361-0.242-4.741-0.93-0.749-2.287-0.962-3.103-1.752 0 0-0.086-0.361-0.105-0.63s0.105-0.759 0.105-0.759c0.509-2.321 2.373-4.024 3.877-5.782 1.65-1.861 3.387-3.705 5.502-5.046 1.494-0.79 3.17-1.185 4.639-2.033 2.966-1.638 5.906-3.166 9.395-3.817zM21.912 18.504c-2.536 1.297-4.897 2.905-7.124 4.674-1.634 1.265-3.944 2.163-4.419 4.406-0.37 1.045 0.236 2.039 1.102 2.593h1.195c1.552-0.959 2.364-2.66 3.571-3.97 1.816-2.013 3.708-4.005 5.989-5.499 1.647-1.105 3.278-2.236 4.944-3.316 1.564-1.026 3.352-1.689 4.811-3.428-3.648 0.739-6.901 2.67-10.071 4.54z"></path></svg>',
  Instant:
    '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M13.701 2.542h11.528c0.286 0.096 0.558 0.283 0.628 0.595-0.053 0.387-0.288 0.713-0.566 0.974-0.488 0.611-1.080 1.127-1.625 1.685-0.336 0.304-0.577 0.695-0.915 0.998-0.544 0.559-1.14 1.071-1.621 1.688-0.459 0.473-0.933 0.93-1.399 1.396-0.275 0.266-0.481 0.595-0.767 0.851-0.557 0.571-1.166 1.095-1.658 1.725-0.527 0.551-1.091 1.066-1.612 1.622-0.335 0.446-0.756 0.813-1.145 1.21-0.307 0.31-0.666 0.604-0.825 1.024-0.071 0.29 0.311 0.431 0.543 0.378 2.471-0.492 4.942-0.988 7.414-1.482 0.346-0.065 0.775-0.007 0.975 0.317 0.406 0.644 0.477 1.436 0.849 2.094 0.2 0.36 0.643 0.469 1.024 0.491 0.56-0.039 1.117-0.179 1.682-0.115 0.146 0.030 0.257 0.139 0.379 0.218v0.396c-0.24 0.355-0.563 0.64-0.863 0.943-0.809 0.809-1.616 1.619-2.424 2.43-0.257 0.26-0.558 0.469-0.814 0.73-1.027 1.032-2.057 2.061-3.084 3.093-0.463 0.521-1.038 0.921-1.511 1.43-0.916 0.922-1.838 1.839-2.753 2.763-0.25 0.257-0.531 0.472-0.844 0.632l-0.32 0.080c0.116-0.691 0.641-1.197 0.968-1.79 1.713-2.678 3.402-5.372 5.113-8.051 0.133-0.218 0.242-0.474 0.201-0.734-0.082-0.376-0.518-0.538-0.863-0.518-3.796 0.585-7.585 1.199-11.38 1.787-0.684 0.089-1.372 0.278-2.064 0.163-0.235-0.065-0.424-0.228-0.542-0.438v-0.677c0.371-0.862 0.835-1.679 1.286-2.5 1.252-2.25 2.519-4.491 3.785-6.733 0.208-0.368 0.456-0.727 0.552-1.146 0.109-0.273-0.152-0.557-0.416-0.599-0.385-0.116-0.912-0.001-1.141-0.416-0.22-0.598 0.196-1.169 0.502-1.651 0.8-1.331 1.602-2.661 2.42-3.982 0.294-0.459 0.79-0.735 1.302-0.883z"></path></svg>',
  Sorcery:
    '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M12.781 1.938h0.013c0.58 0.136 1.216 0.232 1.689 0.624 0.163 0.113 0.166 0.317 0.17 0.496-0.593 0.041-1.178-0.157-1.771-0.066-0.921 0.117-1.898 0.407-2.517 1.14-0.556 0.667-0.596 1.605-0.437 2.422 0.152 0.83 0.798 1.453 1.465 1.912 1.048 0.667 2.248 1.066 3.251 1.808 1.058 0.741 1.792 1.85 2.855 2.585 0.371 0.256 0.803 0.458 1.266 0.434 0.707 0.051 1.404-0.406 1.681-1.049 0.368-1.21-0.184-2.666-1.31-3.272-0.762-0.427-1.624-0.616-2.427-0.944-0.216-0.082-0.433-0.222-0.477-0.466 0.040-0.158 0.141-0.318 0.317-0.341 1.29-0.192 2.594 0.14 3.769 0.666 1.745 0.907 3.329 2.162 4.493 3.756 1.124 1.493 1.752 3.299 2.093 5.121 0.059 0.428 0.125 0.855 0.204 1.28v2.759c-0.198 1.282-0.44 2.579-0.998 3.762-0.819 1.822-2.18 3.429-3.925 4.421-1.036 0.609-1.406 1.149-5.86 1.072v0c-0.507-0.148-0.662-0.32-0.75-0.652 0.138-0.466 0.672-0.597 1.087-0.698 0.453-0.118 1.032-0.153 1.272-0.624-0.127-0.544-0.669-0.83-1.15-1.009-0.727-0.268-1.525-0.239-2.282-0.146-1.097 0.197-2.099 0.832-3.238 0.802-1.393-0.023-2.711-0.632-3.821-1.438-0.803-0.575-1.424-1.37-1.902-2.227-0.336-0.601-1.042-1.925-0.652-3.675v-0.015c0.211-1.099 0.622-2.228 1.493-2.976 0.572-0.437 1.244-0.812 1.977-0.845 0.274 0.008 0.619 0.034 0.777 0.293-0.012 0.106-0.067 0.183-0.16 0.232-0.356 0.233-0.796 0.378-1.038 0.752-0.454 0.618-0.496 1.432-0.385 2.165 0.181 0.906 0.824 1.676 1.615 2.129 0.631 0.362 1.312 0.646 2.026 0.788 0.642 0.131 1.297 0.168 1.949 0.197 0.648 0.028 1.193-0.067 1.762-0.062 0.788 0.007 1.596 0.066 2.333 0.382 0.988 0.431 1.891 1.134 2.408 2.095 0.197 0.374 0.245 0.805 0.444 1.177 0.441-0.083 0.638-0.537 0.772-0.916 0.324-0.878 0.046-1.839-0.329-2.653-0.593-1.227-1.761-2.093-3.046-2.485-1.219-0.392-2.546-0.21-3.752-0.651-0.561-0.197-0.993-0.631-1.364-1.078-0.23-0.276-0.354-0.657-0.224-1.006 0.549-0.137 1.061 0.289 1.613 0.212 0.469-0.106 0.795-0.539 0.889-0.993 0.203-0.697 0.029-1.47-0.424-2.032-0.607-0.755-1.495-1.215-2.389-1.544-1.001-0.384-2.093-0.546-3.022-1.106-1.011-0.633-1.883-1.557-2.273-2.701-0.381-0.993-0.378-2.075-0.33-3.122 0.098-0.99 0.532-1.923 1.118-2.716 0.382-0.531 0.933-0.9 1.478-1.244 0.648-0.411 2.128-0.996 3.972-0.73z"></path></svg>',
  Artifact:
    '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M7.992 1.938h16.015c0.41 0.128 0.83 0.344 0.968 0.784 0.134 0.709-0.138 1.412-0.067 2.123 0.065 0.616-0.192 1.222-0.067 1.834 0.242 0.355 0.684 0.517 0.895 0.896 0.081 0.129 0.142 0.271 0.202 0.412v0.842c-0.141 0.346-0.342 0.674-0.634 0.913-0.261 0.233-0.621 0.407-0.728 0.766-0.581 2.304-1.286 4.598-2.381 6.715-0.255 0.534-0.77 0.864-1.211 1.23-0.641 0.526-1.397 0.881-2.142 1.231-0.457 0.212-0.993 0.349-1.319 0.758-0.058 0.308 0 0.621 0.045 0.926 0.086 1.014 0.179 2.028 0.252 3.044 0.102 0.546-0.009 1.125 0.219 1.647 0.352 0.851 1.152 1.388 1.933 1.809 0.726 0.327 1.499 0.625 2.309 0.599 0.611-0.026 1.244 0.074 1.787 0.368 0.322 0.16 0.375 0.636 0.113 0.877-0.269 0.209-0.617 0.263-0.938 0.35h-14.489c-0.32-0.086-0.667-0.142-0.935-0.35-0.241-0.225-0.22-0.653 0.055-0.841 0.636-0.386 1.403-0.427 2.128-0.407 1.109-0.103 2.175-0.573 3.052-1.254 0.427-0.332 0.783-0.774 0.957-1.29 0.169-0.488 0.071-1.010 0.171-1.508 0.095-1.181 0.173-2.363 0.315-3.54 0.008-0.207 0.043-0.458-0.16-0.587-0.517-0.406-1.18-0.55-1.747-0.873-0.847-0.384-1.604-0.934-2.292-1.554-0.404-0.38-0.622-0.901-0.864-1.387-0.879-1.91-1.519-3.922-2.014-5.962-0.115-0.407-0.548-0.577-0.823-0.856-0.263-0.214-0.43-0.513-0.534-0.832v-0.836c0.102-0.515 0.548-0.787 0.915-1.103 0.319-0.229 0.206-0.662 0.188-0.996-0.14-0.618-0.028-1.252-0.096-1.875-0.070-0.426-0.122-0.865-0.047-1.294 0.167-0.407 0.565-0.654 0.968-0.782z"></path></svg>',
  Enchantment:
    '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M15.839 2.855h0.294c0.115 0.318 0.203 0.647 0.245 0.985 0.414 3.991 0.839 7.985 1.253 11.976 0.072 0.448 0.075 0.966 0.396 1.32 0.377 0.288 0.786-0.094 1.018-0.384 2.057-2.781 4.163-5.529 6.231-8.304 0.219-0.325 0.523-0.575 0.874-0.745-0.018 0.409-0.083 0.82-0.248 1.197-1.232 2.994-2.422 6.007-3.649 9.003-0.136 0.409-0.35 0.85-0.206 1.287 0.209 0.419 0.767 0.222 1.117 0.12 2.356-0.946 4.708-1.909 7.061-2.865 0.563-0.254 1.141-0.486 1.76-0.561v0.283c-0.376 0.462-0.857 0.815-1.309 1.196-1.905 1.621-3.796 3.258-5.715 4.863-0.312 0.277-0.646 0.639-0.582 1.092 0.113 0.379 0.52 0.54 0.862 0.654 2.257 0.524 4.493 1.145 6.744 1.701v0.293c-2.732 0.601-5.436 1.34-8.194 1.817-0.488 0.054-1.028 0.24-1.485-0.029-0.206-0.321-0.061-0.711-0.034-1.060 0.213-1.255 0.054-2.57-0.492-3.721-0.842-1.809-2.562-3.197-4.527-3.577-1.766-0.363-3.678 0.066-5.104 1.173-1.88 1.386-2.893 3.881-2.425 6.181 0.048 0.353 0.177 0.786-0.136 1.060-0.296 0.131-0.623 0.085-0.934 0.043-2.711-0.39-5.339-1.191-8.020-1.738-0.208-0.053-0.414-0.115-0.62-0.173v-0.203c0.246-0.117 0.503-0.213 0.77-0.273 1.933-0.42 3.822-1.026 5.758-1.439 0.412-0.109 0.918-0.262 1.063-0.715 0.050-0.451-0.286-0.81-0.595-1.090-1.68-1.407-3.338-2.842-5.005-4.263-0.655-0.598-1.399-1.101-1.992-1.763v-0.328c0.334 0.074 0.675 0.133 0.994 0.262 2.473 1.034 4.968 2.014 7.444 3.042 0.451 0.176 1.391 0.585 1.512-0.157 0.030-0.623-0.28-1.191-0.499-1.757-0.985-2.427-1.965-4.856-2.951-7.281-0.281-0.735-0.694-1.448-0.684-2.259 0.36 0.155 0.66 0.406 0.879 0.729 2.046 2.757 4.134 5.481 6.18 8.239 0.249 0.376 0.649 0.609 1.108 0.534 0.177-0.444 0.313-0.906 0.352-1.386 0.353-3.429 0.719-6.856 1.081-10.283 0.109-0.902 0.118-1.825 0.408-2.697z"></path></svg>',
  Planeswalker:
    '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M15.996 0c0.041 0.076 0.047 0.163 0.063 0.246 0.066 0.441 0.091 0.886 0.125 1.33 0.076 1.183 0.137 2.367 0.211 3.55 0.125 1.934 0.268 3.87 0.548 5.79 0.137 0.906 0.3 1.812 0.577 2.686 0.367 0.027 0.734 0.054 1.1 0.094 0.181-0.535 0.27-1.095 0.363-1.651 0.083-0.519 0.153-1.041 0.217-1.563 0.249-2.039 0.423-4.086 0.611-6.131 0.043-0.421 0.071-0.845 0.14-1.263 0.035 0.090 0.043 0.188 0.058 0.283 0.041 0.286 0.071 0.574 0.102 0.861 0.197 1.912 0.37 3.827 0.616 5.734 0.113 0.875 0.238 1.749 0.405 2.616 0.112 0.566 0.232 1.134 0.434 1.677 0.34 0.104 0.678 0.218 1.005 0.358 0.103-0.235 0.18-0.48 0.252-0.726 0.183-0.638 0.31-1.291 0.42-1.944 0.239-1.41 0.379-2.834 0.566-4.252 0.049-0.323 0.082-0.652 0.184-0.964 0.050 0.134 0.065 0.277 0.088 0.417 0.090 0.64 0.152 1.284 0.216 1.927 0.065 0.699 0.135 1.397 0.187 2.096 0.002-0.008 0.006-0.024 0.008-0.032-0.001 0.098 0.009 0.196 0.019 0.294 0.143 1.685 0.281 3.371 0.406 5.058-0.959 0.363-1.866 0.861-2.695 1.463-1.11 0.806-2.075 1.803-2.876 2.916-0.835 1.16-1.495 2.443-1.969 3.791-0.596 1.696-0.933 3.474-1.114 5.26-0.059 0.548-0.095 1.099-0.151 1.647-0.020 0.146-0.024 0.301-0.094 0.434h-0.035c-0.065-0.099-0.069-0.22-0.087-0.333-0.043-0.364-0.067-0.73-0.1-1.094-0.084-0.983-0.204-1.965-0.388-2.935-0.302-1.587-0.757-3.154-1.468-4.608-0.813-1.668-1.933-3.197-3.336-4.417-1.040-0.905-2.235-1.635-3.525-2.124 0.178-2.348 0.366-4.695 0.585-7.040 0.074-0.762 0.145-1.524 0.249-2.282 0.022-0.138 0.039-0.278 0.080-0.412 0.005 0.001 0.016 0.003 0.022 0.004 0.085 0.274 0.118 0.561 0.161 0.844 0.149 1.096 0.261 2.197 0.417 3.293 0.125 0.878 0.265 1.755 0.48 2.616 0.096 0.374 0.201 0.749 0.354 1.105 0.327-0.141 0.666-0.253 1.006-0.359 0.127-0.338 0.218-0.688 0.3-1.039 0.124-0.545 0.222-1.095 0.31-1.647 0.356-2.277 0.564-4.574 0.796-6.867 0.042-0.412 0.083-0.825 0.137-1.236 0.020-0.13 0.031-0.263 0.073-0.389 0.046 0.287 0.071 0.577 0.1 0.866 0.183 1.947 0.345 3.896 0.567 5.839 0.107 0.923 0.221 1.847 0.385 2.762 0.074 0.386 0.147 0.775 0.279 1.147 0.366-0.033 0.732-0.066 1.099-0.091 0.274-0.862 0.435-1.755 0.572-2.648 0.149-1 0.256-2.005 0.345-3.012 0.152-1.717 0.248-3.437 0.346-5.157 0.048-0.762 0.084-1.525 0.165-2.284 0.021-0.169 0.039-0.34 0.089-0.503z"></path></svg>',
  Battle:
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1 14 3v4.4c0 3.7-2.4 6.3-6 7.6-3.6-1.3-6-3.9-6-7.6V3z"/></svg>',
  Land: '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M10.756 3.523l0.002-0.001c0.825-0.316 1.306 0.346 1.5 0.658 1.075 1.515 1.514 3.352 2.294 5.017 1.055 2.212 2.206 4.463 4.041 6.138 0.241 0.259 0.719 0.494 0.928 0.249 0.768-0.9 1.389-1.911 1.948-2.952 0.361-0.718 1.161-1.177 1.962-1.151 0.634-0.018 1.206 0.389 1.559 0.891 0.809 1.231 1.198 2.665 1.739 4.022 0.666 1.43 1.391 2.874 2.519 4.003 0.669 0.624 1.395 1.184 2.020 1.855 0.343 0.304 0.536 0.728 0.686 1.151l0.015 0.043c0.149 1.177-0.513 1.735-0.892 2.004-0.739 0.589-1.621 0.96-2.509 1.258-2.994 1.063-6.163 1.622-9.327 1.758-5.152 0.221-7.177 0.004-7.702-0.086-1.923-0.172-3.833-0.493-5.711-0.942-1.543-0.425-3.119-0.855-4.494-1.702-0.536-0.319-1.558-0.709-1.275-2.319l0.016-0.021c0.289-1.060 1.099-1.865 1.837-2.644 0.545-0.742 1.307-1.284 1.852-2.025 1.294-1.664 2.244-3.568 2.989-5.531 0.682-1.721 1.081-3.538 1.687-5.286 0.303-1.127 0.753-2.212 1.298-3.243 0.243-0.455 0.579-0.862 1.018-1.141z"></path></svg>',
};

function dockTypeCounts(d) {
  const kinds = [
    'Creature',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Planeswalker',
    'Battle',
    'Land',
  ];
  const all = deckLeaders(d).concat(d.cards);
  return kinds
    .map((k) => {
      const n = all.filter((c) => (c.type_line || '').split('//')[0].includes(k)).length;
      return n
        ? `<button type="button" class="deck-type-link" data-deck-type="${k === 'Sorcery' ? 'Sorceries' : k + 's'}">${DOCK_TYPE_ICONS[k]}<span>${k === 'Sorcery' ? 'Sorceries' : k + 's'}</span><strong>${n}</strong></button>`
        : '';
    })
    .filter(Boolean)
    .join('');
}

function deckMeterHtml(d) {
  const selected = state._dlSel?.size || 0;
  const move =
    selected && Array.from(state._dlSel).some((k) => k.startsWith('main:'))
      ? 'Move to ' + sideName(d)
      : 'Move to main deck';
  return /* HTML */ `<div class="deck-dock" id="deckMeterRow">
    ${
      selected
        ? `<div class="deck-selection" role="group" aria-label="Selected cards">
      <strong>${selected} selected</strong>
      <button type="button" id="dlSelColl" aria-label="Add selected cards to collection" title="Add to collection">${ICONS.binder}</button>
      <button type="button" id="dlSelMaybe" aria-label="${move}" title="${move}">${ICONS.maybe}</button>
      <button type="button" id="dlSelDel" class="deck-danger" aria-label="Remove selected cards" title="Remove cards">${ICONS.trash}</button>
      <button type="button" id="dlSelX" aria-label="Cancel selection" title="Cancel selection">${ICONS.close}</button>
    </div>`
        : `<div class="deck-search-field app-search-field">
      <span class="deck-search-icon" aria-hidden="true">${ICONS.search}</span>
      <input id="dockSearchInput" type="search" enterkeyhint="search" aria-label="Search this deck" placeholder="Search this deck…" value="${escapeHtml(state.dlSearchQ || '')}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button type="button" id="dockSearchBtn" aria-label="Clear deck search" title="Clear search" ${state.dlSearchQ || state.dlFilterOn ? '' : 'hidden'}>${ICONS.close}</button>
      <button type="button" id="dockFilterChev" aria-label="Filter deck cards" title="Filter cards" aria-expanded="${state.dlPanel === 'dsearch'}">${ICONS.filter}</button>
    </div>`
    }
  </div>`;
}

/* Patch the summary in place when background pricing completes. */
function refreshCapPrice() {
  if (state.screen !== 'decklist') return;
  const d = getDeck(state.activeDeckId);
  if (!d) return;
  const el = document.getElementById('deckPriceValue');
  if (el) el.innerHTML = deckSummaryPriceHtml(d);
}

function decklistPageHtml() {
  const d = getDeck(state.activeDeckId);
  if (!d)
    return /* HTML */ `<main>
      ${needDeckHtml('No deck open yet. Choose or create one from My Stuff.')}
    </main>`;
  return /* HTML */ ` <main class="has-dock deck-workspace">
    <div class="builder-tabs" role="group" aria-label="Deck pages">
      <button
        class="b-tab ${state.builderTab === 'list' ? 'active' : ''}"
        data-btab="list"
        aria-pressed="${state.builderTab === 'list'}"
      >
        Decklist
      </button>
      <button
        class="b-tab ${state.builderTab === 'stats' ? 'active' : ''}"
        data-btab="stats"
        aria-pressed="${state.builderTab === 'stats'}"
      >
        Stats
      </button>
      <button
        class="b-tab ${state.builderTab === 'primer' ? 'active' : ''}"
        data-btab="primer"
        aria-pressed="${state.builderTab === 'primer'}"
      >
        Deck Log
      </button>
    </div>
    <div id="builderBody"></div>
    ${deckMeterHtml(d)}
    <button
      type="button"
      class="deck-fab"
      id="dockAddCards"
      aria-label="Add cards to this deck"
      aria-haspopup="menu"
      title="Add cards"
    >
      ${ICONS.plus}
    </button>
  </main>`;
}

function checkCommanderLegality(d) {
  // The whole commander family: Commander, Pauper Commander, PreDH and
  // Duel Commander. Same shape, each judged in its own format.
  const fmt = deckFormat(d),
    L = fmtLabelOf(fmt);
  const pdh = fmt === 'paupercommander';
  const issues = [];
  const all = deckLeaders(d).concat(d.cards || []);
  const total = all.length,
    SP = fmtSpec(fmt);
  if (total > SP.max)
    issues.push({
      level: 'error',
      text: `Deck has ${total} cards — ${L} decks are exactly ${SP.max} including the commander.`,
    });
  else if (total < SP.min)
    issues.push({
      level: 'warn',
      text: `${SP.min - total} more card${SP.min - total === 1 ? '' : 's'} to reach ${SP.min}.`,
    });
  const leaderBad = (c) =>
    pdh
      ? !(c.type_line || '').includes('Creature')
      : !isLegendary(c) || !(c.type_line || '').includes('Creature');
  if (!d.admiral) issues.push({ level: 'warn', text: 'No Commander appointed yet.' });
  else {
    if (leaderBad(d.admiral) && !/can be your commander/i.test(d.admiral.oracle_text || ''))
      issues.push({
        level: 'error',
        text: pdh
          ? `${d.admiral.name} can't be your commander — in ${L} it must be an uncommon creature.`
          : `${d.admiral.name} can't be your Commander — it must be a legendary creature.`,
      });
    if (fmtVerdict(d.admiral, fmt) === 'banned')
      issues.push({ level: 'error', text: `${d.admiral.name} is banned in ${L}.` });
  }
  if (d.partner) {
    if (!d.admiral)
      issues.push({
        level: 'error',
        text: `${d.partner.name} is a second Commander, but no first Commander is appointed.`,
      });
    else if (!canPair(d.admiral, d.partner))
      issues.push({
        level: 'error',
        text: `${d.admiral.name} and ${d.partner.name} can't share command — their abilities don't pair.`,
      });
    if (fmtVerdict(d.partner, fmt) === 'banned')
      issues.push({ level: 'error', text: `${d.partner.name} is banned in ${L}.` });
  }
  const seen = new Map();
  const ci = new Set(deckColorIdentity(d));
  const unknown = [];
  (d.cards || []).forEach((c) => {
    const basic = (c.type_line || '').includes('Basic Land');
    if (!basic) {
      const n = (seen.get(c.name) || 0) + 1;
      seen.set(c.name, n);
      if (n === 2)
        issues.push({
          level: 'error',
          text: `${c.name} appears more than once — ${L} is singleton (basic lands excepted).`,
        });
    }
    // Name-based offline verdict in the deck's own format. 'preview' is no
    // issue at all — the 🔮 badge already says it, and the card becomes
    // legal by itself on release day.
    const v = fmtVerdict(c, fmt);
    if (v === 'banned') issues.push({ level: 'error', text: `${c.name} is banned in ${L}.` });
    else if (v === 'not_legal')
      issues.push({ level: 'error', text: `${c.name} isn't legal in ${L}.` });
    else if (v === 'unknown') unknown.push(c.name);
    if (d.admiral && (c.color_identity || []).some((x) => !ci.has(x)))
      issues.push({
        level: 'error',
        text: `${c.name} is outside your Commanders' color identity.`,
      });
    if (deckLeaders(d).some((L2) => L2.name === c.name))
      issues.push({ level: 'error', text: `${c.name} is both a Commander and in the deck.` });
  });
  if (unknown.length) queueFmtLegality(unknown);
  return issues;
}

/* The 60-card check: at least 60 in the main deck, at most 15 in the
   sideboard, four copies (restricted: one) across both, and every card
   legal in the format -- judged by name against the live ban list, and by
   the card's own facts for rotation, rarity and card pool. */
function checkConstructedLegality(d) {
  const fmt = deckFormat(d),
    label = fmtLabelOf(fmt);
  const issues = [];
  const add = (level, text, cards) => issues.push({ level, label: text, cards: cards || [] });
  const main = d.cards || [],
    side = ensureMaybeboard(d);
  const n = main.length,
    SP = fmtSpec(fmt);
  if (n < SP.min) add('error', `${n}/${SP.min} cards — ${SP.min - n} to add`);
  if (side.length > SP.side)
    add('error', `Sideboard ${side.length}/${SP.side} — ${side.length - SP.side} too many`);
  const both = main.concat(side);
  const counts = new Map();
  both.forEach((c) => counts.set(c.name, (counts.get(c.name) || 0) + 1));
  const over = [],
    restr = [],
    banned = [],
    notLegal = [],
    unknown = [];
  counts.forEach((q, nm) => {
    const card = both.find((c) => c.name === nm);
    const lim = copyLimit(card, d);
    if (q > lim) (lim === 1 ? restr : over).push(nm);
    const v = fmtVerdict(card, fmt);
    if (v === 'banned') banned.push(nm);
    else if (v === 'not_legal') notLegal.push(nm);
    else if (v === 'unknown') unknown.push(nm);
  });
  if (over.length) add('error', `More than 4 copies`, over);
  if (restr.length) add('error', `Restricted — one copy only`, restr);
  if (banned.length) add('error', `Banned in ${label}`, banned);
  if (notLegal.length) add('error', `Not legal in ${label}`, notLegal);
  if (unknown.length) queueFmtLegality(unknown);
  return issues;
}

function checkDeckLegality(d) {
  return deckIsConstructed(d) ? checkConstructedLegality(d) : checkCommanderLegality(d);
}

function legalityHtml(d) {
  if (!state.legalityOpen) return '';
  const issues = checkDeckLegality(d);
  if (!issues.length)
    return /* HTML */ `<div class="legality ok" id="legalityBox">
      <span class="lg-icon">✓</span><span class="lg-txt">${trS('Deck is legal')}</span>
    </div>`;
  const errors = issues.filter((i) => i.level === 'error').length;
  return /* HTML */ `<div class="legality ${errors ? 'bad' : 'warn'} open" id="legalityBox">
    <div class="lg-body" style="display:block;padding:10px 12px;">
      ${issues
        .map((i) => {
          // Commander checks say {text} with no card list — reading
          // i.cards.length on the latter crashed the whole screen.
          const cards = i.cards || [];
          const label = i.label != null ? i.label : i.text || '';
          return /* HTML */ `<div class="lg-item ${i.level}">
            <div class="lg-label">${escapeHtml(label)}</div>
            ${cards.length ? `<div class="lg-cards">${cards.map((n) => `<span class="lg-card">${escapeHtml(n)}</span>`).join('')}</div>` : ''}
          </div>`;
        })
        .join('')}
    </div>
  </div>`;
}

/* ---- pricing ------------------------------------------------------------
   Scryfall's `prices.eur` is Cardmarket's Trend Price (falling back to their
   1-day/7-day/average/suggested price when trend isn't available). We scan
   every paper printing of a card and take the cheapest, then cache it for 24h
   — both because Scryfall asks apps to cache price data, and because pricing a
   60-card deck costs one request per card. */
const PRICE_TTL = 24 * 60 * 60 * 1000;

function wireDecklistPage() {
  // After the page settles, price the deck and warm the budget engine — all
  // of it in the LOW-priority lane, so it can never queue ahead of anything
  // the user taps. By the time Budget is opened, its data is usually ready.
  {
    const d0 = getDeck(state.activeDeckId);
    if (d0)
      setTimeout(() => {
        priceDeck(d0, null, true)
          .then(() => {
            refreshCapPrice();
            return prefetchBudgetData(d0);
          })
          .catch(() => {});
      }, 2500);
  }
  const d = getDeck(state.activeDeckId);
  if (!d) {
    wireNeedDeck();
    return;
  }
  document.getElementById('menuBtn')?.addEventListener('click', () => openDeckActions(d));
  document
    .getElementById('dockAddCards')
    ?.addEventListener('click', (event) => openDeckAddMenu(d, event));
  if (deckIsConstructed(d)) {
    try {
      ensureFmtBans(deckFormat(d));
    } catch (e) {}
  }
  document.querySelectorAll('.b-tab').forEach((b) =>
    b.addEventListener('click', () => {
      state.builderTab = b.dataset.btab;
      state.dlPanel = null;
      state.dockSet = 0;
      renderBuilderBody(d);
      updateDeckMeter(d);
      syncTabsUI();
      scrollToPageFoot();
    }),
  );
  wireMeterRow(d);
  refreshLegality(d);
  renderBuilderBody(d);
}
