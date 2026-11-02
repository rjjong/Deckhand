// services / language

// The interface is English-only. Keep shared text helpers and the native bridge
// consistent, including devices that previously saved a different language.
function appLang() {
  return 'en';
}

function trS(text) {
  return text;
}

try {
  localStorage.setItem(LS_PREFIX + 'lang', 'en');
} catch (e) {}
try {
  window.DeckhandNotify?.setLang?.('en');
} catch (e) {}
