// platform / notifications

/* ---- Web Push for spoilers (v2.51.589) ----
   Real push: the service worker shows the notification; subscriptions live
   in Netlify Blobs via two tiny functions; a daily scheduled function
   checks Scryfall for new sets and pushes. The public VAPID key is baked
   in; the private key lives ONLY in Netlify environment variables. */
const VAPID_PUBLIC_KEY =
  'BKgh9benrNW3VO69hlydSNaUMoB0s6KsMOg79jSOXaqtenqsWMEVv_9hKxoVRgzeRAsn1mJ0M_Oqr-s8zIPJc6M';

function _b64uToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function _pushStatus(msg) {
  const el = document.getElementById('pushStatus');
  if (el) el.textContent = msg || '';
}

/* Twee schakelaars, één abonnement. De voorkeuren reizen mee naar de server,
   die per melding kijkt wie hem wil. Staan ze allebei uit, dan wordt het
   abonnement opgezegd. De oude ene schakelaar (pushOn) blijft bestaan als
   hoofdstand: aan zodra er één van de twee aanstaat. */
/* Hoe vaak je iets over spoilers hoort. De lijst staat in DOM-volgorde, en
   .otag-pop is column-reverse: wat hier EERST staat, staat in beeld
   ONDERAAN -- bij de duim. Vandaar: elke kaart, dan 5, dan 10, dan uit. */
const SPOIL_EVERY_CHOICES = [1, 5, 10, 0];

function spoilEveryLabel(v) {
  const NL = appLang() === 'nl';
  if (!v) return NL ? 'Geen meldingen' : 'No alerts';
  if (v === 1) return NL ? 'Elke kaart' : 'Every card';
  return NL ? 'Per ' + v + ' kaarten' : 'Every ' + v + ' cards';
}

function normSpoilEvery(v) {
  const n = parseInt(v, 10);
  return SPOIL_EVERY_CHOICES.indexOf(n) > -1 ? n : 5;
}

function pushPrefs() {
  let sp = null,
    up = null,
    ev = null;
  try {
    sp = localStorage.getItem(LS_PREFIX + 'pushSpoilers');
    up = localStorage.getItem(LS_PREFIX + 'pushUpdates');
    ev = localStorage.getItem(LS_PREFIX + 'pushSpoilEvery');
  } catch (e) {}
  if (sp === null && up === null) {
    let oud = null;
    try {
      oud = localStorage.getItem(LS_PREFIX + 'pushOn');
    } catch (e) {}
    const aan = oud === '1'; // de oude schakelaar dekte allebei
    return { spoilers: aan, updates: aan, spoilerEvery: aan ? 5 : 0 };
  }
  const spoilers = sp === '1';
  // Wie eerder alleen aan/uit kende, valt op de oude stand terug: per 5.
  const every = ev === null ? (spoilers ? 5 : 0) : normSpoilEvery(ev);
  return { spoilers: every > 0, updates: up === '1', spoilerEvery: every };
}

function savePushPrefs(p) {
  const every = normSpoilEvery(p.spoilerEvery != null ? p.spoilerEvery : p.spoilers ? 5 : 0);
  try {
    localStorage.setItem(LS_PREFIX + 'pushSpoilEvery', String(every));
    localStorage.setItem(LS_PREFIX + 'pushSpoilers', every > 0 ? '1' : '0');
    localStorage.setItem(LS_PREFIX + 'pushUpdates', p.updates ? '1' : '0');
    localStorage.setItem(LS_PREFIX + 'pushOn', every > 0 || p.updates ? '1' : '0');
  } catch (e) {}
}

function _pushOnMsg(p) {
  const NL = appLang() === 'nl';
  const stukken = [];
  const every = normSpoilEvery(p.spoilerEvery != null ? p.spoilerEvery : p.spoilers ? 5 : 0);
  if (every === 1) stukken.push(NL ? 'elke gespoilde kaart' : 'every spoiled card');
  else if (every > 1) stukken.push(NL ? 'spoilers per ' + every : 'spoilers every ' + every);
  if (p.updates) stukken.push(NL ? 'app-updates' : 'app updates');
  if (!stukken.length) return NL ? 'Uit.' : 'Off.';
  const lijst = stukken.length === 2 ? stukken.join(NL ? ' en ' : ' and ') : stukken[0];
  return (NL ? '\u2713 Aan \u2014 ' : '\u2713 On \u2014 ') + lijst + '.';
}

