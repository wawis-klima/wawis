const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const componentPath = path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx');
const styleModulePath = path.join(root, 'src/mobile791/components/mobile-device-table-v889.css.js');
const globalCssPath = path.join(root, 'src/mobile791/styles.css');
const component = fs.readFileSync(componentPath, 'utf8');
const styleModule = fs.readFileSync(styleModulePath, 'utf8');
const globalCss = fs.readFileSync(globalCssPath, 'utf8');

assert.match(component, /import MOBILE_DEVICE_TABLE_V889_CSS from "\.\/mobile-device-table-v889\.css\.js";/, 'Krytyczne style tabeli muszą być importowane razem z komponentem JS.');
assert.match(component, /<style data-wawis-mobile-device-table="8\.89">\{MOBILE_DEVICE_TABLE_V889_CSS\}<\/style>/, 'Komponent musi osadzać styl tabeli bezpośrednio w DOM.');
assert.match(component, /data-mobile-device-table="8\.89"/, 'Karta musi mieć jednoznaczny znacznik układu 8.89.');
assert.match(component, /data-device-collapsible="9\.98"/, 'Lista urządzeń musi używać aktywnego zwijania 9.98.');
assert.match(component, /expandedDeviceIndexes, setExpandedDeviceIndexes/, 'Każde urządzenie musi mieć niezależny stan rozwinięcia.');
assert.match(component, /setExpandedDeviceIndexes\(\[\]\)/, 'Po przejściu do innego zlecenia urządzenia muszą wracać do stanu zwiniętego.');
assert.match(component, /aria-expanded=\{isExpanded\}/, 'Przycisk rozwijania musi udostępniać stan czytnikom ekranu.');
assert.match(component, /hidden=\{!isExpanded\}/, 'Szczegóły urządzenia muszą być domyślnie ukryte.');
assert.match(component, /Rozwiń.*Urządzenie/, 'Zwinięta karta musi mieć czytelną akcję rozwijania.');
assert.match(component, /jobCompletionInfoItemV999[\s\S]*data-completion-layout="9\.99"/, 'Wiersz zakończenia musi używać aktywnego układu 9.99.');
assert.doesNotMatch(component, /Przez:\s*\{completedByLabel\}/, 'Mobilny wykonawca musi być pokazany bez prefiksu Przez:.');
assert.match(component, /deviceUnitDocumentationTableHeader[\s\S]*Urządzenie[\s\S]*Model \/ moc[\s\S]*Tabliczka[\s\S]*Status/, 'Tabela musi zawierać cztery czytelne kolumny.');
assert.doesNotMatch(component, /deviceUnitDocumentationTableHeader[\s\S]{0,300}<span>Akcje<\/span>/, 'Na wąskim ekranie nie może pozostać osobna kolumna Akcje.');
assert.match(component, /role="button"[\s\S]*onClick=\{handleAction\}[\s\S]*onKeyDown=\{handleKeyDown\}/, 'Cały wiersz jednostki musi otwierać lub obsługiwać tabliczkę.');
assert.match(component, /Otwórz tabliczkę znamionową/, 'Klikalny wiersz musi otwierać podgląd zapisanej tabliczki.');
assert.match(component, /deviceUnitDocumentationCode \$\{isOutdoor \? 'outdoor' : 'indoor'\}/, 'JZ i JW muszą mieć osobne oznaczenia.');
assert.match(styleModule, /\.jobDevicesTableV888 \.deviceUnitDocumentationTableHeader,\s*\.jobDevicesTableV888 \.deviceUnitDocumentationRow\s*\{[\s\S]*display:\s*grid\s*!important;[\s\S]*grid-template-columns:\s*minmax\(88px,[^;]+44px\s*!important;/, 'Nagłówek i wiersze muszą być szerszym gridem czterokolumnowym.');
assert.match(styleModule, /column-gap:\s*7px\s*!important;/, 'Status musi mieć większy odstęp od potwierdzenia.');
assert.match(styleModule, /deviceUnitDocumentationTableHeader > span[\s\S]*white-space:\s*nowrap\s*!important;/, 'Nagłówek Status nie może łamać się na dwie linie.');
assert.match(styleModule, /deviceUnitDocumentationState[\s\S]*width:\s*29px\s*!important;/, 'Potwierdzenie statusu musi pozostać czytelne.');
assert.match(styleModule, /deviceUnitDocumentationRow:active/, 'Klikalny wiersz musi mieć informację zwrotną po dotknięciu.');
assert.match(styleModule, /\.detailMeta > \.jobDevicesTableV888\.infoItem[\s\S]*padding:\s*14px 8px 13px\s*!important;/, 'Tabela musi wykorzystywać więcej szerokości karty.');
assert.match(styleModule, /\.deviceUnitDocumentationCode\.outdoor[\s\S]*background:\s*#e8efff\s*!important;/, 'JZ musi mieć niebieskie oznaczenie.');
assert.match(styleModule, /\.deviceUnitDocumentationCode\.indoor[\s\S]*background:\s*#eaf8ef\s*!important;/, 'JW musi mieć zielone oznaczenie.');
assert.doesNotMatch(styleModule, /deviceUnitDocumentationAction/, 'Osobny przycisk nie może zabierać szerokości tabeli.');
assert.match(styleModule, /jobCompletionInfoItemV999[\s\S]*grid-template-columns:\s*138px minmax\(0, 1fr\)\s*!important;[\s\S]*column-gap:\s*22px\s*!important;/, 'Data zakończenia musi mieć rzeczywisty odstęp od etykiety.');
assert.match(styleModule, /jobCompletionInfoValueV999[\s\S]*place-items:\s*center\s*!important;/, 'Data i wykonawca zakończenia muszą być wyśrodkowani.');
assert.match(styleModule, /jobCompletionInfoValueV999 \.jobCompletionBy[\s\S]*white-space:\s*nowrap\s*!important;/, 'Nazwisko wykonawcy musi pozostać w jednej linii.');
assert.match(styleModule, /jobDeviceDocumentationToggle\[aria-expanded="true"\]/, 'Nagłówek urządzenia musi wizualnie sygnalizować rozwinięcie.');
assert.match(styleModule, /jobDeviceDocumentationBody\[hidden\][\s\S]*display:\s*none\s*!important;/, 'Zwinięta karta nie może zajmować miejsca szczegółami.');
assert.doesNotMatch(globalCss, /mobile-device-table-v889|data-mobile-device-table="8\.89"/, 'Krytyczny układ 8.89 nie może zależeć od cache’owanego styles.css.');

const cssBody = styleModule.match(/String\.raw`([\s\S]*)`;\s*\n\s*export default/)?.[1] || '';
assert.ok(cssBody.length > 4500, 'Osadzony arkusz tabeli wygląda na niepełny.');
let depth = 0;
for (const char of cssBody) {
  if (char === '{') depth += 1;
  if (char === '}') depth -= 1;
  assert.ok(depth >= 0, 'Osadzony CSS ma nadmiarowy nawias zamykający.');
}
assert.equal(depth, 0, 'Osadzony CSS ma niezbilansowane nawiasy.');

console.log('OK: tabela 8.89 jest szersza, ma pełny nagłówek Status i otwiera tabliczkę po kliknięciu wiersza.');
