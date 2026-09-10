const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Brak dist/index.html. Najpierw wykonaj npm run build.');
assert.ok(fs.existsSync(assets), 'Brak katalogu dist/assets.');
const cssFiles = fs.readdirSync(assets).filter((name) => name.endsWith('.css'));
const jsFiles = fs.readdirSync(assets).filter((name) => name.endsWith('.js'));
assert.ok(cssFiles.length > 0, 'Produkcyjny build nie zawiera żadnego pliku CSS.');
assert.ok(jsFiles.length > 0, 'Produkcyjny build nie zawiera żadnego pliku JS.');
const css = cssFiles.map((name) => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
const js = jsFiles.map((name) => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
assert.ok(css.length > 150_000, `Produkcyjny CSS jest podejrzanie mały: ${css.length} B.`);
assert.match(css, /font-family:Inter/, 'Produkcyjny CSS nie zawiera głównego fontu aplikacji.');
assert.match(css, /\.page\{/, 'Produkcyjny CSS nie zawiera podstawowego układu .page.');
assert.match(css, /mobileJobDetails/, 'Produkcyjny CSS nie zawiera mobilnych szczegółów montażu.');
assert.match(
  css,
  /\.mobileDeviceWizardModal\{[^}]*background:#fff!important/,
  'Produkcyjny CSS nie zawiera białej obudowy mobilnego kreatora urządzenia.',
);
assert.match(
  css,
  /\.mobileProtocolWizard\{[^}]*width:100%;[^}]*background:#fff/,
  'Produkcyjny CSS nie zawiera protokołu wewnątrz obudowy kreatora urządzenia.',
);
assert.match(
  js,
  /card modal mobileDeviceWizardModal protocolWizardModal/,
  'Produkcyjny JS nie używa dla protokołu sprawdzonej obudowy kreatora urządzenia.',
);
assert.match(
  js,
  /mobileDeviceWizard mobileProtocolWizard/,
  'Produkcyjny JS nie zawiera pojedynczego głównego elementu protokołu.',
);
assert.match(
  css,
  /\.protocolSignatureModal\{[^}]*height:100dvh!important;[^}]*overflow:hidden!important/,
  'Produkcyjny CSS nie zawiera nieruchomego, pełnoekranowego ekranu podpisu.',
);
assert.match(css, /\.protocolSignatureCanvas\{[^}]*touch-action:none!important/, 'Pole podpisu nie blokuje przesuwania ekranu palcem.');
assert.match(js, /protocolSignatureOverlay/, 'Produkcyjny JS nie zawiera osobnego ekranu podpisu klienta.');
assert.match(js, /Zatwierdź podpis/, 'Produkcyjny JS nie zawiera zatwierdzania podpisu przed powrotem do protokołu.');
assert.match(js, /Uzupełnij protokół/, 'Produkcyjny JS nie zawiera czytelnego wejścia do płatności i podpisu.');
assert.doesNotMatch(js, /Zmień protokół/, 'Produkcyjny JS nadal zawiera starą nazwę przycisku protokołu.');
assert.doesNotMatch(js, /protocolPaymentLegal|protocolTestConfirmation|Brak podpisu klienta/, 'Produkcyjny JS nadal zawiera usunięte opisy formularza protokołu.');
assert.doesNotMatch(css, /protocolPaymentLegal|protocolTestConfirmation/, 'Produkcyjny CSS nadal zawiera nieużywane style usuniętych opisów protokołu.');
assert.match(css, /\.jobsPaginationV995 \.jobsPaginationBtnV995\{[^}]*width:30px!important/, 'Produkcyjny CSS nie zawiera zwężonych przycisków paginacji 9.95.');
assert.match(css, /\.jobCompletionInfoItemV995\{[^}]*column-gap:14px!important/, 'Produkcyjny CSS nie zawiera odstępu przy dacie zakończenia 9.95.');
assert.match(css, /\.jobCompletionInfoValueV995[^}]*text-align:center!important/, 'Produkcyjny CSS nie wyśrodkowuje daty i wykonawcy zakończenia.');
assert.match(js, /data-pagination-layout":"9\.99/, 'Produkcyjny JS nie używa aktywnego układu paginacji 9.99.');
assert.match(js, /jobsPaginationV999/, 'Produkcyjny JS nie zawiera aktywnego, jednowierszowego układu paginacji 9.99.');
assert.match(js, /width:\s*28px\s*!important/, 'Produkcyjny JS nie zawiera przycisków paginacji o szerokości 28 px.');
assert.match(js, /data-completion-layout":"9\.99/, 'Produkcyjny JS nie używa aktywnego układu zakończenia 9.99.');
assert.match(js, /data-device-collapsible":"9\.98/, 'Produkcyjny JS nie zawiera zwijanych kart urządzeń 9.98.');
assert.match(js, /jobCompletionInfoItemV999/, 'Produkcyjny JS nie zawiera wymuszonego odstępu daty zakończenia 9.99.');
assert.match(js, /Rozwiń/, 'Produkcyjny JS nie zawiera akcji rozwijania urządzenia.');
assert.match(js, /send-job-protocol-email/, 'Produkcyjny JS nie wywołuje firmowej wysyłki protokołu.');
assert.match(js, /data-desktop-protocol":"9\.96/, 'Produkcyjny JS nie zawiera desktopowej karty zapisanego protokołu 9.96.');
assert.match(js, /Podgląd PDF/, 'Produkcyjny JS nie zawiera podglądu protokołu na desktopie.');
assert.match(js, /Wyślij klientowi/, 'Produkcyjny JS nie zawiera desktopowej wysyłki protokołu klientowi.');
assert.match(css, /\.desktopJobProtocolPreviewModal\{/, 'Produkcyjny CSS nie zawiera pełnoekranowego podglądu protokołu na desktopie.');
assert.match(js, /Wyślij z /, 'Produkcyjny JS nie zawiera przycisku firmowej wysyłki protokołu.');
assert.match(js, /biuro@wawis\.pl/, 'Produkcyjny JS nie pokazuje firmowego nadawcy protokołu.');
assert.match(js, /WAWIS CHŁODNICTWO I KLIMATYZACJA/, 'Produkcyjny JS nie zawiera firmowego nagłówka protokołu 9.97.');
assert.match(js, /www\.wawis\.pl/, 'Produkcyjny JS nie zawiera wspólnego wiersza danych kontaktowych protokołu 9.97.');
assert.doesNotMatch(js, /240887046/, 'Produkcyjny JS nadal zawiera usunięty REGON w protokole.');
assert.match(css, /\.protocolEmailAction\{/, 'Produkcyjny CSS nie zawiera czytelnej informacji o odbiorcy protokołu.');
assert.doesNotMatch(js, /protocolDialogV982/, 'Produkcyjny JS nadal zawiera wadliwą obudowę protokołu v9.82.');
assert.match(js, /data-center360-header":"10\.00/, 'Produkcyjny JS nie zawiera uproszczonego nagłówka Centrum 360 wersji 10.00.');
assert.match(js, /data-contractor-deep-link":"10\.00/, 'Produkcyjny JS nie zawiera naprawionego przejścia do kontrahenta wersji 10.00.');
assert.doesNotMatch(js, /centrum360SearchButton/, 'Produkcyjny JS nadal zawiera małe pole Szukaj w Centrum 360.');
assert.doesNotMatch(js, /centrum360DateButton/, 'Produkcyjny JS nadal zawiera przycisk Dzisiaj w Centrum 360.');
console.log(`OK: dist zawiera ${cssFiles.length} plik(i) CSS, łącznie ${css.length} B.`);
