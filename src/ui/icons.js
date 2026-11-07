// ui / icons

/* ========================= ICONS ========================= */

function crownSwordSvg() {
  // opacities, fine strokes, a light center accent — crown and crossed swords
  // drawn as line art rather than heavy strokes.
  return `<svg viewBox="0 0 100 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="50" r="46" stroke="#C9A24B" stroke-width="2" opacity="0.55"/>
    <circle cx="50" cy="50" r="38" stroke="#C9A24B" stroke-width="1" opacity="0.35"/>
    <path d="M34 41 L34 30 L41.5 36.5 L50 27 L58.5 36.5 L66 30 L66 41 Z" stroke="#C9A24B" stroke-width="2.5" opacity="0.85"/>
    <line x1="34" y1="46" x2="66" y2="46" stroke="#C9A24B" stroke-width="2.5" opacity="0.85"/>
    <line x1="37" y1="56" x2="63" y2="78" stroke="#C9A24B" stroke-width="2.5" opacity="0.85"/>
    <line x1="63" y1="56" x2="37" y2="78" stroke="#C9A24B" stroke-width="2.5" opacity="0.85"/>
    <circle cx="50" cy="67" r="2.6" fill="#EFE6D0" stroke="none"/>
  </svg>`;
}

function compassSvg() {
  return ICONS.home;
  return `<svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="none" stroke="#C9A24B" stroke-width="2" opacity="0.55"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="#C9A24B" stroke-width="1" opacity="0.35"/>
    <g stroke="#C9A24B" stroke-width="1" opacity="0.6"><line x1="50" y1="4" x2="50" y2="14"/><line x1="50" y1="86" x2="50" y2="96"/><line x1="4" y1="50" x2="14" y2="50"/><line x1="86" y1="50" x2="96" y2="50"/></g>
    <polygon points="50,14 57,50 50,86 43,50" fill="#C9A24B" opacity="0.85"/>
    <polygon points="14,50 50,43 86,50 50,57" fill="#EFE6D0" opacity="0.55"/>
    <circle cx="50" cy="50" r="4" fill="#EFE6D0"/>
  </svg>`;
}

function formatSealSvg(naval) {
  if (!naval)
    return `<svg viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="56" fill="none" stroke="#C9A24B" stroke-width="2" opacity="0.55"/>
    <circle cx="60" cy="60" r="48" fill="none" stroke="#C9A24B" stroke-width="1" stroke-dasharray="1.5 4.5" opacity="0.6"/>
    <g stroke="#C9A24B" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="31" y="36" width="30" height="44" rx="4" transform="rotate(-12 46 58)"/>
      <rect x="57" y="36" width="30" height="44" rx="4" transform="rotate(10 72 58)"/>
    </g>
    <path d="M60 8 l3.2 9 9.4 0.6 -7.2 6 2.3 9.1 -7.7 -5 -7.7 5 2.3 -9.1 -7.2 -6 9.4 -0.6 z" fill="#C9A24B" opacity="0.92"/>
  </svg>`;
  return `<svg viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="56" fill="none" stroke="#C9A24B" stroke-width="2" opacity="0.55"/>
    <circle cx="60" cy="60" r="48" fill="none" stroke="#C9A24B" stroke-width="1" stroke-dasharray="1.5 4.5" opacity="0.6"/>
    <g stroke="#C9A24B" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="33" r="7"/>
      <line x1="60" y1="40" x2="60" y2="90"/>
      <path d="M60 90 q0 13 -15 13 q-13 0 -15 -11"/>
      <path d="M60 90 q0 13 15 13 q13 0 15 -11"/>
      <line x1="42" y1="58" x2="78" y2="58"/>
      <path d="M42 58 q-7 0 -7 9"/>
      <path d="M78 58 q7 0 7 9"/>
    </g>
    <path d="M60 8 l3.2 9 9.4 0.6 -7.2 6 2.3 9.1 -7.7 -5 -7.7 5 2.3 -9.1 -7.2 -6 9.4 -0.6 z" fill="#C9A24B" opacity="0.92"/>
  </svg>`;
}

