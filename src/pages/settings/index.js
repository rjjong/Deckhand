// pages / settings / index

function settingsPageHtml() {
  return /* HTML */ `<main class="hub-page settings-page">
    <section class="hub-intro">
      <span class="hub-eyebrow">YOUR PREFERENCES</span>
      <h1>Make it yours.</h1>
      <p>Choose your preferences, manage your data, and keep everything backed up and in sync.</p>
    </section>
    ${menuToolsHtml(true)}
  </main>`;
}

function wireSettingsPage() {
  wirePreferenceCards();
  wirePreferences();
}

/* ---------------- SETTINGS PAGE ---------------- */

/* Inside the standalone Android build (Deckhand.apk) the Java side exposes this
   bridge. It is the one honest signal that we are running in the app rather
   than a browser tab, so the install and download rows hide themselves there. */
/* The "share this app" invite. The website link comes FIRST: chat apps build
   their preview card (og-image.png) from the first link in a message. The APK
   link installs straight on Android; iPhone gets the web app via Safari. Always
   the public site -- inside the APK, location is not the website. */
const DECKHAND_SITE = /^https?:$/.test(location.protocol)
  ? location.origin + '/'
  : 'https://deckhandcompanion.netlify.app/';

/* ---- Feedback (1.0) ----
   A short message and up to three screenshots, mailed to the maker through
   Netlify Forms (the form "feedback" in the page; Netlify mails each
   submission). Spam guards: a hidden honeypot field, Netlify's own spam
   filter, at least 4 seconds between opening and sending, one send per
   minute and five per day from a device. Screenshots are shrunk on the
   phone first (max 1600 px, JPEG) so they travel light. */
const FB_LOG = LS_PREFIX + 'fbLog';

function fbSentToday() {
  try {
    const t = Date.now();
    return (JSON.parse(localStorage.getItem(FB_LOG) || '[]') || []).filter((x) => t - x < 864e5);
  } catch (e) {
    return [];
  }
}

function fbShrink(file) {
  return new Promise((res) => {
    try {
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => res(b || file), 'image/jpeg', 0.82);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        res(file);
      };
      img.src = url;
    } catch (e) {
      res(file);
    }
  });
}

function fbMailto(text) {
  const to = ['stefvandervelden', 'gmail.com'].join('@'); // assembled here, never written whole in the page
  return (
    'mailto:' +
    to +
    '?subject=' +
    encodeURIComponent('Deckhand feedback') +
    '&body=' +
    encodeURIComponent(text || '')
  );
}

