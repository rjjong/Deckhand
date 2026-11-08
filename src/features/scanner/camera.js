// SPDX-License-Identifier: AGPL-3.0-or-later
// One inference at a time; the preview stays live while detections fill the log.
function openScannerCamera({ mode = 'collection', binder = null, onReview, onClose, onAdd }) {
  if (document.getElementById('cardScannerCamera')) return;
  const settings = normalizeScannerSettings(state);
  const deckMode = mode === 'deck';
  // A deck can contain several physical copies, even when collection scanning
  // is configured to ignore names seen earlier in the session.
  if (deckMode) {
    settings.scannerIgnoreSession = false;
    settings.scannerDebounceMs = 0;
  }
  const el = document.createElement('div');
  el.id = 'cardScannerCamera';
  el.className = 'overlay scanner-camera-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', deckMode ? 'Scan deck camera' : 'Scan card camera');
  el.dataset.mode = mode;
  el.innerHTML = `${appTitlebarHtml(
    'scanner-camera-header',
    `
    <button type="button" class="header-filter" id="scannerCameraBack" aria-label="Close scanner">${ICONS.back}</button>
    <span class="brand-txt">${deckMode ? 'Scan deck' : 'Scan cards'}</span><span class="scanner-badge">Experimental</span>`,
  )}
    <div class="scanner-camera-scroll">
    <main class="scanner-camera-stage"><video id="scannerVideo" muted playsinline autoplay></video>
      <button type="button" id="scannerFocus" class="scanner-camera-focus" aria-label="Refocus camera" hidden></button>
      <svg id="scannerDetectedBorder" class="scanner-camera-border" preserveAspectRatio="none" aria-hidden="true" hidden><polygon /></svg>
      <div class="scanner-framerate"${settings.scannerShowFramerate ? '' : ' hidden'}><output id="scannerFramerate" aria-label="Scan framerate" aria-live="off">— FPS</output><small id="scannerCameraResolution" aria-label="Camera resolution"></small></div>
      <p id="scannerIgnored" class="scanner-ignored" role="status" hidden></p>
    </main>
    <div class="scanner-camera-statusbar">
      <p id="scannerCameraStatus" role="status">Opening camera…</p>
      <button type="button" id="scannerCameraRetry" class="scanner-secondary" hidden>Retry camera</button>
      <button type="button" id="scannerClearSelection" class="scanner-selection-count" aria-label="Clear selection" hidden><span></span>${ICONS.close}</button>
      <div class="scanner-log-actions">
        <button type="button" id="scannerSelectAll" aria-label="Select all scans" title="Select all scans" disabled>${ICONS.selectAll}</button>
        <button type="button" id="scannerDeleteSelected" class="scanner-log-delete" aria-label="Delete selected scans" title="Delete selected scans from the log" disabled>${ICONS.trash}</button>
        <button type="button" id="scannerAddAll" class="scanner-log-add" aria-label="Add selected cards to collection" title="Add selected scans: one Near Mint, nonfoil copy each" disabled>${ICONS.plus}</button>
      </div>
    </div>
    <section class="scanner-log-section" aria-labelledby="scannerLogTitle">
      <header class="scanner-log-header"><h2 id="scannerLogTitle">Detected cards</h2><span id="scannerLogCount">0 cards</span></header>
      <div class="scanner-log-scroll"><p id="scannerLogEmpty">Detected cards appear here, newest first.</p>
        <ol id="scannerDetections" role="log" aria-label="Detected cards, newest first" aria-live="polite" aria-relevant="additions text"></ol>
      </div>
    </section></div>`;
  document.body.appendChild(el);
  const controller = new AbortController();
  const video = el.querySelector('#scannerVideo');
  const stage = el.querySelector('.scanner-camera-stage');
  const focus = el.querySelector('#scannerFocus');
  const resolution = el.querySelector('#scannerCameraResolution');
  const border = scannerCreateBorder(
    stage,
    video,
    el.querySelector('#scannerDetectedBorder'),
    settings.scannerCornerThreshold,
  );
  const notice = el.querySelector('#scannerIgnored');
  const retry = el.querySelector('#scannerCameraRetry');
  const addAll = el.querySelector('#scannerAddAll');
  const selectAll = el.querySelector('#scannerSelectAll');
  if (deckMode) addAll.title = 'Add selected scans to an existing or new deck';
  const deleteSelected = el.querySelector('#scannerDeleteSelected');
  const clearSelection = el.querySelector('#scannerClearSelection');
  const tracker = scannerCreateTracker({
    idThreshold: settings.scannerIdThreshold,
    cornerThreshold: settings.scannerCornerThreshold,
  });
  const framerate = scannerCreateFramerate();
  const fps = el.querySelector('#scannerFramerate');
  const log = scannerCreateLog(el, {
    mode,
    signal: controller.signal,
    binder,
    onReview: (result, card, trigger, options) => {
      tracker.pause();
      framerate.reset();
      fps.textContent = '— FPS';
      border.clear();
      clearIgnored();
      onReview(result, card, trigger, {
        ...options,
        mode,
        binder,
        onAdd: (batch, more) => onAdd?.(batch, { ...more, signal: controller.signal }),
        onClose() {
          options.onClose();
          if (cameraVisible && !paused && !cameraError) startCamera();
          schedule(0);
        },
      });
    },
    onIgnored: notifyIgnored,
    onChange: updateActions,
    settings,
  });
  let active = true,
    stream,
    engine,
    cameraControls,
    captureCanvas,
    timer,
    frameController,
    cameraPending = false,
    cameraVisible = true,
    enginePending = false,
    cameraReady = false,
    busy = false,
    paused = false,
    cameraError = '',
    engineError = '',
    progress = '',
    cameraRequest = 0,
    noticeTimer,
    lastNotice = null,
    noticeHeldKey = null;
  const isTop = () => state.overlayStack[state.overlayStack.length - 1]?.id === 'scanner';
  const canScan = () =>
    active &&
    cameraVisible &&
    cameraReady &&
    engine &&
    !engine.disposed &&
    !paused &&
    !cameraError &&
    !engineError &&
    !document.hidden &&
    isTop();
  function updateActions({ total, selected, addable }) {
    selectAll.disabled = total === 0 || selected === total;
    deleteSelected.disabled = selected === 0;
    addAll.disabled = selected === 0 || addable === 0;
    addAll.setAttribute(
      'aria-label',
      `Add ${addable} selected ${addable === 1 ? 'card' : 'cards'} to ${deckMode ? 'a deck' : 'collection'}`,
    );
    clearSelection.hidden = selected === 0;
    clearSelection.querySelector('span').textContent = `${selected} selected`;
  }
  function clearIgnored() {
    clearTimeout(noticeTimer);
    notice.hidden = true;
    lastNotice = null;
  }
  function notifyIgnored({ name, reason }) {
    if (!active || !isTop() || scannerIsIgnoredCard({ name })) return;
    const key = name.toLowerCase() + ':' + reason;
    if (lastNotice === key) return;
    lastNotice = key;
    notice.textContent =
      reason === 'session'
        ? `${name} ignored · Already scanned this session`
        : `${name} ignored · Within repeat delay`;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 2500);
  }
  const update = () => {
    if (!active) return;
    el.dataset.scanning = String(!!canScan());
    if (!canScan()) {
      framerate.reset();
      fps.textContent = '— FPS';
      border.clear();
      clearIgnored();
    }
    retry.hidden = !(cameraError || engineError || paused);
    retry.disabled = cameraPending || enginePending;
    retry.textContent = paused ? 'Resume camera' : 'Try again';
    const message =
      cameraError ||
      engineError ||
      (!cameraVisible
        ? ''
        : paused
          ? 'Camera paused.'
          : !cameraReady
            ? 'Opening camera…'
            : !engine
              ? progress || 'Preparing recognition…'
              : '');
    const status = el.querySelector('#scannerCameraStatus');
    status.hidden = !message;
    if (status.textContent !== message) status.textContent = message;
  };
  function schedule(delay = 300) {
    clearTimeout(timer);
    if (active && !paused) timer = setTimeout(scanFrame, delay);
  }
  async function scanFrame() {
    if (!active || paused) return;
    if (busy || !canScan()) {
      if (!isTop()) tracker.pause();
      update();
      schedule();
      return;
    }
    busy = true;
    const started = performance.now();
    const request = cameraRequest;
    frameController = new AbortController();
    try {
      captureCanvas = scannerImageCanvas(video, stage, captureCanvas);
      const result = await engine.recognize(captureCanvas, {
        signal: frameController.signal,
        thumbnail: tracker.needsThumbnail,
        cornerThreshold: settings.scannerCornerThreshold,
      });
      if (!active || paused || request !== cameraRequest || !isTop()) return;
      if (scannerIsIgnoredCard(result)) clearIgnored();
      border.update(result);
      if (settings.scannerShowFramerate) {
        const rate = framerate.record(performance.now());
        fps.textContent = rate === null ? '— FPS' : `${rate.toFixed(1)} FPS`;
      }
      const detection = tracker.observe(result);
      if (noticeHeldKey !== tracker.heldKey) {
        clearIgnored();
        noticeHeldKey = tracker.heldKey;
      }
      if (detection) log.append(detection);
      else if (
        tracker.heldKey &&
        tracker.heldKey === (result.secondaryId || result.cardId) &&
        !scannerRecognitionError(result, {
          idThreshold: settings.scannerIdThreshold,
          cornerThreshold: settings.scannerCornerThreshold,
        })
      ) {
        const ignored = log.ignored(result);
        if (ignored) notifyIgnored(ignored);
      }
    } catch (error) {
      if (!active || paused || request !== cameraRequest || error.name === 'AbortError') return;
      if (engine?.disposed) {
        engine = null;
        engineError = error.message;
      } else cameraError = error.message || 'Scanning stopped. Try again.';
    } finally {
      busy = false;
      frameController = null;
      update();
      // Respect the chosen interval without queuing overlapping inference.
      schedule(Math.max(0, settings.scannerIntervalMs - (performance.now() - started)));
    }
  }
  const stopCamera = () => {
    cameraRequest++;
    cameraControls?.stop();
    cameraControls = null;
    focus.hidden = true;
    resolution.textContent = '';
    clearTimeout(timer);
    frameController?.abort();
    tracker.pause();
    border.clear();
    clearIgnored();
    noticeHeldKey = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    cameraReady = false;
    video.srcObject = null;
    video.load();
    if (captureCanvas) captureCanvas.width = captureCanvas.height = 0;
    captureCanvas = null;
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    border.dispose();
    const animate = el.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    stopCamera();
    controller.abort();
    Promise.resolve(engine?.clearFrames?.()).catch(() => {});
    engine = null; // The shared recognition worker remains warm.
    el.dataset.scanning = 'false';
    el.inert = true;
    let finished = false,
      fallback;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      el.removeEventListener('animationend', ended);
      el.remove();
      onClose?.();
    };
    const ended = (event) => {
      if (event.target === el && event.animationName === 'scanner-camera-exit') finish();
    };
    if (!animate) {
      finish();
      return;
    }
    // A quick back press during entry continues from its current position.
    el.style.setProperty('--scanner-exit-start', getComputedStyle(el).transform);
    el.addEventListener('animationend', ended);
    el.classList.add('leaving');
    fallback = setTimeout(finish, 350);
  };
  pushOverlay('scanner', cleanup);
  wireAppDialogKeys(el, closeTopOverlay);
  el.querySelector('#scannerCameraBack').onclick = closeTopOverlay;
  addAll.onclick = () => {
    if (deckMode) {
      onAdd?.(log.prepareAdd(), { signal: controller.signal, returnFocus: addAll });
      return;
    }
    const added = log.addToCollection();
    if (added) toast(`${added} ${added === 1 ? 'card' : 'cards'} added to your collection.`);
  };
  deleteSelected.onclick = () => {
    const removed = log.deleteSelected();
    if (removed) toast(`${removed} ${removed === 1 ? 'card' : 'cards'} removed from the scan log.`);
  };
  clearSelection.onclick = () => log.clearSelection();
  selectAll.onclick = () => log.selectAll();
  log.refresh();
  scannerCreateViewport(
    el.querySelector('.scanner-camera-scroll'),
    stage,
    el.querySelector('.scanner-camera-statusbar'),
    {
      signal: controller.signal,
      onVisible(visible) {
        cameraVisible = visible;
        el.dataset.cameraVisible = String(visible);
        if (!visible) stopCamera();
        else if (active && !paused && !document.hidden && !cameraError) startCamera();
        update();
      },
    },
  );
  const updateResolution = () => {
    if (active && cameraReady && settings.scannerShowFramerate)
      resolution.textContent =
        video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : '';
  };
  video.addEventListener('resize', updateResolution, { signal: controller.signal });
  focus.onclick = (event) => {
    if (!active || !cameraReady || paused || !isTop()) return;
    cameraControls?.focus(scannerFocusPoint(video, stage, event));
  };
  async function startCamera() {
    if (cameraPending || cameraReady || !active || !cameraVisible || !isTop()) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cameraError = 'Open Deckhand over HTTPS to use the camera.';
      update();
      return;
    }
    cameraPending = true;
    cameraError = '';
    paused = false;
    const request = ++cameraRequest;
    update();
    try {
      const next = await navigator.mediaDevices.getUserMedia(
        scannerCameraConstraints({ portrait: window.innerHeight > window.innerWidth }),
      );
      if (!active || request !== cameraRequest || document.hidden || !cameraVisible) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = next;
      video.srcObject = next;
      await video.play();
      if (active && request === cameraRequest) {
        cameraReady = true;
        cameraControls = scannerConfigureCamera(next.getVideoTracks?.()[0], {
          isCurrent: () => active && request === cameraRequest && !document.hidden,
          onChange: updateResolution,
          pointsOfInterest: !!navigator.mediaDevices.getSupportedConstraints?.().pointsOfInterest,
        });
        focus.hidden = !cameraControls.canFocus;
        updateResolution();
        startEngine();
        schedule(0);
      }
    } catch (error) {
      if (active && request === cameraRequest) {
        stopCamera();
        cameraError =
          error.name === 'NotAllowedError'
            ? 'Camera permission was declined. Allow camera access in your browser settings.'
            : 'The camera could not start. Check that it is available, then try again.';
      }
    } finally {
      cameraPending = false;
      update();
      if (
        active &&
        request !== cameraRequest &&
        cameraVisible &&
        !paused &&
        !document.hidden &&
        !cameraError
      )
        startCamera();
    }
  }
  async function startEngine() {
    if ((engine && !engine.disposed) || enginePending || !active) return;
    enginePending = true;
    engineError = '';
    try {
      const next = await scannerGetEngine({
        signal: controller.signal,
        onProgress: (data) => {
          progress = scannerLoadMessage(data);
          update();
        },
      });
      if (!active) return;
      engine = next;
      schedule(0);
    } catch (error) {
      if (active) engineError = error.message;
    } finally {
      enginePending = false;
      update();
    }
  }
  retry.onclick = () => {
    cameraError = '';
    engineError = '';
    paused = false;
    startCamera();
    if (cameraReady) {
      startEngine();
      schedule(0);
    }
    update();
  };
  const pause = () => {
    if (!active) return;
    stopCamera();
    paused = true;
    update();
  };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) pause();
    },
    { signal: controller.signal },
  );
  window.addEventListener('pagehide', pause, { signal: controller.signal });
  el.querySelector('#scannerCameraBack').focus({ preventScroll: true });
  startCamera();
  return { close: cleanup };
}
