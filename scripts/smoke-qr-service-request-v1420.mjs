// WAWIS 14.20 — zgłoszenia klientów z naklejki QR: logika, PRAWDZIWY handler Edge (vm + atrapy), strona startowa,
// migracja. RED na 14.19: brak funkcji qr-service-request i strony klienta (niezalogowany widział logowanie).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import * as logic from '../supabase/functions/qr-service-request/logic.ts';
import * as push from '../supabase/functions/qr-service-request/push.ts';
import { shouldShowPublicQrPage, hasStoredWawisSession, STAFF_LOGIN_FLAG } from '../src/public-qr/public-qr-api.js';

// ---------- 1. Logika ----------
assert.equal(logic.normalizeCode('uye8-eycq'), 'UYE8EYCQ');
assert.equal(logic.normalizeCode('https://wawis-klima.vercel.app/u/UYE8EYCQ'), 'UYE8EYCQ');
assert.equal(logic.normalizeCode('UYE8EYC0'), '', 'znak spoza alfabetu naklejek');
assert.equal(logic.normalizePhone('600 100 200'), '48600100200');
assert.equal(logic.normalizePhone('+48 600-100-200'), '48600100200');
assert.equal(logic.normalizePhone('12345'), '');
assert.equal(logic.normalizePhone('600100200; drop'), '');

const ok = logic.validateSubmission({ kind: 'awaria', description: '  Nie chłodzi,\u0000 kapie  woda ', phone: '600100200' });
assert.deepEqual(ok, { ok: true, value: { kind: 'awaria', description: 'Nie chłodzi, kapie woda', phone: '48600100200' } });
assert.equal(logic.validateSubmission({ kind: 'awaria', description: 'abc', phone: '600100200' }).field, 'description', 'awaria wymaga opisu');
assert.equal(logic.validateSubmission({ kind: 'przeglad', description: '', phone: '600100200' }).ok, true, 'przegląd bez opisu');
assert.equal(logic.validateSubmission({ kind: 'inne', description: 'xxxxxx', phone: '600100200' }).field, 'kind');
assert.equal(logic.validateSubmission({ kind: 'przeglad', description: '', phone: '12' }).field, 'phone');
assert.equal(logic.validateSubmission({ kind: 'przeglad', description: 'x'.repeat(1001), phone: '600100200' }).field, 'description');
assert.equal(logic.validateSubmission({ kind: 'przeglad', phone: '600100200', website: 'http://spam' }).ok, false, 'pole-pułapka');

// Termin przeglądu: 11 mies. po montażu, potem co 12; trwający termin do 62 dni po dacie.
assert.equal(logic.nextInspectionDate('2025-07-14', '2026-11-03'), '2027-06-14');
assert.equal(logic.nextInspectionDate('2025-11-20', '2026-11-03'), '2026-10-20', 'termin sprzed 14 dni jeszcze trwa');
assert.equal(logic.nextInspectionDate('2026-10-30', '2026-11-03'), '2027-09-30');
assert.equal(logic.nextInspectionDate('2024-03-31', '2026-11-03'), '2027-02-28', 'koniec miesiąca');
assert.equal(logic.nextInspectionDate('', '2026-11-03'), '');

// Publiczne dane: tylko bezpieczne pola — nigdy nazwisko, adres, numer seryjny.
const info = logic.buildPublicInfo({
  code: 'UYE8EYCQ',
  device: { model: 'Rotenso Imoto 3.5', installation_date: '2025-11-20', contractor_id: 'x', serial_number: 'SECRET', company_name: 'Jan Kowalski' },
  settings: { company_name: 'WaWis-Klima', service_phone: '606553984' },
  todayIso: '2026-11-03',
});
assert.deepEqual(Object.keys(info).sort(), ['assigned', 'code', 'company', 'inspectionDueNow', 'installationDate', 'model', 'nextInspection', 'ok', 'phone', 'phoneHref'].sort());
assert.equal(info.phone, '606 553 984');
assert.equal(info.phoneHref, '+48606553984');
assert.equal(info.nextInspection, '20.10.2026');
assert.equal(info.inspectionDueNow, true);
assert.ok(!JSON.stringify(info).includes('SECRET') && !JSON.stringify(info).includes('Kowalski'));
const free = logic.buildPublicInfo({ code: 'BNKJXZDY', device: null, settings: null, todayIso: '2026-11-03' });
assert.equal(free.assigned, false);
assert.equal(free.model, '');
assert.equal(free.company, 'WAWIS Klimatyzacja');