function openFeedbackSheet() {
  if (window.DECKHAND_CONFIG?.selfHosted) {
    toast(
      appLang() === 'nl'
        ? 'Feedback versturen staat uit op deze server.'
        : 'Feedback submission is disabled on this server.',
    );
    return;
  }
  const NL = appLang() === 'nl',
    T = (a, b) => (NL ? a : b);
  document.getElementById('fbSheet')?.remove();
  const opened = Date.now(),
    shots = [null, null, null];
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'fbSheet';
  el.style.zIndex = 1300;
  el.style.alignItems = 'flex-end';
  el.innerHTML = /* HTML */ `<div class="deckpick fb-sheet" role="dialog" aria-label="Feedback">
    <h4>${T('Feedback sturen', 'Send feedback')}</h4>
    <p class="fb-hint">
      ${T(
        'Wat gebeurde er, en waar in de app? Een screenshot helpt enorm: maak er een (meestal aan/uit + volume omlaag tegelijk) en voeg hem hieronder toe, tot 3. Je appversie en telefoontype gaan vanzelf mee.',
        'What happened, and where in the app? A screenshot helps a lot: take one (usually power + volume down together) and add it below, up to 3. Your app version and phone type come along by themselves.',
      )}
    </p>
    <textarea
      id="fbMsg"
      rows="5"
      maxlength="2000"
      placeholder="${T('Je bericht\u2026', 'Your message\u2026')}"
    ></textarea>
    <div class="fb-count" id="fbCount">0/2000</div>
    <div class="fb-shots">
      ${[0, 1, 2].map((i) => `<button type="button" class="fb-shot" data-fbshot="${i}">${inlIco('camera', 18)}<span>${T('Screenshot', 'Screenshot')}</span></button>`).join('')}
    </div>
    <input type="file" id="fbFile" accept="image/*" hidden />
    <input
      type="email"
      id="fbEmail"
      maxlength="120"
      autocomplete="email"
      placeholder="${T('Je e-mail (alleen als je antwoord wilt)', 'Your email (only if you want a reply)')}"
    />
    <input
      type="text"
      class="fb-hp"
      id="fbHp"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
    />
    <div class="fb-actions">
      <button type="button" class="ghost-btn" id="fbCancel">${T('Annuleren', 'Cancel')}</button
      ><button type="button" class="primary-btn" id="fbSend">${T('Versturen', 'Send')}</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  const close = () => {
    el.remove();
  };
  pushOverlay('feedback', close);
  const done = () => {
    close();
    const st = state.overlayStack;
    if (st.length && st[st.length - 1].id === 'feedback') st.pop();
  };
  el.addEventListener('click', (e) => {
    if (e.target === el) done();
  });
  el.querySelector('#fbCancel').addEventListener('click', done);
  const msg = el.querySelector('#fbMsg'),
    cnt = el.querySelector('#fbCount'),
    file = el.querySelector('#fbFile');
  msg.addEventListener('input', () => {
    cnt.textContent = msg.value.length + '/2000';
  });
  let slot = 0;
  const paintShot = (i) => {
    const b = el.querySelector(`[data-fbshot="${i}"]`);
    if (shots[i])
      b.innerHTML = `<img src="${URL.createObjectURL(shots[i])}" alt=""><span class="fb-x" data-fbx="${i}">\u2715</span>`;
    else b.innerHTML = `${inlIco('camera', 18)}<span>${T('Screenshot', 'Screenshot')}</span>`;
  };
  el.querySelectorAll('[data-fbshot]').forEach((b) =>
    b.addEventListener('click', (e) => {
      const i = +b.dataset.fbshot;
      if (e.target.closest('[data-fbx]')) {
        shots[i] = null;
        paintShot(i);
        return;
      }
      slot = i;
      file.value = '';
      file.click();
    }),
  );
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      toast(T('Alleen afbeeldingen.', 'Images only.'));
      return;
    }
    shots[slot] = await fbShrink(f);
    paintShot(slot);
  });
  el.querySelector('#fbSend').addEventListener('click', async () => {
    const text = msg.value.trim();
    if (el.querySelector('#fbHp').value) {
      done();
      return;
    } // a bot filled the trap
    if (text.length < 10) {
      toast(
        T(
          'Schrijf iets meer (minstens 10 tekens).',
          'Write a little more (at least 10 characters).',
        ),
      );
      msg.focus();
      return;
    }
    if (Date.now() - opened < 4000) {
      toast(T('Even rustig \u2014 probeer het zo nog eens.', 'Easy \u2014 try again in a moment.'));
      return;
    }
    const log = fbSentToday();
    if (log.length && Date.now() - log[log.length - 1] < 60000) {
      toast(
        T(
          'Je stuurde net al iets \u2014 wacht een minuutje.',
          'You just sent one \u2014 wait a minute.',
        ),
      );
      return;
    }
    if (log.length >= 5) {
      toast(
        T(
          'Vandaag al 5 berichten gestuurd \u2014 morgen weer.',
          'Five messages sent today \u2014 more tomorrow.',
        ),
      );
      return;
    }
    const ctx =
      'Deckhand ' +
      APP_VERSION +
      (apkInstalled() ? ' · app ' + apkInstalled() : ' · browser') +
      ' · ' +
      appLang() +
      ' · ' +
      window.innerWidth +
      'x' +
      window.innerHeight +
      ' · ' +
      navigator.userAgent;
    const fd = new FormData();
    fd.append('form-name', 'feedback');
    fd.append('bot-field', '');
    fd.append('message', text);
    fd.append('email', el.querySelector('#fbEmail').value.trim());
    fd.append('context', ctx);
    shots.forEach((b, i) => {
      if (b)
        fd.append(
          'screenshot' + (i + 1),
          new File([b], 'screenshot' + (i + 1) + '.jpg', { type: 'image/jpeg' }),
        );
    });
    const btn = el.querySelector('#fbSend');
    btn.disabled = true;
    btn.textContent = T('Versturen\u2026', 'Sending\u2026');
    let ok = false;
    try {
      const same = location.origin === DECKHAND_SITE.replace(/\/$/, '');
      const r = await fetch(
        same ? '/' : DECKHAND_SITE,
        same ? { method: 'POST', body: fd } : { method: 'POST', body: fd, mode: 'no-cors' },
      );
      ok = same ? r.ok : true;
    } catch (e) {
      ok = false;
    }
    if (ok) {
      try {
        localStorage.setItem(FB_LOG, JSON.stringify(log.concat([Date.now()])));
      } catch (e) {}
      done();
      toast(T('Bedankt! Je bericht is verstuurd.', 'Thank you! Your message was sent.'));
      return;
    }
    btn.disabled = false;
    btn.textContent = T('Versturen', 'Send');
    openInAppConfirm(
      T(
        'Versturen lukte niet. Openen in je mail-app? Screenshots voeg je daar zelf toe.',
        'Sending failed. Open it in your mail app? Add screenshots there yourself.',
      ),
      (yes) => {
        if (yes) {
          try {
            location.href = fbMailto(text + '\n\n' + ctx);
          } catch (e) {}
        }
      },
      { ok: T('Mail-app', 'Mail app'), cancel: T('Annuleren', 'Cancel') },
    );
    const ic = document.getElementById('inAppConfirm');
    if (ic) ic.style.zIndex = 1400; // above this sheet
  });
  setTimeout(() => {
    try {
      msg.focus();
    } catch (e) {}
  }, 60);
}

// About's button and the small one under the credits in Extras
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('#feedbackBtn, [data-feedback]')) {
    e.stopPropagation();
    openFeedbackSheet();
  }
});

/* ---- The Android app keeps itself current ----
   APK_LATEST is the Deckhand.apk that sits next to this page on the site:
   raise it whenever a new APK goes into the repo. Inside an older app the
   page offers the update once (again after three days if put off): from APK
   4.3 the app downloads it and opens Android's installer itself; an older
   app hands the download to the browser. Android always asks the person to
   confirm, and the same signature means every deck and card stays. */
const APK_LATEST = '1.0';

/* The APK line restarted at 1.0 too (it was 3.0 ... 5.0). An app from the old
   line is always older than any app from the new one. */
function apkCmp(a, b) {
  const line = (v) => (+String(v || '0').split('.')[0] >= 3 ? 0 : 1);
  const la = line(a),
    lb = line(b);
  if (la !== lb) return la < lb ? -1 : 1;
  return apkVerCmp(a, b);
}

function apkVerCmp(a, b) {
  const x = String(a || '0')
      .split('.')
      .map(Number),
    y = String(b || '0')
      .split('.')
      .map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// The installed Android app's version, or null in a plain browser. Apps from
// before 4.3 do not say it, so their features give them away.
function apkInstalled() {
  try {
    const n = window.DeckhandNotify;
    if (!n) return null;
    if (typeof n.appVersion === 'function') {
      const v = String(n.appVersion() || '');
      if (v) return v;
    }
    if (typeof n.setPriceWatch === 'function') return '4.2';
    if (window.DeckhandExport && typeof window.DeckhandExport.share === 'function') return '4.1';
    if (typeof n.markSpoilersSeen === 'function') return '4.0';
    return '3.0';
  } catch (e) {
    return null;
  }
}

function apkOutdated() {
  const v = apkInstalled();
  return !!(v && apkCmp(v, APK_LATEST) < 0);
}

function apkUpdateNow() {
  const nl = appLang() === 'nl',
    url = DECKHAND_SITE + 'Deckhand.apk?v=' + APK_LATEST;
  const n = window.DeckhandNotify;
  if (n && typeof n.installUpdate === 'function') {
    n.installUpdate(url);
    return 'self';
  }
  // An older app: the page asks for the file, the app hands the download to
  // the browser, and the browser saves it -- tap it there to install.
  toast(
    nl
      ? 'Je browser downloadt de nieuwe app. Tik op de download en dan op Installeren.'
      : 'Your browser downloads the new app. Tap the download, then Install.',
  );
  try {
    location.href = url;
  } catch (e) {}
  return 'browser';
}

window.dhUpdateState = function (st) {
  const nl = appLang() === 'nl';
  const M = {
    downloading: nl ? 'Nieuwe app downloaden…' : 'Downloading the new app…',
    permission: nl
      ? 'Sta toe dat Deckhand apps installeert, en ga dan terug.'
      : 'Allow Deckhand to install apps, then come back.',
    installing: nl
      ? 'Bevestig de installatie in het scherm van Android.'
      : 'Confirm the install on Android\u2019s screen.',
    error: nl
      ? 'Downloaden mislukt — probeer het later nog eens.'
      : 'Download failed — try again later.',
  };
  if (M[st]) toast(M[st]);
};

function openApkUpdateSheet() {
  const nl = appLang() === 'nl',
    cur = apkInstalled();
  if (!cur) return;
  document.getElementById('apkSheet')?.remove();
  const self = !!(
    window.DeckhandNotify && typeof window.DeckhandNotify.installUpdate === 'function'
  );
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'apkSheet';
  el.style.zIndex = 215;
  el.style.alignItems = 'flex-end';
  // column-reverse sheet: Install at the foot, by the thumb.
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet apk-sheet">
    <div class="br-actions">
      <button type="button" class="primary-btn" id="apkNow">
        ${nl ? 'Nu installeren' : 'Install now'}
      </button>
      <button type="button" class="ghost-btn" id="apkLater">${nl ? 'Later' : 'Later'}</button>
    </div>
    <div class="bk-hint">
      ${
        self
          ? nl
            ? 'De app downloadt de nieuwe versie en Android vraagt je om te bevestigen.'
            : 'The app downloads the new version and Android asks you to confirm.'
          : nl
            ? 'Je browser downloadt de nieuwe versie. Tik op de download en daarna op <b>Installeren</b>. Android vraagt misschien eerst of de browser apps mag installeren.'
            : 'Your browser downloads the new version. Tap the download, then <b>Install</b>. Android may first ask whether the browser may install apps.'
      }
      ${nl ? ' Je decks, collectie en instellingen blijven gewoon staan.' : ' Your decks, collection and settings stay as they are.'}
    </div>
    <div class="br-title">
      <b>${inlIco('phone', 16)}${nl ? 'Nieuwe Android-app' : 'New Android app'} — ${APK_LATEST}</b
      ><span
        >${
          nl
            ? `Je hebt versie ${escapeHtml(cur)}. Nieuw in ${APK_LATEST}: ${escapeHtml(((APK_NOTES[APK_LATEST] || {}).nl || []).join(' · '))}.`
            : `You have version ${escapeHtml(cur)}. New in ${APK_LATEST}: ${escapeHtml(((APK_NOTES[APK_LATEST] || {}).en || []).join(' · '))}.`
        }</span
      >
    </div>
  </div>`;
  let after = null;
  brSheetOpen(
    el,
    'apkSheet',
    () => {
      if (after) {
        const f = after;
        after = null;
        setTimeout(f, 0);
      }
    },
    true,
  );
  const close = () => brSheetClose('apkSheet');
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelector('#apkLater').addEventListener('click', () => {
    try {
      localStorage.setItem(
        LS_PREFIX + 'apkSnooze',
        JSON.stringify({ v: APK_LATEST, t: Date.now() }),
      );
    } catch (e) {}
    close();
  });
  el.querySelector('#apkNow').addEventListener('click', () => {
    after = () => apkUpdateNow();
    close();
  });
}

