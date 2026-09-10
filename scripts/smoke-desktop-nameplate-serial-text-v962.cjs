const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const moduleUrl = pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-model-ocr.js')).href;
  const ocr = await import(moduleUrl);

  const expected = '540U1052303A34120130283';
  assert.equal(ocr.extractSerialNumberFromOcrText(`SN:${expected}\nMade in China`), expected);
  assert.equal(ocr.extractSerialNumberFromOcrText(`S N : ${expected}`), expected);
  assert.equal(ocr.extractSerialNumberFromOcrText(`5N: ${expected}`), expected);
  assert.equal(ocr.extractSerialNumberFromOcrText('PC/EAN: 5905567601132'), '');
  assert.equal(ocr.extractSerialNumberFromOcrText('SN: 5905567601132'), '', 'EAN-13 must not be accepted as serial fallback');

  console.log('Smoke OK: focused SN text fallback extracts a serial only after an SN marker and rejects EAN-13');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
