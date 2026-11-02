// ui / card-details

/* ---- read-only card info sheet ----
   Same details as the decklist card sheet (printing, price, Oracle text,
   rulings) for cards tapped anywhere outside a deck — search results, browse,
   inspiration. Offers an add button instead of deck-editing actions. */
/* Open at the card image and keep the start visible while details load,
   releasing the scroll position as soon as the reader takes control. */
function pinSheetToTop(root) {
  const m = root.querySelector('.overlay-inner > main') || root.querySelector('main');
  if (!m) return;
  let userMoved = false,
    done = false;
  const release = () => {
    userMoved = true;
  };
  m.addEventListener('touchstart', release, { passive: true, once: true });
  m.addEventListener('pointerdown', release, { passive: true, once: true });
  m.addEventListener('wheel', release, { passive: true, once: true });
  const pin = () => {
    if (!userMoved && !done) m.scrollTop = 0;
  };
  requestAnimationFrame(pin);
  let ro = null;
  if (window.ResizeObserver) {
    try {
      ro = new ResizeObserver(pin);
      Array.from(m.children).forEach((c) => ro.observe(c));
    } catch (e) {
      ro = null;
    }
  }
  m.querySelectorAll('img').forEach((im) => {
    if (!im.complete) im.addEventListener('load', pin, { once: true });
  });
  setTimeout(() => {
    done = true;
    try {
      ro && ro.disconnect();
    } catch (e) {}
  }, 1600);
}

