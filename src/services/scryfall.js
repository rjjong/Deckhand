// services / scryfall

/* ========================= SCRYFALL ========================= */

const SF_BASE = window.DECKHAND_CONFIG?.scryfallBase
  ? location.origin + window.DECKHAND_CONFIG.scryfallBase
  : 'https://api.scryfall.com';

function hasLocalDataFile(name) {
  const files = window.DECKHAND_CONFIG?.dataFiles;
  return !Array.isArray(files) || files.includes(name);
}

function sfRequestUrl(url) {
  const u = new URL(url, location.href);
  return window.DECKHAND_CONFIG?.scryfallBase && u.hostname === 'api.scryfall.com'
    ? SF_BASE + u.pathname + u.search
    : u.href;
}

/* Every Scryfall request goes through here: spaced out and auto-retried with
   exponential backoff on 429/5xx, so bulk operations (which fire many
   requests) don't get rate-limited and misreported as "not found". */
let _nextSfSlot = 0;

/* ---------- The Scryfall scheduler ----------
   One worker drains two queues — interactive first, background second — one
   request at a time with polite spacing. Three hard guarantees:
   1. A search waits behind AT MOST one in-flight request, never a queue of
      price lookups (priority is re-decided before every single request).
   2. No request can hang forever: mobile networks sometimes black-hole a
      fetch (no reply, no error) — a 12s abort converts that into a normal
      retry instead of an infinite spinner that wedges the whole session.
   3. Retries rejoin the FRONT of their own lane after backoff. */
const _sfQ = { hi: [], lo: [] };

let _sfWorking = false,
  _sfGen = 0,
  _sfBeat = 0;

/* Requests start at least 250ms apart, with a shared backend queue as well.
   which is inside that, but a burst of deck pricing still managed to trip their
   limiter -- and a refused request comes back as a fast network error, not a
   429, because the refusal carries no CORS headers. So the queue watches for
   the signature (several sub-100ms failures in a row, or a real 429) and eases
   off for a minute before returning to full speed. Still one request at a time:
   only the spacing changes. */
const SF_GAP = 250,
  SF_GAP_EASY = 1000,
  SF_COOL_MS = 60000;

let _sfRetryAt = 0;

let _sfCoolUntil = 0,
  _sfFastFails = 0;

function _sfCooling() {
  return Date.now() < _sfCoolUntil;
}

function _sfNoteRefusal(ms, status) {
  if (status === 429 || (ms != null && ms < 100)) {
    if (++_sfFastFails >= 3 || status === 429) {
      if (!_sfCooling())
        try {
          sfJournal(
            'queue: Scryfall is pushing back \u2014 easing to ' +
              SF_GAP_EASY +
              'ms for ' +
              SF_COOL_MS / 1000 +
              's',
          );
        } catch (e) {}
      _sfCoolUntil = Date.now() + SF_COOL_MS;
      _sfFastFails = 0;
    }
  }
}

function _sfNoteOk() {
  _sfFastFails = 0;
}

/* Black box: the last network outcomes and JS errors, readable via
   Extras -> Copy diagnostics. When "nothing loads", this says why. */
const _sfLog = [];

function sfJournal(line) {
  try {
    _sfLog.push(new Date().toISOString().slice(11, 19) + ' ' + line);
    if (_sfLog.length > 30) _sfLog.shift();
  } catch (e) {}
}

/* Crash capture: any uncaught error or rejected promise writes one line
   into the journal (throttled), so Copy diagnostics always carries the
   real exception — no more invisible failures. */
let _crashNotes = 0;

function _noteCrash(kind, msg, where) {
  if (_crashNotes >= 8) return;
  _crashNotes++;
  sfJournal(kind + ': ' + String(msg || 'unknown').slice(0, 140) + (where ? ' @' + where : ''));
}

try {
  window.addEventListener('error', (e) => {
    _noteCrash(
      'JS ERROR',
      e && e.message,
      e && e.lineno ? (e.filename || '').split('/').pop() + ':' + e.lineno : '',
    );
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    _noteCrash(
      'UNHANDLED',
      (r && (r.message || r)) || 'rejection',
      r && r.stack ? String(r.stack).split('\n')[1] : '',
    );
  });
} catch (e) {}

