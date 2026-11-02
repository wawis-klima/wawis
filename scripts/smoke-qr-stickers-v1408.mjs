// WAWIS 14.08 — naklejki QR urządzeń: wykonanie modułu qr-stickers.js, zgodność z wydrukowanymi kodami,
// przekierowanie 404.html i podłączenie w aplikacji (montaż, Urządzenia, adres z aparatu).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as qr from '../src/modules/qr-stickers.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------- 1. Normalizacja i format ----------
assert.equal(qr.normalizeQrStickerCode('https://wawis-klima.vercel.app/u/UYE8EYCQ'), 'UYE8EYCQ', 'Adres z naklejki.');
assert.equal(qr.normalizeQrStickerCode('https://wawis-klima.vercel.app/u/UYE8EYCQ/'), 'UYE8EYCQ');
assert.equal(qr.normalizeQrStickerCode('uye8-eycq'), 'UYE8EYCQ', 'Ręcznie wpisany numer.');
assert.equal(qr.normalizeQrStickerCode(' UYE8 EYCQ '), 'UYE8EYCQ');
assert.equal(qr.normalizeQrStickerCode('UYE8EYC0'), '', 'Cyfra 0 nie występuje na naklejkach.');
assert.equal(qr.normalizeQrStickerCode('UYE8EYCI'), '', 'Litera I nie występuje.');
assert.equal(qr.normalizeQrStickerCode('UYE8EYC'), '', 'Za krótki.');
assert.equal(qr.normalizeQrStickerCode('https://example.com/inne'), '');
assert.equal(qr.normalizeQrStickerCode('5905567608841'), '', 'EAN z tabliczki to nie naklejka.');
assert.equal(qr.formatQrStickerCode('UYE8EYCQ'), 'UYE8-EYCQ');
assert.equal(qr.formatQrStickerCode('zle'), '');

// ---------- 2. Wszystkie wydrukowane kody są akceptowane i zgodne z migracją ----------
const migration = read('supabase/migrations/20261102160000_qr_stickers_v1408.sql');
const printed = [];
for (const [batch, file] of [['partia-1', 'docs/naklejki-qr/partia-1-kody.csv'], ['partia-2', 'docs/naklejki-qr/partia-2-kody.csv']]) {
  const lines = read(file).trim().split(/\r?\n/).slice(1);
  assert.equal(lines.length, 162, `${batch}: 162 kody`);
  for (const line of lines) {
    const [, code, label, url] = line.split(';');
    assert.equal(qr.normalizeQrStickerCode(url), code, `QR ${url}`);
    assert.equal(qr.normalizeQrStickerCode(label), code, `numer ${label}`);
    assert.equal(qr.formatQrStickerCode(code), label);
    assert.ok(migration.includes(`('${code}','${batch}')`), `Kod ${code} w imporcie migracji`);
    printed.push(code);
  }
}
assert.equal(new Set(printed).size, 324, 'Brak powtórzeń między partiami.');
assert.equal((migration.match(/\('[2-9A-HJKMNP-Z]{8}','partia-[12]'\)/g) || []).length, 324, 'Migracja importuje dokładnie wydrukowane kody.');

// ---------- 3. Adres strony ----------
assert.equal(qr.readQrCodeFromLocation({ pathname: '/u/UYE8EYCQ', search: '' }), 'UYE8EYCQ');
assert.equal(qr.readQrCodeFromLocation({ pathname: '/', search: '?qr=UYE8EYCQ' }), 'UYE8EYCQ');
assert.equal(qr.readQrCodeFromLocation({ pathname: '/', search: '?jobId=1' }), '');
assert.equal(qr.readQrCodeFromLocation({ pathname: '/u/ZLYKOD00', search: '' }), '');

// 404.html: wykonanie skryptu przekierowania
const html = read('public/404.html');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const [path, expected] of [['/u/UYE8EYCQ', '/?qr=UYE8EYCQ'], ['/u/UYE8-EYCQ', '/?qr=UYE8-EYCQ'], ['/inne', null]]) {
  let replaced = null;
  vm.runInNewContext(script, { location: { pathname: path, replace: (to) => { replaced = to; } } });
  assert.equal(replaced, expected, `404.html ${path}`);
}

