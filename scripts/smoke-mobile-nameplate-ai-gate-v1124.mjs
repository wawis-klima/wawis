import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSerialNumberFromOcrText } from '../src/modules/desktop-nameplate-model-ocr.js';
import { getMobileNameplateEvidence } from '../src/mobile791/modules/nameplate-reader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(
  extractSerialNumberFromOcrText('S/N:\nIMOTO35XI2400012345\nPC/EAN: 5905567600791'),
  'IMOTO35XI2400012345',
  'Serial must still be read from the line below S/N',
);

const empty = getMobileNameplateEvidence({});
assert.equal(empty.hasEvidence, false, 'Empty/random photo evidence must not unlock AI');

const randomPhoto = getMobileNameplateEvidence({
  serialTextResult: { rawText: 'TREE\nWINDOW\nGARDEN' },
  modelTextResult: { rawText: 'HOUSE' },
});
assert.equal(randomPhoto.hasEvidence, false, 'Ordinary scene text must not be treated as a nameplate');

const weakNumericNoise = getMobileNameplateEvidence({
  serialTextResult: { rawText: 'HOUSE 1234' },
  modelTextResult: { rawText: 'STREET' },
});
assert.equal(weakNumericNoise.hasEvidence, false, 'A lone number on an ordinary photo must not unlock AI');

const realPlateText = getMobileNameplateEvidence({
  serialTextResult: { rawText: 'S/N:\nIMOTO35XI2400012345' },
  modelTextResult: { rawText: 'ROTENSO\nMODEL I35Xi R14\n230V 50Hz\nR32' },
});
assert.equal(realPlateText.hasEvidence, true, 'Technical nameplate text must unlock AI fallback when needed');

const barcodeEvidence = getMobileNameplateEvidence({
  barcodeInfo: { ean: '5905567600791', detections: [{ value: '5905567600791' }] },
});
assert.equal(barcodeEvidence.hasEvidence, true, 'A valid local barcode/EAN signal must unlock AI fallback');

const reader = read('src/mobile791/modules/nameplate-reader.js');
assert(reader.includes("aiSkipReason: 'no_nameplate_evidence'"), 'No-evidence path must skip AI explicitly');
assert(reader.includes('Nie wykryto tabliczki znamionowej — zrób zdjęcie ponownie'), 'No-evidence path must explain why reading stopped');
assert(reader.indexOf('if (!evidence.hasEvidence)') < reader.indexOf('readDesktopNameplateWithAi({'), 'Evidence gate must execute before AI');

const capture = read('src/mobile791/components/nameplate/NameplatePhotoCapture.jsx');
assert(capture.includes('AI nie zostało uruchomione. Zrób zdjęcie tabliczki ponownie.'), 'Mobile UI must explain that AI was intentionally skipped');
assert(capture.includes('disabled={noNameplateEvidence}'), 'Fields must be disabled for a non-nameplate photo');
assert(capture.includes('noNameplateEvidence ? "Zrób zdjęcie ponownie"'), 'Non-nameplate photo must force a retake instead of manual bypass');

console.log('Smoke OK: 11.24 rejects photos without nameplate evidence and never calls AI blindly.');
