import assert from 'node:assert/strict';
import fs from 'node:fs';

// WAWIS 13.73 (decyzja właściciela 26.10.2026): płatne AI tabliczek tylko wtedy, gdy czytnik nie wystarczył.
const store = new Map();
globalThis.window = { localStorage: {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
} };

const { hasTrustedBarcodeSerial } = await import('../src/mobile791/modules/nameplate-reader.js');
const usage = await import('../src/mobile791/modules/nameplate-ai-usage.js');
const EAN = '5905567600791';

// 1. Numer z kodu kreskowego (sam albo zgodny z nadrukiem) → AI niepotrzebne.
assert.equal(hasTrustedBarcodeSerial({ status: 'single_source', serialNumber: 'IMOTO35XI2400012345', barcodeSerial: 'IMOTO35XI2400012345', ocrSerial: '' }, { ean: EAN }), true);
assert.equal(hasTrustedBarcodeSerial({ status: 'confirmed', serialNumber: 'ABC1234567', barcodeSerial: 'ABC1234567', ocrSerial: 'ABC1234567' }, {}), true);
// 2. Konflikt, brak numeru, numer tylko z OCR, EAN albo ciąg jak EAN → nadal AI.
assert.equal(hasTrustedBarcodeSerial({ status: 'conflict', serialNumber: '', barcodeSerial: 'ABC1234567', ocrSerial: 'ABC1234S67' }, {}), false);
assert.equal(hasTrustedBarcodeSerial({ status: 'missing' }, {}), false);
assert.equal(hasTrustedBarcodeSerial({ status: 'single_source', serialNumber: 'ABC1234567', barcodeSerial: '', ocrSerial: 'ABC1234567' }, {}), false);
assert.equal(hasTrustedBarcodeSerial({ status: 'single_source', serialNumber: EAN, barcodeSerial: EAN }, { ean: EAN }), false);
assert.equal(hasTrustedBarcodeSerial({ status: 'single_source', serialNumber: '590556760079', barcodeSerial: '590556760079' }, {}), false);
assert.equal(hasTrustedBarcodeSerial({ status: 'single_source', serialNumber: 'AB12', barcodeSerial: 'AB12' }, {}), false);

// 3. Licznik w Diagnostyce: dziś i 7 dni, stare wpisy usuwane.
const now = new Date('2026-10-26T09:00:00');
usage.recordNameplateAiUsage('ai', 'old', { now: new Date('2026-08-01T09:00:00') });
usage.recordNameplateAiUsage('ai', 'conflict', { now });
usage.recordNameplateAiUsage('skipped', 'barcode_serial', { now });
usage.recordNameplateAiUsage('skipped', 'confirmed', { now });
usage.recordNameplateAiUsage('cached', 'manual', { now });
usage.recordNameplateAiUsage('ai', 'manual', { now: new Date('2026-10-22T09:00:00') });
usage.recordNameplateAiUsage('bogus', 'x', { now });
const summary = usage.getNameplateAiUsageSummary({ now });
assert.deepEqual(summary.today, { ai: 1, skipped: 2, cached: 1 });
assert.deepEqual(summary.week, { ai: 2, skipped: 2, cached: 1 });
assert.ok(!store.get('wawis-nameplate-ai-usage-v1').includes('2026-08-01'), 'wpisy starsze niż 31 dni usuwane');

// 4. Ten sam kadr → ten sam klucz (treść pliku), wynik AI z pamięci; limit pamięci.
const bytes = new Uint8Array([1, 2, 3, 4, 5]);
const fileA = new Blob([bytes], { type: 'image/jpeg' });
const fileB = new Blob([bytes], { type: 'image/jpeg' });
const fileC = new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' });
const keyA = await usage.getNameplateImageKey(fileA, 'JZ');
assert.equal(keyA, await usage.getNameplateImageKey(fileB, 'JZ'));
assert.notEqual(keyA, await usage.getNameplateImageKey(fileC, 'JZ'));
assert.notEqual(keyA, await usage.getNameplateImageKey(fileA, 'JW'));
usage.rememberNameplateAiResult(keyA, { serialNumber: 'X1' });
assert.deepEqual(usage.getCachedNameplateAiResult(keyA), { serialNumber: 'X1' });
for (let i = 0; i < 40; i += 1) usage.rememberNameplateAiResult(`k${i}`, { i });
assert.equal(usage.getCachedNameplateAiResult(keyA), null, 'pamięć ograniczona do 30 zdjęć');

// 5. Statycznie: kolejność decyzji w czytniku i przycisk „Sprawdź przez AI”.
const reader = fs.readFileSync(new URL('../src/mobile791/modules/nameplate-reader.js', import.meta.url), 'utf8');
const skipIdx = reader.indexOf("hasTrustedBarcodeSerial(serialCheck, barcodeInfo)) {");
const aiIdx = reader.indexOf('readDesktopNameplateWithAi({');
const offlineIdx = reader.indexOf('if (isBrowserOffline()) {');
assert.ok(skipIdx > 0 && skipIdx < aiIdx && skipIdx < offlineIdx, 'pominięcie AI przed wywołaniem AI');
assert.match(reader, /if \(!forceAi && !isBrowserOffline\(\) && hasTrustedBarcodeSerial/);
assert.match(reader, /const aiResult = cachedAiResult \|\| await withTimeout\(/);
const capture = fs.readFileSync(new URL('../src/mobile791/components/nameplate/NameplatePhotoCapture.jsx', import.meta.url), 'utf8');
assert.match(capture, /data-testid="nameplate-ai-check"/);
assert.match(capture, /runNameplateReading\(verification\.file, \{ forceAi: true \}\)/);
// Potwierdzenie SN znak po znaku nadal wymagane, gdy numer pochodzi tylko z kodu.
const { requiresNameplateSerialReview } = await import('../src/mobile791/modules/nameplate-serial-verification.js');
assert.equal(requiresNameplateSerialReview({ reading: { serialCheck: { status: 'single_source' } } }), true);

console.log('smoke-nameplate-ai-saving-v1373: OK');