function attachSwipeNav(el, onNext, onPrev, meta) {
  meta = meta || {};
  const can = (dir) =>
    dir === 'next'
      ? meta.canNext
        ? !!meta.canNext()
        : true
      : meta.canPrev
        ? !!meta.canPrev()
        : true;
  const peek = (dir) => {
    try {
      return dir === 'next' ? meta.peekNext && meta.peekNext() : meta.peekPrev && meta.peekPrev();
    } catch (e) {
      return null;
    }
  };
  const ghostEl = () => {
    let g = el._swipeGhost;
    if (!g) {
      g = document.createElement('img');
      g.className = 'swipe-ghost';
      g.alt = '';
      el.appendChild(g);
      el._swipeGhost = g;
    }
    // Ride at the SAME height as the card on the sheet: center the ghost on
    // the hero image and match its width, so the incoming card lines up
    // edge-for-edge with the one leaving. Mid-screen stays the fallback,
    // and the anchor is clamped so a far-scrolled hero can't drag the
    // preview off the screen.
    const hero = el.querySelector('.card-detail img');
    if (hero) {
      const r = hero.getBoundingClientRect();
      if (r.height > 40 && r.width > 40) {
        const vh = window.innerHeight || 640;
        const cy = Math.min(vh - 120, Math.max(120, r.top + r.height / 2));
        g.style.top = cy + 'px';
        g.style.width = r.width + 'px';
        g.style.marginLeft = -r.width / 2 + 'px';
      }
    }
    return g;
  };
  const killGhost = () => {
    if (el._swipeGhost) {
      el._swipeGhost.remove();
      el._swipeGhost = null;
    }
  };
  const edgeFlash = (side) => {
    const fl = document.createElement('div');
    fl.className = 'edge-flash ' + side;
    el.appendChild(fl);
    setTimeout(() => fl.remove(), 340);
    try {
      navigator.vibrate && navigator.vibrate(14);
    } catch (err) {}
  };
  /* Card sheets slide like the main pages now: the sheet follows the finger
     while dragging, commits with a glide-out past the threshold (the next
     card glides in from the opposite side), and snaps back on a short drag.
     The chevrons run the same glide, minus the finger. One engine for every
     sheet — decklist, search results, spoilers, collection stacks. */
  const paneEl = () => el.querySelector('.overlay-inner > main') || el.querySelector('main');
  /* A carousel, not a cut: on release the leaving sheet keeps sliding out
     while the NEXT sheet -- the whole sheet, not just its card -- slides in
     from exactly where its card was under the finger, both on one curve.
     The incoming card image rides on top until the new sheet's own image
     has loaded, so the card never blanks or pops in late.
     Transforms on the sheet are divided by its CSS zoom (0.9), so sheet and
     card move the same number of pixels as the finger. */
  const zoomOf = (n) => {
    try {
      return parseFloat(getComputedStyle(n).zoom) || 1;
    } catch (e) {
      return 1;
    }
  };
  const setX = (n, px) => {
    if (n) n.style.transform = px ? `translateX(${px / zoomOf(n)}px)` : '';
  };
  function slideCommit(which) {
    const m = paneEl();
    const W0 = window.innerWidth || 360;
    if (Date.now() < (el._swipeAnimUntil || 0)) return; // one glide at a time
    if (which && !can(which)) {
      // end of the chain: flash, never glide out
      edgeFlash(which === 'next' ? 'right' : 'left');
      which = null;
    }
    if (!which) {
      // short drag: snap home
      const g0 = el._swipeGhost;
      if (g0) {
        g0.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
        g0.style.transform = `translate(${curDx < 0 ? W0 : -W0}px, -50%)`;
        setTimeout(killGhost, 180);
      }
      if (m) {
        m.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
        setX(m, 0);
        m.style.opacity = '1';
        setTimeout(() => {
          if (m) {
            m.style.transition = '';
            m.style.transform = '';
            m.style.opacity = '';
            m.style.willChange = '';
          }
        }, 180);
      }
      curDx = 0;
      return;
    }
    const out = which === 'next' ? -1 : 1; // the side the old sheet leaves toward
    const dx0 = curDx;
    curDx = 0;
    const inX = -out * W0 + dx0; // where the incoming card is now
    // A chevron tap has no ghost yet: the incoming card starts just off-screen.
    let g = el._swipeGhost;
    const src = peek(which);
    if (!g && src) {
      g = ghostEl();
      g.src = src;
      g.style.transition = 'none';
      g.style.transform = `translate(${inX}px, -50%)`;
      g.style.opacity = '1';
    }
    // The leaving sheet, measured before the new one replaces it.
    const inner = m && m.parentElement;
    const ir = inner ? inner.getBoundingClientRect() : null;
    const mr = m ? m.getBoundingClientRect() : null;
    const scrollTop = m ? m.scrollTop : 0,
      oldOp = m ? m.style.opacity || '1' : '1';
    const dur = Math.round(Math.max(180, Math.min(300, ((W0 - Math.abs(dx0)) / W0) * 320)));
    const ease = 'cubic-bezier(.2,.75,.25,1)';
    el._swipeAnimUntil = Date.now() + dur + 60;
    try {
      navigator.vibrate && navigator.vibrate(6);
    } catch (err) {}
    which === 'next' ? onNext() : onPrev(); // renders the new sheet in place, synchronously
    const nm = paneEl();
    if (g && !g.isConnected) el.appendChild(g); // the re-render emptied the overlay
    let wrap = null;
    if (m && nm && nm !== m && ir && mr) {
      // The old sheet goes back in, frozen, in a twin of its old frame.
      wrap = document.createElement('div');
      wrap.className = 'overlay-inner swipe-leaving';
      wrap.style.cssText = `position:fixed;left:${ir.left}px;top:${mr.top}px;width:${ir.width}px;height:${mr.height}px;max-width:none;margin:0;pointer-events:none;z-index:120;transform:translateX(${dx0}px);`;
      m.style.transition = 'none';
      m.style.transform = '';
      m.style.opacity = oldOp;
      wrap.appendChild(m);
      el.appendChild(wrap);
      m.scrollTop = scrollTop;
      nm.style.willChange = 'transform';
      nm.style.transition = 'none';
      setX(nm, inX);
    } else if (m && nm === m) {
      // No re-render (yet): the old sheet simply leaves.
      m.style.transition = `transform ${dur}ms ${ease}, opacity ${dur}ms ${ease}`;
      setX(m, out * W0);
      m.style.opacity = '0.4';
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (wrap) {
          wrap.style.transition = `transform ${dur}ms ${ease}`;
          wrap.style.transform = `translateX(${out * W0}px)`;
          m.style.transition = `opacity ${dur}ms ${ease}`;
          m.style.opacity = '0.4';
        }
        if (nm && nm !== m) {
          nm.style.transition = `transform ${dur}ms ${ease}`;
          setX(nm, 0);
        }
        if (g) {
          g.style.transition = `transform ${dur}ms ${ease}`;
          g.style.transform = 'translate(0px, -50%)';
        }
      }),
    );
    setTimeout(() => {
      if (wrap) wrap.remove();
      const cur = paneEl();
      [nm, cur].forEach((x) => {
        if (x) {
          x.style.transition = '';
          x.style.transform = '';
          x.style.opacity = '';
          x.style.willChange = '';
        }
      });
      // The riding card leaves only once the sheet's own image can take over.
      const gg = el._swipeGhost;
      if (!gg) return;
      const hero = el.querySelector('.card-detail img');
      const fade = () => {
        if (el._swipeGhost !== gg) return;
        gg.style.transition = 'opacity 90ms linear';
        gg.style.opacity = '0';
        setTimeout(() => {
          if (el._swipeGhost === gg) killGhost();
        }, 110);
      };
      if (!hero || (hero.complete && hero.naturalWidth)) fade();
      else {
        hero.addEventListener('load', fade, { once: true });
        hero.addEventListener('error', fade, { once: true });
        setTimeout(fade, 1200);
      }
    }, dur + 30);
  }
  // Chevrons flank the hero image at its vertical middle — same glide.
  const img = el.querySelector('.card-detail img');
  if (img && !img.closest('.ci-nav-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'ci-nav-wrap';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    const mk = (which, glyph, side) => {
      const b = document.createElement('button');
      b.className = 'ci-nav-arrow ' + side;
      b.innerHTML = glyph;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (Date.now() < (el._swipeAnimUntil || 0)) return;
        // 1.11: the same carousel as a swipe -- the whole next sheet glides in
        if (el._swipeLive && el._swipeLive.can(which)) {
          G.W = window.innerWidth || 360;
          G.dx = 0;
          const P = prepLive(which);
          if (P) {
            placeLive(P, 0);
            finishLive(P, true);
            return;
          }
        }
        slideCommit(which);
      });
      wrap.appendChild(b);
    };
    mk('prev', '‹', 'left');
    mk('next', '›', 'right');
  }
  // The overlay element persists across _replace renders, so the previous
  // render's touch listeners must come off before new ones go on — otherwise
  // every card viewed stacks another handler and one swipe navigates them
  // all at once (or stale closures cancel out and the sheet jams).
  if (el._swipeNavHandlers) {
    el.removeEventListener('touchstart', el._swipeNavHandlers.ts);
    if (el._swipeNavHandlers.tm) el.removeEventListener('touchmove', el._swipeNavHandlers.tm);
    el.removeEventListener('touchend', el._swipeNavHandlers.te);
    if (el._swipeNavHandlers.tc) el.removeEventListener('touchcancel', el._swipeNavHandlers.tc);
  }
  let curDx = 0; // the fallback glide (slideCommit) reads it
  // 1.39: a laptop trackpad's two-finger sideways swipe steps too -- the
  // same glide as the chevrons, one card per gesture.
  if (el._swipeWheel) el.removeEventListener('wheel', el._swipeWheel);
  {
    let acc = 0,
      last = 0;
    el._swipeWheel = (e) => {
      if (Math.abs(e.deltaX) < 4 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
      e.preventDefault();
      const now = Date.now();
      if (now - last > 260) acc = 0;
      last = now;
      acc += e.deltaX;
      if (Math.abs(acc) < 80 || now < (el._wheelLock || 0) || now < (el._swipeAnimUntil || 0))
        return;
      const which = acc > 0 ? 'next' : 'prev';
      acc = 0;
      el._wheelLock = now + 550;
      const b = el.querySelector('.ci-nav-arrow.' + (which === 'next' ? 'right' : 'left'));
      if (b) b.click();
    };
    el.addEventListener('wheel', el._swipeWheel, { passive: false });
  }
  /* 1.11: a real carousel. The moment a drag picks its direction, the NEXT
     sheet is built for real (the same render a chevron does) and the current
     one is set aside, frozen as it was, in a fixed frame. Under the finger
     both pages move together -- title, price, card, buttons, text: the whole
     next page is in view during the swipe, nothing pops in afterwards.
     Release past the threshold finishes the glide; a short drag glides back
     and the original sheet is rebuilt in place, invisibly.
     The gesture state lives on the overlay (el._swipeG): building the next
     sheet re-attaches these handlers, and the drag carries straight on.
     A sheet whose neighbour cannot be built at once (Wants, fetched card by
     card) keeps the old ride-along card image. */
  const G =
    el._swipeG ||
    (el._swipeG = { armed: false, engaged: false, dx: 0, sx: 0, sy: 0, W: 1, prep: null });
  el._swipeLive = { can, onNext, onPrev };
  const pageOf = () => el.querySelector(':scope > .overlay-inner');
  const prepLive = (dir) => {
    const L = el._swipeLive;
    const inner = pageOf();
    if (!inner) return null;
    const r = inner.getBoundingClientRect();
    const om = inner.querySelector('main'),
      st = om ? om.scrollTop : 0;
    try {
      (dir === 'next' ? L.onNext : L.onPrev)();
    } catch (err) {
      return null;
    }
    const ni = pageOf();
    if (!ni || ni === inner) {
      return null;
    } // nothing built (yet): the ride-along card instead
    // The old page's frame sits beside the overlay (a late re-render of the
    // sheet -- a printing or price upgrade -- can't sweep it away mid-swipe),
    // wearing the overlay's own class so every sheet style still applies and
    // its layout stays exactly as it was. Its ids stay too: it comes AFTER
    // the live sheet in the document, so every lookup still finds the live one.
    const wrap = document.createElement('div');
    wrap.className = el.className + ' swipe-leaving';
    const z = (parseInt(getComputedStyle(el).zIndex, 10) || 100) + 1;
    // 1.25: the frozen page rides inside a clip the size of the sheet itself,
    // so on a wide screen it never slides across the side menu.
    const er = el.getBoundingClientRect();
    const clip = document.createElement('div');
    clip.className = 'swipe-clip';
    clip.style.cssText = `position:fixed;left:${er.left}px;top:${er.top}px;width:${er.width}px;height:${er.height}px;overflow:hidden;pointer-events:none;z-index:${z};`;
    wrap.style.cssText = `position:absolute;inset:auto;left:${r.left - er.left}px;top:${r.top - er.top}px;width:${r.width}px;height:${r.height}px;display:flex;flex-direction:column;background:none;pointer-events:none;will-change:transform;`;
    wrap.appendChild(inner);
    clip.appendChild(wrap);
    document.body.appendChild(clip);
    // The finger's touch stays aimed at the element it first landed on -- now
    // inside the frozen page, outside this overlay. Its moves are forwarded
    // to the overlay's (current) handlers until the gesture ends.
    if (!el._swipeDocFwd) {
      const fwd = (k) => (e) => {
        if (el.contains(e.target)) return;
        const H = el._swipeNavHandlers;
        if (H && H[k]) H[k](e);
      };
      el._swipeDocFwd = { tm: fwd('tm'), te: fwd('te'), tc: fwd('tc') };
      document.addEventListener('touchmove', el._swipeDocFwd.tm, { passive: false });
      document.addEventListener('touchend', el._swipeDocFwd.te, { passive: true });
      document.addEventListener('touchcancel', el._swipeDocFwd.tc, { passive: true });
    }
    if (om) om.scrollTop = st; // a moved node forgets its scroll
    ni.style.willChange = 'transform';
    ni.style.transition = 'none';
    return { dir, wrap, clip, ni, nz: zoomOf(ni), out: dir === 'next' ? -1 : 1, st }; // the zoom once: reading it per move forced a style pass
  };
  const unFwd = () => {
    const F = el._swipeDocFwd;
    if (!F) return;
    document.removeEventListener('touchmove', F.tm, { passive: false });
    document.removeEventListener('touchend', F.te, { passive: true });
    document.removeEventListener('touchcancel', F.tc, { passive: true });
    el._swipeDocFwd = null;
  };
  const placeLive = (P, d) => {
    P.wrap.style.transform = `translateX(${d}px)`;
    const cur = pageOf();
    if (cur && cur !== P.ni) {
      P.ni = cur;
      P.nz = zoomOf(cur);
      cur.style.willChange = 'transform';
      cur.style.transition = 'none';
    } // re-rendered meanwhile
    P.ni.style.transform = `translateX(${(d - P.out * G.W) / P.nz}px)`;
  };
  const finishLive = (P, commit) => {
    const W0 = G.W || window.innerWidth || 360;
    const from = G.dx;
    const dist = commit ? W0 - Math.abs(from) : Math.abs(from);
    const dur = Math.round(Math.max(150, Math.min(300, (dist / W0) * 340)));
    const ease = 'cubic-bezier(.2,.75,.25,1)';
    el._swipeAnimUntil = Date.now() + dur + 80;
    if (commit) {
      try {
        navigator.vibrate && navigator.vibrate(6);
      } catch (err) {}
    }
    {
      const cur = pageOf();
      if (cur && cur !== P.ni) {
        placeLive(P, from);
      }
    }
    const nz = P.nz;
    void P.wrap.offsetWidth;
    void P.ni.offsetWidth; // 1.25: commit the start position first
    P.wrap.style.transition = `transform ${dur}ms ${ease}`;
    P.ni.style.transition = `transform ${dur}ms ${ease}`;
    requestAnimationFrame(() => {
      P.wrap.style.transform = `translateX(${commit ? P.out * W0 : 0}px)`;
      P.ni.style.transform = commit ? 'translateX(0px)' : `translateX(${(-P.out * W0) / nz}px)`;
    });
    setTimeout(() => {
      if (commit) {
        (P.clip || P.wrap).remove();
      } else {
        // back where we were: rebuild the original sheet in place (the
        // frozen copy still covers it), then let the copy go
        const L = el._swipeLive;
        try {
          (P.dir === 'next' ? L.onPrev : L.onNext)();
        } catch (err) {}
        const back = pageOf();
        const bm = back && back.querySelector('main');
        if (bm) bm.scrollTop = P.st;
        // the frozen copy covers the rebuilt sheet until its pictures are painted
        requestAnimationFrame(() => requestAnimationFrame(() => (P.clip || P.wrap).remove()));
      }
      const cur = pageOf();
      [P.ni, cur].forEach((x) => {
        if (x) {
          x.style.transition = '';
          x.style.transform = '';
          x.style.willChange = '';
        }
      });
    }, dur + 30);
  };
  const ts = (e) => {
    if (e.touches.length !== 1) {
      G.armed = false;
      return;
    }
    if (G.engaged) return; // a gesture already under way
    G.armed = true;
    G.engaged = false;
    G.dx = 0;
    G.prep = null;
    G.vs = [];
    G.t0 = performance.now();
    G.sx = e.touches[0].clientX;
    G.sy = e.touches[0].clientY;
    G.W = window.innerWidth || 360;
  };
  const tm = (e) => {
    if (!G.armed) return;
    if (Date.now() < (el._swipeAnimUntil || 0)) {
      G.armed = false;
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - G.sx,
      dy = t.clientY - G.sy;
    if (!G.engaged) {
      if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) {
        // scrolling wins
        G.armed = false;
        if (G.prep && G.prep.wrap) {
          const P0 = G.prep;
          G.prep = null;
          G.dx = 0;
          unFwd();
          finishLive(P0, false);
        } // built early for nothing
        return;
      }
      // Build the next page EARLY -- while the finger travels its first
      // pixels and nothing moves on screen yet -- so the build's moment of
      // work is never seen as a hitch in the slide.
      if (!G.prep && Math.abs(dx) > 7 && Math.abs(dx) > 2 * Math.abs(dy)) {
        const dirE = dx < 0 ? 'next' : 'prev';
        if (el._swipeLive.can(dirE)) {
          const P1 = prepLive(dirE);
          if (P1) {
            G.prep = P1;
            G.dx = 0;
            placeLive(P1, 0);
          }
        }
      }
      if (Math.abs(dx) > 16 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        G.engaged = true;
        const dir0 = dx < 0 ? 'next' : 'prev';
        if (!G.prep) {
          if (el._swipeLive.can(dir0)) G.prep = prepLive(dir0) || { dir: dir0, ghost: true };
          else G.prep = { dir: dir0, edge: true };
        }
        if (!G.prep.wrap) {
          const m = paneEl();
          if (m) {
            m.style.willChange = 'transform';
            m.style.transition = 'none';
          }
        }
      } else return;
    }
    e.preventDefault(); // the sheet owns this gesture now
    {
      const vs = G.vs || (G.vs = []);
      vs.push([performance.now(), t.clientX]);
      if (vs.length > 6) vs.shift();
    } // 1.39: for the flick
    const P = G.prep;
    if (P && P.wrap) {
      // live pages: dragging back past the start pushes back
      const wrong = P.dir === 'next' ? dx > 0 : dx < 0;
      G.dx = wrong ? dx * 0.25 : dx;
      placeLive(P, G.dx);
      return;
    }
    // the ride-along card (or the end of the chain)
    const dirW = dx < 0 ? 'next' : 'prev';
    const allowed = can(dirW);
    const useDx = allowed ? dx : dx * 0.3; // the end of the chain pushes back
    curDx = G.dx = useDx;
    const m = paneEl();
    if (m) {
      setX(m, useDx);
      m.style.opacity = String(Math.max(0.55, 1 - (Math.abs(useDx) / G.W) * 0.6));
    }
    if (allowed) {
      const src = peek(dirW);
      if (src) {
        const g = ghostEl();
        if (g.getAttribute('src') !== src) g.src = src;
        g.style.transform = `translate(${(dx < 0 ? G.W : -G.W) + dx}px, -50%)`;
        g.style.opacity = '1';
      }
    } else killGhost();
  };
  const te = (e) => {
    if (G.engaged) {
      // 1.39: a shorter drag commits (16% of the width, at most 64px), and so
      // does a quick flick the same way (>0.45 px/ms over 26px or more). A
      // slow drag that stops short, or a flick back, still snaps home.
      const thr = Math.min(64, G.W * 0.16);
      const fl = (() => {
        const v = G.vs || [];
        if (v.length < 2) return 0;
        const a = v[0],
          b = v[v.length - 1];
        if (performance.now() - b[0] > 120) return 0;
        const dt = b[0] - a[0];
        return dt > 0 ? (b[1] - a[1]) / dt : 0;
      })();
      const quick = performance.now() - (G.t0 || 0) < 300;
      const flickN = (fl < -0.45 || quick) && G.dx < -28,
        flickP = (fl > 0.45 || quick) && G.dx > 28;
      const P = G.prep;
      G.armed = false;
      G.engaged = false;
      G.prep = null;
      if (P && P.wrap) {
        unFwd();
        const commit = P.dir === 'next' ? G.dx < -thr || flickN : G.dx > thr || flickP;
        finishLive(P, commit);
        return;
      }
      curDx = G.dx;
      const want = G.dx < -thr || flickN ? 'next' : G.dx > thr || flickP ? 'prev' : null;
      slideCommit(want); // the end guard inside flashes when out of cards
      return;
    }
    if (G.prep && G.prep.wrap) {
      const P0 = G.prep;
      G.prep = null;
      G.dx = 0;
      unFwd();
      finishLive(P0, false);
    } // built early, never dragged
    if (!G.armed) return;
    G.armed = false;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - G.sx,
      dy = t.clientY - G.sy;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const want2 = dx < 0 ? 'next' : 'prev';
      if (!can(want2)) {
        edgeFlash(want2 === 'next' ? 'right' : 'left');
        return;
      }
      slideCommit(want2);
    }
  };
  const tc = () => {
    const P = G.prep;
    unFwd();
    if (G.engaged) {
      if (P && P.wrap) finishLive(P, false);
      else {
        curDx = G.dx;
        slideCommit(null);
      }
    }
    G.armed = false;
    G.engaged = false;
    G.prep = null;
  };
  el.addEventListener('touchstart', ts, { passive: true });
  el.addEventListener('touchmove', tm, { passive: false });
  el.addEventListener('touchend', te, { passive: true });
  el.addEventListener('touchcancel', tc, { passive: true });
  el._swipeNavHandlers = { ts, tm, te, tc };
  // Warm both neighbors' art in the browser cache so the ghost has pixels on
  // the very FIRST drag — without this the image only starts loading mid-
  // gesture and the preview shows as an empty dark slab.
  setTimeout(() => {
    ['next', 'prev'].forEach((d) => {
      if (!can(d)) return;
      const u = peek(d);
      if (u) {
        const im = new Image();
        im.src = u;
      }
    });
  }, 250);
}

