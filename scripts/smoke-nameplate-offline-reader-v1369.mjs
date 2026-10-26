import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNameplateLocalFallbackCandidates } from '../src/mobile791/modules/nameplate-reader.js';
import { requiresNameplateSerialReview } from '../src/mobile791/modules/nameplate-serial-verification.js';

// WAWIS 13.69: bez internetu (AI niedostępne) pola tabliczki dostają odczyt czytnika telefonu,
// ale nigdy jako potwierdzony wynik i nigdy jako numer EAN.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const EAN = '5905567600791';

// 1. Konflikt czytników: kandydat z kodu kreskowego.
const conflict = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'conflict', serialNumber: '', barcodeSerial: 'IMOTO35XI2400012345', ocrSerial: 'IMOTO35XI2400O12345' },
  barcodeInfo: { ean: EAN },
});
assert.equal(conflict.serialNumber, 'IMOTO35XI2400012345');
assert.equal(conflict.serialSource, 'barcode');

// 2. Konflikt, gdy kod kreskowy to EAN: bierzemy nadruk, nie EAN.
const conflictEan = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'conflict', barcodeSerial: EAN, ocrSerial: 'ABC1234567890' },
  barcodeInfo: { ean: EAN },
});
assert.equal(conflictEan.serialNumber, 'ABC1234567890');
assert.equal(conflictEan.serialSource, 'ocr');

// 3. Brak potwierdzonego SN, offline: pojedynczy OCR tylko z napisem S/N.
const missingOffline = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  serialTextResult: { serialNumber: 'IMOTO35XI2400012345', votes: 1, confidence: 30, rawText: 'S/N:\nIMOTO35XI2400012345' },
  allowUnsupportedOcr: true,
});
assert.equal(missingOffline.serialNumber, 'IMOTO35XI2400012345');
assert.equal(missingOffline.serialSource, 'ocr_single');

// 4. Ten sam odczyt online (błąd AI) nie jest podstawiany — tylko offline.
const missingOnline = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  serialTextResult: { serialNumber: 'IMOTO35XI2400012345', votes: 1, confidence: 30, rawText: 'S/N:\nIMOTO35XI2400012345' },
  allowUnsupportedOcr: false,
});
assert.equal(missingOnline.serialNumber, '');

// 5. Napis S/N nieczytelny, ale numer odczytany: offline podajemy ciąg wyglądający jak SN.
const noLabel = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  serialTextResult: { serialNumber: '', rawText: 'ROTENSO\nMODEL: I35XI R14\n230V 50HZ 3.5 KW R32\nIMOTO35XI2400012345\nPC/EAN: 5905567600791' },
  barcodeInfo: { ean: EAN },
  allowUnsupportedOcr: true,
});
assert.equal(noLabel.serialNumber, 'IMOTO35XI2400012345');
assert.equal(noLabel.serialSource, 'ocr_token');

// 5b. Zasłonięty SN: tylko EAN, model i wartości techniczne → pole puste.
const hidden = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  serialTextResult: { serialNumber: '', rawText: 'ROTENSO\nMODEL: I35XI R14\nINDOOR UNIT 230V ~ 50HZ\nCOOLING CAPACITY: 3.5 KW REFRIGERANT: R32\n5905567600791\nPC/EAN: 5905567600791\nMADE IN P.R.C.' },
  barcodeInfo: { ean: EAN },
  allowUnsupportedOcr: true,
});
assert.equal(hidden.serialNumber, '');
// Online (błąd AI) ciąg bez potwierdzenia nie jest wpisywany.
assert.equal(getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  serialTextResult: { serialNumber: '', rawText: 'IMOTO35XI2400012345' },
  allowUnsupportedOcr: false,
}).serialNumber, '');

// 6. EAN / ciąg wyglądający jak EAN nigdy nie trafia do SN.
for (const value of [EAN, '590556760079', '12345678']) {
  const ean = getNameplateLocalFallbackCandidates({
    serialCheck: { status: 'missing' },
    serialTextResult: { serialNumber: value, rawText: `S/N: ${value}` },
    barcodeInfo: { ean: EAN },
    allowUnsupportedOcr: true,
  });
  assert.equal(ean.serialNumber, '', `EAN-like ${value} must not become SN`);
}

// 7. Model: niepewny odczyt ze słownika jako kandydat, gdy pole modelu jest puste.
const model = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  modelTextResult: { reliable: false, exactModel: { manufacturer: 'Rotenso', model: 'Imoto I35Xi', code: 'I35XI', capacityKw: 3.5 } },
});
assert.match(model.modelValue, /I35Xi/i);
const modelKept = getNameplateLocalFallbackCandidates({
  serialCheck: { status: 'missing' },
  modelValue: 'Rotenso Inny',
  modelTextResult: { reliable: false, exactModel: { model: 'Imoto I35Xi' } },
});
assert.equal(modelKept.modelValue, '');

// 8. Kandydat zawsze wymaga zaznaczenia „Sprawdziłem numer SN znak po znaku”.
for (const status of ['conflict', 'missing', 'single_source']) {
  assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: { status } } }), true, status);
}

// 9. Statycznie: bez internetu AI nie jest wywoływane, a UI pokazuje ostrzeżenie i używa kandydatów.
const reader = read('src/mobile791/modules/nameplate-reader.js');
const offlineIdx = reader.indexOf('if (isBrowserOffline()) {');
const aiIdx = reader.indexOf('readDesktopNameplateWithAi({');
assert.ok(offlineIdx > 0 && aiIdx > offlineIdx, 'Offline short-circuit must come before the AI call');
const capture = read('src/mobile791/components/nameplate/NameplatePhotoCapture.jsx');
assert.match(capture, /reading\.aiUnavailable \|\| reading\.aiOptional \? \(reading\.localCandidates/);
assert.match(capture, /data-testid="nameplate-offline-reader"/);
assert.match(capture, /Brak internetu — AI nie sprawdziła tabliczki/);

console.log('smoke-nameplate-offline-reader-v1369: OK');