window.addEventListener('error', (e) => {
  sfJournal(
    'JS-ERROR ' +
      (e.message || '') +
      ' @' +
      String(e.filename || '')
        .split('/')
        .pop() +
      ':' +
      (e.lineno || 0),
  );
  try {
    toast('⚠ ' + (e.message || 'Something broke'));
  } catch (_) {}
});

window.addEventListener('unhandledrejection', (e) => {
  sfJournal('PROMISE-REJ ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 120));
});

/* ---- Offline banner + queue hold ----
   Four straight network failures = the connection is down, not the app:
   one clear banner says so, the request queue HOLDS instead of grinding
   doomed retries, and recovery is watched three ways -- any successful
   response, the browser's own online event, and a light 12s probe. */
let _netFailN = 0,
  _netRunN = 0,
  _netDown = false,
  _netProbeT = null;

let _netFailKeys = new Set(),
  _netConfirming = false;

/* What a failed fetch actually tells us. A request WE aborted for taking too
   long proves nothing about the connection — the network may simply be busy,
   which is the normal state of a phone on mobile data. Only an outright
   failure ("Failed to fetch") is evidence of a dead line. */
function _netClassify(err) {
  if (!err) return 'ok';
  const nm = String(err.name || ''),
    msg = String(err.message || '');
  if (nm === 'AbortError' || /hard timeout/i.test(msg)) return 'slow';
  return 'dead';
}

/* Distinct endpoints only: one URL failing over and over is one problem, not
   four, and must never take the whole app offline by itself. */
function _netNoteFail(url) {
  const key = String(url).split('?')[0];
  // A run of failures with no success in between is evidence on its own.
  // Measured in the field: every recommendation query dies on /cards/search,
  // which is ONE endpoint -- the distinct-endpoint count stuck at 1 and the
  // app never noticed it was offline.
  _netRunN++;
  if (!_netFailKeys.has(key)) {
    _netFailKeys.add(key);
    _netFailN++;
  }
  if ((_netFailN >= 3 || _netRunN >= 5) && !_netDown && !_netConfirming) _netConfirmDown();
}

/* Never take the app offline on inference alone — go and check. */
async function _netConfirmDown() {
  if (_netConfirming || _netDown) return;
  _netConfirming = true;
  try {
    if (navigator.onLine === false) {
      _netSetDown(true);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      try {
        ctl.abort();
      } catch (e) {}
    }, 6000);
    try {
      const r = await fetch(SF_BASE + '/catalog/keyword-abilities', {
        cache: 'no-store',
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (r) {
        _netNote(true);
        return;
      } // the line is fine after all
    } catch (e) {
      clearTimeout(t);
    }
    _netSetDown(true);
  } finally {
    _netConfirming = false;
  }
}

/* The offline notice lives in the page-name bar: one short chip on the left,
   rebuilt by every render and kept in sync the moment the network flips. */
function netChipHtml() {
  const local = window.DECKHAND_CONFIG?.selfHosted && navigator.onLine !== false;
  const title = local
    ? appLang() === 'nl'
      ? 'De lokale Deckhand-server is niet bereikbaar. Start de server opnieuw.'
      : 'The local Deckhand server is unavailable. Start the server again.'
    : appLang() === 'nl'
      ? 'Geen verbinding — je ziet de opgeslagen versie'
      : 'No connection — showing cached data';
  return _netDown
    ? `<span class="net-chip" id="netChip" title="${title}">⚡ ${local ? 'Server offline' : 'Offline'}</span>`
    : '';
}

function _netChipSync() {
  try {
    const cap = document.querySelector('.page-cap');
    const chip = document.getElementById('netChip');
    if (_netDown) {
      if (!chip && cap)
        (cap.querySelector('.cap-tools') || cap).insertAdjacentHTML('afterbegin', netChipHtml());
    } else if (chip) {
      chip.remove();
    }
  } catch (e) {}
}

function _netSetDown(down) {
  if (_netDown === down) return;
  _netDown = down;
  try {
    _netChipSync();
  } catch (e) {}
  try {
    sfJournal(down ? 'NETWORK DOWN — queue holding, banner up' : 'network back — queue resumed');
  } catch (e) {}
  if (!down)
    try {
      netBackRefresh();
    } catch (e) {}
  if (down && !_netProbeT) {
    _netProbeT = setInterval(async () => {
      try {
        const pc = new AbortController();
        const pt = setTimeout(() => {
          try {
            pc.abort();
          } catch (e) {}
        }, 6000);
        const r = await fetch(
          window.DECKHAND_CONFIG?.selfHosted
            ? '/api/health'
            : SF_BASE + '/catalog/keyword-abilities',
          { cache: 'no-store', signal: pc.signal },
        );
        clearTimeout(pt);
        if (r?.ok) _netNote(true);
      } catch (e) {}
    }, 12000);
  }
  if (!down && _netProbeT) {
    clearInterval(_netProbeT);
    _netProbeT = null;
  }
}

function _netNote(ok) {
  if (ok) {
    _netFailN = 0;
    _netRunN = 0;
    _netFailKeys.clear();
    if (_netDown) _netSetDown(false);
  }
}

try {
  window.addEventListener('offline', () => _netSetDown(true));
  window.addEventListener('online', () => {
    _netFailN = 0;
    _netRunN = 0;
    _netFailKeys.clear();
    _netSetDown(false);
  });
} catch (e) {}

/* ---- Offline name lookups ----
   The weekly local database (33k+ cards) answers /cards/named lookups when
   the network cannot: card pages, tiles and deck lists keep working mid-
   outage. bulkToCardish dresses the slim record as a full Scryfall card,
   real image URLs included. Exact names and partner-pair halves resolve;
   true fuzzy matching stays a live-API affair. */
function _sfNamedParam(url) {
  const m = String(url).match(/\/cards\/named\?(?:exact|fuzzy)=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' '));
  } catch (e) {
    return null;
  }
}