/* Both the deck editor and standalone card view share this page header. */
function cardDetailsHeaderHtml(card) {
  return /* HTML */ `<header class="topbar app-overlay-header card-details-header">
      <button type="button" class="header-menu" data-app-menu aria-label="Open menu">
        <img src="icon-192.png" alt="" width="36" height="36" />${backupBadgeHtml()}
      </button>
      <button type="button" class="brand-txt two-line" data-app-home aria-label="Go to home">
        ${trS('Card Details')}
      </button>
      <div class="card-details-metrics">
        <button
          type="button"
          class="card-details-metric"
          id="csPrice"
          aria-label="Price trend and history"
        >
          <span class="card-details-metric-label">${trS('Trend')}</span>
          <span class="cp-val" data-card-price>…</span>
        </button>
        <button
          type="button"
          class="card-details-metric"
          id="csSaltRow"
          aria-label="Salt score"
          disabled
        >
          <span class="card-details-metric-label">${trS('Salt')}</span>
          <span class="cp-val" data-saltseat>—</span>
        </button>
      </div>
    </header>
    <div class="card-details-subtitle">
      <h1 class="sheet-title">${escapeHtml(card.name)}</h1>
    </div>`;
}

function wireCardDetailsNav(el, card) {
  wireOverlayNav(el);
  el.querySelector('#csPrice')?.addEventListener('click', () => openPriceHistory(card));
  el.querySelector('#csSaltRow')?.addEventListener('click', openSaltiestOverlay);
}

