// SPDX-License-Identifier: AGPL-3.0-or-later
// One corner pass and one identification at a time; neither builds a frame backlog.
function openScannerCamera({ mode = 'collection', binder = null, onReview, onClose, onAdd }) {
  if (document.getElementById('cardScannerCamera')) return;
  const settings = normalizeScannerSettings(state);
  const deckMode = mode === 'deck';
  // A deck can contain several physical copies, even when collection scanning
  // is configured to ignore printings seen earlier in the session.
  if (deckMode) {
    settings.scannerIgnoreSession = false;
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
      <div class="scanner-framerate"${settings.scannerShowFramerate ? '' : ' hidden'}><output id="scannerFramerate" aria-label="Scan framerate" aria-live="off">— FPS</output><small id="scannerCornerRate"></small><small id="scannerCameraResolution" aria-label="Camera resolution"></small><small id="scannerBackend"></small><small id="scannerProcessing"></small><small id="scannerTimings"></small><small id="scannerCameraVibrationStatus" role="status"></small></div>
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
  const cornerFramerate = scannerCreateFramerate();
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
    onAccepted() {
      const result = scannerScanFeedback();
      if (settings.scannerShowFramerate)
        el.querySelector('#scannerCameraVibrationStatus').textContent = scannerVibrationMessage(
          result,
          true,
        );
    },
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
    cornerController,
    recognitionCanvas,
    recognitionBusy = false,
    lastRecognitionAt = -Infinity,
    previewSuppressed = false,
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
  function notifyIgnored({ name, printingId, printing, reason }) {
    if (!active || !isTop() || scannerIsIgnoredCard({ name })) return;
    const key = (printingId || name.toLowerCase()) + ':' + reason;
    if (lastNotice === key) return;
    lastNotice = key;
    notice.textContent = `${name}${printing ? ` (${printing})` : ''} ignored · Already scanned this printing`;
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
      cornerFramerate.reset();
      el.querySelector('#scannerCornerRate').textContent = '';
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
  async function recognizeFrame(canvas, priorDetection, started, request) {
    recognitionBusy = true;
    lastRecognitionAt = performance.now();
    const job = new AbortController();
    frameController = job;
    try {
      const result = await engine.recognize(canvas, {
        signal: job.signal,
        thumbnail: tracker.needsThumbnail,
        cornerThreshold: settings.scannerCornerThreshold,
        idThreshold: settings.scannerIdThreshold,
        detection: priorDetection,
      });
      if (!active || paused || request !== cameraRequest || !isTop()) return;
      if (scannerIsIgnoredCard(result)) clearIgnored();
      previewSuppressed =
        scannerIsIgnoredCard(result) ||
        !result.cardPresent ||
        !result.cornersValid ||
        result.confidence < settings.scannerCornerThreshold;
      if (!engine.canPreviewCorners) border.update(result);
      else if (previewSuppressed) border.clear();
      if (settings.scannerShowFramerate) {
        const rate = framerate.record(performance.now());
        fps.textContent = rate === null ? '— FPS' : `${rate.toFixed(1)} FPS`;
        const info = result.diagnostics || engine.diagnostics;
        const timing = result.timing || {};
        const ms = (key) => Math.round(timing[key] || 0);
        el.querySelector('#scannerBackend').textContent = info?.inferenceMode
          ? `${info.inferenceMode} · ${info.numThreads || 1} CPU thread${info.numThreads > 1 ? 's' : ''}`
          : '';
        el.querySelector('#scannerProcessing').textContent = result.timing
          ? `Frame ${Math.round(performance.now() - started)} ms · ${timing.orientationPasses || 0} orientation${timing.orientationPasses === 1 ? '' : 's'}`
          : '';
        el.querySelector('#scannerTimings').textContent = result.timing
          ? `Detect ${ms('detectMs')} · Warp ${ms('dewarpMs')}\nModel ${ms('embedMs')} · Lookup ${ms('searchMs')} ms`
          : '';
      }
      const detection = tracker.observe(result);
      if (noticeHeldKey !== tracker.heldKey) {
        clearIgnored();
        noticeHeldKey = tracker.heldKey;
      }
      if (detection) log.append(detection);
      else if (
        tracker.heldKey &&
        tracker.heldKey === scannerPrintingIdentity(result) &&
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
      if (frameController === job) {
        recognitionBusy = false;
        frameController = null;
      }
      update();
      if (
        canScan() &&
        engine.canPreviewCorners &&
        !busy &&
        performance.now() - lastRecognitionAt >= settings.scannerIntervalMs
      )
        schedule(0);
    }
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
    const started = performance.now(),
      request = cameraRequest;
    try {
      captureCanvas = scannerImageCanvas(video, stage, captureCanvas);
      if (engine.canPreviewCorners) {
        cornerController = new AbortController();
        const outline = await engine.detect(captureCanvas, {
          signal: cornerController.signal,
          cornerThreshold: settings.scannerCornerThreshold,
        });
        if (!canScan() || request !== cameraRequest) return;
        if (outline) {
          el.dataset.cornerFrames = String(Number(el.dataset.cornerFrames || 0) + 1);
          if (!outline.cardPresent) {
            previewSuppressed = false;
            tracker.observe(outline);
          }
          if (previewSuppressed) border.clear();
          else border.update(outline);
          if (settings.scannerShowFramerate) {
            const rate = cornerFramerate.record(performance.now());
            el.querySelector('#scannerCornerRate').textContent =
              `Corners ${rate === null ? '—' : rate.toFixed(1)} FPS · ${Math.round(outline.timing?.detectMs || 0)} ms`;
          }
          if (
            !outline.cardPresent ||
            !outline.cornersValid ||
            recognitionBusy ||
            performance.now() - lastRecognitionAt < settings.scannerIntervalMs
          )
            return;
          // Preserve the exact frame that produced these corners. The preview
          // can capture its next frame while identification uses this copy.
          recognitionCanvas ||= document.createElement('canvas');
          if (recognitionCanvas.width !== captureCanvas.width)
            recognitionCanvas.width = captureCanvas.width;
          if (recognitionCanvas.height !== captureCanvas.height)
            recognitionCanvas.height = captureCanvas.height;
          recognitionCanvas.getContext('2d').drawImage(captureCanvas, 0, 0);
          recognitionCanvas.scannerSource = captureCanvas.scannerSource;
          void recognizeFrame(recognitionCanvas, outline, started, request);
          return;
        }
      }
      if (!recognitionBusy) await recognizeFrame(captureCanvas, null, started, request);
    } catch (error) {
      if (canScan() && request === cameraRequest && error.name !== 'AbortError')
        cameraError = error.message || 'Scanning stopped. Try again.';
    } finally {
      busy = false;
      cornerController = null;
      update();
      const interval = engine?.canPreviewCorners ? 120 : settings.scannerIntervalMs;
      schedule(Math.max(0, interval - (performance.now() - started)));
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
    cornerController?.abort();
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
    if (recognitionCanvas) recognitionCanvas.width = recognitionCanvas.height = 0;
    recognitionCanvas = null;
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