async function _bulkNamedServe(url) {
  try {
    const nm = _sfNamedParam(url);
    if (!nm) return null;
    let slim = await bulkCardByName(nm);
    if (!slim) {
      const cut = nm.indexOf(' // ');
      if (cut > 0)
        slim =
          (await bulkCardByName(nm.slice(0, cut))) || (await bulkCardByName(nm.slice(cut + 4)));
    }
    const card = slim ? bulkToCardish(slim) : null;
    if (!card) return null;
    return {
      ok: true,
      status: 200,
      _bulk: true,
      json: async () => card,
      text: async () => JSON.stringify(card),
    };
  } catch (e) {
    return null;
  }
}

function sfFetch(url, attempt, bg, fresh, front) {
  url = sfRequestUrl(url);
  // OFFLINE FAST PATH: while the banner is up, name lookups answer straight
  // from the local database -- no queueing behind a dead network.
  if (
    (_netDown || (window.DECKHAND_CONFIG?.selfHosted && !fresh)) &&
    /\/cards\/named\?/.test(String(url))
  ) {
    return _bulkNamedServe(url).then((r) => {
      if (r) {
        try {
          sfJournal(
            'BULK 200 (offline) ' +
              String(url)
                .replace(/^https?:\/\/[^/]*/, '')
                .slice(0, 70),
          );
        } catch (e) {}
        return r;
      }
      return _sfEnqueue(url, attempt, bg, fresh, front);
    });
  }
  return _sfEnqueue(url, attempt, bg, fresh, front);
}