assert.equal(logic.rateLimitError({ perCode: 2, perIp: 4, global: 19 }), '');
assert.match(logic.rateLimitError({ perCode: 3, perIp: 0, global: 0 }), /już do nas dotarło/);
assert.match(logic.rateLimitError({ perCode: 0, perIp: 5, global: 0 }), /już do nas dotarło/);
assert.match(logic.rateLimitError({ perCode: 0, perIp: 0, global: 20 }), /Chwilowo/);
const msg = logic.buildAdminPush({ kind: 'awaria', model: 'Rotenso Imoto', contractorName: 'Jan Nowak', city: '42-400 Zawiercie', phone: '48600100200', description: 'Nie chłodzi' });
assert.equal(msg.title, 'Nowe zgłoszenie: Awaria');
assert.equal(msg.body, 'Rotenso Imoto — Jan Nowak, Zawiercie. Tel. 600 100 200. Nie chłodzi');

// ---------- 2. Prawdziwy handler Edge ----------
const STICKERS = { UYE8EYCQ: 'dev-1', BNKJXZDY: null };
function makeAdmin({ counts = {}, insertFails = false, subscriptions = 1 } = {}) {
  const calls = { inserts: [], updates: [], rpc: [] };
  const client = {
    calls,
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: name === 'push_claim_delivery_v1268' ? true : null, error: null }; },
    from(table) {
      const st = { table, filters: {}, head: false };
      const q = {
        select(_c, opts) { if (opts?.head) st.head = true; return q; },
        eq(k, v) { st.filters[k] = v; return q; }, gte(k, v) { st.filters[`${k}>=`] = v; return q; },
        in() { return q; }, order() { return q; }, limit() { return q; },
        maybeSingle() { st.single = true; return q; }, single() { st.single = true; return q; },
        insert(row) { calls.inserts.push({ table, row }); st.insert = row; return q; },
        update(patch) { calls.updates.push({ table, patch }); return q; },
        then(resolve) {
          if (table === 'qr_stickers') {
            const code = st.filters.code;
            return resolve({ data: code in STICKERS ? { code, device_id: STICKERS[code] } : null, error: null });
          }
          if (table === 'devices') return resolve({ data: { id: 'dev-1', model: 'Rotenso Imoto', installation_date: '2025-11-20', contractor_id: 'c-1', serial_number: 'SECRET' }, error: null });
          if (table === 'sms_settings') return resolve({ data: { company_name: 'WaWis-Klima', service_phone: '606553984' }, error: null });
          if (table === 'contractors') return resolve({ data: { company_name: 'Jan Nowak', city: '42-400 Zawiercie' }, error: null });
          if (table === 'service_requests') {
            if (st.head) {
              const key = st.filters.qr_code ? 'perCode' : st.filters.ip_hash ? 'perIp' : 'global';
              return resolve({ count: counts[key] || 0, error: null });
            }
            if (st.insert) return resolve(insertFails ? { data: null, error: { message: 'x' } } : { data: { id: 'req-1' }, error: null });
            return resolve({ data: null, error: null });
          }
          if (table === 'profiles') return resolve({ data: [{ id: 'admin-1' }], error: null });
          if (table === 'push_subscriptions') return resolve({ data: Array.from({ length: subscriptions }, (_, i) => ({ id: `s${i}`, user_id: 'admin-1', endpoint: `https://push.example/${i}`, p256dh: 'k', auth: 'a', ownership_generation: 1 })), error: null });
          if (table === 'push_delivery_log') return resolve({ data: st.insert ? { id: 'log-1' } : null, error: null });
          return resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return client;
}
function makeWebpush() { const sent = []; return { sent, setVapidDetails() {}, async sendNotification(sub, payload) { sent.push(JSON.parse(payload)); } }; }
function loadHandler(adminClient, webpush) {
  const source = fs.readFileSync(new URL('../supabase/functions/qr-service-request/index.ts', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '');
  let handler = null;
  const context = {
    Deno: { env: { get: (n) => (n === 'SUPABASE_URL' ? 'https://x.supabase.co' : `fixture-${n}`) }, serve: (fn) => { handler = fn; } },
    createClient: () => adminClient, webpush,
    buildAdminPush: logic.buildAdminPush, buildPublicInfo: logic.buildPublicInfo, normalizeCode: logic.normalizeCode,
    rateLimitError: logic.rateLimitError, validateSubmission: logic.validateSubmission, warsawToday: logic.warsawToday,
    sendAdminPush: push.sendAdminPush,
    Response, Request, URL, Intl, Date, JSON, Math, Number, String, Array, Object, Promise, Error, Map, Set, console, crypto, TextEncoder, Uint8Array,
  };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source), context);
  return handler;
}
const post = (body, headers = {}) => new Request('https://local.invalid/fn', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers }, body: JSON.stringify(body) });
const run = async (body, opts = {}) => {
  const admin = makeAdmin(opts); const webpush = makeWebpush();
  const res = await loadHandler(admin, webpush)(typeof body === 'string' ? new Request('https://local.invalid/fn', { method: body }) : post(body));
  return { res, json: await res.json().catch(() => null), admin, webpush };
};