function openCardInfo(card, opts) {
  if (!(opts && opts._replace) && zoomTake(card)) return; // 1.28 desk: a click shows the card big
  _cardSheetGen++; // this render owns csPrice/csRulings from here on
  opts = opts || {};
  // A remembered printing upgrades the sheet to that exact printing — art,
  // set line, and price all agree. The original shows while it loads; the
  // sheet re-renders in place when the preferred one arrives.
  // A collection copy is a physical printing — never "upgrade" it to the
  // remembered one; that made the sheet disagree with the binder tile.
  if (!opts._ppApplied && opts.colIdx == null) {
    const pp = printPrefFor(card);
    if (pp) {
      opts._ppApplied = true;
      // Generation guard: if the person swipes on before this arrives, a late
      // resolve must not flash the old card back onto the sheet.
      const myGen = _cardSheetGen;
      sfFetch(SF_BASE + '/cards/' + pp.id)
        .then((r) => (r.ok ? r.json() : null))
        .then((full) => {
          if (
            full &&
            full.name === card.name &&
            _cardSheetGen === myGen &&
            document.getElementById('cardSheetOverlay')
          ) {
            // Pref records from before prices rode along lack .p — tiles then
            // wore this printing's art with the canonical printing's price.
            // The full card is in hand right here: refresh the record once.
            if (pp.p == null && !pp.f) setPrintPref(full);
            openCardInfo(full, Object.assign({}, opts, { _replace: true }));
          }
        })
        .catch(() => {});
    }
  }
  const colIdx = opts.colIdx != null ? opts.colIdx : null;
  state._colSheetIdx = colIdx;
  // A sheet already up AND on top is a double-fired tap or swipe replace:
  // reuse it in place. But a sheet buried under another overlay (a reco or
  // Similar-cards page opened FROM it) means this tap opens a genuinely NEW
  // sheet above that overlay — the old one steps aside under a private id,
  // its stack entry re-bound to its own element, so each back press closes
  // exactly one layer in order: new sheet, then the reco page, then the
  // original sheet.
  const _existingSheet = document.getElementById('cardSheetOverlay');
  const _topOv = state.overlayStack.length
    ? state.overlayStack[state.overlayStack.length - 1].id
    : null;
  const _sheetOnTop = _topOv === 'cardInfo' || _topOv === 'cardSheet';
  if (!opts._replace && _existingSheet && _sheetOnTop) opts._replace = true;
  if (!opts._replace && _existingSheet && !_sheetOnTop) {
    window._sheetBgSeq = (window._sheetBgSeq || 0) + 1;
    _existingSheet.id = 'cardSheetOverlay_bg' + window._sheetBgSeq;
    // Its inner ids go too — with two sheets stacked, getElementById found
    // the HIDDEN one first: the new sheet's rulings wrote into an invisible
    // element and its buttons wired themselves to the wrong sheet (the
    // exact cure stacked Similar pages already received).
    _existingSheet.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const bgEl = _existingSheet;
    const oldEntry = state.overlayStack
      .slice()
      .reverse()
      .find((e) => e.id === 'cardInfo' || e.id === 'cardSheet');
    if (oldEntry)
      oldEntry.closeFn = () => {
        try {
          bgEl.remove();
        } catch (e) {}
      };
  }
  if (!opts._replace)
    pushOverlay('cardInfo', () => {
      document.getElementById('cardSheetOverlay')?.remove();
    });
  let el = document.getElementById('cardSheetOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay card-details-page';
    el.id = 'cardSheetOverlay';
  }
  csPopApply(el); // 1.26: a right-click opens this sheet as a popup by the mouse
  // (Re)append only when this sheet is new or already on top — a background
  // price/printing re-render must never climb above overlays opened later
  // (the Similar page vanished behind exactly that on its first open).
  {
    const _ovs = document.querySelectorAll('body > .overlay:not(.swipe-leaving)');
    if (!el.isConnected || (_ovs.length && _ovs[_ovs.length - 1] === el))
      document.body.appendChild(el);
    el.classList.toggle(
      'sheet-over-overlay',
      Array.from(document.querySelectorAll('body > .overlay:not(.swipe-leaving)')).some(
        (o) => o !== el,
      ),
    );
  }
  const pinned =
    state.searchPinnedDeckId && state.screen !== 'browse'
      ? getDeck(state.searchPinnedDeckId)
      : null; // 1.7: not from the loose Inspiration page
  // In-deck test for the sheet's main button: leaders and duplicate-allowed
  // cards (basics etc.) stay on the Add side — only a removable main-deck
  // copy flips the button to Remove.
  const pinnedHasCard = () =>
    !!(
      pinned &&
      (deckIsConstructed(pinned)
        ? atCopyLimit(pinned, card)
        : pinned.cards.some((x) => x.name === card.name) && !allowsDuplicates(card))
    );
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${cardDetailsHeaderHtml(card)}
    <main class="card-detail">
      <div style="text-align:center;">
        <span class="cd-hero" style="position:relative;display:block;width:100%;margin:0 auto;"
          ><img
            class="${wbClass(card)}"
            src="${colIdx != null ? cardImageLargeRaw(card) : cardImageLarge(card)}"
            id="ciImg"
            alt="${escapeHtml(card.name)}"
            style="width:100%;box-shadow:0 12px 30px rgba(0,0,0,0.4);cursor:pointer;"
          />${dfcFlipHtml(card)}</span
        >
      </div>
      <div class="card-details-actions">
        <div class="cs-actions-grid" style="margin:0;">
          ${(() => {
            // 1.38: the deck sheet's layout -- Recommendations top right,
            // Similar under it, Change printing | Tags · ∞ at the foot; an
            // odd count folds Share · Tags · ∞ into three icon buttons.
            const _cmbI = `<button type="button" class="ghost-btn" data-cmbbtn style="width:100%;">∞</button>`;
            const _recoI = `<button class="ghost-btn" id="ciReco" style="width:100%;"><span class="ib">${ICONS.reco}</span>${trS('Recommendations')}</button>`;
            const _simI = `<button class="ghost-btn" id="ciSimilar" style="width:100%;"><span class="ib">${ICONS.similar}</span>${trS('Similar cards')}</button>`;
            const _shareI = `<button class="ghost-btn" id="ciShare" style="width:100%;"><span class="ib">${ICONS.share}</span>${trS('Share')}</button>`;
            const _pairI = `<div class="cs-pair"><button class="ghost-btn" id="ciTags" style="width:100%;"><span class="ib">${ICONS.tag}</span>${trS('Tags')}</button>${_cmbI}</div>`;
            const _trioI = `<div class="cs-pair cs-trio"><button class="ghost-btn" id="ciShare" title="${trS('Share')}" aria-label="${trS('Share')}"><span class="ib">${ICONS.share}</span></button><button class="ghost-btn" id="ciTags" title="${trS('Tags')}" aria-label="${trS('Tags')}"><span class="ib">${ICONS.tag}</span></button>${_cmbI}</div>`;
            if (colIdx != null)
              return `
          <button class="ghost-btn" id="ciAddOne" style="width:100%;color:var(--brass);border-color:var(--brass);">＋ ${trS('Add one')}</button>
          ${_recoI}
          <button class="ghost-btn" id="ciRemOne" style="width:100%;color:var(--danger);border-color:var(--danger);">− ${trS('Remove one')}</button>
          ${_simI}
          <button class="ghost-btn" id="ciPrint2" style="width:100%;"><span class="ib">${ICONS.swap}</span>${trS('Change printing')}</button>
          ${_trioI}`;
            const _addI = `<button class="ghost-btn" id="ciAdd" style="width:100%;color:var(--brass);border-color:var(--brass);" ${ciBlockWhy(card, pinned) ? 'disabled' : ''}>${ciBlockWhy(card, pinned) ? escapeHtml(trS(ciBlockWhy(card, pinned))) : pinned ? (pinnedHasCard() ? `− Remove from ${escapeHtml(pinned.name)}` : `+ Add to ${escapeHtml(pinned.name)}`) : `${modeGlyph()} ${trS('Add to…')}`}</button>`;
            const _printI = `<button class="ghost-btn" id="ciPrint" style="width:100%;"><span class="ib">${ICONS.swap}</span>${trS('Change printing')}</button>`;
            if (opts.wantName)
              return `${_addI}${_recoI}
          <button class="ghost-btn" id="ciWantRm" style="width:100%;color:var(--danger);border-color:var(--danger);">${trS('Remove from Wants')}</button>
          ${_simI}${_printI}${_trioI}`;
            return `${_addI}${_recoI}${_shareI}${_simI}${_printI}${_pairI}`;
          })()}
        </div>
      </div>
      <div id="ciTagBox"></div>
      <div class="detail-sec sel-text">
        <div class="detail-h">Oracle Text</div>
        <div id="sheetOracle" data-cardname="${escapeHtml(card.name || '')}">
          ${oracleBlockHtml(card)}
        </div>
      </div>
      <div class="detail-sec">
        <div class="detail-h">Legality</div>
        ${legalityBlockHtml(card)}
      </div>
      <div class="detail-sec sel-text">
        <div class="detail-h">Rulings</div>
        <div id="csRulings">
          <div class="status">
            <div class="spinner"></div>
            Loading rulings…
          </div>
        </div>
      </div>
      <div class="sheet-foot-spacer" aria-hidden="true"></div>
    </main>
    ${el.classList.contains('cs-pop') ? '' : overlayNavHtml()}
  </div>`;
  pinSheetToTop(el);
  wireCardDetailsNav(el, card);
  document
    .getElementById('ciImg')
    .addEventListener('click', () =>
      showCardPreview(card, colIdx != null ? cardImageLargeRaw(card) : cardImageLarge(card)),
    );
  wireCombosButton(el, card);
  try {
    paintPendingArt();
  } catch (e) {}
  // 1.9: outside a deck, recommendations are about the card itself -- no
  // "which deck?" question first
  document.getElementById('ciReco')?.addEventListener('click', () => openCardReco(card, null));
  document.getElementById('ciAddOne')?.addEventListener('click', () => {
    const it = state.collection.items[colIdx];
    if (!it) return;
    it.qty = (it.qty || 1) + 1;
    saveCollection();
    state._colDirty = true;
    toast(`${it.name} — now ×${it.qty}`);
  });
  document.getElementById('ciRemOne')?.addEventListener('click', () => {
    const it = state.collection.items[colIdx];
    if (!it) return;
    it.qty = (it.qty || 1) - 1;
    if (it.qty <= 0) {
      state.collection.items.splice(colIdx, 1);
      saveCollection();
      state._colDirty = true;
      toast(`${it.name} removed from your collection.`);
      closeTopOverlay();
      return;
    }
    saveCollection();
    state._colDirty = true;
    toast(`${it.name} — now ×${it.qty}`);
  });
  document.getElementById('ciPrint2')?.addEventListener('click', () => {
    setTimeout(
      () =>
        openPrintingGrid(
          card,
          (chosen) => {
            const it = state.collection.items[colIdx];
            if (!it) return;
            const iu =
              chosen.image_uris ||
              (chosen.card_faces && chosen.card_faces[0] && chosen.card_faces[0].image_uris) ||
              {};
            it.set = chosen.set || it.set;
            it.set_name = chosen.set_name || it.set_name;
            it.cn = chosen.collector_number || it.cn;
            if (iu.normal || iu.small) it.img = iu.normal || iu.small;
            const pe =
              chosen.prices &&
              (chosen._foilPick ? chosen.prices.eur_foil || chosen.prices.eur : chosen.prices.eur);
            if (pe != null) it.eur = parseFloat(pe);
            it.foil = chosen._foilPick ? true : undefined; // picking the foil version makes this copy a foil
            // 1.39: this copy is its own printing -- no app-wide pick from here
            saveCollection();
            state._colDirty = true;
            toast(
              `Now showing the ${chosen.set_name}${chosen._foilPick ? ' ✨ foil' : ''} printing.`,
            );
            openCardInfo(chosen, { colIdx: colIdx, _replace: true, _ppApplied: true });
          },
          {
            onCustom: (custom) => {
              // 1.18: your own image dresses THIS copy only
              const it = state.collection.items[colIdx];
              if (!it) return;
              it.img = custom.image_uris.normal;
              saveCollection();
              state._colDirty = true;
            },
          },
        ),
      40,
    );
  });
  document
    .getElementById('ciPrint')
    ?.addEventListener('click', () => openPrintingBrowse(card, opts));
  document.getElementById('ciSimilar')?.addEventListener('click', () => openSimilarCards(card));
  document.getElementById('ciShare')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTileMenu(e.currentTarget, [
      { label: trS('Share image'), fn: () => shareCardImage(card) },
      { label: trS('Share link'), fn: () => shareCardLink(card) },
    ]);
  });
  document.getElementById('ciWantRm')?.addEventListener('click', () => {
    const nm = opts.wantName;
    state.collection.wantsExclude.push(nm);
    state.collection.wantsManual = (state.collection.wantsManual || []).filter(
      (w) => w.name !== nm,
    );
    saveCollection();
    toast(nm + ' removed from Wants.');
    closeTopOverlay();
    if (state.screen === 'collection') render();
  });
  const ciAddBtn = document.getElementById('ciAdd');
  // The pinned button tells the truth and toggles: "− Remove from …" while
  // the card sits in the deck, back to "+ Add to …" once it's out — and
  // either action refreshes the results grid beneath the sheet, so IN DECK
  // badges never go stale (they used to, when adding from this sheet).
  const syncCiAdd = () => {
    if (!ciAddBtn || ciBlockWhy(card, pinned) || !pinned) return;
    const has = pinnedHasCard();
    ciAddBtn.textContent = has ? `− Remove from ${pinned.name}` : `+ Add to ${pinned.name}`;
    ciAddBtn.style.color = has ? 'var(--danger)' : 'var(--brass)';
    ciAddBtn.style.borderColor = has ? 'var(--danger)' : 'var(--brass)';
  };
  syncCiAdd();
  ciAddBtn?.addEventListener('click', () => {
    if (pinned) {
      if (pinnedHasCard()) {
        const i = pinned.cards.findIndex((x) => x.name === card.name);
        const rm = pinned.cards.splice(i, 1)[0];
        logDeckChange(pinned, { type: 'remove', name: rm.name, card: rm });
        toast(`${rm.name} removed from ${pinned.name}.`);
        scheduleSave(pinned);
      } else if (!addCardToDeckValidated(pinned, card)) {
        return; // rejected (off-color, in command, …) — nothing changed
      }
      syncCiAdd();
      if (typeof opts.refreshFn === 'function') {
        try {
          opts.refreshFn(card);
        } catch (e) {}
      }
    } else openDeckPickPopup(card, 'main', opts.refreshFn, null, true); // Add to…: Collection rides along
  });
  document.getElementById('ciTags')?.addEventListener('click', () => {
    const box = document.getElementById('ciTagBox');
    if (!box) return;
    if (box.dataset.open === '1') {
      const top = state.overlayStack[state.overlayStack.length - 1];
      if (top && top.id === 'tagBox') closeTopOverlay();
      else {
        box.dataset.open = '0';
        box.innerHTML = '';
      }
      return;
    }
    box.dataset.open = '1';
    pushOverlay('tagBox', () => {
      const b = document.getElementById('ciTagBox');
      if (b) {
        b.dataset.open = '0';
        b.innerHTML = '';
      }
    });
    renderTagEditor(null, card, box); // deckless: the global registry directly
    keepSheetFoot(box);
  });
  loadRulings(card);
  loadCardPrice(card);
  const pool = Array.isArray(opts.pool) ? opts.pool : null;
  if (pool && pool.length > 1) {
    let pi =
      opts.poolIdx != null && pool[opts.poolIdx] && pool[opts.poolIdx].name === card.name
        ? opts.poolIdx
        : pool.findIndex((x) => x && x.name === card.name);
    const go = (dir) => {
      let n = pi + dir;
      while (n >= 0 && n < pool.length && pool[n].name === card.name) n += dir; // skip duplicate copies
      if (n < 0 || n >= pool.length) return;
      try {
        navigator.vibrate && navigator.vibrate(6);
      } catch (e) {}
      openCardInfo(pool[n], Object.assign({}, opts, { poolIdx: n, _replace: true }));
    };
    const peekIdx = (dir) => {
      let n = pi + dir;
      while (n >= 0 && n < pool.length && pool[n].name === card.name) n += dir;
      return n < 0 || n >= pool.length ? -1 : n;
    };
    attachSwipeNav(
      el,
      () => go(1),
      () => go(-1),
      {
        canNext: () => peekIdx(1) >= 0,
        canPrev: () => peekIdx(-1) >= 0,
        peekNext: () => {
          const n = peekIdx(1);
          return n >= 0 ? cardImageMed(pool[n]) : null;
        },
        peekPrev: () => {
          const n = peekIdx(-1);
          return n >= 0 ? cardImageMed(pool[n]) : null;
        },
      },
    );
    // 1.25: the neighbours' big pictures load ahead -- stepping on shows the
    // next card at once instead of an empty frame that fills in late.
    try {
      [peekIdx(1), peekIdx(-1)].forEach((n) => {
        if (n >= 0) {
          const u = cardImageLarge(pool[n]);
          if (u) {
            const im = new Image();
            im.decoding = 'async';
            im.src = u;
          }
        }
      });
    } catch (e) {}
  }
  // From Wants the pool is a list of names, resolved one card at a time —
  // exact same chevrons and swipe, with wantName tracking the shown card so
  // Add to my collection and Remove from Wants always act on it.
  // From the collection grid the pool is a list of item indices — the same
  // chevrons and swipe, resolving each stack's exact printing as it comes
  // into view, with colIdx following so Manage copy acts on the shown copy.
  const cpool =
    !pool && !Array.isArray(opts.wantPool) && Array.isArray(opts.colPool) ? opts.colPool : null;
  if (cpool && cpool.length > 1 && colIdx != null) {
    const ci0 =
      opts.colPoolIdx != null && cpool[opts.colPoolIdx] === colIdx
        ? opts.colPoolIdx
        : cpool.indexOf(colIdx);
    const go = (dir) => {
      const n = ci0 + dir;
      if (n < 0 || n >= cpool.length) return;
      try {
        navigator.vibrate && navigator.vibrate(6);
      } catch (e) {}
      openCollectionCard(cpool[n], cpool);
    };
    attachSwipeNav(
      el,
      () => go(1),
      () => go(-1),
      {
        canNext: () => ci0 + 1 < cpool.length,
        canPrev: () => ci0 - 1 >= 0,
        peekNext: () => {
          const it = state.collection.items[cpool[ci0 + 1]];
          return it ? it.img : null;
        },
        peekPrev: () => {
          const it = state.collection.items[cpool[ci0 - 1]];
          return it ? it.img : null;
        },
      },
    );
  }
  const wpool = !pool && !cpool && Array.isArray(opts.wantPool) ? opts.wantPool : null;
  if (wpool && wpool.length > 1) {
    const wi =
      opts.wantIdx != null && wpool[opts.wantIdx] === card.name
        ? opts.wantIdx
        : wpool.indexOf(card.name);
    const go = async (dir) => {
      const n = wi + dir;
      if (n < 0 || n >= wpool.length) return;
      try {
        navigator.vibrate && navigator.vibrate(6);
      } catch (e) {}
      try {
        // Generation guard: with two quick swipes, the earlier fetch can land
        // after the later one — a stale resolve must never repaint the sheet.
        const myGen = _cardSheetGen;
        const c = await wantCardFor(wpool[n]);
        if (c && _cardSheetGen === myGen)
          openCardInfo(
            c,
            Object.assign({}, opts, { wantName: wpool[n], wantIdx: n, _replace: true }),
          );
      } catch (e) {}
    };
    const peekW = (k) => {
      const c = state._wantsSrc && state._wantsSrc.get(wpool[k]);
      return c ? cardImageMed(c) : null;
    };
    attachSwipeNav(
      el,
      () => go(1),
      () => go(-1),
      {
        canNext: () => wi + 1 < wpool.length,
        canPrev: () => wi - 1 >= 0,
        peekNext: () => peekW(wi + 1),
        peekPrev: () => peekW(wi - 1),
      },
    );
  }
}

/* Printing chooser for the read-only card sheet: not tied to any deck — the
   chosen printing simply becomes THE card on the sheet, so Add to a deck and
   Collection carry that exact printing onward. */
function openPrintingBrowse(card, opts) {
  openPrintingGrid(card, (chosen) => {
    setPrintPref(chosen); // 1.18: remembered for THIS place only (Search, this overlay, this page)
    toast(`Now showing the ${chosen.set_name}${chosen._foilPick ? ' ✨ foil' : ''} printing.`);
    openCardInfo(chosen, Object.assign({}, opts || {}, { _replace: true, _ppApplied: true }));
  });
}
