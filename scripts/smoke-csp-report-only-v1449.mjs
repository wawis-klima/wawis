// WAWIS 14.49 — pełna polityka CSP w trybie Report-Only + Permissions-Policy (audyt 20.11.2026, decyzja właściciela).
// RED na 14.48: vercel.json ma tylko `frame-ancestors 'self'` — brak ograniczeń skryptów, połączeń, obrazów i workerów
// oraz brak Permissions-Policy; zdarzenia `securitypolicyviolation` nie trafiają do diagnostyki.
// Report-Only: przeglądarka niczego nie blokuje (aparat, mikrofon, OCR, PDF, czytnik kodów działają jak dotąd),
// a każde źródło spoza listy trafia do diagnostyki jako `app.csp.<dyrektywa>.<źródło>.warning` bez adresu URL.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {
  CSP_SUPABASE_HOST,
  buildCspViolationEventType,
  classifyCspBlockedSource,
  installCspViolationDiagnostics,
  normalizeCspDirective,
} from '../src/modules/csp-violation-diagnostics.js';
import { getSafeDiagnosticDetails } from '../src/modules/diagnostic-error-codes.js';
import { sanitizeDiagnosticEntry } from '../src/modules/diagnostic-privacy.js';
import { getDiagnosticSeverity } from '../src/modules/diagnostics-core.js';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
const reportOnly = headers['content-security-policy-report-only'];
assert.ok(reportOnly, 'jest nagłówek Content-Security-Policy-Report-Only');
assert.equal(headers['content-security-policy'], "frame-ancestors 'self'", 'wymuszana CSP bez zmian (tylko osadzanie)');

const policy = new Map(reportOnly.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const [name, ...sources] = part.split(/\s+/);
  return [name, sources];
}));
const has = (directive, source) => (policy.get(directive) || []).includes(source);
for (const directive of ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'media-src',
  'worker-src', 'frame-src', 'manifest-src', 'object-src', 'base-uri', 'form-action']) {
  assert.ok(policy.has(directive), `dyrektywa ${directive}`);
}
assert.equal(policy.has('frame-ancestors'), false, 'frame-ancestors jest ignorowane w Report-Only — zostaje w wymuszanej CSP');
assert.deepEqual(policy.get('object-src'), ["'none'"]);
assert.ok(!has('script-src', "'unsafe-inline'") && !has('script-src', "'unsafe-eval'"), 'skrypty bez unsafe-inline/unsafe-eval');
assert.ok(has('script-src', "'wasm-unsafe-eval'"), 'OCR (Tesseract WASM) i czytnik kodów (zxing WASM)');