{ const { res } = await run('GET'); assert.equal(res.status, 405); }
{ const { res, json } = await run({ action: 'info', code: 'ZZZZZZZZ' }); assert.equal(res.status, 404); assert.equal(json.error, 'Nieznana naklejka.'); }
{ const { res } = await run({ action: 'info', code: '<script>' }); assert.equal(res.status, 404); }
{ // informacje: bez nazwiska, adresu, numeru seryjnego
  const { res, json } = await run({ action: 'info', code: 'uye8-eycq' });
  assert.equal(res.status, 200);
  assert.equal(json.model, 'Rotenso Imoto');
  assert.equal(json.phone, '606 553 984');
  assert.ok(!JSON.stringify(json).match(/SECRET|Jan Nowak|Zawiercie|c-1|dev-1/), JSON.stringify(json));
}
{ const { res, json, admin } = await run({ action: 'submit', code: 'UYE8EYCQ', kind: 'awaria', description: 'abc', phone: '600100200' });
  assert.equal(res.status, 422); assert.equal(json.field, 'description'); assert.equal(admin.calls.inserts.length, 0); }
{ const { res, admin } = await run({ action: 'submit', code: 'UYE8EYCQ', kind: 'przeglad', phone: '600100200', website: 'x' });
  assert.equal(res.status, 422); assert.equal(admin.calls.inserts.length, 0, 'robot: bez zapisu'); }
{ const { res, json, admin, webpush } = await run({ action: 'submit', code: 'UYE8EYCQ', kind: 'przeglad', phone: '600100200' }, { counts: { perCode: 3 } });
  assert.equal(res.status, 429); assert.match(json.error, /już do nas dotarło/); assert.equal(admin.calls.inserts.length, 0); assert.equal(webpush.sent.length, 0); }
{ const { res } = await run({ action: 'submit', code: 'UYE8EYCQ', kind: 'przeglad', phone: '600100200' }, { counts: { global: 20 } });
  assert.equal(res.status, 429); }
{ // poprawne zgłoszenie: zapis + jedno powiadomienie z danymi klienta (tylko dla administratora)
  const { res, json, admin, webpush } = await run({ action: 'submit', code: 'UYE8EYCQ', kind: 'awaria', description: 'Nie chłodzi, kapie woda', phone: '600 100 200' });
  assert.equal(res.status, 200, JSON.stringify(json)); assert.deepEqual(json, { ok: true });
  const row = admin.calls.inserts.find((c) => c.table === 'service_requests').row;
  assert.equal(row.qr_code, 'UYE8EYCQ'); assert.equal(row.device_id, 'dev-1'); assert.equal(row.contractor_id, 'c-1');
  assert.equal(row.kind, 'awaria'); assert.equal(row.phone, '48600100200'); assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!row.ip_hash.includes('1.2.3.4'));
  assert.equal(webpush.sent.length, 1);
  assert.equal(webpush.sent[0].title, 'Nowe zgłoszenie: Awaria');
  assert.match(webpush.sent[0].body, /Jan Nowak, Zawiercie\. Tel\. 600 100 200/);
  assert.ok(admin.calls.rpc.some((c) => c.name === 'push_claim_delivery_v1268' && c.args.p_event_key === 'service_request:req-1'));
  assert.ok(admin.calls.updates.some((u) => u.table === 'service_requests' && u.patch.push_delivered === 1));
}
{ // naklejka nieprzypisana: zgłoszenie przyjęte bez urządzenia
  const { res, admin } = await run({ action: 'submit', code: 'BNKJXZDY', kind: 'przeglad', phone: '600100200' });
  assert.equal(res.status, 200);
  const row = admin.calls.inserts.find((c) => c.table === 'service_requests').row;
  assert.equal(row.device_id, null);
}
{ // błąd powiadomień nie odbiera klientowi potwierdzenia (zgłoszenie jest zapisane)
  const admin = makeAdmin(); const webpush = { setVapidDetails() {}, async sendNotification() { throw new Error('push down'); } };
  const res = await loadHandler(admin, webpush)(post({ action: 'submit', code: 'UYE8EYCQ', kind: 'przeglad', phone: '600100200' }));
  assert.equal(res.status, 200);
}
{ const { res } = await run({ action: 'submit', code: 'UYE8EYCQ', kind: 'przeglad', phone: '600100200' }, { insertFails: true });
  assert.equal(res.status, 500); }
{ const res = await loadHandler(makeAdmin(), makeWebpush())(new Request('https://local.invalid/fn', { method: 'POST', body: 'x'.repeat(9000) }));
  assert.equal(res.status, 413); }