// At start-up: once per new APK, again three days after "Later".
function apkUpdateCheck() {
  try {
    if (!apkOutdated()) return;
    let sz = null;
    try {
      sz = JSON.parse(localStorage.getItem(LS_PREFIX + 'apkSnooze') || 'null');
    } catch (e) {}
    if (sz && sz.v === APK_LATEST && Date.now() - (sz.t || 0) < 3 * 86400000) return;
    if (document.getElementById('inAppConfirm') || (state.overlayStack || []).length) return; // never on top of something
    openApkUpdateSheet();
  } catch (e) {}
}

function shareAppText(lang) {
  if (window.DECKHAND_CONFIG?.selfHosted) return 'Deckhand — ' + DECKHAND_SITE;
  // ?v=<version>: every release is a link WhatsApp has never seen, so it
  // fetches the preview card (og-image.png) fresh instead of reusing an old
  // cached one -- shares within one version still reuse the good card.
  const S = DECKHAND_SITE,
    site = S + '?v=' + APP_VERSION,
    apk = S + 'Deckhand.apk';
  if (lang === 'nl')
    return `Deckhand — de complete Magic: The Gathering-app. Gratis, zonder reclame.
${site}

Decks bouwen voor elk format, EDHREC ingebouwd, kaarten zoeken, een budgettool, je collectie met Cardmarket-prijzen, een AI-judge voor regelvragen, een life counter en Magic-nieuws. Bijna alles werkt offline.

Android: installeer de app direct
${apk}
(Je telefoon vraagt misschien één keer of je apps buiten de Play Store toestaat.)

iPhone: open de eerste link in Safari en kies Delen → Zet op beginscherm.`;
  return `Deckhand — the complete Magic: The Gathering companion. Free, no ads.
${site}

Deck building for every format, EDHREC built in, powerful card search, a budget tool, your collection with Cardmarket prices, an AI rules judge, a life counter and Magic news. Almost all of it works offline.

Android: install the app directly
${apk}
(Your phone may ask once to allow apps from outside the Play Store.)

iPhone: open the first link in Safari, then Share → Add to Home Screen.`;
}