function localServerUnavailable() {
  return new Response(
    JSON.stringify({
      object: 'error',
      code: 'local_server_unavailable',
      details: 'The local Deckhand server is unavailable.',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}

function _sfEnqueue(url, attempt, bg, fresh, front) {
  if (window.DECKHAND_CONFIG?.selfHosted && _netDown)
    return Promise.resolve(localServerUnavailable());
  if (Date.now() < _sfRetryAt)
    return Promise.resolve(
      new Response(
        JSON.stringify({
          object: 'error',
          code: 'rate_limited',
          details: 'Scryfall is cooling down.',
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );
  // `front` puts the job at the head of its lane: still strictly one request
  // at a time at the same 80ms cadence — only the ORDER changes. Used for
  // what the person is looking at right now (the open card sheet's rulings
  // and price), which must not wait behind a deck page's background queue.
  return new Promise((resolve, reject) => {
    let _screen = '';
    try {
      _screen = state.screen || '';
    } catch (e) {}
    const job = {
      url,
      attempt: attempt || 0,
      bg: !!bg,
      fresh: !!fresh,
      born: Date.now(),
      screen: _screen,
      resolve,
      reject,
    };
    const lane = job.bg ? _sfQ.lo : _sfQ.hi;
    if (front) lane.unshift(job);
    else lane.push(job);
    _sfPump();
  });
}

/* Throw every QUEUED job asked for by one page out of both lanes. The job
   in flight is left alone -- it is already paid for. A dropped job answers
   as a 404, which every caller in this app already reads as "nothing found"
   rather than a failure, so nothing has to learn a new error shape and no
   promise is ever left unhandled. */
function sfDropQueuedFor(screen) {
  const dead = {
    ok: false,
    status: 404,
    superseded: true,
    json: async () => ({ data: [] }),
    text: async () => '',
  };
  let n = 0;
  ['hi', 'lo'].forEach((k) => {
    _sfQ[k] = _sfQ[k].filter((job) => {
      if (job.screen !== screen) return true;
      n++;
      try {
        job.resolve(dead);
      } catch (e) {}
      return false;
    });
  });
  if (n)
    try {
      sfJournal('queue: dropped ' + n + ' superseded ' + screen + ' job' + (n === 1 ? '' : 's'));
    } catch (e) {}
  return n;
}

async function _sfPump() {
  if (_sfWorking) return;
  _sfWorking = true;
  const myGen = ++_sfGen;
  // Interactive jobs precede background jobs. A rate limit pauses both lanes.
  try {
    while (_sfQ.hi.length || _sfQ.lo.length) {
      if (myGen !== _sfGen) return; // the watchdog started a fresh pump — stand down
      _sfBeat = Date.now();
      // Network down? HOLD the lane instead of grinding doomed retries --
      // the probe or the browser's online event releases it.
      let _held = 0;
      while (_netDown && !window.DECKHAND_CONFIG?.selfHosted && _held < 6) {
        _sfBeat = Date.now();
        await new Promise((r) => setTimeout(r, 1200));
        _held++;
        if (myGen !== _sfGen) return;
      }
      const job = _sfQ.hi.length ? _sfQ.hi.shift() : _sfQ.lo.shift();
      if (window.DECKHAND_CONFIG?.selfHosted && _netDown) {
        const cached = /\/cards\/named\?/.test(String(job.url))
          ? await _bulkNamedServe(job.url)
          : null;
        job.resolve(cached || localServerUnavailable());
        continue;
      }
      if (Date.now() < _sfRetryAt) {
        job.resolve(
          new Response(JSON.stringify({ object: 'error', code: 'rate_limited' }), { status: 429 }),
        );
        continue;
      }
      if (Date.now() - job.born > 90000) {
        const served = /\/cards\/named\?/.test(String(job.url))
          ? await _bulkNamedServe(job.url)
          : null;
        if (served) job.resolve(served);
        else job.reject(new Error('request expired in queue'));
        continue;
      }
      const t0 = Date.now();
      let res = null,
        err = null;
      const ctl = new AbortController();
      const killer = setTimeout(() => {
        try {
          ctl.abort();
        } catch (e) {}
      }, 20000);
      let hardT = null;
      try {
        // Hard race: even a fetch that ignores its abort signal frees the lane.
        res = await Promise.race([
          fetch(job.url, { signal: ctl.signal, cache: job.fresh ? 'no-store' : 'default' }),
          new Promise((_, rej) => {
            hardT = setTimeout(() => rej(new Error('hard timeout')), 24000);
          }),
        ]);
      } catch (e) {
        err = e;
      }
      clearTimeout(killer);
      clearTimeout(hardT);
      sfJournal(
        (res
          ? res.status
          : err && err.name === 'AbortError'
            ? 'TIMEOUT'
            : 'ERR ' + String((err && err.message) || err).slice(0, 60)) +
          ' ' +
          (Date.now() - t0) +
          'ms ' +
          String(job.url)
            .replace(/^https?:\/\/[^/]*/, '')
            .slice(0, 70),
      );
      // Any RESPONSE (even a 404) proves the line is up. A timeout proves
      // nothing either way, so it is deliberately not counted.
      const _verdict = res ? 'ok' : _netClassify(err);
      if (_verdict === 'ok') _netNote(true);
      else if (_verdict === 'dead') {
        if (window.DECKHAND_CONFIG?.selfHosted) _netSetDown(true);
        else _netNoteFail(job.url);
      }
      // A refusal is fast; a genuinely slow line is not. Only the fast kind,
      // and a real 429, mean "you are asking too often".
      if (res && res.status === 429) {
        _sfNoteRefusal(null, 429);
        _sfRetryAt =
          Date.now() + Math.max(60000, (Number(res.headers?.get('retry-after')) || 0) * 1000);
        for (const lane of [_sfQ.hi, _sfQ.lo]) {
          while (lane.length)
            lane.shift().resolve(
              new Response(JSON.stringify({ object: 'error', code: 'rate_limited' }), {
                status: 429,
              }),
            );
        }
      } else if (_verdict === 'dead') _sfNoteRefusal(Date.now() - t0, null);
      else if (res && res.ok) _sfNoteOk();
      const retryable = err || (res && res.status >= 500);
      const _maxTries = _netDown ? 0 : 1;
      if (retryable && job.attempt < _maxTries) {
        if (res)
          console.warn(
            'Scryfall ' + res.status + ', retrying (attempt ' + (job.attempt + 1) + ')',
            job.url,
          );
        job.attempt++;
        const lane = job.bg ? _sfQ.lo : _sfQ.hi;
        setTimeout(
          () => {
            lane.unshift(job);
            _sfPump();
          },
          backoffMs(job.attempt - 1),
        );
      } else if (err) {
        // Last net: a name lookup dying on a network error answers from the
        // local database instead of failing its caller.
        const served = /\/cards\/named\?/.test(String(job.url))
          ? await _bulkNamedServe(job.url)
          : null;
        if (served) {
          try {
            sfJournal(
              'BULK 200 (net-fail) ' +
                String(job.url)
                  .replace(/^https?:\/\/[^/]*/, '')
                  .slice(0, 70),
            );
          } catch (e) {}
          job.resolve(served);
        } else if (window.DECKHAND_CONFIG?.selfHosted) job.resolve(localServerUnavailable());
        else job.reject(err);
      } else {
        job.resolve(res);
      }
      await new Promise((r) => setTimeout(r, _sfCooling() ? SF_GAP_EASY : SF_GAP));
    }
  } finally {
    if (myGen === _sfGen) _sfWorking = false;
    if ((_sfQ.hi.length || _sfQ.lo.length) && !_sfWorking) _sfPump();
  }
}

/* Watchdog: if the pump has queued work but hasn't heartbeat in 20s, its
   awaited fetch has wedged in a way even the 12s abort didn't catch. Retire
   that loop (generation bump) and start a fresh one — the whole app's data
   access rides on this one lane, so it must never stall permanently. */
setInterval(() => {
  if (_sfWorking && (_sfQ.hi.length || _sfQ.lo.length) && Date.now() - _sfBeat > 30000) {
    console.warn(
      'Scryfall queue watchdog: pump wedged for 20s — restarting it. Queue:',
      _sfQ.hi.length,
      'hi /',
      _sfQ.lo.length,
      'lo',
    );
    _sfGen++;
    _sfWorking = false;
    _sfPump();
  }
}, 5000);

function backoffMs(attempt) {
  return Math.min(6000, 450 * Math.pow(1.8, attempt)) + Math.random() * 250;
}

async function resolveLegalSets(force) {
  if (state.setsResolved && !force) return;
  try {
    const res = await sfFetch(SF_BASE + '/sets', 0, false, !!force);
    if (!res.ok) return;
    const data = await res.json();
    const all = data.data || [];
    // Full catalog for the daily new-set check
    state.allSetsRaw = all.map((x) => ({
      code: x.code,
      name: x.name,
      set_type: x.set_type,
      digital: !!x.digital,
      released_at: x.released_at || '',
      parent: x.parent_set_code || '',
      icon: x.icon_svg_uri || '',
      cards: x.card_count || 0,
    }));
    state.setIconMap = {};
    state.allSetsRaw.forEach((x) => {
      if (x.icon) state.setIconMap[x.code] = x.icon;
    });
    try {
      localStorage.setItem(LS_PREFIX + 'setIcons', JSON.stringify(state.setIconMap));
    } catch (e) {}
    state.setsResolved = true;
  } catch (e) {
    if (window.DECKHAND_CONFIG?.selfHosted && _netDown) sfJournal('sets: local server unavailable');
    else console.error('resolveLegalSets failed', e);
  }
}

const GAME_CHANGERS = new Set([
  'Drannith Magistrate',
  'Enlightened Tutor',
  'Farewell',
  'Humility',
  "Serra's Sanctum",
  'Smothering Tithe',
  "Teferi's Protection",
  'Consecrated Sphinx',
  'Cyclonic Rift',
  'Fierce Guardianship',
  'Force of Will',
  'Gifts Ungiven',
  'Intuition',
  'Mystical Tutor',
  'Narset, Parter of Veils',
  'Rhystic Study',
  "Thassa's Oracle",
  'Ad Nauseam',
  "Bolas's Citadel",
  'Braids, Cabal Minion',
  'Demonic Tutor',
  'Imperial Seal',
  'Necropotence',
  'Opposition Agent',
  'Orcish Bowmasters',
  'Tergrid, God of Fright',
  'Vampiric Tutor',
  'Gamble',
  "Jeska's Will",
  'Underworld Breach',
  'Biorhythm',
  'Crop Rotation',
  "Gaea's Cradle",
  'Natural Order',
  'Seedborn Muse',
  'Survival of the Fittest',
  'Worldly Tutor',
  'Aura Shards',
  'Coalition Victory',
  'Grand Arbiter Augustin IV',
  'Notion Thief',
  'Ancient Tomb',
  'Chrome Mox',
  'Field of the Dead',
  'Glacial Chasm',
  'Grim Monolith',
  "Lion's Eye Diamond",
  'Mana Vault',
  "Mishra's Workshop",
  'Mox Diamond',
  'Panoptic Mirror',
  'The One Ring',
  'The Tabernacle at Pendrell Vale',
]);

function isGameChanger(c) {
  if (!c) return false;
  // The card's own Scryfall flag rules whenever present — always current.
  if (typeof c.game_changer === 'boolean') return c.game_changer;
  return GAME_CHANGERS.has(frontFace(c).name || c.name);
}

function gcMarkHtml(c) {
  return isGameChanger(c)
    ? `<span class="gc-mark" title="Game Changer"><span>GC</span></span>`
    : '';
}

/* The bottom-left badge rail: UB, the spoiler 🔮 (matching the Spoilers
   page's own button), and the owned-✓ as small circles packed from the
   card's bottom-left rightward — over the type line and art edge, the least
   load-bearing part of a card frame — and never anywhere near the mana
   cost, the name, or the power/toughness box. The rail overlay copies the
   card's 63:88 box, so it hugs the IMAGE's bottom even when the tile
   carries text below it. */
/* A two-faced card carries an image per face; split and adventure cards
   share one image and get no flip. */
function dfcBackFace(card) {
  const f = card && card.card_faces;
  if (!f || f.length < 2) return null;
  const pick = (im) => (im && (im.normal || im.large || im.png)) || null;
  let front = pick(f[0].image_uris),
    back = pick(f[1].image_uris);
  // Slimmed deck/collection copies and local-database cards carry no face
  // art — but every two-faced card's front and back live at fixed CDN paths
  // derived from its Scryfall id, so the flip button never goes missing.
  if (
    (!front || !back) &&
    card.id &&
    /^(transform|modal_dfc|reversible_card|double_faced_token)$/.test(card.layout || '')
  ) {
    const u = (side) =>
      'https://cards.scryfall.io/normal/' +
      side +
      '/' +
      card.id[0] +
      '/' +
      card.id[1] +
      '/' +
      card.id +
      '.jpg';
    front = front || u('front');
    back = back || u('back');
  }
  return front && back ? { front, back } : null;
}

function dfcFlipHtml(c) {
  const d = dfcBackFace(c);
  if (!d) {
    // Meld halves flip too — but their back is the COMPLETE meld result
    // (both halves joined into one card), fetched once per name on first
    // tap and cached for the session; never just a rotated half.
    if (c && c.layout === 'meld') {
      // Prefetch the moment the button exists: resolve the meld result AND
      // warm the browser's image cache, so the tap flips as instantly as a
      // normal double-faced card instead of waiting on the fetch queue.
      queueMicrotask(() => {
        try {
          meldResultImage(c.name)
            .then((u) => {
              if (u) {
                const im = new Image();
                im.src = u;
              }
            })
            .catch(() => {});
        } catch (_) {}
      });
      return /* HTML */ `<span class="dfc-flip-box"
        ><button
          class="dfc-flip"
          title="Show the full meld result"
          data-meld="${escapeHtml(c.name)}"
          data-front="${escapeHtml(cardImageLarge(c))}"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 5V2L7 6l5 4V7c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 13c0-4.42-3.58-8-8-8zm-5.3 2.74L5.24 6.28A7.93 7.93 0 0 0 4 13c0 4.42 3.58 8 8 8v3l5-4-5-4v3c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8z"
            />
          </svg></button
      ></span>`;
    }
    return '';
  }
  return /* HTML */ `<span class="dfc-flip-box"
    ><button
      class="dfc-flip"
      title="Flip to the other face"
      data-front="${escapeHtml(d.front)}"
      data-back="${escapeHtml(d.back)}"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 5V2L7 6l5 4V7c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 13c0-4.42-3.58-8-8-8zm-5.3 2.74L5.24 6.28A7.93 7.93 0 0 0 4 13c0 4.42 3.58 8 8 8v3l5-4-5-4v3c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8z"
        />
      </svg></button
  ></span>`;
}

/* The full meld result for a meld half: named card -> all_parts ->
   meld_result -> that card's own image. One fetch per name per session. */
const _meldImgCache = new Map();

async function meldResultImage(name) {
  if (_meldImgCache.has(name)) return _meldImgCache.get(name);
  const r = await sfFetch(SF_BASE + '/cards/named?exact=' + encodeURIComponent(name), 0, false);
  if (!r || !r.ok) return null;
  const c = await r.json();
  const part = (c.all_parts || []).find((p) => p.component === 'meld_result');
  if (!part || !part.uri) return null;
  const r2 = await sfFetch(part.uri, 0, false);
  if (!r2 || !r2.ok) return null;
  const m = await r2.json();
  const img = (m.image_uris && (m.image_uris.normal || m.image_uris.large)) || null;
  if (img) _meldImgCache.set(name, img);
  return img;
}

function cardBadgesHtml(c) {
  if (!c) return '';
  const b = [];
  if (isPreviewCard(c)) b.push('<i class="cb cb-sp" title="Spoiler — not yet released">🔮</i>');
  if (ownedNames().has(c.name)) b.push('<i class="cb cb-own" title="In your collection">✓</i>');

  // The flip button for double-faced cards rides along wherever the badge
  // rail is emitted — every grid tile and deck view gets it in one place.
  const _pf = c.pin ? null : _printPrefRec(c.name);
  const _isFoil = _pf ? !!_pf.f : !!c._foilPick;
  return (
    (b.length ? `<span class="card-badges">${b.join('')}</span>` : '') +
    (_isFoil ? '<i class="foil-star" title="Foil printing">✨</i>' : '') +
    dfcFlipHtml(c)
  );
}

/* Old scans have square white corners; the CSS clips every card image to the
   real card corner radius so corners read dark like the physical card — except
   genuinely white-bordered cards, which keep their light corners. */
function wbClass(c) {
  return c && c.border_color === 'white' ? 'wb-card' : '';
}

/* Owned marker: a small check on deck tiles for cards that are in the
   collection under ANY printing. */
function ownedNames() {
  if (!state._ownedSet)
    state._ownedSet = new Set((state.collection.items || []).map((it) => it.name));
  return state._ownedSet;
}

/* Spoiler season: sets whose release date is still ahead but whose previews
   are already on Scryfall. Their cards flow into the pool the moment they're
   spoiled, wearing a SPOILER marker until the set actually releases. */
function isPreviewSet(code) {
  const d = (autoSets.previewMeta || {})[(code || '').toLowerCase()];
  return !!d && d > new Date().toISOString().slice(0, 10);
}

function isPreviewCard(c) {
  return (
    !!c &&
    (isPreviewSet(c.set) ||
      (c.released_at && c.released_at > new Date().toISOString().slice(0, 10)))
  );
}

async function runLimited(items, worker, limit = 6) {
  const out = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const my = idx++;
      out[my] = await worker(items[my], my);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(next));
  return out;
}

/* Core search primitive: one broad Scryfall query (no giant OR-of-sets clause),
   then verify each candidate's historical legality via its own prints list.
   This is the same reliable technique Bulk Edit uses, applied to live search
   so we don't depend on a single fragile multi-set query string. */
function chunkArr(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* Fast path: instead of fetching a broad result set and then verifying each
   candidate's legality one-by-one (which needs ~2x N requests and was the
   reason Inspiration was slow), restrict the query itself to legal sets via
   a handful of parallel "(set:a OR set:b OR ...)" queries and merge the
   results. This needs ~8 requests total regardless of how many cards match,
   and is safe now that sfFetch's queue no longer has the race condition that
   caused an earlier version of this approach to silently return nothing. */
const _queryCache = new Map();
