const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
  const barcode = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-barcode.js')).href);
  const exactSerial = '540S25420034B110171916';
  const result = barcode.summarizeBarcodeResults([
    { value: '5905567600791', format: 'ean_13', source: 'universal_barcode', variant: 'górny pas kodu', roleHint: 'ean' },
    { value: exactSerial, format: 'code_128', source: 'universal_barcode', variant: 'dolny pas kodu SN', roleHint: 'serial' },
  ]);
  assert.strictEqual(result.ean, '5905567600791');
  assert.strictEqual(result.serialNumber, exactSerial);
  assert.strictEqual(result.serialSource, 'universal_barcode');
  assert.strictEqual(result.rotensoModel?.code, 'I35Xi R14');

  const rejectedText = barcode.summarizeBarcodeResults([
    { value: '0034B110171918', format: 'printed_text', source: 'some_text_reader', roleHint: 'serial' },
  ]);
  assert.strictEqual(rejectedText.serialNumber, '', 'Printed text must not autofill serial in barcode path');

  const source = read('src/modules/desktop-nameplate-barcode.js');
  assert(source.includes('barcode-detector@3.2.1/dist/iife/ponyfill.min.js'));
  assert(source.includes("['code_128', 'code_39'].includes(format)"));
  assert(source.includes("['universal_barcode', 'native_barcode'].includes(source)"));
  assert(!source.includes('printed_ocr'));
  console.log('Smoke OK: universal reader owns barcode SN/EAN and never accepts printed text as barcode evidence');
})().catch((error) => { console.error(error); process.exit(1); });
