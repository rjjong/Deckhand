// Experimental batch scanner. Photos and OCR stay on the user's device.
const SCANNER_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M3 12h18"/><rect x="8" y="6" width="8" height="12" rx="1"/></svg>';

function openCardScanner() {
  if (document.getElementById('cardScannerOverlay')) return;
  const el = document.createElement('div');
  el.id = 'cardScannerOverlay';
  el.className = 'overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Scan cards');
  el.innerHTML = `<div class="overlay-inner scanner-screen">
    ${overlayCapHtml('Scan cards', `<button type="button" class="header-filter" id="scannerClose" aria-label="Close scanner">${ICONS.close}</button>`)}
    <main class="scanner-body">
      <section class="scanner-intro"><span class="scanner-badge">Experimental</span>
        <h1>Scan a few cards at once.</h1>
        <p>Place up to eight separated English cards on a plain, contrasting surface. Keep every edge visible and avoid glare.</p>
        <p>Review every match. Set, printing, language and foil are not identified.</p>
      </section>
      <div class="scanner-actions">
        <button type="button" class="hub-card" id="scannerCamera">${SCANNER_ICON}<span>Open camera</span></button>
        <button type="button" class="hub-card" id="scannerPhoto">${inlIco('file')}<span>Choose photos</span></button>
        <input id="scannerFile" type="file" accept="image/*" multiple hidden>
      </div>
      <div class="scanner-preview" hidden><video id="scannerVideo" muted playsinline autoplay hidden></video><canvas id="scannerCanvas" hidden></canvas></div>
      <button type="button" class="primary-btn" id="scannerCapture" hidden>Scan this frame</button>
      <p id="scannerStatus" role="status">Photos are processed on your device. Camera access requires HTTPS or localhost.</p>
      <div id="scannerResults" class="scanner-results"></div>
      <p class="scanner-credits">Recognition uses <a href="https://opencv.org/" target="_blank" rel="noopener">OpenCV</a> and <a href="https://tesseract.projectnaptha.com/" target="_blank" rel="noopener">Tesseract.js</a>.</p>
    </main>
    <footer class="scanner-footer"><button type="button" class="primary-btn" id="scannerAdd" disabled>Add selected to collection</button></footer>
  </div>`;
  document.body.appendChild(el);
  let active = true,
    busy = false,
    stream,
    worker,
    index,
    rows = [];
  const listeners = new AbortController();
  const status = (text) => {
    if (active) el.querySelector('#scannerStatus').textContent = text;
  };
  const stopCamera = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    el.querySelector('#scannerVideo').srcObject = null;
    el.querySelector('#scannerCapture').hidden = true;
  };
  const cleanup = () => {
    active = false;
    stopCamera();
    worker?.terminate().catch(() => {});
    listeners.abort();
    closeNselMenu();
    el.remove();
  };
  pushOverlay('scanner', cleanup);
  wireAppDialogKeys(el, closeTopOverlay);
  el.querySelector('#scannerClose').onclick = closeTopOverlay;
  const updateAdd = () => {
    const count = rows.filter((row) => row.selected).length;
    el.querySelector('#scannerAdd').disabled = busy || !count;
    el.querySelector('#scannerAdd').textContent = count
      ? `Add ${count} selected to collection`
      : 'Add selected to collection';
  };
  const setBusy = (value) => {
    busy = value;
    el.setAttribute('aria-busy', String(value));
    for (const id of ['scannerCamera', 'scannerPhoto', 'scannerCapture', 'scannerFile'])
      el.querySelector('#' + id).disabled = value;
    el.querySelectorAll(
      '.scanner-result input, .scanner-result select, .scanner-result .nsel-btn',
    ).forEach((input) => {
      input.disabled = value;
    });
    updateAdd();
  };
  const showRows = () => {
    if (!active) return;
    el.querySelector('#scannerResults').innerHTML = rows
      .map(
        (row, i) => `<section class="scanner-result">
      <img src="${row.thumb}" alt="Scanned card ${i + 1}">
      <div><label for="scannerQuery${i}">Card ${i + 1}</label>
        <input id="scannerQuery${i}" data-scan-query="${i}" value="${escapeHtml(row.selected?.n || row.selected?.name || row.text.trim().split('\n')[0] || '')}" placeholder="Correct the card name" autocomplete="off" ${busy ? 'disabled' : ''}>
        <label class="scanner-match-label" for="scannerMatch${i}">Choose a match</label>
        <select id="scannerMatch${i}" data-scan-match="${i}" ${busy ? 'disabled' : ''}>${matchOptions(row)}</select>
        <small>${row.selected ? 'Check the name before adding.' : 'No certain match. Correct the name and choose a card.'}</small>
      </div></section>`,
      )
      .join('');
    enhanceSelects(el);
    el.querySelectorAll('.scanner-result .nsel-btn').forEach((button) => {
      button.disabled = busy;
      button.addEventListener('click', () => {
        const menu = document.getElementById('nselPop');
        if (!menu) return;
        const bounds = button.getBoundingClientRect();
        const width = Math.min(innerWidth - 32, Math.max(bounds.width, 200));
        menu.style.width = width + 'px';
        menu.style.left = Math.max(16, Math.min(bounds.left, innerWidth - width - 16)) + 'px';
        const below = innerHeight - bounds.bottom - 16;
        const above = bounds.top - 80;
        menu.classList.add('scanner-options');
        menu.style.setProperty('bottom', 'auto', 'important');
        if (below < Math.min(menu.scrollHeight, 280) && above > below) {
          const height = Math.max(80, Math.min(menu.scrollHeight, 280, above));
          menu.style.setProperty('top', Math.max(80, bounds.top - height - 4) + 'px', 'important');
          menu.style.maxHeight = height + 'px';
        } else {
          menu.style.setProperty('top', bounds.bottom + 4 + 'px', 'important');
          menu.style.maxHeight = Math.max(80, Math.min(280, below)) + 'px';
        }
      });
    });
    updateAdd();
  };
  const matchOptions = (row) =>
    '<option value="">Skip this card</option>' +
    row.matches
      .map(
        (match, i) =>
          `<option value="${i}" ${row.selected === match.card ? 'selected' : ''}>${escapeHtml(match.card.n || match.card.name)}</option>`,
      )
      .join('');
  el.querySelector('#scannerResults').addEventListener('input', (event) => {
    const target = event.target;
    if (!target.matches('[data-scan-query]')) return;
    const row = rows[+target.dataset.scanQuery];
    row.matches = scannerMatches(target.value, index.cards);
    row.selected = row.matches[0]?.score === 1 ? row.matches[0].card : null;
    target.closest('.scanner-result').querySelector('select').innerHTML = matchOptions(row);
    target.closest('.scanner-result').querySelector('small').textContent = row.selected
      ? 'Check the name before adding.'
      : 'No certain match. Correct the name and choose a card.';
    updateAdd();
  });
  el.querySelector('#scannerResults').addEventListener('change', (event) => {
    if (!event.target.matches('[data-scan-match]')) return;
    const row = rows[+event.target.dataset.scanMatch];
    row.selected = event.target.value === '' ? null : row.matches[+event.target.value]?.card;
    event.target.closest('.scanner-result').querySelector('small').textContent = row.selected
      ? 'Check the name before adding.'
      : 'No certain match. Correct the name and choose a card.';
    updateAdd();
  });
  el.querySelector('#scannerAdd').onclick = () => {
    const cards = rows
      .filter((row) => row.selected)
      .map((row) => (row.selected.n ? bulkToCardish(row.selected) : row.selected))
      .filter(Boolean);
    if (cards.length && !busy) closeOverlayThen(() => openAddManyToCollection(cards));
  };
  el.querySelector('#scannerCamera').onclick = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status('Open Deckhand over HTTPS to use the camera, or choose a photo instead.');
      return;
    }
    setBusy(true);
    try {
      stopCamera();
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (!active) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = next;
      const video = el.querySelector('#scannerVideo');
      video.srcObject = stream;
      video.hidden = false;
      el.querySelector('#scannerCanvas').hidden = true;
      el.querySelector('.scanner-preview').hidden = false;
      await video.play();
      if (!active) return;
      el.querySelector('#scannerCapture').hidden = false;
      status('Keep the cards still, then tap Scan this frame.');
    } catch (error) {
      stopCamera();
      status(
        error.name === 'NotAllowedError'
          ? 'Camera permission was declined. Allow camera access in your browser, or choose a photo.'
          : 'The camera could not start. Choose a photo instead.',
      );
    } finally {
      if (active) setBusy(false);
    }
  };
  const imageCanvas = (source) => {
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height || width * height > 40000000)
      throw new Error('Choose a smaller, clear photo.');
    const scale = Math.min(1, 1800 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  const scan = async (canvases) => {
    setBusy(true);
    rows = [];
    showRows();
    try {
      status('Loading recognition tools… This may take a moment the first time.');
      const libraries = await scannerLoadLibraries();
      if (!active) return;
      index = await bulkIndexReady();
      if (!index) {
        status('Loading the local card library…');
        await bulkSyncCheck(true);
        const deadline = Date.now() + 30000;
        while (active && _bulkSyncing && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 150));
        index = await bulkIndexReady();
      }
      if (!active) return;
      if (!index?.cards?.length)
        throw new Error(
          'The card library is not ready. Load it in Settings → Data sources and try again.',
        );
      for (const canvas of canvases) {
        if (!active) return;
        status('Finding card outlines…');
        let regions = scannerDetectCards(canvas, libraries.cv);
        if (
          !regions.length &&
          canvas.width / canvas.height > 0.55 &&
          canvas.width / canvas.height < 0.83
        ) {
          regions = [
            {
              points: [
                { x: 0, y: 0 },
                { x: canvas.width, y: 0 },
                { x: canvas.width, y: canvas.height },
                { x: 0, y: canvas.height },
              ],
              width: canvas.width,
              height: canvas.height,
            },
          ];
        }
        if (!regions.length) {
          status(
            'No separated card outlines found. Use a plain background, leave space between cards, and show all four edges.',
          );
          continue;
        }
        if (!worker) {
          const created = await libraries.tesseract.createWorker('eng', 1, {
            workerPath: '/assets/scanner/worker.min.js',
            workerBlobURL: false,
            corePath: '/assets/scanner',
            langPath: '/assets/scanner',
          });
          if (!active) {
            await created.terminate();
            return;
          }
          worker = created;
          await worker.setParameters({ tessedit_pageseg_mode: '6' });
        }
        const preview = el.querySelector('#scannerCanvas');
        preview.width = canvas.width;
        preview.height = canvas.height;
        const context = preview.getContext('2d');
        context.drawImage(canvas, 0, 0);
        context.strokeStyle = '#f1ce62';
        context.lineWidth = 4;
        preview.hidden = false;
        el.querySelector('#scannerVideo').hidden = true;
        el.querySelector('.scanner-preview').hidden = false;
        for (const [i, region] of regions.entries()) {
          if (!active) return;
          status(`Reading card ${i + 1} of ${regions.length}…`);
          context.beginPath();
          region.points.forEach((p, j) =>
            j ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y),
          );
          context.closePath();
          context.stroke();
          const card = scannerWarpCard(canvas, region, libraries.cv);
          let result = await worker.recognize(scannerTitleImage(card));
          if (!active) return;
          let matches = scannerMatches(result.data.text, index.cards);
          if (!matches.length || matches[0].score < 0.85) {
            const flipped = await worker.recognize(scannerTitleImage(card, true));
            if (!active) return;
            const alternatives = scannerMatches(flipped.data.text, index.cards);
            if ((alternatives[0]?.score || 0) > (matches[0]?.score || 0)) {
              result = flipped;
              matches = alternatives;
            }
          }
          const thumb = document.createElement('canvas');
          thumb.width = 125;
          thumb.height = 175;
          thumb.getContext('2d').drawImage(card, 0, 0, 125, 175);
          rows.push({
            thumb: thumb.toDataURL('image/jpeg', 0.75),
            text: result.data.text,
            matches,
            selected: matches[0]?.score >= 0.85 ? matches[0].card : null,
          });
          showRows();
        }
      }
      if (rows.length)
        status(
          `${rows.length} card${rows.length === 1 ? '' : 's'} scanned. Review the matches before adding.`,
        );
    } catch (error) {
      status(error.message || 'Recognition failed. Try a clearer photo.');
    } finally {
      if (active) setBusy(false);
    }
  };
  el.querySelector('#scannerCapture').onclick = () => {
    try {
      const canvas = imageCanvas(el.querySelector('#scannerVideo'));
      stopCamera();
      scan([canvas]);
    } catch (error) {
      status(error.message);
    }
  };
  el.querySelector('#scannerPhoto').onclick = () => el.querySelector('#scannerFile').click();
  el.querySelector('#scannerFile').onchange = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 6);
    event.target.value = '';
    if (!files.length) return;
    stopCamera();
    setBusy(true);
    try {
      const canvases = [];
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Each photo must be smaller than 20 MB.');
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (!active) return;
          canvases.push(imageCanvas(image));
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      await scan(canvases);
    } catch (error) {
      status(error.message || 'This photo could not be opened. Try a JPEG or PNG.');
    } finally {
      if (active) setBusy(false);
    }
  };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && stream) {
        stopCamera();
        status('Camera paused. Tap Open camera to resume.');
      }
    },
    { signal: listeners.signal },
  );
  window.addEventListener('pagehide', stopCamera, { signal: listeners.signal });
  el.querySelector('#scannerClose').focus({ preventScroll: true });
}