/* Why push is off. Android's WebView -- what the Deckhand APK runs on -- has no
   Push API at all, so the honest answer there is not "your phone can't do this"
   but "this wrapper can't, the browser version can". */
function _pushUnavailableMsg() {
  const NL = appLang() === 'nl';
  if (window.DECKHAND_CONFIG?.selfHosted)
    return NL
      ? 'Pushmeldingen staan uit op deze server.'
      : 'Push notifications are disabled on this server.';
  if (nativeNotify()) {
    return NL ? '' : '';
  }
  if (inAndroidApp()) {
    return NL
      ? 'Niet beschikbaar in de Android-app \u2014 pushmeldingen werken alleen in de browserversie. Updates zie je hier gewoon in de changelog.'
      : 'Not available inside the Android app \u2014 push only works in the browser version. Updates still show up here in the changelog.';
  }
  return NL ? 'Dit toestel ondersteunt geen pushmeldingen.' : 'This device does not support push.';
}

/* Inside the Android app there is no Push API, but the app itself can look
   once a day and raise a real Android notification. That lane is exposed by
   the wrapper as DeckhandNotify; when it is there, the toggle drives it
   instead of a web push subscription. */
function nativeNotify() {
  try {
    const n = window.DeckhandNotify;
    return n && typeof n.setEnabled === 'function' ? n : null;
  } catch (e) {
    return null;
  }
}

function _nativeOnMsg() {
  return '';
  return appLang() === 'nl'
    ? '\u2713 Aan \u2014 de app kijkt \u00e9\u00e9n keer per dag zelf naar nieuwe sets en updates.'
    : '\u2713 On \u2014 the app checks once a day for new sets and updates.';
}

async function enableNativeNotify() {
  const NL = appLang() === 'nl';
  const n = nativeNotify();
  if (!n) return;
  try {
    n.setLang(appLang());
    n.setEnabled(true);
    try {
      localStorage.setItem(LS_PREFIX + 'pushOn', '1');
    } catch (e) {}
    _pushStatus(_nativeOnMsg());
    _nativePermCheck(n);
  } catch (e) {
    _pushStatus((NL ? 'Aanzetten mislukt: ' : 'Could not enable: ') + ((e && e.message) || e));
  }
}

/* Android 13+ shows its own permission sheet; report the outcome honestly. */
function _nativePermCheck(n) {
  const NL = appLang() === 'nl';
  setTimeout(() => {
    try {
      if (n.permissionGranted && !n.permissionGranted()) {
        _pushStatus(
          NL
            ? '\u26a0 Meldingen staan nog uit voor Deckhand \u2014 zet ze aan bij Instellingen \u2192 Apps \u2192 Deckhand \u2192 Meldingen.'
            : '\u26a0 Notifications are still off for Deckhand \u2014 turn them on in Settings \u2192 Apps \u2192 Deckhand \u2192 Notifications.',
        );
      }
    } catch (e) {}
  }, 2500);
}

function disableNativeNotify() {
  const n = nativeNotify();
  try {
    if (n) n.setEnabled(false);
  } catch (e) {}
  try {
    localStorage.setItem(LS_PREFIX + 'pushOn', '0');
  } catch (e) {}
  _pushStatus(appLang() === 'nl' ? 'Uit.' : 'Off.');
}

/* The verdict belongs on screen the moment Extras opens, not only after a tap.
   Three cases: the app's own lane, a browser that can push, and neither. */
/* De app-laan (de Android-schil) kent de twee lanen en de spoilerfrequentie
   sinds APK 3.3. Een oudere schil kent alleen setEnabled; dan valt alles
   terug op \u00e9\u00e9n schakelaar. */
function applyNativePrefs(p) {
  const n = nativeNotify();
  if (!n) return;
  try {
    n.setLang(appLang());
  } catch (e) {}
  let gesplitst = false;
  try {
    if (typeof n.setSpoilerEvery === 'function' && typeof n.setUpdates === 'function') {
      n.setSpoilerEvery(normSpoilEvery(p.spoilerEvery));
      n.setUpdates(!!p.updates);
      gesplitst = true;
    }
  } catch (e) {}
  if (gesplitst) {
    try {
      localStorage.setItem(LS_PREFIX + 'pushOn', p.spoilerEvery > 0 || p.updates ? '1' : '0');
    } catch (e) {}
    _pushStatus(
      p.spoilerEvery > 0 || p.updates ? _nativeOnMsg() : appLang() === 'nl' ? 'Uit.' : 'Off.',
    );
    // Android 13+ shows its own permission sheet; report the outcome honestly.
    if (p.spoilerEvery > 0 || p.updates) _nativePermCheck(n);
    return;
  }
  p.spoilerEvery > 0 || p.updates ? enableNativeNotify() : disableNativeNotify();
}

