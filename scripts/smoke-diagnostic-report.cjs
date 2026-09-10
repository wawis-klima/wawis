const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const desktopDiagnostics = read('src/modules/diagnostics.js');
const mobileDiagnostics = read('src/mobile791/modules/diagnostics.js');
const panel = read('src/components/diagnostics/DiagnosticsPanel.jsx');
const mobileButton = read('src/mobile791/components/diagnostics/MobileDiagnosticButton.jsx');
const main = read('src/main.jsx');
const shell = read('src/components/layout/AdminDesktopShell.jsx');

for (const source of [desktopDiagnostics, mobileDiagnostics]) {
  assert(source.includes('buildDiagnosticReport'), 'Brak generatora raportu diagnostycznego.');
  assert(source.includes('customerDataIncluded: false'), 'Raport nie deklaruje wykluczenia danych klientów.');
  assert(source.includes('commentsIncluded: false'), 'Raport nie deklaruje wykluczenia komentarzy.');
  assert(source.includes('photosIncluded: false'), 'Raport nie deklaruje wykluczenia zdjęć.');
  assert(source.includes('SENSITIVE_KEY_PATTERN'), 'Brak maskowania wrażliwych kluczy.');
  assert(source.includes('navigator.storage.estimate'), 'Brak diagnostyki zajętości pamięci.');
  assert(source.includes("window.addEventListener('offline'"), 'Brak zapisu zmiany stanu offline.');
}

assert(main.includes('installDiagnosticConsoleCapture'), 'Diagnostyka nie jest instalowana przy starcie aplikacji.');
assert(main.includes('installGlobalDiagnosticHandlers'), 'Globalne handlery diagnostyczne nie są instalowane.');
assert(panel.includes('Pobierz raport diagnostyczny'), 'Brak przycisku raportu na desktopie.');
assert(panel.includes('Raport bez danych klientów'), 'Brak informacji o prywatności raportu.');
assert(shell.includes("label: 'Diagnostyka'"), 'Brak pozycji Diagnostyka w menu desktopowym.');
assert(mobileButton.includes('getPhotoQueueSummary'), 'Mobilny raport nie zawiera podsumowania kolejki zdjęć.');
assert(mobileButton.includes('Pobierz raport diagnostyczny'), 'Brak przycisku raportu mobilnego.');

console.log('OK: raport diagnostyczny jest dostępny na desktopie i telefonie, maskuje dane i zawiera stan kolejki zdjęć.');
