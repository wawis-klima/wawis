import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSerialNumberFromOcrText } from '../src/modules/desktop-nameplate-model-ocr.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(
  extractSerialNumberFromOcrText('S/N: IMOTO35XI2400012345'),
  'IMOTO35XI2400012345',
  'S/N must be recognized as a serial marker',
);
assert.equal(
  extractSerialNumberFromOcrText('5/N: IMOTO35XI2400012345'),
  'IMOTO35XI2400012345',
  'OCR-confused 5/N must be recognized as a serial marker',
);
assert.equal(
  extractSerialNumberFromOcrText('SN: IMOTO35XI2400012345'),
  'IMOTO35XI2400012345',
  'legacy SN form must remain supported',
);
assert.equal(
  extractSerialNumberFromOcrText('S/N:\nIMOTO35XI2400012345\nPC/EAN: 5905567600791'),
  'IMOTO35XI2400012345',
  'Serial must be read from the line below a standalone S/N label',
);
assert.equal(
  extractSerialNumberFromOcrText('PC/EAN: 5905567600791'),
  '',
  'EAN must never be accepted as a serial number',
);

const capture = read('src/mobile791/components/nameplate/NameplatePhotoCapture.jsx');
assert(capture.includes('modelValue: "",\n      serialNumber: "",'), 'New nameplate verification must start with blank model/SN');
assert(!capture.includes('reading.modelValue || current.modelValue || currentModel'), 'Fresh OCR result must not fall back to old device model');
assert(!capture.includes('reading.serialNumber || current.serialNumber || currentSerial'), 'Fresh OCR result must not fall back to old device serial');
assert(capture.includes('verification.busy || !modelReady || !serialReady ? "Wpisz ręcznie" : "Zrób zdjęcie ponownie"'), 'Incomplete automatic read must offer manual entry');

console.log('Smoke OK: 11.23 recognizes S/N and never presents stale device data as a fresh OCR result.');
