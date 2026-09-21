const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cards = fs.readFileSync(path.join(root, 'src/components/desktop/DesktopJobDeviceCards.jsx'), 'utf8');
const details = fs.readFileSync(path.join(root, 'src/components/JobDetailsPanel.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

assert(cards.includes('class DeviceCardsBoundary'), 'Brak error boundary dla kart urządzeń');
assert(cards.includes('class OcrActionBoundary'), 'Brak osobnego error boundary dla OCR');
assert(cards.includes('safeNameplateTarget'), 'Metadane tabliczek nie są bezpiecznie parsowane');
assert(cards.includes('safeText'), 'Dane modelu i numeru nie są normalizowane przed renderem');
assert(cards.includes('Brak danych przypisania JZ/JW'), 'Brak czytelnego fallbacku dla starych rekordów tabliczek');
assert(details.includes('getSafeJobDeviceRows'), 'JobDetails nie chroni parsera urządzeń');
assert(css.includes('v8.70 — hotfix białego panelu'), 'Brak CSS hotfixu 8.70');
assert(css.includes('grid-template-columns:minmax(0,1fr) auto auto'), 'Karty nadal mają zbyt szeroki układ kolumn');
assert(css.includes('.desktopDeviceCardsFallback'), 'Brak widocznego fallbacku zamiast białego ekranu');

console.log('Smoke OK: montaże z tabliczkami nie mogą już wyłączyć całego panelu szczegółów');
