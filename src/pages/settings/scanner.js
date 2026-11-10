// pages / settings / scanner

function scannerSettingsHtml() {
  const settings = normalizeScannerSettings(state);
  return /* HTML */ ` <div class="settings-section">
    ${menuCardHtml('scannerSettingsRow', SCANNER_ICON, 'Card scanner', 'Recognition, scan speed and repeat detection')}
    <div id="scannerSettingsBody" class="menu-tool-body scanner-settings" hidden>
      <label class="scanner-setting-field" for="scannerIdThreshold">
        <span
          ><strong>ID threshold</strong
          ><small
            >Minimum match score, from 0 to 1. Higher values require a closer card match.</small
          ></span
        >
        <span class="scanner-setting-number"
          ><input
            id="scannerIdThreshold"
            type="number"
            inputmode="decimal"
            min="0"
            max="1"
            step="any"
            value="${settings.scannerIdThreshold}"
        /></span>
      </label>
      <label class="scanner-setting-field" for="scannerCornerThreshold">
        <span
          ><strong>Corner threshold</strong
          ><small
            >Minimum card detector confidence, from 0 to 1. Higher values require clearer
            corners.</small
          ></span
        >
        <span class="scanner-setting-number"
          ><input
            id="scannerCornerThreshold"
            type="number"
            inputmode="decimal"
            min="0"
            max="1"
            step="any"
            value="${settings.scannerCornerThreshold}"
        /></span>
      </label>
      <label class="scanner-setting-field" for="scannerIntervalMs">
        <span
          ><strong>Scan interval</strong
          ><small
            >Minimum time between scans, from 100 to 10,000 ms. Slower devices can take
            longer.</small
          ></span
        >
        <span class="scanner-setting-number"
          ><input
            id="scannerIntervalMs"
            type="number"
            inputmode="numeric"
            min="100"
            max="10000"
            step="1"
            value="${settings.scannerIntervalMs}"
            aria-describedby="scannerIntervalUnit"
          /><span id="scannerIntervalUnit">milliseconds</span></span
        >
      </label>
      <label class="scanner-setting-toggle" for="scannerShowFramerate">
        <span
          ><strong>Show scan framerate and timings</strong
          ><small
            >Show scan speed, processing times and acceleration over the camera preview.</small
          ></span
        >
        <input
          id="scannerShowFramerate"
          type="checkbox"
          ${settings.scannerShowFramerate ? ' checked' : ''}
        />
      </label>
      <label class="scanner-setting-toggle" for="scannerIgnoreSession">
        <span
          ><strong>Ignore previously scanned printings</strong
          ><small
            >Log each exact printing once per session. Other sets and artwork are scanned
            separately.</small
          ></span
        >
        <input
          id="scannerIgnoreSession"
          type="checkbox"
          ${settings.scannerIgnoreSession ? ' checked' : ''}
        />
      </label>
      <p class="scanner-settings-note">
        A card held in view is always logged once. Close and reopen the scanner to start a new
        scanning session. Settings apply the next time you open the scanner.
      </p>
    </div>
  </div>`;
}

function wireScannerSettings() {
  document
    .getElementById('scannerSettingsRow')
    ?.addEventListener('click', () =>
      foldToggle(
        document.getElementById('scannerSettingsBody'),
        null,
        document.getElementById('scannerSettingsRow'),
      ),
    );
  for (const [id, key, scale] of [
    ['scannerIdThreshold', 'scannerIdThreshold', 1],
    ['scannerCornerThreshold', 'scannerCornerThreshold', 1],
    ['scannerIntervalMs', 'scannerIntervalMs', 1],
  ]) {
    const input = document.getElementById(id);
    input?.addEventListener('change', () => {
      const settings = normalizeScannerSettings({ ...state, [key]: input.valueAsNumber * scale });
      Object.assign(state, settings);
      input.value = String(settings[key] / scale);
      persistSettings();
    });
  }
  for (const key of ['scannerShowFramerate', 'scannerIgnoreSession'])
    document.getElementById(key)?.addEventListener('change', (event) => {
      state[key] = event.target.checked;
      persistSettings();
    });
}