// Skrypt startowy w index.html (raport startu) musi mieć poprawny hash — każda jego zmiana wymaga nowego hasha.
const indexHtml = fs.readFileSync('index.html', 'utf8');
const inlineScripts = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(inlineScripts.length >= 1, 'index.html ma skrypt startowy');
for (const body of inlineScripts) {
  const hash = `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  assert.ok(has('script-src', hash), `script-src zawiera hash skryptu inline z index.html (${hash})`);
}

// Supabase: REST, Storage (podpisane linki do zdjęć/PDF), Edge Functions i Realtime.
const supabaseOrigin = `https://${CSP_SUPABASE_HOST}`;
const migrationsUsingProject = fs.readFileSync('supabase/migrations/20261103140000_sms_queue_daily_v1417.sql', 'utf8');
assert.ok(migrationsUsingProject.includes(CSP_SUPABASE_HOST), 'host Supabase w CSP = host projektu produkcyjnego');
for (const directive of ['connect-src', 'img-src', 'frame-src']) assert.ok(has(directive, supabaseOrigin), `${directive}: Supabase`);
assert.ok(has('connect-src', `wss://${CSP_SUPABASE_HOST}`), 'connect-src: Realtime (wss)');

// Zewnętrzne adresy faktycznie używane przez kod przeglądarki.
const weather = fs.readFileSync('src/modules/weather-daily-mean.js', 'utf8');
const weatherOrigins = [...weather.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((match) => match[0]);
assert.ok(weatherOrigins.length >= 3, 'adresy Open-Meteo w kodzie');
for (const origin of weatherOrigins) assert.ok(has('connect-src', origin), `connect-src: ${origin}`);
const barcode = fs.readFileSync('src/modules/desktop-nameplate-barcode.js', 'utf8');
const barcodeOrigin = barcode.match(/https:\/\/[a-z0-9.-]+/)[0];
assert.ok(has('script-src', barcodeOrigin), `script-src: czytnik kodów ${barcodeOrigin}`);
const pushSw = fs.readFileSync('public/push-sw.js', 'utf8');
const cdnHosts = JSON.parse(pushSw.match(/NAMEPLATE_READER_CDN_HOSTS = (\[[^\]]+\])/)[1]);
for (const host of cdnHosts) {
  assert.ok(has('script-src', `https://${host}`) && has('connect-src', `https://${host}`), `CDN czytnika: ${host}`);
}
// Podgląd PDF (blob:), zdjęcia i miniatury (blob:/data:), workery pdf.js i Tesseract z /ocr/.
assert.ok(has('frame-src', 'blob:') && has('img-src', 'blob:') && has('img-src', 'data:'), 'blob:/data: dla PDF i zdjęć');
assert.ok(has('worker-src', "'self'") && has('worker-src', 'blob:'), 'workery OCR i pdf.js');
assert.ok(has('style-src', "'unsafe-inline'"), 'style inline React (style={{…}}) i <style> w index.html');

// Permissions-Policy: aparat (QR, tabliczki) i mikrofon (dyktowanie) dla aplikacji; reszta wyłączona.
const permissions = new Map(headers['permissions-policy'].split(',').map((part) => part.trim().split('=')));
assert.equal(permissions.get('camera'), '(self)');
assert.equal(permissions.get('microphone'), '(self)');
for (const feature of ['geolocation', 'payment', 'usb', 'serial', 'bluetooth', 'display-capture']) {
  assert.equal(permissions.get(feature), '()', `${feature} wyłączone`);
}
const appSources = ['src/mobile791/components/qr/QrStickerScanner.jsx', 'src/modules/client-voice-input.js']
  .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert.match(appSources, /getUserMedia/, 'aparat używany przez skaner QR');
assert.match(appSources, /SpeechRecognition/, 'mikrofon używany przez dyktowanie');
assert.doesNotMatch(fs.readFileSync('src/modules/weather-daily-mean.js', 'utf8'), /navigator\.geolocation/, 'aplikacja nie używa lokalizacji');

// Klasyfikacja zgłoszeń: zamknięte listy, nigdy adres ani ścieżka.
const origin = 'https://wawis-klima.vercel.app';
assert.equal(classifyCspBlockedSource('inline', origin), 'inline');
assert.equal(classifyCspBlockedSource('eval', origin), 'eval');
assert.equal(classifyCspBlockedSource('wasm-eval', origin), 'wasm-eval');
assert.equal(classifyCspBlockedSource('blob', origin), 'blob');
assert.equal(classifyCspBlockedSource('data', origin), 'data');
assert.equal(classifyCspBlockedSource(`${origin}/ocr/worker.min.js`, origin), 'self');
assert.equal(classifyCspBlockedSource(`https://${CSP_SUPABASE_HOST}/storage/v1/object/sign/job-photos/x.jpg?token=abc`, origin), 'supabase');
assert.equal(classifyCspBlockedSource(`wss://${CSP_SUPABASE_HOST}/realtime/v1/websocket`, origin), 'supabase-realtime');
assert.equal(classifyCspBlockedSource('https://cdn.jsdelivr.net/npm/zxing-wasm@2/dist/reader.wasm', origin), 'jsdelivr');
assert.equal(classifyCspBlockedSource('https://api.open-meteo.com/v1/forecast?latitude=50', origin), 'open-meteo');
assert.equal(classifyCspBlockedSource('https://evil.example/steal?phone=48600111222', origin), 'external');
assert.equal(classifyCspBlockedSource('', origin), 'unknown');
assert.equal(classifyCspBlockedSource('chrome-extension://abc/x.js', origin), 'other');
assert.equal(normalizeCspDirective('script-src-elem'), 'script-src-elem');
assert.equal(normalizeCspDirective("script-src 'self'"), 'script-src');
assert.equal(normalizeCspDirective('made-up-directive'), 'other');
const leakType = buildCspViolationEventType({ effectiveDirective: 'connect-src', blockedURI: 'https://evil.example/a/b?klient=Jan%20Kowalski' }, origin);
assert.equal(leakType, 'app.csp.connect-src.external.warning');
assert.doesNotMatch(leakType, /evil|klient|kowalski|\/|:/i, 'typ zdarzenia bez adresu i danych');

// Nasłuch: jedno zgłoszenie danego rodzaju na sesję strony, zapis przechodzi przez filtr prywatności.
const target = new EventTarget();
const logged = [];
const uninstall = installCspViolationDiagnostics((type, payload) => logged.push({ type, payload }), target);
const fire = (props) => target.dispatchEvent(Object.assign(new Event('securitypolicyviolation'), props));
fire({ effectiveDirective: 'script-src-elem', blockedURI: 'inline' });
fire({ effectiveDirective: 'script-src-elem', blockedURI: 'inline' });
fire({ effectiveDirective: 'connect-src', blockedURI: `https://${CSP_SUPABASE_HOST}/rest/v1/jobs?select=*` });
fire({ violatedDirective: 'worker-src', blockedURI: 'blob' });
assert.deepEqual(logged.map((entry) => entry.type), [
  'app.csp.script-src-elem.inline.warning',
  'app.csp.connect-src.supabase.warning',
  'app.csp.worker-src.blob.warning',
], 'deduplikacja na sesję strony');
uninstall();
fire({ effectiveDirective: 'img-src', blockedURI: 'data' });
assert.equal(logged.length, 3, 'po odinstalowaniu brak zapisów');
const flood = new EventTarget();
const floodLog = [];
installCspViolationDiagnostics((type) => floodLog.push(type), flood);
const sources = ['inline', 'eval', 'blob', 'data', 'about', 'self', 'unknown', 'external', 'other'];
for (const directive of ['default-src', 'script-src', 'script-src-elem', 'style-src', 'img-src', 'font-src', 'connect-src']) {
  for (const source of sources) flood.dispatchEvent(Object.assign(new Event('securitypolicyviolation'), {
    effectiveDirective: directive, blockedURI: source === 'external' ? 'https://x.example/' : source === 'other' ? 'ftp-x' : source,
  }));
}
assert.ok(floodLog.length <= 40, 'najwyżej 40 rodzajów zgłoszeń na sesję');
assert.equal(installCspViolationDiagnostics(() => {}, null)(), undefined, 'brak document (testy/SSR) nie rzuca');

for (const { type, payload } of logged) {
  const entry = sanitizeDiagnosticEntry({ id: 'diag-csp-0001', time: '2026-11-20T18:00:00.000Z', type, payload });
  assert.equal(entry.type, type, `filtr prywatności przepuszcza typ ${type}`);
  assert.equal(entry.payload.code, 'CSP_REPORT_ONLY_VIOLATION');
  assert.equal(getSafeDiagnosticDetails(entry).code, 'CSP_REPORT_ONLY_VIOLATION', 'kod wysyłany do bazy');
  assert.equal(getDiagnosticSeverity(entry), 'warning', 'ostrzeżenie trafia do synchronizacji diagnostyki');
}
assert.equal(getSafeDiagnosticDetails({ type: 'app.csp.connect-src.external.warning', payload: {} }).code,
  'CSP_REPORT_ONLY_VIOLATION', 'kod rozpoznany także po samym typie');

// Oba interfejsy (komputer i telefon) instalują nasłuch razem z pozostałymi globalnymi handlerami.
for (const file of ['src/modules/diagnostics.js', 'src/mobile791/modules/diagnostics.js']) {
  const source = fs.readFileSync(file, 'utf8');
  const install = source.indexOf('export function installGlobalDiagnosticHandlers');
  assert.ok(install > 0, `${file}: installGlobalDiagnosticHandlers`);
  assert.ok(source.indexOf('installCspViolationDiagnostics(logDiagnostic)', install) > install, `${file}: nasłuch CSP`);
}

console.log('PASS WAWIS 14.49 — CSP Report-Only (Supabase, Open-Meteo, jsDelivr, OCR/WASM, blob:, hash skryptu startowego), Permissions-Policy (aparat i mikrofon dla aplikacji), zgłoszenia CSP w diagnostyce bez adresów.');
