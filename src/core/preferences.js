// core / preferences

async function loadSettings() {
  state.priceCache = loadPriceCache();
  state.collection = loadCollection();
  state.startupPage = 'home';
  try {
    const raw = localStorage.getItem(LS_PREFIX + 'settings:app');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.theme) state.theme = s.theme;
      if (s.guild && GUILDS.some((g) => g.k === s.guild)) state.guild = s.guild;
      if (STARTUP_PAGES.includes(s.startupPage)) state.startupPage = s.startupPage;
    }
  } catch (e) {
    /* no settings saved yet */
  }
  applyTheme();
}

async function persistSettings() {
  try {
    localStorage.setItem(
      LS_PREFIX + 'settings:app',
      JSON.stringify({ theme: state.theme, guild: state.guild, startupPage: state.startupPage }),
    );
  } catch (e) {
    console.error(e);
  }
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-mode', 'commander'); // the one palette; the attribute name is historic
  const g = currentGuild();
  document.documentElement.setAttribute('data-main', g.main);
  document.documentElement.setAttribute('data-side', g.side);
  // The browser chrome follows the ink colour of the chosen guild.
  try {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', GUILD_SWATCH[g.main][0]);
  } catch (e) {}
  // The typing cursor wears the SECONDARY colour of the pairing, as a tint
  // that stands out on the fields (which are that colour's surface).
  const caret = CARET_BY_SIDE[g.side] || CARET_BY_SIDE.U;
  document.documentElement.style.setProperty('--caret', caret);
  // The count's red: the LIGHT red tint where it sits on a dark surface,
  // the deep red on a light one (a white main colour = a light page; a
  // white second colour = light tiles).
  document.documentElement.style.setProperty('--count-bad', g.main === 'W' ? '#B5484D' : '#F4B6A2');
  document.documentElement.style.setProperty(
    '--count-bad-tile',
    g.side === 'W' ? '#B5484D' : '#F4B6A2',
  );
  // The Android app draws the cursor's grab handle itself: tell it too.
  try {
    if (window.DeckhandNotify && typeof DeckhandNotify.setAccent === 'function')
      DeckhandNotify.setAccent(caret);
  } catch (e) {}
  document.title = brandTitle();
}

const CARET_BY_SIDE = { W: '#8A6A1E', U: '#A6D0EE', B: '#D6D1CA', R: '#F4B6A2', G: '#B4DAB4' };

function scheduleSave(deck) {
  deck._saveStatus = 'saving';
  updateSaveIndicator();
  clearTimeout(saveTimers[deck.id]);
  saveTimers[deck.id] = setTimeout(async () => {
    deck.updatedAt = Date.now();
    await persistDeck(deck);
    deck._saveStatus = 'saved';
    updateSaveIndicator();
  }, 550);
}

function updateSaveIndicator() {
  const el = document.getElementById('saveIndicator');
  const deck = getDeck(state.activeDeckId);
  if (!el || !deck) return;
  const saving = deck._saveStatus === 'saving';
  if (el) el.textContent = saving ? 'Saving…' : 'Saved';
  el.classList.toggle('saving', saving);
}
