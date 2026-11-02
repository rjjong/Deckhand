// core / mana

/* 1.32: which colours a card can make. Scryfall's produced_mana when the card
   carries it. Cards that came from the phone's own database don't (the weekly
   file leaves the field out) -- Birds of Paradise and Bloom Tender went
   uncounted that way -- so their rules text answers instead. Reminder text
   is skipped in the "Add" reading; Treasure makers count through their
   token (1.34). Cards that fetch a land (Nature's Lore, Farseek, Rampant
   Growth, fetchlands) bring the colours of the lands they can find. */
const _PM_ALL = ['W', 'U', 'B', 'R', 'G'];

const _PM_BASIC = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };

const _pmMemo = new WeakMap();

function manaFromRulesText(text, typeLine, withAdd) {
  const out = new Set();
  const o = String(text || '').replace(/\([^)]*\)/g, ' ');
  const tl = String(typeLine || '');
  if (withAdd) {
    // land subtypes: a Plains Island makes W and U even without its reminder text
    tl.split('//').forEach((part) => {
      if (!/\bLand\b/.test(part)) return;
      const sub = (part.split('\u2014')[1] || '').toLowerCase();
      Object.keys(_PM_BASIC).forEach((b) => {
        if (new RegExp('\\b' + b + '\\b').test(sub)) out.add(_PM_BASIC[b]);
      });
    });
    const re = /\badd\b([^.]*)/gi;
    let m;
    while ((m = re.exec(o))) {
      const cl = m[1];
      (cl.match(/\{[^}]+\}/g) || []).forEach((sym) =>
        sym
          .slice(1, -1)
          .toUpperCase()
          .split('/')
          .forEach((p) => {
            if (/^[WUBRGC]$/.test(p)) out.add(p);
          }),
      );
      if (
        /mana of any (one )?colou?r|any combination of colou?rs|mana of (that|the chosen) colou?r|colou?r identity|of any colou?r/i.test(
          cl,
        )
      )
        _PM_ALL.forEach((k) => out.add(k));
      if (/mana of any type/i.test(cl)) {
        _PM_ALL.forEach((k) => out.add(k));
        out.add('C');
      }
    }
  }
  // 1.34: mana TOKENS count too -- Treasure and Gold make any colour,
  // Powerstones and Eldrazi Spawn/Scions make colourless.
  const lo = String(text || '').toLowerCase();
  if (/\bcreates?\b[^.]*\b(treasure|gold)\b/.test(lo)) _PM_ALL.forEach((k) => out.add(k));
  if (/\bcreates?\b[^.]*\b(powerstone|eldrazi spawn|eldrazi scion)\b/.test(lo)) out.add('C');
  // land fetching. 1.34: only a BASIC-only search is held to its types
  // ("basic Forest card" = green). "a Forest card" also finds Temple
  // Garden, Breeding Pool, a triome... so Nature's Lore, Farseek, Knight of
  // the White Orchid and the fetchlands can bring every colour.
  const fr = /search your library for ([^.]*)/gi;
  let f;
  while ((f = fr.exec(o))) {
    const seg = f[1].toLowerCase();
    const types = Object.keys(_PM_BASIC).filter((b) => new RegExp('\\b' + b + '\\b').test(seg));
    if (types.length) {
      if (/\bbasic\b/.test(seg)) types.forEach((b) => out.add(_PM_BASIC[b]));
      else _PM_ALL.forEach((k) => out.add(k));
    } else if (/\blands?\b|\bgates?\b/.test(seg)) _PM_ALL.forEach((k) => out.add(k));
  }
  return out;
}

function producedManaOf(c) {
  if (!c || typeof c !== 'object') return [];
  if (_pmMemo.has(c)) return _pmMemo.get(c);
  const faces = Array.isArray(c.card_faces) ? c.card_faces : [];
  const pm = c.produced_mana || (faces[0] && faces[0].produced_mana) || null;
  const text = c.oracle_text || faces.map((f) => f.oracle_text || '').join('\n');
  const tl = c.type_line || faces.map((f) => f.type_line || '').join(' // ');
  const set = manaFromRulesText(text, tl, !(pm && pm.length));
  if (pm && pm.length) pm.forEach((k) => set.add(k));
  const out = ['W', 'U', 'B', 'R', 'G', 'C'].filter((k) => set.has(k));
  try {
    _pmMemo.set(c, out);
  } catch (e) {}
  return out;
}

function countsForCurve(c) {
  // The mana curve is a curve of castable SPELLS. A land stays out if it can
  // provide mana in any form: producing it directly (produced_mana), or the
  // workaround — searching other lands onto the battlefield (fetchlands,
  // Evolving Wilds). Only a land with no path to mana at all, like Maze of
  // Ith, is a real draw you spend a card on — that one counts, at 0.
  const face0 = (c.card_faces && c.card_faces[0]) || null;
  const tl0 = (c.type_line || (face0 && face0.type_line) || '').split('//')[0];
  if (!/\bLand\b/i.test(tl0)) return true;
  const pm = c.produced_mana || (face0 && face0.produced_mana) || [];
  if (pm.length) return false;
  const ot = c.oracle_text || (face0 && face0.oracle_text) || '';
  if (/search your library for [^.]*\b(plains|island|swamp|mountain|forest|gate|land)\b/i.test(ot))
    return false;
  return true;
}

