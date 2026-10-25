// WAWIS 13.70: czytniki tabliczek muszą działać bez internetu (iPhone, tryb samolotowy).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sw = read('public/push-sw.js');
assert.match(sw, /const NAMEPLATE_READER_CACHE = "wawis-nameplate-readers-v1";/);
assert.match(sw, /url\.pathname\.startsWith\("\/ocr\/"\)/, 'OCR files must be cached');
assert.match(sw, /\/npm\/barcode-detector@/, 'Code 128 reader must be cached');
assert.match(sw, /\/npm\/zxing-wasm@/, 'zxing WASM must be cached');
// Cache czytników nie może być kasowany przy aktualizacji wersji (usuwamy tylko wawis-app-shell-*).
assert.match(sw, /key\.startsWith\("wawis-app-shell-"\)/);
assert.ok(!/wawis-app-shell-v[\d.]+.*NAMEPLATE_READER_CACHE/.test(sw));
// Obsługa czytników przed odrzuceniem zapytań spoza domeny.
assert.ok(sw.indexOf('isNameplateReaderAsset(url)') < sw.indexOf('if (url.origin !== self.location.origin || request.headers.has("range")) return;'));

const ocr = read('src/modules/desktop-nameplate-model-ocr.js');
assert.match(ocr, /workerBlobURL: false/, 'OCR worker must load from /ocr/ so the service worker can serve it offline');
assert.match(ocr, /if \(warmupOnlyWorker\) await cancelDesktopNameplateModelOcr\(\);/, 'Warm-up must not kill a worker used by a real read');

const warm = read('src/mobile791/modules/nameplate-reader-warmup.js');
assert.match(warm, /navigator\.onLine === false/);
assert.match(warm, /navigator\.serviceWorker\.controller/);
assert.match(read('src/mobile791/App.jsx'), /scheduleNameplateReaderWarmup\(\)/);
assert.match(read('src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx'), /data-testid="diagnostics-prepare-readers"/);
assert.match(read('src/modules/desktop-nameplate-barcode.js'), /export async function warmUniversalBarcodeReader/);

console.log('smoke-nameplate-offline-readers-v1370: OK');
