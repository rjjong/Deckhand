// ui / card-skeleton

/* ---- The offline card skeleton ---------------------------------------
   The same five colours the mana charts use, plus the app's flat gold for
   anything multicoloured (kleurenwet: no new colours are invented here). */
const SK_INK = { W: '#F1E6C8', U: '#7CB8DB', B: '#8B7EA8', R: '#D98A6B', G: '#8FBD8F' };

const SK_GREY = '#9AA0A6';

const _skCache = new Map();

function _skColorOf(c) {
  if (!c) return SK_GREY;
  let cols = c.colors && c.colors.length ? c.colors : c.c ? String(c.c).split('') : null;
  if (!cols || !cols.length) {
    // A land or an artifact has no colour of its own; its identity still
    // says which deck it belongs to, so a gold/one-colour hint is fair.
    cols =
      c.color_identity && c.color_identity.length
        ? c.color_identity
        : c.ci
          ? String(c.ci).split('')
          : [];
  }
  cols = cols.filter((x) => SK_INK[x]);
  if (cols.length > 1) {
    let g = '';
    try {
      g = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
    } catch (e) {}
    return g || '#E8BE58';
  }
  return cols.length === 1 ? SK_INK[cols[0]] : SK_GREY;
}

function _skEsc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _skFit(t, n) {
  t = String(t || '');
  return t.length > n ? t.slice(0, n - 1) + '\u2026' : t;
}

/* De Oracle-tekst zoals de database op de telefoon hem kent: de volle kaart
   (oracle_text), een dubbelzijdige kaart (card_faces) of het slanke veld
   `ot` uit de lokale database. */
function _skOracleOf(c) {
  if (!c) return '';
  if (c.oracle_text) return String(c.oracle_text);
  if (Array.isArray(c.card_faces) && c.card_faces.length) {
    return c.card_faces
      .map((f) => String((f && f.oracle_text) || ''))
      .filter(Boolean)
      .join('\n//\n');
  }
  return String(c.ot || '');
}

/* Een tekening kan niets meten -- een SVG-achtergrond heeft geen layout.
   Dus schatten we de breedte per teken, in eenheden van de lettergrootte.
   Ruim genomen: liever een tikje kleiner dan over de rand. */