// ---------- 3. Start strony: klient bez sesji → strona zgłoszenia; pracownik → aplikacja ----------
const mem = (entries = {}) => {
  const m = new Map(Object.entries(entries));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
assert.equal(shouldShowPublicQrPage({ code: 'UYE8EYCQ', storage: mem(), session: mem() }), true, 'klient');
assert.equal(shouldShowPublicQrPage({ code: '', storage: mem(), session: mem() }), false, 'bez kodu — zwykła aplikacja');
assert.equal(shouldShowPublicQrPage({ code: 'UYE8EYCQ', storage: mem({ 'sb-uohziyaudbpwmupvljyd-auth-token': '{"a":1}' }), session: mem() }), false, 'zalogowany pracownik');
assert.equal(shouldShowPublicQrPage({ code: 'UYE8EYCQ', storage: mem({ 'klima-mock-supabase-session': '{}' }), session: mem() }), false, 'sesja testowa');
assert.equal(shouldShowPublicQrPage({ code: 'UYE8EYCQ', storage: mem(), session: mem({ [STAFF_LOGIN_FLAG]: '1' }) }), false, '„Jestem pracownikiem”');
assert.equal(shouldShowPublicQrPage({ code: 'UYE8EYCQ', storage: mem(), session: mem({ 'klima-mock-supabase-session': '{}' }) }), false, 'sesja w pamięci karty (telefon, wersja testowa)');
assert.equal(hasStoredWawisSession({ getItem() { throw new Error('private'); } }), false);

const main = fs.readFileSync('src/main.jsx', 'utf8');
assert.match(main, /if \(publicQrMode\) return bootPublicQr\(\)/);
assert.match(main, /if \(!publicQrMode\) \{\n  registerOfflineWorker\(\)\n  installVersionResumeGuard\(\)\n\}/, 'strona klienta bez service workera');
const page = fs.readFileSync('src/public-qr/PublicQrPage.jsx', 'utf8');
assert.ok(page.includes('tabIndex={-1}') && page.includes('pqrTrap'), 'pole-pułapka ukryte');
assert.ok(!/contractor|serial/i.test(page), 'strona klienta nie odwołuje się do danych klienta');

// ---------- 4. Migracja i konfiguracja ----------
const sql = fs.readFileSync('supabase/migrations/20261103200000_service_requests_v1420.sql', 'utf8');
assert.match(sql, /alter table public\.service_requests enable row level security;/);
assert.match(sql, /revoke all on table public\.service_requests from public, anon, authenticated;/);
for (const fn of ['service_requests_list_v1420(integer)', 'service_request_set_status_v1420(uuid, text)']) {
  assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon;`), fn);
}
assert.equal((sql.match(/not public\.current_user_is_admin\(\)/g) || []).length, 2, 'obie funkcje tylko dla administratora');
assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(delete from|drop table|truncate|update public\.(?!service_requests))/i, 'bez zmian istniejących danych');
const manifest = JSON.parse(fs.readFileSync('supabase/rebuild/manifest-v1089.json', 'utf8'));
assert.ok(manifest.files.includes('supabase/migrations/20261103200000_service_requests_v1420.sql'));
assert.match(fs.readFileSync('supabase/config.toml', 'utf8'), /\[functions\.qr-service-request\]\nverify_jwt = false/);

console.log('PASS WAWIS 14.20 — zgłoszenia z naklejki QR: tylko bezpieczne dane, walidacja, limity, zapis i push; klient bez logowania widzi stronę zgłoszenia.');
