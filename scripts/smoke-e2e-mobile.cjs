const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const playwrightConfig = read('playwright.config.js');
const runner = read('scripts', 'run-playwright-mobile.cjs');
const spec = read('tests', 'e2e', 'mobile-photo-two-sessions.spec.js');
const nameplateSpec = read('tests', 'e2e', 'mobile-serial-scanner.spec.js');
const resilienceSpec = read('tests', 'e2e', 'mobile-resilience.spec.js');
const protocolSpec = read('tests', 'e2e', 'mobile-protocol-test.spec.js');
const visualSpec = read('tests', 'e2e', 'release-visual-checks.spec.js');
const helper = read('tests', 'e2e', 'mock-helpers.js');
const mock = read('src', 'mobile791', 'lib', 'mockSupabaseClient.js');

assert.equal(packageJson.scripts['test:e2e:mobile'], 'node scripts/run-playwright-mobile.cjs');
assert.equal(packageJson.scripts['test:smoke:e2e-mobile'], 'node scripts/smoke-e2e-mobile.cjs');
assert.match(runner, /--grep/);
assert.match(runner, /@mobile/);
assert.match(runner, /'--workers',\s*'1'/);
assert.match(runner, /VITE_SUPABASE_MODE: 'mock'/);
assert.match(playwrightConfig, /--use-fake-device-for-media-stream/);
assert.match(playwrightConfig, /--use-fake-ui-for-media-stream/);

// Dwie sesje + Multi-Split muszą być sprawdzane na aktualnym, zwijanym widoku urządzeń.
assert.match(spec, /devices\['iPhone 14'\]/);
assert.match(spec, /browser\.newContext/);
assert.match(spec, /workerPage/);
assert.match(spec, /adminPage/);
assert.match(spec, /setInputFiles/);
assert.match(spec, /Klient Testowy Multi-Split/);
assert.match(spec, /Urządzenia i tabliczki/);
assert.match(spec, /Rozwiń Urządzenie 1/);
assert.match(spec, /deviceUnitDocumentationRow/);
assert.match(spec, /Rotenso Model JW 3 \(TEST\)/);
assert.match(spec, /device_model/);
assert.match(helper, /loginWithoutReset/);
assert.match(mock, /sessionStorage/);
assert.match(mock, /MOCK_STORE_KEY/);
assert.match(mock, /window\.addEventListener\('storage'/);
assert.match(mock, /klima-mock-supabase-store-v3/);
assert.match(mock, /JW1: Rotenso Model JW 1 \(TEST\) \| JW2: Rotenso Model JW 2 \(TEST\) \| JW3: Rotenso Model JW 3 \(TEST\) \| JZ: Rotenso Multi-Split JZ \(TEST\)/);
assert.match(mock, /JW1: TEST-MULTI-JW-1 \| JW2: TEST-MULTI-JW-2 \| JW3: TEST-MULTI-JW-3 \| JZ: TEST-MULTI-JZ-1/);

// Dokumentacja tabliczek jest dziś przepływem po utworzeniu montażu: tabela szczegółów + kreator brakujących tabliczek.
assert.match(nameplateSpec, /devices\['iPhone 14'\]/);
assert.match(nameplateSpec, /uproszczony kreator urządzeń bez OCR/);
assert.match(nameplateSpec, /nameplateGalleryInput/);
assert.match(nameplateSpec, /selectNameplateAndCrop/);
assert.match(nameplateSpec, /Dopasuj kadr/);
assert.match(nameplateSpec, /Zapisz kadr/);
assert.match(nameplateSpec, /deviceUnitDocumentationRow/);
assert.match(nameplateSpec, /Rozwiń Urządzenie 1/);
assert.match(nameplateSpec, /Zwiń Urządzenie 1/);
assert.match(nameplateSpec, /toHaveAttribute\('aria-expanded', 'false'\)/);
assert.match(nameplateSpec, /Otwórz tabliczkę znamionową JZ/);
assert.match(nameplateSpec, /mobileDeviceWizard/);
assert.match(nameplateSpec, /Tryb: Multi/);
assert.match(nameplateSpec, /Nie można zakończyć zlecenia/);
assert.match(nameplateSpec, /Dodaj brakujące tabliczki/);
assert.match(nameplateSpec, /Zapisz montaż/);
assert.match(nameplateSpec, /Wszystkie wymagane zdjęcia tabliczek są zapisane/);
assert.match(nameplateSpec, /toBeDisabled/);
assert.match(nameplateSpec, /toBeEnabled/);
assert.match(nameplateSpec, /name: 'Zakończ', exact: true/);
assert.match(nameplateSpec, /Zakończone · tylko podgląd/);

// Odporność kolejki, aktualne Centrum synchronizacji i historia zakończonych montaży.
assert.match(resilienceSpec, /wawis-mobile-photo-queue/);
assert.match(resilienceSpec, /Zapisano na telefonie/);
assert.match(resilienceSpec, /page\.reload\(\)/);
assert.match(resilienceSpec, /Wszystko wysłane/);
assert.match(resilienceSpec, /countQueuedPhotos/);
assert.match(resilienceSpec, /Otwórz Centrum synchronizacji/);
assert.match(resilienceSpec, /Rozwiń Urządzenie 1/);
assert.match(resilienceSpec, /Komentarze i pytania/);
assert.match(resilienceSpec, /Historia komentarza zakończonego zlecenia/);

// Protokół po zakończeniu + precyzyjne rozróżnienie akcji Zakończ od statusu Zakończone.
assert.match(protocolSpec, /@mobile protokół po zakończeniu zlecenia/);
assert.match(protocolSpec, /protokół nie jest dostępny przed zakończeniem zlecenia/);
assert.match(protocolSpec, /pracownik tworzy protokół, wysyła go z biuro@wawis\.pl i pobiera PDF/);
assert.match(protocolSpec, /administrator na telefonie również tworzy protokół tylko dla zakończonego zlecenia/);
assert.match(protocolSpec, /name: 'Zakończ', exact: true/);
assert.match(protocolSpec, /mobileProtocolWizard/);
assert.match(protocolSpec, /Zapisz protokół/);
assert.match(protocolSpec, /job_protocols/);
assert.match(protocolSpec, /Wyślij z biuro@wawis\.pl/);
assert.match(protocolSpec, /job_protocol_email_log/);

// Pracownik mobilny nie ma panelu Diagnostyka; wizualny release check ma tego pilnować.
assert.match(visualSpec, /name: 'Diagnostyka'/);
assert.match(visualSpec, /toHaveCount\(0\)/);

console.log('Mobile iPhone E2E wiring smoke OK: current 10.60 device, sync, protocol and worker flows');