function inAndroidApp() {
  try {
    return typeof window.DeckhandExport !== 'undefined';
  } catch (e) {
    return false;
  }
}

/* About: what Deckhand stands for. */
function aboutHtml() {
  const NL = appLang() === 'nl';
  const items = NL
    ? [
        [
          'Een complete ervaring',
          'decks, collectie, zoeken, spoilers, life counter, drafttools, een AI-judge voor je regelvragen en AI-hulp bij je lands: alles wat je als Magic-speler nodig hebt, in één app.',
        ],
        [
          'Open source',
          'de code staat openbaar op GitHub (GPL v3). Kijk erin, leer ervan, maak hem beter.',
        ],
        [
          'Voor altijd gratis',
          'geen betaalde versie, geen abonnement, niets achter een betaalmuur.',
        ],
        ['Geen reclame', 'niets dat in de weg zit, niets dat je verkocht wordt.'],
        [
          'Geen account, niemand die meekijkt',
          'je hoeft niets aan te maken, en Deckhand houdt niet bij wat je doet.',
        ],
        [
          'Jouw data is van jou',
          'je decks en collectie staan op je eigen telefoon. Eén back-upbestand naar je eigen cloud, en je decks exporteer je naar elke andere app.',
        ],
        [
          'Werkt offline',
          'de kaartendatabase staat op je telefoon: aan de keukentafel, in de winkel, in de trein.',
        ],
        [
          'Gemaakt voor één hand',
          'elke knop zit onderin, binnen bereik van je duim. De rest van het scherm is voor je kaarten.',
        ],
        [
          'Zuinig op de community',
          'kaartdata van Scryfall, thema’s van EDHREC: altijd met naam genoemd, en nooit vaker gevraagd dan nodig.',
        ],
        [
          'Door Magic-spelers, voor Magic-spelers',
          'gebouwd uit wat we aan onze eigen tafels misten. Ideeën zijn welkom.',
        ],
      ]
    : [
        [
          'A complete experience',
          'decks, collection, search, spoilers, life counter, draft tools, an AI judge for your rules questions and AI help with your lands: everything a Magic player needs, in one app.',
        ],
        [
          'Open source',
          'the code is public on GitHub (GPL v3). Look inside, learn from it, make it better.',
        ],
        ['Free forever', 'no paid version, no subscription, nothing behind a paywall.'],
        ['No ads', 'nothing in your way, nothing being sold to you.'],
        [
          'No account, nobody watching',
          'there is nothing to sign up for, and Deckhand does not track what you do.',
        ],
        [
          'Your data is yours',
          'your decks and collection live on your own phone. One backup file to your own cloud, and your decks export to any other app.',
        ],
        [
          'Works offline',
          'the card database lives on your phone: at the kitchen table, in the store, on the train.',
        ],
        [
          'Made for one hand',
          'every button sits at the bottom, within reach of your thumb. The rest of the screen is for your cards.',
        ],
        [
          'Kind to the community',
          'card data from Scryfall, themes from EDHREC: always credited, and never asked more often than needed.',
        ],
        [
          'By Magic players, for Magic players',
          'built from what we missed at our own tables. Ideas are welcome.',
        ],
      ];
  const data = NL
    ? [
        [
          'Alles op je eigen telefoon',
          'je decks, collectie, Gezocht, prijsalerts, potjes en instellingen staan in de opslag van de app op dit toestel. Er is geen Deckhand-server die ze bewaart of meeleest — behalve als je zelf Sync aanzet (zie hieronder).',
        ],
        [
          'Kaartgegevens worden gedownload',
          'de kaartendatabase en prijzen komen eens per dag of week van de Deckhand-site en blijven op je telefoon staan. Zoek je iets wat er niet in staat, dan vraagt de app het rechtstreeks aan Scryfall of EDHREC; die zien dat er een vraag komt, maar niet van wie.',
        ],
        [
          'Meldingen zonder account',
          'de Android-app kijkt zelf op je telefoon of er spoilers of updates zijn. Er wordt niets over jou opgeslagen om je een melding te kunnen sturen.',
        ],
        [
          'Feedback',
          'wat je via Over Deckhand stuurt, gaat via de Deckhand-site (Netlify) als e-mail naar de maker, met je appversie en telefoontype. Je e-mailadres alleen als je het zelf invult.',
        ],
        [
          'De AI-judge',
          'je vraag gaat met de officiële regels en de tekst van de kaarten die je tagt via de Deckhand-site naar een AI-dienst: Google Gemini, met Groq als reserve. Zonder naam of account: alleen een willekeurig toestelnummer, om de 20 vragen per dag te tellen. Google mag wat via zijn gratis laag binnenkomt gebruiken om zijn diensten te verbeteren; er gaat niets mee dat naar jou wijst. Voor een antwoord is dus internet nodig.',
        ],
        [
          'AI-hulp bij lands',
          'vraag je de AI om lands, dan gaan de kaartnamen, kaartteksten en cijfers van dat deck via de Deckhand-site naar dezelfde AI-dienst. Je deck zelf wordt daar niet bewaard, alleen het antwoord, zodat hetzelfde deck de volgende keer niets kost. Ook hier alleen het toestelnummer, om de 10 analyses per dag te tellen.',
        ],
        [
          'Wis je de app, dan is alles weg',
          'app-gegevens wissen, de app verwijderen of je telefoon resetten haalt alles mee. Daarom de back-up in Extra\u2019s: één bestand met alles, dat je in je eigen cloud zet en op elk toestel terugzet.',
        ],
        [
          'Sync, alleen als je het aanzet',
          'koppel je apparaten in Extra\u2019s \u2192 Sync, dan staat een kopie van je decks, collectie, mappen, tags en instellingen op de Deckhand-site (Netlify), onder je koppelcode. Zonder naam of account; de site bewaart alleen een versleutelde vingerafdruk van de code. Wie de code heeft, kan erbij \u2014 deel hem dus niet. Ontkoppelen kan altijd.',
        ],
        [
          'Beschermde opslag',
          'de app vraagt Android of zijn opslag beschermd mag blijven, zodat het systeem hem niet opruimt als je telefoon vol raakt. In Extra\u2019s → Back-up zie je of dat gelukt is.',
        ],
      ]
    : [
        [
          'Everything on your own phone',
          'your decks, collection, Wants, price alerts, games and settings live in the app\u2019s storage on this device. There is no Deckhand server that keeps or reads them — unless you turn on Sync yourself (see below).',
        ],
        [
          'Card data is downloaded',
          'the card database and prices come from the Deckhand site once a day or week and stay on your phone. Look up something that is not in it and the app asks Scryfall or EDHREC directly; they see a request arrive, not who sent it.',
        ],
        [
          'Notifications without an account',
          'the Android app checks for spoilers and updates on your phone itself. Nothing about you is stored to be able to notify you.',
        ],
        [
          'Feedback',
          'what you send from About Deckhand goes through the Deckhand site (Netlify) as an email to the maker, with your app version and phone type. Your email address only if you fill it in.',
        ],
        [
          'The AI judge',
          'your question goes, with the official rules and the text of the cards you tag, through the Deckhand site to an AI service: Google Gemini, with Groq as the reserve. No name, no account: only a random device number, to count the 20 questions a day. Google may use what comes in through its free tier to improve its services; nothing that points to you goes along. So an answer needs an internet connection.',
        ],
        [
          'AI help with lands',
          'when you ask the AI for lands, the card names, card texts and numbers of that deck go through the Deckhand site to the same AI service. Your deck itself is not kept there, only the answer, so the same deck costs nothing next time. Here too only the device number, to count the 10 analyses a day.',
        ],
        [
          'Clear the app and it is all gone',
          'clearing app data, uninstalling or resetting your phone takes everything with it. That is why there is the backup in Extras: one file with everything, kept in your own cloud and restored on any device.',
        ],
        [
          'Sync, only if you turn it on',
          'link your devices in Extras \u2192 Sync and a copy of your decks, collection, binders, tags and settings is kept on the Deckhand site (Netlify), under your link code. No name, no account; the site keeps only a scrambled fingerprint of the code. Whoever has the code can get in \u2014 so don\u2019t share it. You can unlink any time.',
        ],
        [
          'Protected storage',
          'the app asks Android to keep its storage protected, so the system does not clean it up when your phone runs full. Extras → Backup shows whether that worked.',
        ],
      ];
  return /* HTML */ `<div class="about-txt">
    <p>
      ${NL ? 'Deckhand rust op één gedachte: alles wat een Magic-speler nodig heeft, in één app, zonder addertjes.' : 'Deckhand rests on one idea: everything a Magic player needs, in one app, with no strings attached.'}
    </p>
    <ul>
      ${items.map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join('')}
    </ul>
    <h4 class="about-h">${NL ? 'Waar je gegevens staan' : 'Where your data lives'}</h4>
    <ul>
      ${data.map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join('')}
    </ul>
    <h4 class="about-h">${NL ? 'Feedback' : 'Feedback'}</h4>
    <p class="about-fb-hint">
      ${NL ? 'Een bug gezien, iets wat niet klopt, of een idee? Laat het weten \u2014 met een screenshot erbij is het meteen duidelijk.' : 'Spotted a bug, something off, or have an idea? Let us know \u2014 with a screenshot it is clear at once.'}
    </p>
    <button type="button" class="primary-btn about-fb" id="feedbackBtn">
      ${inlIco('edit', 16)}${NL ? 'Stuur feedback' : 'Send feedback'}
    </button>
    <a
      class="ghost-btn about-gh"
      href="https://github.com/stefvdv/Deckhand"
      target="_blank"
      rel="noopener"
      >${NL ? 'De code op GitHub' : 'The code on GitHub'} ↗</a
    >
  </div>`;
}

