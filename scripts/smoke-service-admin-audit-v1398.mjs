// WAWIS 13.98 — regresje z audytu modułu serwisowego administratora.
// Wykonuje rzeczywisty kod modułów (bez atrap logiki), statyczne asercje są wyłącznie pomocnicze.
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Minimalne środowisko przeglądarki dla modułu e-mail (localStorage per test).
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const moduleRoot = process.env.WAWIS_SERVICE_MODULE_ROOT || '../src/mobile791/modules/';
const visits = await import(new URL(moduleRoot + 'service-visits.js', import.meta.url));
const email = await import(new URL(moduleRoot + 'service-visit-email.js', import.meta.url));
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// ---------- 1. Statusy (SA-1398-STATUS) ----------
const label = visits.serviceVisitStatusLabel;
assert.equal(label({ status: 'w_trakcie', primary_technician_id: 'x' }), 'W trakcie',
  'Wizyta w trakcie nie może być pokazana jako „Przydzielony”.');
assert.equal(label({ status: 'oczekuje_na_podpis', primary_technician_id: null }), 'Oczekuje na podpis klienta',
  'Wizyta czekająca na podpis nie może wyglądać jak „bez przydziału”.');
assert.equal(label({ status: 'zaplanowany', primary_technician_id: 'x' }), 'Przydzielony');
assert.equal(label({ status: 'zaplanowany', primary_technician_id: null }), 'Zaplanowany, bez przydziału');
assert.equal(label({ status: 'wykonany' }), 'Wykonany');
assert.equal(label({ status: 'odwolany' }), 'Odwołany');
const adminSrc = read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
assert.doesNotMatch(adminSrc, /v\.status==='wykonany'\?'Wykonany'/, 'Brak starej, niepełnej mapy statusów w liście klienta.');
assert.doesNotMatch(adminSrc, /Status sprzed usunięcia: \{v\.status\}/, 'Kosz nie pokazuje surowego kodu statusu.');
assert.ok((adminSrc.match(/serviceVisitStatusLabel\(/g) || []).length >= 4, 'Wszystkie widoki używają jednej mapy statusów.');

// ---------- 2. Historia pojedynczego urządzenia (SA-1398-DEVICE-HISTORY) ----------
const names = { piotr: 'Piotr Wasik' };
const visitRows = [
  { id: 'v-old', status: 'wykonany', scheduled_date: '2025-10-01', items: [
    // Urządzenie przebudowane przez synchronizator montaży: device_id = null, device_ref_id zachowany.
    { id: 'i1', device_id: null, device_ref_id: 'dev-A', result: 'sprawne', performed_at: '2025-10-02T09:00:00Z', performed_by: 'piotr' },
    { id: 'i2', device_id: 'dev-B', device_ref_id: 'dev-B', result: 'usterka', performed_at: '2025-10-02T09:30:00Z', performed_by: 'piotr' },
  ] },
  { id: 'v-late', status: 'wykonany', scheduled_date: '2026-10-29', items: [
    // 22:30 UTC = 30.10 w Polsce (CET); obcięcie ISO dałoby błędnie 29.10.
    { id: 'i3', device_id: 'dev-A', device_ref_id: 'dev-A', result: 'usterka', performed_at: '2026-10-29T23:30:00Z', performed_by: 'obcy' },
  ] },
  { id: 'v-plan', status: 'zaplanowany', primary_technician_id: null, scheduled_date: '2026-11-15', items: [
    { id: 'i4', device_id: 'dev-A', device_ref_id: 'dev-A', result: null, performed_at: null, performed_by: null },
  ] },
];
const histA = visits.buildServiceDeviceHistory({ visits: visitRows, deviceId: 'dev-A', nameOf: id => names[id] });
assert.deepEqual(histA.map(h => h.visitId), ['v-plan', 'v-late', 'v-old'], 'Najnowsze najpierw; obejmuje wpis z device_id=null.');
assert.equal(histA[1].dateLabel, 'Wykonano 30.10.2026', 'Data wykonania w strefie Europe/Warsaw.');
assert.equal(histA[1].resultLabel, 'Usterka');
assert.equal(histA[1].performedBy, 'Inny użytkownik', 'Nieznany wykonawca nie jest zgadywany z przydziału.');
assert.equal(histA[2].performedBy, 'Piotr Wasik');
assert.equal(histA[0].resultLabel, null);
assert.equal(histA[0].statusLabel, 'Zaplanowany, bez przydziału');
assert.equal(histA[0].dateLabel, 'Termin 15.11.2026');
const histB = visits.buildServiceDeviceHistory({ visits: visitRows, deviceId: 'dev-B', nameOf: id => names[id] });
assert.deepEqual(histB.map(h => h.visitId), ['v-old'], 'Historia nie miesza innych urządzeń klienta.');
assert.deepEqual(visits.buildServiceDeviceHistory({ visits: visitRows, deviceId: 'dev-X' }), []);
assert.match(adminSrc, /buildServiceDeviceHistory\(\{visits,deviceId:d\.id/, 'Ekran klienta pokazuje historię przy każdym urządzeniu.');

// ---------- 3. Historia wizyty (SA-1398-VISIT-HISTORY) ----------
function fakeHistoryDb(failTable) {
  const data = {
    service_visit_change_events: [{ id: 1, changed_at: '2026-10-29T08:00:00Z', changed_by: 'piotr',
      old_scheduled_date: '2026-10-30', new_scheduled_date: '2026-11-02', old_scheduled_time: '10:00:00', new_scheduled_time: '12:30:00',
      old_status: 'zaplanowany', new_status: 'zaplanowany', old_notes: '', new_notes: '' },
      // Zmiana tylko kolumny technicznej — nie może tworzyć pustego wpisu.
      { id: 2, changed_at: '2026-10-29T08:01:00Z', changed_by: 'piotr', old_scheduled_date: '2026-11-02', new_scheduled_date: '2026-11-02',
      old_scheduled_time: '12:30:00', new_scheduled_time: '12:30:00', old_status: 'zaplanowany', new_status: 'zaplanowany', old_notes: 'a', new_notes: 'a' }],
    service_visit_assignment_events: [{ id: 7, changed_at: '2026-10-29T09:00:00Z', changed_by: 'piotr',
      old_primary_technician_id: null, new_primary_technician_id: 'piotr', old_additional_technician_ids: [], new_additional_technician_ids: ['obcy'] }],
    service_visit_protocol_email_log: [{ id: 'e1', created_at: '2026-10-29T10:00:00Z', sent_at: null, recipient_email: 'k@x.pl', status: 'sending', sent_by: 'piotr' }],
  };
  const calls = [];
  return { calls, from(table) {
    const q = { filters: [], select() { return this; }, eq(f, v) { this.filters.push([f, v]); return this; },
      order() { return this; }, limit() {
        calls.push([table, this.filters]);
        return Promise.resolve(table === failTable ? { data: null, error: new Error('RLS') } : { data: data[table], error: null });
      } };
    return q;
  } };
}
const okDb = fakeHistoryDb(null);
const full = await visits.loadServiceVisitHistory({ supabase: okDb, visitId: 'V1', nameOf: id => names[id] });
assert.deepEqual(full.failed, []);
assert.deepEqual(full.entries.map(e => e.kind), ['email', 'assignment', 'change'], 'Scalona historia, najnowsze najpierw, bez pustych zmian.');
assert.match(full.entries[2].text, /Termin: 30\.10\.2026 10:00 → 02\.11\.2026 12:30/);
assert.equal(full.entries[1].text, 'Przydział: Bez przydziału → Piotr Wasik, Inny użytkownik');
assert.match(full.entries[0].text, /wynik nieustalony/, 'Niepewna wysyłka jest jawnie oznaczona.');
assert.ok(okDb.calls.every(([, f]) => f.some(([k, v]) => k === 'service_visit_id' && v === 'V1')), 'Każde zapytanie ograniczone do jednej wizyty.');
const partial = await visits.loadServiceVisitHistory({ supabase: fakeHistoryDb('service_visit_protocol_email_log'), visitId: 'V1', nameOf: id => names[id] });
assert.deepEqual(partial.failed, ['wysyłki e-mail'], 'Błąd jednego źródła jest raportowany…');
assert.equal(partial.entries.length, 2, '…i nie ukrywa pozostałej historii.');

// ---------- 4. E-mail: brak ślepego zaułka po odmowie (SA-1398-EMAIL-RETRY) ----------
const visit = { id: 'visit-1', status: 'wykonany', client: { email: 'Klient@Example.pl' } };
const protocol = { id: 'proto-1', storage_path: 'visit-1/pdf/a.pdf' };
function httpError(status, body) {
  return { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } };
}
function fakeEmailDb(responses) {
  const keys = [];
  return { keys, functions: { invoke: async (name, { body }) => {
    assert.equal(name, 'send-service-visit-protocol-email');
    keys.push(body.requestKey);
    return responses.shift();
  } } };
}
// 4a. Odrzucenie przez dostawcę (422) → kolejna próba MUSI dostać nowy klucz.
//     Poprzednio ten sam klucz wracał do serwera, który odpowiadał 409 „nieustalony wynik” bez końca.
store.clear();
let db = fakeEmailDb([
  { data: null, error: httpError(422, { error: 'Serwer pocztowy odrzucił wiadomość.' }) },
  { data: { status: 'sent' }, error: null },
]);
await assert.rejects(email.sendServiceProtocolEmail({ supabase: db, visit, protocol }), /odrzucił wiadomość/,
  'Pokazujemy rzeczywistą przyczynę z serwera.');
assert.equal(email.hasUncertainServiceEmailAttempt({ visitId: visit.id, protocolId: protocol.id }), false);
const ok = await email.sendServiceProtocolEmail({ supabase: db, visit, protocol });
assert.equal(ok.recipient, 'klient@example.pl');
assert.notEqual(db.keys[0], db.keys[1], 'Po jednoznacznej odmowie nowa próba ma nowy klucz.');

// 4b. Niepewny wynik (503 pending) → ten sam klucz przy zwykłym ponowieniu (idempotencja serwera i Resend).
store.clear();
db = fakeEmailDb([
  { data: null, error: httpError(503, { error: 'Dostawca nie potwierdził wyniku.', pending: true }) },
  { data: null, error: httpError(409, { error: 'Wysyłka ma nieustalony wynik.', pending: true }) },
  { data: { status: 'sent' }, error: null },
]);
await assert.rejects(email.sendServiceProtocolEmail({ supabase: db, visit, protocol }), /niepewny/);
assert.equal(email.hasUncertainServiceEmailAttempt({ visitId: visit.id, protocolId: protocol.id }), true);
await assert.rejects(email.sendServiceProtocolEmail({ supabase: db, visit, protocol }), /niepewny/);
assert.equal(db.keys[0], db.keys[1], 'Bez decyzji użytkownika nie powstaje druga, niekontrolowana wysyłka.');
// 4c. Świadome ponowienie po potwierdzeniu administratora → nowy klucz, sukces czyści stan niepewny.
await email.sendServiceProtocolEmail({ supabase: db, visit, protocol, forceNewAttempt: true });
assert.notEqual(db.keys[2], db.keys[1], 'Potwierdzone ponowienie ma nowy klucz (wyjście ze ślepego zaułka 409).');
assert.equal(email.hasUncertainServiceEmailAttempt({ visitId: visit.id, protocolId: protocol.id }), false);

// 4d. Błąd sieci bez odpowiedzi serwera → nieustalony, klucz zachowany.
store.clear();
db = fakeEmailDb([{ data: null, error: { message: 'Failed to send a request to the Edge Function' } }]);
await assert.rejects(email.sendServiceProtocolEmail({ supabase: db, visit, protocol }), err => err.pending === true);
assert.equal(email.hasUncertainServiceEmailAttempt({ visitId: visit.id, protocolId: protocol.id }), true);

// 4e. 409 bez flagi pending (np. błąd rejestracji) nie jest traktowany jako pewna odmowa.
store.clear();
db = fakeEmailDb([{ data: null, error: httpError(409, { error: 'Nie udało się zarejestrować wysyłki.' }) }]);
await assert.rejects(email.sendServiceProtocolEmail({ supabase: db, visit, protocol }), /niepewny/);
assert.equal(email.hasUncertainServiceEmailAttempt({ visitId: visit.id, protocolId: protocol.id }), true);

const execSrc = read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
assert.match(execSrc, /hasUncertainServiceEmailAttempt\(/);
assert.match(execSrc, /forceNewAttempt:uncertain/, 'Nowy klucz tylko po pytaniu o niepewną wysyłkę.');
assert.equal((execSrc.match(/window\.confirm\(question\)/g) || []).length, 1, 'Jedno pytanie przed wysyłką.');
assert.match(execSrc, /Historia wysyłek e-mail/, 'Historia wysyłek jest widoczna dla administratora.');

// ---------- 5. Kosz: brak nieaktualnej instrukcji USUN (SA-1398-PURGE-TEXT) ----------
assert.doesNotMatch(adminSrc, /USUN/, 'Interfejs nie wspomina już o wpisywaniu USUN.');
assert.doesNotMatch(adminSrc, /window\.prompt/, 'Brak pola do wpisywania tekstu.');
const trashBlock = adminSrc.match(/\{currentVisit\.deleted_at \? <div className="serviceAdminStack">[\s\S]*?<\/>\}/)?.[0] || '';
assert.ok(trashBlock, 'Blok akcji Kosza istnieje.');
assert.match(trashBlock, /data-testid="service-purge-hint">Usunięcie na stałe wymaga jednego potwierdzenia/);
const [inTrash, active] = trashBlock.split('</div> : <>');
assert.doesNotMatch(inTrash, /przenosi serwis do kosza/, 'W Koszu nie ma sprzecznego tekstu „pliki pozostają bezpieczne”.');
assert.match(active, /przenosi serwis do kosza/, 'Tekst o Koszu tylko przy aktywnym serwisie.');
assert.match(active, /onClick=\{trashVisit\}/);
assert.match(inTrash, /onClick=\{purgeVisit\}/);

console.log('WAWIS 13.98 service admin audit regressions: PASS');
