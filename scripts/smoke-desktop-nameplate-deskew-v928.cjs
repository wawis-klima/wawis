const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
  const barcode = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-barcode.js')).href);
  const source = read('src/modules/desktop-nameplate-barcode.js');
  const version = read('src/version.js');

  assert(version.includes("APP_VERSION = '9.31'"), 'App version is not 9.31');
  assert.strictEqual(barcode.ean13IsValid('5905567600777'), true, 'EAN from the reported skewed nameplate must pass checksum');
  assert(source.includes('BARCODE_DESKEW_ANGLES'), 'Deskew angle sweep is missing');
  for (const angle of ['-18', '-15', '-12', '-9', '-6', '-3', '3', '6', '9', '12', '15', '18']) {
    assert(source.includes(angle), `Deskew sweep is missing angle ${angle}`);
  }
  assert(source.includes('function rotateCanvas('), 'Canvas rotation helper is missing');
  assert(source.includes("context.fillStyle = '#ffffff'"), 'Rotated canvas should use white background');
  assert(source.includes('detectUniversalDeskew(image)'), 'Universal decoder deskew retry is missing');
  assert(source.includes('detectNativeDeskew(image)'), 'Native decoder deskew retry is missing');
  assert(source.includes('detectLocalEan13Deskew(image)'), 'Local EAN deskew retry is missing');
  assert(source.includes("label: 'Automatyczne prostowanie zdjęcia…'"), 'Deskew progress state is missing');
  assert(source.indexOf('Automatyczne prostowanie zdjęcia') > source.indexOf('Dodatkowy odczyt EAN-13'), 'Deskew must be a fallback after normal scans');
  assert(!source.includes('scanDesktopNameplateIdentifiers') && !source.includes('printed_ocr'), 'Deskew path must remain barcode-only');

  console.log('Smoke OK: v9.28 retries barcode decoding over ±18° deskew angles without AI/OCR');
})().catch((error) => { console.error(error); process.exit(1); });