function ndFmtBtnHtml(f) {
  // The New! sits by the arrow, on the menu -- not by the chosen format's
  // name, where it would read as "Commander is new".
  return `${FMT_LABELS[f] || f} <span style="float:right;display:inline-flex;align-items:center;gap:2px;"><span style="opacity:0.6;margin-left:6px;">▾</span></span>`;
}

/* An icon inline with text: the app's line icons at text size, in the
   text's own ink -- never a coloured emoji. */
function inlIco(name, px) {
  return `<span class="inl-ico" style="--ii:${px || 15}px;">${ICONS[name] || ''}</span>`;
}

/* 1.36: a fold of an Extras tile floats over the tiles. One at a time; it
   sits above its tile when there is more room above, else below; a scrim
   behind it closes it on a tap (back closes it too, like every fold). The
   observer in wireSettingsPage calls this whenever a fold opens or shuts. */
function xtPlace(body) {
  const main = body.closest('main'),
    sec = body.parentElement;
  if (!main || !sec) return;
  // 1.37: every fold opens the same way -- a sheet over the tiles, its foot
  // just above the nav bar, as wide as the tiles, as tall as its content
  // (up to the title bar), with its tile's name on top.
  const l1 = sec.querySelector('.xt-tile .l1');
  if (l1) {
    const c = l1.cloneNode(true);
    c.querySelectorAll('.new-pill').forEach((x) => x.remove());
    body.dataset.xtTitle = c.textContent.replace(/\u00ad/g, '').trim();
  }
  let left = Infinity,
    right = -Infinity;
  main.querySelectorAll(':scope > .settings-section').forEach((x) => {
    const q = x.getBoundingClientRect();
    left = Math.min(left, q.left);
    right = Math.max(right, q.right);
  });
  const cap = document.querySelector('.page-cap'),
    nav = document.querySelector('.brand-banner');
  const topLim = cap ? Math.max(0, cap.getBoundingClientRect().bottom) : 0;
  const botLim = nav
    ? Math.min(window.innerHeight, nav.getBoundingClientRect().top)
    : window.innerHeight;
  const gap = 10;
  body.style.left = Math.round(left) + 'px';
  body.style.width = Math.round(right - left) + 'px';
  if (isDesk()) {
    body.style.top = Math.round(topLim + gap) + 'px';
    body.style.bottom = 'auto';
    body.style.maxHeight = Math.max(160, Math.round(window.innerHeight - topLim - 2 * gap)) + 'px';
    body.dataset.side = 'down';
    return;
  }
  body.style.top = 'auto';
  body.style.bottom = Math.round(window.innerHeight - botLim + gap) + 'px';
  body.style.maxHeight = Math.max(160, Math.round(botLim - topLim - 2 * gap)) + 'px';
  body.dataset.side = 'up';
}