// ---------- 4. Wywołania RPC i komunikaty ----------
const calls = [];
const fake = (data, error = null) => ({ rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } });
await qr.assignQrStickerToJobDevice({ supabase: fake({ ok: true }), code: 'uye8-eycq', jobId: 'job-1', deviceIndex: '2' });
assert.deepEqual(calls.at(-1), ['qr_sticker_assign_job_device', { p_code: 'UYE8EYCQ', p_job_id: 'job-1', p_device_index: 2 }]);
await qr.assignQrStickerToDevice({ supabase: fake({ ok: true }), code: 'UYE8EYCQ', deviceId: 'dev', replace: true });
assert.deepEqual(calls.at(-1), ['qr_sticker_assign_device', { p_code: 'UYE8EYCQ', p_device_id: 'dev', p_replace: true }]);
assert.deepEqual(await qr.loadJobQrStickers({ supabase: fake([{ device_index: 2, code: 'BNKJXZDY' }]), jobId: 'job-1' }), { 2: 'BNKJXZDY' });
assert.deepEqual(await qr.loadDeviceQrStickers({ supabase: fake([{ device_id: 'd1', code: 'BNKJXZDY' }]), deviceIds: ['d1', 'd1', null] }), { d1: 'BNKJXZDY' });
assert.deepEqual(calls.at(-1)[1], { p_device_ids: ['d1'] });
await assert.rejects(qr.lookupQrSticker({ supabase: fake(null, { message: 'Could not find the function public.qr_sticker_lookup (PGRST202)' }), code: 'UYE8EYCQ' }),
  /nie są jeszcze włączone w bazie/, 'Przed migracją: czytelny komunikat.');
assert.match(qr.describeQrAssignFailure({ reason: 'sticker_taken', code: 'UYE8EYCQ', can_replace: false, device: { client: 'Kowalski', city: 'Zawiercie', device_index: 1 } }),
  /UYE8-EYCQ jest już przypisana: Kowalski · Zawiercie · Urządzenie 1\. Przepisać ją może tylko administrator\./);
assert.match(qr.describeQrAssignFailure({ reason: 'device_has_sticker', existing_code: 'BNKJXZDY', can_replace: false }), /BNKJ-XZDY/);
assert.match(qr.describeQrAssignFailure({ reason: 'device_not_saved' }), /nie jest jeszcze zapisane/);
assert.match(qr.describeQrAssignFailure({ reason: 'unknown_code', code: 'ZZZZZZZZ' }), /nie pochodzi z naklejek WAWIS/);

// ---------- 5. Podłączenie w aplikacji ----------
const details = read('src/mobile791/components/JobDetailsPanel.jsx');
assert.match(details, /useJobQrStickers\(\{ supabase, jobId: selectedJobId/);
assert.match(details, /canAssign=\{canEditSelectedJob && !selectedJob\?\.offline_pending\}/, 'Pracownik przypisuje tylko w montażu, który może edytować.');
assert.doesNotMatch(read('src/mobile791/modules/nameplate-requirements.js'), /qr/i, 'Naklejka nie jest wymagana do zakończenia montażu.');
const app = read('src/mobile791/App.jsx');
assert.match(app, /readQrCodeFromLocation\(\)/);
assert.match(app, /profile && qrResolverCode \?/, 'Wynik naklejki dopiero po zalogowaniu.');
assert.match(app, /onOpenDevices=\{isAdmin && isMobile \?/, 'Urządzenia klienta tylko dla administratora.');
const service = read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
assert.match(service, /Skanuj naklejkę QR/);
assert.match(service, /assignQrStickerToDevice\(\{ supabase, code, deviceId: device\.id \}\)/);
assert.match(service, /if \(!window\.confirm\(question\)\) throw new Error/, 'Przepisanie tylko po potwierdzeniu.');
const scanner = read('src/mobile791/components/qr/QrStickerScanner.jsx');
assert.match(scanner, /getUserMedia\(\{ video: \{ facingMode: \{ ideal: 'environment' \} \}, audio: false \}\)/);
assert.match(scanner, /stopCamera\(\)/);
assert.match(scanner, /Brak internetu/);
const barcode = read('src/modules/desktop-nameplate-barcode.js');
assert.match(barcode, /formats: \['qr_code'\]/);

console.log('WAWIS 14.08 QR stickers: PASS');