function _skW(t, size) {
  let w = 0;
  const str = String(t == null ? '' : t);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (/[ .,:;'`!|\u2019]/.test(ch)) w += 0.3;
    else if (/[ijlt()\[\]\/]/.test(ch)) w += 0.36;
    else if (/[MW\u2014]/.test(ch)) w += 0.95;
    else if (/[mw]/.test(ch)) w += 0.82;
    else if (/[A-Z0-9]/.test(ch)) w += 0.68;
    else w += 0.54;
  }
  return w * size;
}

/* Eén regel die in een vak moet passen: de letter krimpt tot hij past.
   Pas als hij op zijn kleinst nog te breed is, wordt er afgekapt. */
function _skFitW(t, maxW, base, min) {
  let size = base;
  let str = String(t == null ? '' : t);
  while (size > min && _skW(str, size) > maxW) size--;
  if (_skW(str, size) > maxW) {
    while (str.length > 1 && _skW(str + '\u2026', size) > maxW) str = str.slice(0, -1);
    str = str.replace(/[\s\u2014-]+$/, '') + '\u2026';
  }
  return { t: str, size };
}

/* Tekst in regels breken op BREEDTE in plaats van op aantal tekens.
   Manasymbolen staan in accolades ({1}{G}); die vallen weg, de tekens
   blijven los van elkaar staan. */
function _skWrapW(text, maxW, size) {
  const lines = [];
  String(text || '')
    .split(/\n+/)
    .forEach((para) => {
      const woorden = para
        .replace(/\}\{/g, ' ')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
      let regel = '';
      woorden.forEach((w) => {
        const t = regel ? regel + ' ' + w : w;
        if (_skW(t, size) <= maxW || !regel) regel = t;
        else {
          lines.push(regel);
          regel = w;
        }
      });
      if (regel) lines.push(regel);
    });
  return lines;
}

/* Het hele tekstvak: de letter krimpt tot de VOLLEDIGE Oracle-tekst
   binnen het vak past -- breedte én hoogte. Alleen als hij op zijn
   kleinst nog niet past, eindigt de laatste regel op een beletselteken. */
function _skBlock(text, maxW, top, bottom, base, min) {
  const plek = (size) => {
    const lead = Math.round(size * 1.34);
    return { lead, ruimte: Math.max(1, Math.floor((bottom - top - size) / lead) + 1) };
  };
  if (!String(text || '').trim()) return { lines: [], size: base, lead: Math.round(base * 1.34) };
  for (let size = base; size >= min; size--) {
    const { lead, ruimte } = plek(size);
    const lines = _skWrapW(text, maxW, size);
    if (lines.length <= ruimte) return { lines, size, lead };
  }
  const { lead, ruimte } = plek(min);
  const lines = _skWrapW(text, maxW, min).slice(0, ruimte);
  if (lines.length) lines[lines.length - 1] += ' \u2026';
  return { lines, size: min, lead };
}

/* One card, drawn: frame, title bar, empty art window, type bar, four blank
   text rules and a power/toughness box when the card has one. */
function cardSkeletonUri(card) {
  const name = String((card && (card.name || card.n)) || '');
  // A skeleton drawn before the database was loaded carries only the name,
  // so the cache key says HOW MUCH was known -- a fuller one replaces it.
  const ot = _skOracleOf(card);
  const known = ot ? 'text' : card && (card.type_line || card.tl) ? 'full' : 'bare';
  const key = (name || '?') + '|' + known;
  if (_skCache.has(key)) return _skCache.get(key);
  const col = _skColorOf(card);
  const type = String((card && (card.type_line || card.tl)) || '')
    .split('//')[0]
    .trim();
  const cost = String((card && (card.mana_cost || card.mc)) || '')
    .replace(/[{}]/g, ' ')
    .trim();
  const pw = card && (card.power != null ? card.power : card.pw);
  const tg = card && (card.toughness != null ? card.toughness : card.tg);
  const pt = pw != null && tg != null && pw !== '' ? pw + '/' + tg : '';
  // Elk vak van de kaart heeft een vaste breedte; de letter past zich aan.
  // De naambalk deelt zijn ruimte met de manakosten rechts.
  const costF = cost ? _skFitW(cost, 150, 21, 12) : null;
  const nameF = _skFitW(name, 380 - (costF ? _skW(costF.t, costF.size) + 16 : 0), 25, 12);
  const typeF = _skFitW(type, 380, 21, 11);
  // Het tekstvak loopt van y=462 tot y=642; het power/toughness-vakje bijt
  // er onderaan een hoek uit, dus daar is minder hoogte beschikbaar.
  const otBox = _skBlock(ot, 380, 472, pt ? 598 : 634, 18, 10);
  const otLines = otBox.lines;
  const L = (y) =>
    `<rect x="58" y="${y}" width="${372 - (y % 3) * 26}" height="7" rx="3.5" fill="${col}" fill-opacity="0.22"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680" width="488" height="680">` +
    `<rect width="488" height="680" rx="26" fill="#100D0B"/>` +
    `<rect x="14" y="14" width="460" height="652" rx="20" fill="none" stroke="${col}" stroke-opacity="0.55" stroke-width="3"/>` +
    `<rect x="36" y="38" width="416" height="52" rx="12" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-opacity="0.45" stroke-width="2"/>` +
    `<text x="54" y="${64 + Math.round(nameF.size * 0.34)}" fill="${col}" fill-opacity="0.95" font-family="Georgia,serif" font-size="${nameF.size}">${_skEsc(nameF.t)}</text>` +
    (costF
      ? `<text x="434" y="${64 + Math.round(costF.size * 0.34)}" text-anchor="end" fill="${col}" fill-opacity="0.8" font-family="Georgia,serif" font-size="${costF.size}">${_skEsc(costF.t)}</text>`
      : '') +
    `<rect x="36" y="104" width="416" height="286" rx="10" fill="none" stroke="${col}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="10 8"/>` +
    `<rect x="36" y="404" width="416" height="44" rx="10" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-opacity="0.45" stroke-width="2"/>` +
    `<text x="54" y="${426 + Math.round(typeF.size * 0.34)}" fill="${col}" fill-opacity="0.9" font-family="Georgia,serif" font-size="${typeF.size}">${_skEsc(typeF.t)}</text>` +
    `<rect x="36" y="462" width="416" height="180" rx="10" fill="none" stroke="${col}" stroke-opacity="0.35" stroke-width="2"/>` +
    // De echte Oracle-tekst uit de database op de telefoon. Staat hij er
    // niet (nog niet geladen, of een kaart zonder tekst), dan blijven de
    // vier blinde regels staan.
    (otLines.length
      ? otLines
          .map(
            (ln, i) =>
              `<text x="54" y="${472 + otBox.size + i * otBox.lead}" fill="${col}" fill-opacity="0.72" font-family="Georgia,serif" font-size="${otBox.size}">${_skEsc(ln)}</text>`,
          )
          .join('')
      : L(492) + L(524) + L(556) + L(588)) +
    (pt
      ? `<rect x="336" y="604" width="116" height="50" rx="10" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-opacity="0.5" stroke-width="2"/>` +
        `<text x="394" y="638" text-anchor="middle" fill="${col}" fill-opacity="0.95" font-family="Georgia,serif" font-size="24">${_skEsc(pt)}</text>`
      : '') +
    `</svg>`;
  const uri = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  if (_skCache.size > 400) _skCache.clear();
  _skCache.set(key, uri);
  return uri;
}

/* The picture failed: find out WHICH card this was and draw its skeleton.
   The local database is already in memory, so its type, colour and stats
   come for free -- exactly the information the card sheet shows offline. */
let _skIdxAsked = false;

function _skLookup(name) {
  const key = String(name || '').toLowerCase();
  if (!key) return null;
  // The database in memory is the best source -- but at boot it is still
  // loading, which is exactly when the first pictures fail. Ask for it once
  // and redraw every skeleton the moment it lands.
  try {
    if (_bulkIdx && _bulkIdx.byName) {
      const bc = _bulkIdx.byName.get(key);
      if (bc) return bc;
    }
  } catch (e) {}
  if (!_bulkIdx && !_skIdxAsked) {
    _skIdxAsked = true;
    try {
      bulkIndexReady()
        .then(() => {
          try {
            repaintSkeletons();
          } catch (e) {}
        })
        .catch(() => {});
    } catch (e) {}
  }
  // Meanwhile: the card is almost certainly already in front of us.
  const pots = [];
  try {
    const d = getDeck(state.activeDeckId);
    if (d) {
      pots.push(d.cards || []);
      pots.push(d.maybeboard || []);
    }
  } catch (e) {}
  try {
    if (state.searchResults) pots.push(state.searchResults);
  } catch (e) {}
  try {
    if (state.reco && state.reco.pool) pots.push(state.reco.pool);
  } catch (e) {}
  try {
    if (state.collection && state.collection.items) pots.push(state.collection.items);
  } catch (e) {}
  try {
    (state.decksIndex || []).forEach((d) => {
      if (d && d.cards) pots.push(d.cards);
    });
  } catch (e) {}
  for (const arr of pots) {
    for (const c of arr) {
      if (c && String(c.name || c.n || '').toLowerCase() === key) return c;
    }
  }
  return null;
}

function _skFor(name) {
  return cardSkeletonUri(_skLookup(name) || { name });
}

/* Every card picture still on its way gets its skeleton painted BEHIND it,
   so nothing is ever blank or broken while it loads -- and offline the
   frame is simply what stays. The picture covers it the moment it lands. */
function paintPendingArt(root) {
  const scope = root || document;
  let n = 0;
  scope.querySelectorAll('img').forEach((im) => {
    if (n > 80) return; // never a long job
    if (im.classList.contains('art-missing') || im.classList.contains('art-pending')) return;
    const src = String(im.currentSrc || im.src || '');
    if (!/scryfall\.io/.test(src)) return;
    if (im.complete && im.naturalWidth > 0) return; // already there
    const nm = im.getAttribute('alt') || '';
    if (!nm) return;
    n++;
    try {
      im.style.setProperty('--sk', _skFor(nm));
      im.classList.add('art-pending');
    } catch (e) {}
    const done = () => {
      im.classList.remove('art-pending');
    };
    im.addEventListener('load', done, { once: true });
  });
}

/* Redraw every skeleton on screen — used once the card database finishes
   loading, so the frames fill in with type, cost and stats by themselves. */
function repaintSkeletons() {
  document.querySelectorAll('img.art-missing').forEach((im) => {
    const nm = im.getAttribute('alt') || '';
    if (!nm) return;
    try {
      im.style.setProperty('--sk', _skFor(nm));
    } catch (e) {}
  });
}

/* Line back? Give every skeleton one quiet chance at its real picture. A
   probe loads it out of sight, so the tile only changes once it succeeded. */
function retryMissingArt() {
  document.querySelectorAll('img.art-missing').forEach((im) => {
    const src = im.dataset.artsrc || im.currentSrc || im.src;
    if (!src) return;
    im.dataset.artsrc = src;
    const probe = new Image();
    probe.onload = () => {
      im.classList.remove('art-missing');
      im.style.removeProperty('--sk');
      if (im.src !== src) im.src = src;
    };
    probe.src = src;
  });
}
