import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  reconcileNameplateSerial,
  withNameplateAiSerialCandidate,
  resolveNameplateSerialWithVisualAi,
  requiresNameplateSerialReview,
} from '../src/mobile791/modules/nameplate-serial-verification.js';

const sn = '540U6072106A5060130225';
const candidate = (overrides = {}) => ({
  barcodeSerial: sn,
  ocrSerial: sn,
  ocrVotes: 2,
  ocrConfidence: 84,
  ocrRawText: `Model I50Xi R14\nSN: ${sn}`,
  ...overrides,
});

const confirmed = reconcileNameplateSerial(candidate());
assert.deepEqual(confirmed, { status: 'confirmed', serialNumber: sn, barcodeSerial: sn, ocrSerial: sn });
assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: confirmed } }), false);

const corruptedCode = '541716530899072106A5018130225';
const conflict = reconcileNameplateSerial(candidate({ barcodeSerial: corruptedCode }));
assert.equal(conflict.status, 'conflict');
assert.equal(conflict.serialNumber, '', 'Conflicting serial values must never be prefilled as correct.');
assert.equal(conflict.barcodeSerial, corruptedCode);
assert.equal(conflict.ocrSerial, sn);
assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: conflict } }), true);

const noisyOcr = reconcileNameplateSerial(candidate({ ocrSerial: '99999999999', ocrVotes: 1 }));
assert.equal(noisyOcr.status, 'single_source');
assert.equal(noisyOcr.serialNumber, sn, 'One noisy OCR vote must not override barcode.');
const noSnLabel = reconcileNameplateSerial(candidate({ ocrRawText: `MODEL I50Xi R14\n${sn}` }));
assert.equal(noSnLabel.status, 'single_source');
const lowConfidence = reconcileNameplateSerial(candidate({ ocrConfidence: 40 }));
assert.equal(lowConfidence.status, 'single_source');

const onlyPrinted = reconcileNameplateSerial(candidate({ barcodeSerial: '' }));
assert.equal(onlyPrinted.status, 'single_source');
assert.equal(onlyPrinted.serialNumber, sn);
const onlyBarcode = reconcileNameplateSerial(candidate({ ocrSerial: '', ocrVotes: 0 }));
assert.equal(onlyBarcode.status, 'single_source');
assert.equal(onlyBarcode.serialNumber, sn);
const absent = reconcileNameplateSerial(candidate({ barcodeSerial: '', ocrSerial: '' }));
assert.equal(absent.status, 'missing');
assert.equal(absent.serialNumber, '');
assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: onlyBarcode } }), true);

assert.equal(withNameplateAiSerialCandidate(conflict, sn).status, 'conflict', 'AI must never hide an independent disagreement.');
assert.equal(withNameplateAiSerialCandidate(onlyPrinted, sn).status, 'single_source', 'AI receiving barcode context must not become a second independent vote.');
const aiOnly = withNameplateAiSerialCandidate(absent, sn);
assert.equal(aiOnly.status, 'single_source');
assert.equal(aiOnly.serialNumber, sn);
const trustedAi = (serialNumber, confidence = 0.96, rawText = `S/N: ${serialNumber}`, uncertainCharacters = []) => ({
  aiResult: {
    serial_number: serialNumber,
    confidence: { serial_number: confidence },
    raw_text: rawText,
    uncertain_characters: uncertainCharacters,
  },
});
const aiMatchesBarcode = resolveNameplateSerialWithVisualAi(conflict, trustedAi(corruptedCode));
assert.equal(aiMatchesBarcode.status, 'ai_resolved');
assert.equal(aiMatchesBarcode.serialNumber, corruptedCode);
assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: aiMatchesBarcode } }), false);
const aiMatchesOcr = resolveNameplateSerialWithVisualAi(conflict, trustedAi(sn));
assert.equal(aiMatchesOcr.status, 'ai_resolved');
assert.equal(aiMatchesOcr.serialNumber, sn);
assert.equal(resolveNameplateSerialWithVisualAi(conflict, trustedAi('98765432109')).status, 'conflict');
assert.equal(resolveNameplateSerialWithVisualAi(conflict, trustedAi(sn, 0.65)).status, 'conflict');
assert.equal(resolveNameplateSerialWithVisualAi(conflict, trustedAi(sn, 0.99, 'Model I50Xi R14')).status, 'conflict');
assert.equal(resolveNameplateSerialWithVisualAi(conflict, trustedAi(sn, 0.99, `S/N: ${sn}`, ['0/O'])).status, 'conflict');
assert.equal(resolveNameplateSerialWithVisualAi(absent, trustedAi(sn)).status, 'single_source', 'AI alone never becomes confirmed');
const barcodeAndAi = resolveNameplateSerialWithVisualAi(onlyBarcode, trustedAi(sn));
assert.equal(barcodeAndAi.status, 'ai_resolved');
const contradicted = resolveNameplateSerialWithVisualAi(onlyBarcode, trustedAi('98765432109'));
assert.equal(contradicted.status, 'conflict');
assert.equal(contradicted.serialNumber, '');

assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: confirmed }, serialManuallyChanged: true }), true);
assert.equal(requiresNameplateSerialReview({ reading: null }), true);

const reader = readFileSync('src/mobile791/modules/nameplate-reader.js', 'utf8');
const photo = readFileSync('src/mobile791/components/nameplate/NameplatePhotoCapture.jsx', 'utf8');
assert.match(reader, /scanDesktopNameplateBarcodes\(file/);
assert.match(reader, /scanDesktopNameplateSerialText\(file/);
assert.doesNotMatch(reader, /if \(!serialNumber\) \{\s*try \{\s*serialTextResult/, 'OCR must run even when barcode returned a serial.');
assert.match(reader, /const serialCheck = reconcileNameplateSerial/);
assert.match(reader, /const needsSerialAi = serialCheck\.status !== 'confirmed'/);
assert.match(reader, /visualSerialOnly: needsSerialAi/, 'AI must run blind for an unconfirmed serial.');
assert.match(reader, /resolveNameplateSerialWithVisualAi\(serialCheck, aiResult\)/);
const aiClient = readFileSync('src/modules/desktop-nameplate-ai.js', 'utf8');
assert.match(aiClient, /visualSerialOnly \? \{\} : barcodeInfo/);
assert.match(aiClient, /serialReadMode: visualSerialOnly \? 'visual_only'/);
const apiSource = readFileSync('api/read-nameplate-ai.js', 'utf8');
assert.match(apiSource, /!visualSerialOnly && Array\.isArray\(barcodeValues\)/);
assert.match(apiSource, /!visualSerialOnly && Array\.isArray\(barcodeDetections\)/);
assert.match(apiSource, /Przeczytaj wyłącznie nadrukowany numer/);
assert.match(photo, /serialCheck\?\.status === "ai_resolved"/);
assert.match(photo, /reading\.serialCheck\?\.status === 'conflict'/);
assert.match(photo, /requiresNameplateSerialReview\(verification\) && !verification\.serialReviewed/);
assert.match(photo, /Sprawdziłem numer SN znak po znaku/);
console.log('Nameplate dual-serial confirmation OK: match, conflict, weak OCR, missing data, AI, explicit review.');
