// services / deck-sharing

/* ---- share links -------------------------------------------------------
   There's no server behind this app, so a share link carries the whole deck
   in the URL hash: names only (the receiving app re-resolves them against
   Scryfall, exactly like Import does), gzipped when the browser supports it
   to keep the link short. */
function b64urlEncode(bytes) {
  let s = '';
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function buildShareUrl(d) {
  // Kept deliberately lean: every byte here becomes ~1.4 characters of URL,
  // and messaging apps stop linkifying very long URLs — which cuts the deck
  // code and breaks the link. Tags are personal metadata, not the deck, so
  // they no longer travel (old links that carry them still import fine).
  const payload = {
    n: d.name,
    a: d.admiral ? d.admiral.name : null,
    a2: d.partner ? d.partner.name : null,
    c: d.cards.map((c) => c.name),
    m: (d.maybeboard || []).map((c) => c.name),
    p: d.primer || '',
    ds: d.description || '',
    wr: (() => {
      const st = logStatsFor(d);
      return st ? { w: st.wins, l: st.losses } : null;
    })(),
    by: d.author || '',
    f: deckFormat(d), // the deck travels with its format
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let token;
  if (typeof CompressionStream !== 'undefined') {
    try {
      let fmt = 'deflate-raw',
        prefix = 'd';
      let cs;
      try {
        cs = new CompressionStream(fmt);
      } catch (e) {
        fmt = 'gzip';
        prefix = 'g';
        cs = new CompressionStream(fmt);
      }
      const w = cs.writable.getWriter();
      w.write(bytes);
      w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      token = prefix + b64urlEncode(new Uint8Array(buf));
    } catch (e) {
      token = 'r' + b64urlEncode(bytes);
    }
  } else {
    token = 'r' + b64urlEncode(bytes);
  }
  // location.origin is the literal string "null" on file:// and content:// pages,
  // which produced links like "null/path#deck=…". Strip any existing hash instead.
  const base = location.href.split('#')[0].split('?')[0];
  return base + '?deck=' + token;
}

async function decodeShareToken(token) {
  // Messaging apps wrap, truncate, and decorate pasted links — strip anything
  // that can't be part of a token (spaces, newlines, trailing ellipsis/
  // punctuation) before decoding, so a cleanly copied link always survives.
  token = String(token || '').replace(/[^A-Za-z0-9_-]/g, '');
  const kind = token[0];
  const bytes = b64urlDecode(token.slice(1));
  let json;
  if (kind === 'd') {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes);
    w.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    json = new TextDecoder().decode(buf);
  } else if (kind === 'g') {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(bytes);
    w.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    json = new TextDecoder().decode(buf);
  } else {
    json = new TextDecoder().decode(bytes);
  }
  return JSON.parse(json);
}

async function shareDeck(d) {
  // A share *link* only exists if this app itself lives at a real web address.
  // Opened as a local file (file:// or content://) there is nothing for the
  // link to point at, so share the decklist as text instead of a dead link.
  const hosted = /^https?:/i.test(location.href);
  if (!hosted) {
    const lines = [`${d.name} — ${fmtLabelOf(deckFormat(d))} deck`];
    if (d.admiral) lines.push(`${fmtName(d)}: ${d.admiral.name}`);
    if (d.partner) lines.push(`Partner: ${d.partner.name}`);
    {
      const m = new Map();
      d.cards.forEach((c) => m.set(c.name, (m.get(c.name) || 0) + 1));
      lines.push('', ...Array.from(m, ([n, q]) => q + ' ' + n));
    }
    const text = lines.join('\n');
    if (navigator.share) {
      try {
        await navigator.share({ title: d.name, text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Decklist copied — share links need the app hosted at a web address.');
      return;
    } catch (e) {
      toast('Could not share this deck.');
    }
    return;
  }
  // Byline: shown on the shared deck page. Asked once, remembered for future
  // shares, editable any time from this prompt.
  if (d.author === undefined || d.author === null) {
    const remembered = localStorage.getItem(LS_PREFIX + 'authorName') || '';
    const name = await new Promise((res) =>
      openInAppPrompt('Sign your deck', 'Your name or handle (optional)', remembered, (v) =>
        res(v),
      ),
    );
    d.author = (name || '').trim();
    if (d.author) {
      try {
        localStorage.setItem(LS_PREFIX + 'authorName', d.author);
      } catch (e) {}
    }
    persistDeck(d);
  }
  let url;
  try {
    url = await buildShareUrl(d);
  } catch (e) {
    console.error('share encode failed', e);
    toast('Could not build a share link for this deck.');
    return;
  }
  const isLocalFile = location.protocol === 'file:' || location.protocol === 'content:';
  const text = `${d.name} — ${fmtLabelOf(deckFormat(d))} format decklist`;
  if (navigator.share) {
    try {
      await navigator.share({ title: d.name, text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; /* fall through to clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(
      isLocalFile
        ? 'Link copied — it only opens for people with this same file.'
        : 'Deck link copied to clipboard.',
    );
  } catch (e) {
    toast('Could not share or copy this deck.');
  }
}

/* If the app was opened via a share link, offer to import the deck it carries. */
function pendingShareToken() {
  try {
    const q = new URL(location.href).searchParams.get('deck');
    if (q) return q;
  } catch (e) {}
  const h = location.hash || '';
  if (h.startsWith('#deck=')) return h.slice(6); // legacy links keep working
  return null;
}

async function checkShareLink() {
  const token = pendingShareToken();
  if (!token) return false;
  history.replaceState({ screen: 'home' }, '', location.pathname); // don't re-import on refresh
  let payload;
  try {
    payload = await decodeShareToken(token);
  } catch (e) {
    console.error('share decode failed', e);
    appReady();
    toast(
      'This deck link arrived incomplete — messaging apps sometimes cut long links. Ask the sender to copy the link (Share → copy) and send it as-is.',
      5000,
    );
    return false;
  }
  openShowcase(payload, { fromLink: true });
  return true;
}

/* Close the top overlay, then run `fn` only after the history-driven close has
   actually completed — closing and navigating in the same tick was leaving
   half-rendered screens (missing nav bar) after Save/Import on deck pages. */
function closeOverlayThen(fn) {
  if (!state.overlayStack.length) {
    fn();
    return;
  }
  const top = state.overlayStack[state.overlayStack.length - 1];
  if (!top.pushed) {
    // Overlay has no history entry — it closes synchronously, no popstate.
    closeTopOverlay();
    fn();
    return;
  }
  let done = false;
  const h = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', h);
    setTimeout(fn, 30);
  };
  window.addEventListener('popstate', h);
  setTimeout(h, 600); // safety: if popstate never fires, proceed anyway
  closeTopOverlay();
}
