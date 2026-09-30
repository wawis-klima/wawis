const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const modal = read('src/mobile791/components/modals/JobFormModal.jsx');
const css = read('src/mobile791/v1198-new-job-compact.css');
const main = read('src/main.jsx');

assert.ok(modal.includes('useEffect') && modal.includes('useRef'), 'Mobile ma używać efektu do automatycznego lookupu kodu.');
assert.ok(modal.includes('window.setTimeout') && modal.includes('refreshPostalCode(jobForm.city, jobForm.street)') && modal.includes('}, 550);'), 'Kod ma być wyszukiwany automatycznie po krótkiej pauzie.');
assert.match(modal, /postalLookupAttemptRef/, 'Lookup nie może zapętlać ponowień dla tego samego adresu.');
assert.match(modal, /value=\{cityAddressParts\.postalCode\}/, 'Pole kodu ma być kontrolowane i od razu odświeżać wartość.');
assert.match(modal, /<ClientVoiceInput/, 'Główny przycisk Wprowadź głosowo ma pozostać.');
assert.doesNotMatch(modal, /VoiceFieldButton|VoiceNoteButton/, 'Przy polach nie może być osobnych mikrofonów.');
assert.doesNotMatch(modal, /normalizeVoiceEmail|normalizeVoicePhone|appendVoiceNoteText/, 'Stara logika mikrofonów przy polach ma być usunięta.');
assert.match(css, /min-height:36px !important/, 'Pola formularza mają być niższe.');
assert.match(css, /grid-template-columns:minmax\(0,1fr\) 104px !important/, 'Miejscowość i kod mają być w kompaktowym dwukolumnowym układzie.');
assert.match(main, /v1198-new-job-compact\.css/, 'Kompaktowy CSS musi być ładowany jako ostatni override mobile.');

console.log('OK: v11.98 mobile ma automatyczny kod, mniejsze pola i tylko jeden główny przycisk głosowy.');