function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const days = Math.floor(h / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

function identityStripCss(colors) {
  const hex = { W: '#F1E6C8', U: '#7CB8DB', B: '#8B7EA8', R: '#D98A6B', G: '#8FBD8F' };
  if (!colors || !colors.length) return 'linear-gradient(90deg,var(--brass-dim),var(--brass))';
  const stops = colors.map((c) => hex[c] || '#9FB0BC');
  return stops.length === 1 ? stops[0] : `linear-gradient(90deg, ${stops.join(', ')})`;
}

const SYNC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.5 4.5 0 0 0 7 18.5z"/><path d="M10 12.5l2-2 2 2M12 10.5v5"/></svg>`;

const ICONS = {
  tools: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6.5 3 3M6 18l8-8"/><path d="M21 4a6 6 0 0 1-7.5 7.5L6.2 19a2.3 2.3 0 0 1-3.2-3.2l7.5-7.3A6 6 0 0 1 18 1l-4 4 5 5 4-4"/></svg>`,
  return: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 4-6 6 6 6M3 10h12a6 6 0 0 1 0 12"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  trade: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v17M5 6h14M8 20h8M5 6l-3 7h6L5 6zm14 0-3 7h6l-3-7z"/><path d="M2 13a3 3 0 0 0 6 0m8 0a3 3 0 0 0 6 0"/></svg>`,
  gavel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 12.5l-8 8a2.1 2.1 0 0 1-3-3l8-8"/><path d="M16 16l6-6"/><path d="M8 8l6-6"/><path d="M9 7l8 8"/><path d="M21 11l-8-8"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/></svg>`,
  draft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="6.5" width="9" height="13" rx="1.5" transform="rotate(-10 8.5 13)"/><rect x="11" y="4.5" width="9" height="13" rx="1.5" transform="rotate(10 15.5 11)"/></svg>`,
  ban: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.7" fill="currentColor"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/></svg>`,
  decks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5V4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1"/><path d="M3 8V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1"/><rect x="1" y="8" width="14" height="14" rx="2"/><path d="m8 11 3 4-3 4-3-4z"/></svg>`,
  binder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/><path d="M12 5v15"/><rect x="5" y="7" width="4" height="4" rx=".6"/><rect x="15" y="7" width="4" height="4" rx=".6"/><path d="M5 14h4m6 0h4"/></svg>`,
  collection: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="7" width="13" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1"/></svg>`,
  coins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.2 6.1L20 12l-5.8 2.9L12 21l-2.2-6.1L4 12l5.8-2.9z"/></svg>`,
  imp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v11M7.5 10l4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>`,
  exp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 17V6M7.5 10L12 5.5 16.5 10"/><path d="M4 20h16"/></svg>`,
  bulk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h11M4 11h7M4 16h5"/><path d="M13.5 18.2l6.2-6.2 2.3 2.3-6.2 6.2-2.9.6z"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/></svg>`,
  restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5v-11"/><path d="M7.5 9 12 4.5 16.5 9"/><path d="M5 19.5h14"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 19 6v5.5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5"/><path d="M12 17.2v.3"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.2c0-.9.7-1.7 1.7-1.7h3.9l2 2.2h7.7c.9 0 1.7.8 1.7 1.7v8.2c0 .9-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7z"/></svg>`,
  folderPlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.2c0-.9.7-1.7 1.7-1.7h3.9l2 2.2h7.7c.9 0 1.7.8 1.7 1.7v8.2c0 .9-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7z"/><path d="M12 10.6v5M9.5 13.1h5"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="9.8" r="1.6"/><path d="m4 17.2 4.8-4.4 3.4 3 3.1-2.6 4.7 4.1"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15"/><path d="M9.5 7V5.2c0-.4.3-.7.7-.7h3.6c.4 0 .7.3.7.7V7"/><path d="m6.5 7 .9 11.7c.1.8.7 1.3 1.5 1.3h6.2c.8 0 1.4-.5 1.5-1.3L17.5 7"/><path d="M10.2 10.7v5.8M13.8 10.7v5.8"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5" width="13" height="15.5" rx="1.8"/><path d="M9.2 5V4c0-.3.2-.5.5-.5h4.6c.3 0 .5.2.5.5v1"/><path d="M9 10.5h6M9 13.5h6M9 16.5h3.8"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3.5H7.2c-.9 0-1.7.8-1.7 1.7v13.6c0 .9.8 1.7 1.7 1.7h9.6c.9 0 1.7-.8 1.7-1.7V8.5z"/><path d="M13.5 3.5v5h5"/><path d="M8.8 12.8h6.4M8.8 15.8h6.4"/></svg>`,
  printer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V4.5h10V9"/><rect x="3.8" y="9" width="16.4" height="7.6" rx="1.7"/><path d="M7 13.8h10v5.7H7z"/><path d="M16.3 11.6h.4"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5h16"/><path d="m5 15.3 4.4-4.4 3.4 3.1L18.6 8"/><path d="M14.8 8h3.8v3.8"/></svg>`,
  library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6.5" width="11.5" height="14" rx="1.6"/><path d="M8.3 3.5h9.2c.9 0 1.6.7 1.6 1.6v12.4"/></svg>`,
  grave: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V10.2a5 5 0 0 1 10 0V20"/><path d="M4.8 20h14.4"/><path d="M12 9.2v5.6M9.7 11.4h4.6"/></svg>`,
  token: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.6"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.6c0-.9.7-1.6 1.6-1.6h2.3l1.5-2h5.2l1.5 2h2.3c.9 0 1.6.7 1.6 1.6v8.8c0 .9-.7 1.6-1.6 1.6H5.6c-.9 0-1.6-.7-1.6-1.6z"/><circle cx="12" cy="12.8" r="3.4"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 17.6h2"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5z"/></svg>`,
  planet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5.2"/><path d="M7.4 9.6C4.4 8.1 2.6 8 2.2 8.8c-.7 1.3 3.4 4.7 9 7.6s10.7 4 11.4 2.7c.4-.8-.8-2.2-3.2-3.9"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="4.5" width="15" height="15" rx="3.2"/><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="9.5" rx="7.5" ry="4.5"/><path d="M4.5 9.5v4.6c0 2.5 3.4 4.5 7.5 4.5s7.5-2 7.5-4.5V9.5"/><path d="M8.5 17.8v-2.9M12 18.6v-3M15.5 17.8v-2.9"/></svg>`,
  wheel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.7"/><path d="M12 3.5v6.8M12 13.7v6.8M3.5 12h6.8M13.7 12h6.8M6 6l4.8 4.8M13.2 13.2 18 18M18 6l-4.8 4.8M10.8 13.2 6 18"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.8 5.2 18.8 9.2 9 19H5v-4z"/><path d="m12.8 7.2 4 4"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="1.8"/><path d="M16 8V5.8c0-1-.8-1.8-1.8-1.8H5.8C4.8 4 4 4.8 4 5.8v8.4c0 1 .8 1.8 1.8 1.8H8"/></svg>`,
  cardview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3.5" width="12" height="17" rx="1.8"/><path d="M8.6 7h6.8M8.6 14.5h6.8M8.6 17h4.2"/><rect x="8.6" y="8.8" width="6.8" height="3.8" rx=".6"/></svg>`,
  burger: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h15"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`,
  inspire: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16l-6 7v7l-4 2v-9z"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.4 10.8l7.2-4.5M8.4 13.2l7.2 4.5"/></svg>`,
  reco: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/></svg>`,
  similar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8.5" y="3" width="12" height="16" rx="2"/><path d="M15.5 21h-10a2 2 0 0 1-2-2V8"/></svg>`,
  addOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/></svg>`,
  removeOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/></svg>`,
  maybe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9.7 9.3a2.3 2.3 0 1 1 3.2 2.1c-.75.35-.9.95-.9 1.7"/><path d="M12 16.4v.2"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10l-2.6-2.6M17 7l-2.6 2.6M17 17H7l2.6 2.6M7 17l2.6-2.6"/></svg>`,
  manage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h8M19 7h1M4 12h2M13 12h7M4 17h10M21 17h-1"/><circle cx="15" cy="7" r="2.1"/><circle cx="9" cy="12" r="2.1"/><circle cx="17" cy="17" r="2.1"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  selectAll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="14" height="14" rx="2"/><path d="M17 3H5a2 2 0 0 0-2 2v12m8-3 2 2 4-5"/></svg>`,
  chevRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.4 12 4l9 7.4"/><path d="M5.4 9.9V20h13.2V9.9"/><path d="M9.7 20v-5.8h4.6V20"/></svg>`,
};