function paintPushAvailability() {
  const sb = document.getElementById('pushSpoilBtn');
  const up = document.getElementById('pushUpdToggle');
  if (!sb && !up) return;
  const p = pushPrefs();
  const zetKnop = (v) => {
    if (sb)
      sb.innerHTML = `${escapeHtml(spoilEveryLabel(v))} <span style="float:right;opacity:0.6;">▾</span>`;
  };
  const nat = nativeNotify();
  if (nat) {
    let every = null,
      upd = null;
    try {
      if (typeof nat.getSpoilerEvery === 'function') every = nat.getSpoilerEvery();
    } catch (e) {}
    try {
      if (typeof nat.getUpdates === 'function') upd = nat.getUpdates();
    } catch (e) {}
    try {
      nat.setLang(appLang());
    } catch (e) {}
    if (every == null || upd == null) {
      // Oude schil: \u00e9\u00e9n schakelaar voor alles.
      let on = false;
      try {
        on = !!nat.isEnabled();
      } catch (e) {}
      every = on ? p.spoilerEvery || 5 : 0;
      upd = on;
    }
    zetKnop(normSpoilEvery(every));
    if (up) {
      up.disabled = false;
      up.checked = !!upd;
    }
    _pushStatus(every > 0 || upd ? _nativeOnMsg() : '');
    return;
  }
  if (
    window.DECKHAND_CONFIG?.webPushEnabled === false ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    if (sb) {
      sb.disabled = true;
      sb.closest('.settings-row')?.style.setProperty('opacity', '0.75');
    }
    if (up) {
      up.checked = false;
      up.disabled = true;
      up.closest('.settings-row')?.style.setProperty('opacity', '0.75');
    }
    zetKnop(0);
    _pushStatus(_pushUnavailableMsg());
    return;
  }
  // A browser that already carries a subscription should say so on arrival,
  // not stay blank until the next tap.
  zetKnop(p.spoilerEvery);
  if (up) up.checked = p.updates;
  if (p.spoilers || p.updates) _pushStatus(_pushOnMsg(p));
}

async function syncPushPrefs(p) {
  if (window.DECKHAND_CONFIG?.webPushEnabled === false) {
    _pushStatus(_pushUnavailableMsg());
    return;
  }
  const NL = appLang() === 'nl';
  p = Object.assign({}, p, { spoilerEvery: normSpoilEvery(p.spoilerEvery) });
  p.spoilers = p.spoilerEvery > 0;
  // Wat je koos wordt METEEN bewaard, ook als het aanmelden daarna misgaat:
  // de knop hoort te tonen wat je gevraagd hebt, en de statusregel zegt het
  // eerlijk als de server het niet heeft meegekregen.
  savePushPrefs(p);
  if (!p.spoilers && !p.updates) {
    await unsubscribePush();
    return;
  }
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      _pushStatus(_pushUnavailableMsg());
      paintPushAvailability();
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      _pushStatus(
        NL
          ? 'Toestemming geweigerd \u2014 zet meldingen aan in de Android-instellingen.'
          : 'Permission denied \u2014 allow notifications in Android settings.',
      );
      savePushPrefs({ spoilers: false, updates: false, spoilerEvery: 0 });
      paintPushAvailability();
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub)
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _b64uToBytes(VAPID_PUBLIC_KEY),
      });
    // Language AND the two switches travel with the subscription: the server
    // decides per notification who wants it.
    const r = await fetch('/.netlify/functions/push-subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        Object.assign(JSON.parse(JSON.stringify(sub)), {
          lang: appLang(),
          spoilers: normSpoilEvery(p.spoilerEvery) > 0,
          spoilerEvery: normSpoilEvery(p.spoilerEvery),
          updates: !!p.updates,
        }),
      ),
    });
    if (!r.ok) throw new Error('subscribe ' + r.status);
    _pushStatus(_pushOnMsg(p));
  } catch (e) {
    _pushStatus((NL ? 'Aanzetten mislukt: ' : 'Could not enable: ') + ((e && e.message) || e));
    paintPushAvailability();
  }
}

async function unsubscribePush() {
  const NL = appLang() === 'nl';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try {
        await fetch('/.netlify/functions/push-subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch (e) {}
      await sub.unsubscribe();
    }
  } catch (e) {}
  _pushStatus(NL ? 'Uit.' : 'Off.');
}