function xtCloseAll() {
  document
    .querySelectorAll('main.xt-tiles > .settings-section > .xt-body:not([hidden])')
    .forEach((b) => foldSet(b, false));
}

function xtSync() {
  const main = document.querySelector('main.xt-tiles');
  if (!main) return;
  const open = Array.from(
    main.querySelectorAll(':scope > .settings-section > .xt-body:not([hidden])'),
  );
  if (open.length > 1) {
    let keep = null;
    for (let i = _folds.length - 1; i >= 0 && !keep; i--)
      if (open.indexOf(_folds[i].body) >= 0) keep = _folds[i].body;
    keep = keep || open[open.length - 1];
    open.forEach((b) => {
      if (b !== keep) foldSet(b, false);
    });
    return;
  }
  let scrim = main.querySelector(':scope > .xt-scrim');
  if (!open.length) {
    if (scrim) scrim.remove();
    return;
  }
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'xt-scrim';
    scrim.addEventListener('click', (e) => {
      e.stopPropagation();
      xtCloseAll();
    });
    // position:fixed -- its place among the reversed tiles does not matter
    main.appendChild(scrim);
  }
  xtPlace(open[0]);
}

window.addEventListener('resize', () => {
  try {
    xtSync();
  } catch (e) {}
});

/* Extras: the folds that hold long reading (format rules, ban lists, About)
   open DOWNWARD and read top to bottom. Once open, the row moves up to sit
   just under the page title, so the text runs down the screen from there.
   1.36: a tile's fold floats instead -- nothing to move; inside a floating
   fold the fold itself scrolls the opened part to its top. */
function dropReveal(row) {
  if (row && row.classList && row.classList.contains('xt-tile')) return;
  const pop = row && row.closest ? row.closest('main.xt-tiles .xt-body') : null;
  if (pop) {
    requestAnimationFrame(() => {
      try {
        pop.scrollTop += row.getBoundingClientRect().top - pop.getBoundingClientRect().top - 6;
      } catch (e) {}
    });
    return;
  }
  requestAnimationFrame(() => {
    try {
      const top = document.elementFromPoint(window.innerWidth / 2, 4);
      const bar =
        top && top.closest
          ? top.closest('header, .topbar, .page-cap, .app-top, [class*="cap"]')
          : null;
      const br = bar ? bar.getBoundingClientRect().bottom : 0;
      const off = (br > 20 && br < 200 ? br : 90) + 8;
      const r = row.getBoundingClientRect();
      pageScroller().scrollBy(0, r.top - off);
    } catch (err) {}
  });
}

const EXTRAS_FMT_ORDER = [
  'commander',
  'paupercommander',
  'duel',
  'predh',
  'standard',
  'pauper',
  'modern',
  'legacy',
  'vintage',
  'premodern',
];

function startupPageOptions() {
  const nl = appLang() === 'nl';
  return [{ k: 'home', l: nl ? 'Startpagina' : 'Home', i: ICONS.home }].concat(
    primaryNavItems().map((item) => ({
      ...item,
      l: nl
        ? {
            decks: 'Decks',
            collection: 'Collectie',
            search: 'Zoeken',
            browse: 'Inspiratie',
            life: 'Leventeller',
          }[item.k]
        : item.l,
    })),
  );
}

