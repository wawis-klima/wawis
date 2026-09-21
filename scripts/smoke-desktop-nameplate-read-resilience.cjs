const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const component = read('src/components/desktop/DesktopNameplateOcrButton.jsx');
const cards = read('src/components/desktop/DesktopJobDeviceCards.jsx');
const barcode = read('src/modules/desktop-nameplate-barcode.js');
const readerUtils = read('src/modules/desktop-nameplate-reader-utils.js');
const modelOcr = read('src/modules/desktop-nameplate-model-ocr.js');

assert(component.includes('async function openAndPrepare()'), 'Reader modal should open through preparation-only handler');
assert(!component.includes('requestAnimationFrame(() => { void runBarcodeScan(); })'), 'Opening modal must not auto-start scan');
assert(component.includes('BARCODE_SCAN_TIMEOUT_MS = 95000'), 'Barcode timeout is missing');
assert(component.includes('CATALOG_LOOKUP_TIMEOUT_MS = 7000'), 'Catalog timeout is missing');
assert(component.includes('AI_READ_TIMEOUT_MS = 60000'), 'AI timeout is missing');
assert(component.includes('MODEL_OCR_TIMEOUT_MS = 60000'), 'Focused model OCR timeout is missing');
assert(component.includes('operationRef.current += 1'), 'Cancellation token is missing');
assert(component.includes('closeOnOverlay={!saving}') && component.includes('disabled={saving}'), 'Modal closing rules are incomplete');
assert(cards.includes('disabled={Boolean(!photo)}'), 'Reader launch should depend on photo presence, not unrelated busy state');
assert(!barcode.includes('scanDesktopNameplateIdentifiers') && !barcode.includes('printed_ocr'), 'Barcode reader still contains OCR fallback');
assert(component.includes('scanDesktopNameplateModelCode'), 'Blue scan action does not run focused local model recognition');
assert(modelOcr.includes('focused-model-only') && modelOcr.includes('resolveFocusedRotensoModelText'), 'Focused model-only OCR guard is missing');
assert(barcode.includes('barcode-detector@3.2.1/dist/iife/ponyfill.min.js'), 'Universal barcode reader is missing');
assert(readerUtils.includes('AbortController') && readerUtils.includes("error?.name === 'AbortError'"), 'Photo fetch timeout/abort handling is missing');
assert(fs.existsSync(path.join(root, 'public/ocr/eng.traineddata.gz')), 'Local model OCR language data is missing');

console.log('Smoke OK: nameplate reader opens fast and blue scan has bounded model-only OCR');