function manaSymbolCounts(cards) {
  // GEN counts generic pips ONLY from truly colourless cards — costs made of
  // nothing but numerals (and X): Sol Ring's {1} counts, but the {3} in
  // {3}{R}{R} does not; that card contributes its two R symbols alone.
  // C = the true Eldrazi diamond {C}, only on cards that literally demand it.
  // Hybrid symbols like {2/W} keep counting their colour half only.
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, GEN: 0 };
  let total = 0;
  cards.forEach((c) => {
    // Lands never count toward symbols (production scans them separately).
    // The front face decides: a pure land is out; an MDFC spell//land still
    // counts its castable spell side.
    const tl = (
      c.type_line ||
      (c.card_faces && c.card_faces[0] && c.card_faces[0].type_line) ||
      ''
    ).split('//')[0];
    if (/\bLand\b/i.test(tl)) return;
    const symbols = rawManaCost(c).match(/\{([^}]+)\}/g) || [];
    if (!symbols.length) return;
    const pureGeneric = symbols.every((sym) => /^\d+$|^X$/i.test(sym.slice(1, -1)));
    symbols.forEach((sym) => {
      const inner = sym.slice(1, -1);
      if (/^\d+$/.test(inner)) {
        if (pureGeneric) {
          const n = parseInt(inner, 10);
          counts.GEN += n;
          total += n;
        }
        return; // generic pips on coloured cards count for nothing
      }
      inner.split('/').forEach((part) => {
        if (counts[part] !== undefined && part !== 'GEN') {
          counts[part]++;
          total++;
        }
      });
    });
  });
  return { counts, total };
}

function categoryOf(card, d) {
  if (d && (card.type_line || '').split('//')[0].includes('Land')) return 'Lands';
  const t = frontFace(card).type_line || '';
  if (t.includes('Creature')) return 'Creatures';
  if (t.includes('Planeswalker')) return 'Planeswalkers';
  if (t.includes('Battle')) return 'Battles';
  if (t.includes('Instant')) return 'Instants';
  if (t.includes('Sorcery')) return 'Sorceries';
  if (t.includes('Artifact')) return 'Artifacts';
  if (t.includes('Enchantment')) return 'Enchantments';
  return 'Other';
}

function pipsHtml(colors, size) {
  // The same hand-drawn mana symbols the Advanced filters use — no more
  // letter circles on deck tiles.
  const px = size === 'sm' ? 15 : 18;
  if (!colors || !colors.length) return manaIconSvg('C', px);
  return colors.map((c) => manaIconSvg(c, px)).join('');
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s) {
  // No automatic card-name recognition — the WRITER decides what links: a
  // card name between "quotes" becomes a tappable link to its card sheet.
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/&quot;([^&<>]{2,80}?)&quot;/g, '<a class="card-ql" href="javascript:void 0">$1</a>');
}

/* Card names inside primer prose become tappable links — matched against
   the local 33k-card index, longest name first, links styled blue. Single-
   word names need 6+ letters so prose words like “opt” stay prose. */
/* A featherweight card peek — just the image, ✕ or back to dismiss. */
async function openCardPeek(name) {
  try {
    const ix = await bulkIndexReady();
    const entry = ix && ix.byName ? ix.byName.get(String(name).toLowerCase()) : null;
    if (!entry) return;
    const cardish = bulkToCardish(entry);
    pushOverlay('cardPeek', () => {
      document.getElementById('cardPeekOverlay')?.remove();
    });
    let el = document.getElementById('cardPeekOverlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'overlay';
      el.id = 'cardPeekOverlay';
    }
    document.body.appendChild(el);
    el.innerHTML = /* HTML */ `<div
      class="overlay-inner"
      style="display:flex;flex-direction:column;"
    >
      ${overlayCapHtml(cardish.name || name, `<button type="button" class="header-filter" id="peekClose" aria-label="Close">${ICONS.close}</button>`)}
      <main style="display:flex;align-items:center;justify-content:center;padding:14px;">
        <img
          class="${wbClass(cardish)}"
          src="${cardImageLarge(cardish)}"
          alt="${escapeHtml(name)}"
          style="max-width:min(92vw,420px);border-radius:16px;"
        />
      </main>
    </div>`;
    el.querySelector('#peekClose').addEventListener('click', closeTopOverlay);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.tagName === 'MAIN') closeTopOverlay();
    });
  } catch (e) {}
}

function renderPrimerHtml(md) {
  if (!md || !md.trim())
    return '<p class="empty-note" style="padding:14px 0;">No primer written yet. Add strategy notes, key combos, or a mulligan guide for this deck.</p>';
  const lines = escapeHtml(md).split(/\r?\n/);
  let html = '';
  let inList = false;
  lines.forEach((line) => {
    const l = line.trim();
    if (!l) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      return;
    }
    if (/^#{1,3}\s/.test(l)) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<h4>${l.replace(/^#+\s*/, '')}</h4>`;
      return;
    }
    if (/^[-*]\s/.test(l)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineMd(l.replace(/^[-*]\s/, ''))}</li>`;
      return;
    }
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    html += `<p>${inlineMd(l)}</p>`;
  });
  if (inList) html += '</ul>';
  return html;
}