function menuToolsHtml(preferences = false) {
  const NL = appLang() === 'nl',
    T = (a, b) => (NL ? a : b);
  const hints = {
    lifeRow: 'Start or resume a game',
    draftRow: 'Seats, timers, pairings and standings',
    crRow: 'Look up rules and ask a question',
    langRow: 'Choose your interface and card language',
    dataSourcesRow: 'Local library, catalogues and refresh controls',
    guildRow: 'Pick your colors',
    fmtRulesRow: 'Read the rules for each format',
    banListsRow: 'Check banned and restricted cards',
    syncRow: 'Keep your devices in sync',
    backupRow: 'Save, restore and recover your decks',
    apkBtn: 'Get the Android app',
  };
  const tile = (id, ico, title, extra) => menuCardHtml(id, ico, title, hints[id], extra);
  const g = GUILDS.find((x) => x.k === state.guild) || GUILDS[0];
  const browser = !(window.matchMedia('(display-mode: standalone)').matches || inAndroidApp());
  if (preferences)
    return /* HTML */ ` <section class="menu-tools hub-actions" aria-label="Preferences">
      <div class="settings-section">
        ${menuCardHtml('startupRow', ICONS.home, T('Opstartpagina', 'Startup page'), startupPageOptions().find((item) => item.k === state.startupPage)?.l || T('Startpagina', 'Home'))}
        <div id="startupBody" class="menu-tool-body" hidden>
          <p class="hint startup-hint">
            ${T('Kies welke pagina opent als je de app start.', 'Choose which page opens when you launch the app.')}
          </p>
          <div
            class="startup-options"
            role="group"
            aria-label="${T('Opstartpagina', 'Startup page')}"
          >
            ${startupPageOptions()
              .map(
                (item) =>
                  `<label class="startup-option"><input type="radio" name="startupPage" value="${item.k}"${state.startupPage === item.k ? ' checked' : ''}><span class="startup-icon" aria-hidden="true">${item.i}</span><span>${item.l}</span></label>`,
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="settings-section">
        ${tile('langRow', ICONS.globe, T('Taal', 'Language'))}
        <div id="languageBody" class="menu-tool-body" hidden>
          <div class="seg seg-inline">
            ${APP_LANGS.map((L) => `<button data-lang-choice="${L.code}" class="${appLang() === L.code ? 'active' : ''}">${L.code.toUpperCase()}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="settings-section">
        ${tile('dataSourcesRow', ICONS.library, T('Gegevensbronnen', 'Data sources'))}
        <div id="dataSourcesBody" class="menu-tool-body" hidden>${dataSourcesHtml()}</div>
      </div>
      <div class="settings-section">
        <div id="guildBody" class="guild-list xt-body" hidden>
          ${GUILDS.map((x) => `<button type="button" class="guild-opt ${x.k === state.guild ? 'sel' : ''}" data-guild="${x.k}"><span class="guild-swatch" style="--gm:${GUILD_SWATCH[x.main][0]};--gs:${GUILD_SWATCH[x.side][1]};"></span>${manaIconSvg(x.main, 16)}${manaIconSvg(x.side, 16)}<span>${x.n}</span></button>`).join('')}
        </div>
        ${tile('guildRow', `<span id="guildCur">${manaIconSvg(g.main, 22)}${manaIconSvg(g.side, 22)}</span>`, T('Kleurenschema', 'Color scheme'))}
      </div>
      <div class="settings-section">
        ${tile('syncRow', SYNC_ICON, 'Sync', `<div class="l2">${syncState() ? T('Gekoppeld', 'Linked') : T('Meerdere apparaten', 'Several devices')}</div>`)}
      </div>
      <div class="settings-section">
        <div id="backupBody" class="acc-up xt-body" hidden style="padding:4px 14px 2px;">
          <div class="l2">
            ${T('Decks, collectie en instellingen in één bestand — bewaar het in je eigen cloud.', 'Decks, collection and settings in one file — keep it in your own cloud.')}
          </div>
          <div class="l2" id="lastBackupLine" style="margin-top:5px;">${backupAgeLabel()}</div>
          <div class="l2" style="margin-top:5px;">
            ${
              state._persisted === true
                ? inlIco('shield', 14) + T('Opslag beschermd', 'Storage protected')
                : state._persisted === false
                  ? inlIco('warn', 14) +
                    T(
                      'Opslag onbeschermd — installeer de app en maak back-ups',
                      'Storage unprotected — install the app and back up',
                    )
                  : T('Opslag controleren…', 'Checking storage…')
            }
          </div>
          <div style="display:flex;gap:8px;margin:10px 0 4px;">
            <button class="ghost-btn" id="backupBtn" style="padding:9px 12px;font-size:13px;">
              ${inlIco('save')}${T('Back-up maken', 'Make a backup')}
            </button>
            <button class="ghost-btn" id="restoreBtn" style="padding:9px 12px;font-size:13px;">
              ${inlIco('restore')}${T('Terugzetten', 'Restore')}
            </button>
          </div>
          <button
            class="ghost-btn"
            id="deletedDecksBtn"
            style="padding:9px 12px;font-size:13px;margin:0 0 6px;"
          >
            ${inlIco('restore')}${T('Verwijderde decks', 'Deleted decks')}
          </button>
          <input
            type="file"
            id="restoreFile"
            accept="application/json,.json,application/octet-stream,text/plain"
            style="display:none;"
          />
        </div>
        ${tile('backupRow', ICONS.shield, T('Back-up', 'Backup'))}
      </div>
    </section>`;
  return /* HTML */ ` <section class="menu-tools hub-actions" aria-label="Tools">
    <div class="settings-section">${tile('draftRow', ICONS.draft, 'Draft tools')}</div>
    <div class="settings-section">
      ${tile('crRow', ICONS.gavel, T('Vraag de AI-judge', 'Ask AI judge'))}
    </div>
    <div class="settings-section">
      ${tile('fmtRulesRow', ICONS.library, T('Format&shy;regels', 'Format rules'))}
    </div>
    <div class="settings-section">
      ${tile('banListsRow', ICONS.ban, T('Banlijsten', 'Ban lists'))}
    </div>
    ${browser && !window.DECKHAND_CONFIG?.selfHosted && /Android/i.test(navigator.userAgent) ? `<div class="settings-section" id="apkRow">${tile('apkBtn', ICONS.phone, T('Android-app', 'Android app'), '<div class="l2" id="apkNote"></div>')}</div>` : ''}
    <div class="settings-section" id="appFootCell">
      <p class="hint" id="appFootNote" style="text-align:center;line-height:1.45;font-size:11px;">
        Deckhand v${APP_VERSION} · ${T('kaarten', 'cards')}
        <a href="https://scryfall.com" target="_blank" rel="noopener" style="color:var(--head-ink);"
          >Scryfall</a
        >
        · ${T('thema’s', 'themes')}
        <a href="https://edhrec.com" target="_blank" rel="noopener" style="color:var(--head-ink);"
          >EDHREC</a
        >
        · ${T('prijzen', 'prices')} Cardmarket<br />Unofficial Fan Content under the Fan Content
        Policy. Not approved/endorsed by Wizards. © Wizards of the Coast LLC.
      </p>
    </div>
  </section>`;
}

function commanderQuickRulesHtml() {
  return /* HTML */ `<div class="rules-text">
    <ul>
      <li><strong>A four-player format</strong> — free-for-all multiplayer is the default.</li>
      <li>
        <strong>Your Commander</strong> — a legendary creature. Every card in your deck must fit
        within its color identity.
      </li>
      <li>
        <strong>Exactly 100 cards</strong> including the Commander, singleton — except basic lands,
        which are unlimited.
      </li>
      <li>
        <strong>The Commander starts in the command zone</strong> — cast it from there for {2} more
        per previous cast, and it may return there instead of other zones.
      </li>
      <li>
        <strong>Start at 40 life.</strong> Free first mulligan is customary. 21 combat damage from
        one Commander defeats a player.
      </li>
      <li>
        <strong>Legality:</strong> Commander has a wide card pool — almost every standard
        black-bordered card is legal (joke sets like Unhinged aren't), minus the official Commander
        banned list (see the Banned tab — always current).
      </li>
    </ul>
  </div>`;
}

function commanderFullRulesHtml() {
  if (appLang() === 'nl')
    return /* HTML */ `<div class="rules-text">
      <p>
        <strong>Commander</strong> is een multiplayer-format voor vier spelers: free-for-all-potjes
        rond een legendary leider.
      </p>
      <p>
        <strong>Je Commander.</strong> Een legendary creature. Hij begint het spel in de command
        zone en je mag hem daarvandaan casten — voor {2} extra per keer dat je hem dit potje al
        vanuit de command zone hebt gecast. Als je Commander het battlefield zou verlaten of van
        zone zou wisselen, mag je hem in plaats daarvan terugzetten in de command zone.
      </p>
      <p>
        <strong>Deckbouw.</strong> Precies 100 kaarten, je Commander meegeteld. Behalve basic lands
        mogen geen twee kaarten dezelfde naam hebben. De color identity van elke kaart — de
        manasymbolen in de kosten en de regeltekst — moet binnen de color identity van je Commander
        vallen.
      </p>
      <p>
        <strong>Legaliteit.</strong> Commander heeft een heel brede kaartpool — bijna elke gewone
        kaart met zwarte rand die ooit op papier verscheen, is legaal. Grapkaarten met zilveren rand
        (Un-sets zoals Unhinged) en playtestkaarten niet, en de kaarten op de officiële
        Commander-banlijst ook niet — zie Banlijsten, live opgehaald en altijd actueel.
      </p>
      <p>
        <strong>Spelen.</strong> Spelers beginnen met 40 life. De gebruikelijke gratis eerste
        mulligan geldt. Alle normale manieren om te winnen en te verliezen gelden — en daarnaast
        verliest een speler die in de loop van het potje 21 of meer combat damage van dezelfde
        Commander heeft gekregen.
      </p>
      <p>
        <strong>De geest van het format.</strong> Commander is een sociaal format: bespreek vóór het
        potje het power level met je tafel en mik op potjes waar iedereen plezier aan heeft.
      </p>
    </div>`;
  return /* HTML */ `<div class="rules-text">
    <p>
      <strong>Commander</strong> is a four-player multiplayer format: free-for-all games built
      around a legendary leader.
    </p>
    <p>
      <strong>Your Commander.</strong> A legendary creature. It begins the game in the command zone,
      and you may cast it from there — paying {2} more for each time it was previously cast from the
      command zone this game. If your Commander would leave the battlefield or change zones, you may
      return it to the command zone instead.
    </p>
    <p>
      <strong>Deckbuilding.</strong> Exactly 100 cards including your Commander. Apart from basic
      lands, no two cards may share a name. Every card's color identity — mana symbols in its cost
      and rules text — must fall within your Commander's color identity.
    </p>
    <p>
      <strong>Legality.</strong> Commander has a very wide card pool — almost every standard
      black-bordered card ever printed in paper is legal. Silver-bordered joke cards (Un-sets such
      as Unhinged) and playtest cards are not, and neither are the cards on the official Commander
      banned list — see the Banned List tab, which is fetched live and always current.
    </p>
    <p>
      <strong>Playing.</strong> Players begin at 40 life. The customary free first mulligan applies.
      All normal ways to win and lose apply — and in addition, a player who has been dealt 21 or
      more combat damage by the same Commander over the course of the game loses.
    </p>
    <p>
      <strong>The spirit of the format.</strong> Commander is a social format: talk with your table
      about power level before the game, and aim for games everyone enjoys.
    </p>
  </div>`;
}

function rulesTextHtml() {
  return commanderFullRulesHtml();
}
