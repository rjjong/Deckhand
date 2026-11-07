// App updates replace shell caches, never localStorage or IndexedDB.
let pwaUpdateBuild = null;
let pwaReloading = false;
let pwaResumeUntil = Date.now() + 15000;
let pwaLastCheck = 0;
let pwaUpdateCheck = null;

function pwaUpdateIsSafe() {
  return !(
    state.modal ||
    state.lifeOpen ||
    state.overlayStack.length ||
    state.dlPanel ||
    state.screen === 'draft' ||
    state.decksIndex.some((deck) => deck._saveStatus === 'saving') ||
    document.activeElement?.matches('input, textarea, [contenteditable="true"]') ||
    document.querySelector('[role="dialog"], [aria-busy="true"]')
  );
}

function showPwaUpdate() {
  let button = document.getElementById('pwaUpdate');
  if (!button) {
    button = document.createElement('button');
    button.id = 'pwaUpdate';
    button.type = 'button';
    button.className = 'pwa-update';
    button.textContent = '↻ Update ready — reload';
    button.addEventListener('click', () => applyPwaUpdate(true));
    document.body.appendChild(button);
  }
  button.disabled = navigator.onLine === false;
}

function applyPwaUpdate(manual = false) {
  if (
    !pwaUpdateBuild ||
    pwaReloading ||
    document.visibilityState !== 'visible' ||
    navigator.onLine === false
  )
    return;
  if (!pwaUpdateIsSafe()) {
    if (manual) toast('Finish editing or close the current screen to update.');
    return;
  }
  if (!manual && Date.now() > pwaResumeUntil) return;
  // A bad proxy response must not trap a device in repeated reloads.
  try {
    const previous = JSON.parse(sessionStorage.getItem('deckhand:pwaReload') || 'null');
    if (!manual && previous?.build === pwaUpdateBuild && Date.now() - previous.at < 60000) return;
    sessionStorage.setItem(
      'deckhand:pwaReload',
      JSON.stringify({ build: pwaUpdateBuild, at: Date.now() }),
    );
  } catch (e) {}
  pwaReloading = true;
  location.reload();
}

async function inspectPwaBuild() {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return;
  const build = await new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 3000);
    channel.port1.onmessage = (event) => finish(event.data?.build);
    try {
      worker.postMessage({ type: 'GET_BUILD' }, [channel.port2]);
    } catch (e) {
      finish(null);
    }
  });
  if (!build || worker !== navigator.serviceWorker.controller) return;
  const htmlBuild = document.querySelector('meta[name="deckhand-build"]')?.content;
  if (build === DECKHAND_BUILD && build === htmlBuild) {
    pwaUpdateBuild = null;
    document.getElementById('pwaUpdate')?.remove();
    try {
      sessionStorage.removeItem('deckhand:pwaReload');
    } catch (e) {}
    return;
  }
  pwaUpdateBuild = build;
  showPwaUpdate();
  applyPwaUpdate();
}

async function updateServiceWorker(reg) {
  if (navigator.onLine === false) return false;
  try {
    await reg.update();
    await inspectPwaBuild();
    return true;
  } catch (e) {
    sfJournal('SW update deferred: ' + String(e.message || e).slice(0, 100));
    return false;
  }
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.addEventListener('controllerchange', inspectPwaBuild);
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      const promote = (worker) => worker?.postMessage({ type: 'SKIP_WAITING' });
      if (reg.waiting) promote(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') promote(worker);
        });
      });
      const check = (force = false) => {
        if (document.visibilityState !== 'visible') return;
        if (pwaUpdateCheck) return pwaUpdateCheck;
        if (!force && Date.now() - pwaLastCheck < 60000) return inspectPwaBuild();
        pwaLastCheck = Date.now();
        pwaUpdateCheck = updateServiceWorker(reg).finally(() => {
          pwaUpdateCheck = null;
        });
        return pwaUpdateCheck;
      };
      const resume = () => {
        pwaResumeUntil = Date.now() + 15000;
        check(true);
      };
      // Do not interrupt someone who has started using the page. An update
      // found during that session stays available until they return or reload.
      for (const type of ['pointerdown', 'keydown', 'input'])
        document.addEventListener(
          type,
          () => {
            pwaResumeUntil = 0;
          },
          { passive: true },
        );
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resume();
        else pwaResumeUntil = 0;
      });
      window.addEventListener('focus', resume);
      window.addEventListener('online', () => {
        if (pwaUpdateBuild) showPwaUpdate();
        check(true);
      });
      window.addEventListener('offline', () => {
        if (pwaUpdateBuild) showPwaUpdate();
      });
      setInterval(check, 5 * 60 * 1000);
      await inspectPwaBuild();
      check();
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  });
}
