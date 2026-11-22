// WAWIS 14.78 — licznik SMS w menu komputera = „Klienci na liście” w module SMS (decyzja właściciela 22.11.2026).
// RED na 14.77: w weekend lista miała 2 klientów (terminy z soboty/niedzieli), a licznik liczył tylko kolejkę (0).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSmsListCount, loadSmsNavCount } from '../src/modules/communication-counters.js';
import { buildSmsTargets, deriveSmsQueue } from '../src/modules/sms.js';
import { normalizeDeviceRecord } from '../src/modules/devices-fetch.js';

const NOW = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
// Termin 1. przypomnienia = montaż + 11 miesięcy → montaż 11 miesięcy przed wczoraj (termin wczoraj, w oknie 62 dni).
const due = new Date(NOW); due.setDate(due.getDate() - 1);
const install = new Date(due); install.setMonth(install.getMonth() - 11);
const deviceRow = (id, phone) => ({ id, contractor_id: `c-${id}`, contractor_name: `Klient ${id}`, contractor_phone: phone,
  contractor_city: 'Poręba', contractor_street: 'Zakładowa 1', model: 'Rotenso', serial_number: `SN-${id}`,
  installation_date: iso(install), status: 'aktywne', sms_consent: true, sms_reminder_enabled: true });
const rows = [deviceRow('d1', '600100200'), deviceRow('d2', '600100300')];

function fakeSupabase({ logs = [], devicesError = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name) {
      calls.push(name);
      if (name === 'admin_get_sms_module_snapshot') return Promise.resolve({ data: { settings: {}, queue_logs: logs }, error: null });
      if (name.startsWith('admin_list_devices_with_contractor')) return Promise.resolve(devicesError ? { data: null, error: devicesError } : { data: rows, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
    },
  };
}

// 1. Pusta kolejka (weekend), 2 klientów z terminem → licznik 2, tak jak „Klienci na liście”.
const weekend = fakeSupabase();
const expected = deriveSmsQueue(buildSmsTargets({ jobs: [], devices: rows.map((row) => normalizeDeviceRecord(row)) }), []).length;
assert.equal(expected, 2, 'ekran SMS: 2 klientów na liście');
assert.equal(await loadSmsListCount({ supabase: weekend, jobs: [] }), 2, 'licznik = lista modułu SMS mimo pustej kolejki');

// 2. Urządzenia w pamięci przez 10 min — co minutę bez pobierania całej bazy urządzeń.
const cached = fakeSupabase();
const t0 = Date.now();
await loadSmsListCount({ supabase: cached, jobs: [], now: t0 });
await loadSmsListCount({ supabase: cached, jobs: [], now: t0 + 60_000 });
assert.equal(cached.calls.filter((n) => n.startsWith('admin_list_devices')).length, 1, 'urządzenia pobrane raz w 10 min');
await loadSmsListCount({ supabase: cached, jobs: [], now: t0 + 11 * 60_000 });
assert.equal(cached.calls.filter((n) => n.startsWith('admin_list_devices')).length, 2, 'po 10 min odświeżone');
assert.equal(cached.calls.filter((n) => n === 'admin_get_sms_module_snapshot').length, 3, 'kolejka za każdym razem świeża');

// 3. Błąd pobrania urządzeń → licznik z samej kolejki (jak do 14.77), bez znikania przy zwykłych SMS-ach w kolejce.
const broken = fakeSupabase({ devicesError: { message: 'boom', code: 'XX000' }, logs: [
  { sms_type: 'service_reminder', status: 'pending_approval', reminder_group_id: 'g1', reminder_group_primary: true },
] });
assert.equal(await loadSmsNavCount({ supabase: broken, jobs: [] }), 1, 'awaryjnie: sama kolejka');

// 4. Aplikacja używa nowego licznika i liczy ponownie po wczytaniu montaży.
const app = fs.readFileSync('src/App.jsx', 'utf8');
assert.match(app, /loadSmsNavCount\(\{ supabase, jobs: communicationJobsRef\.current \|\| \[\] \}\)/);
assert.match(app, /refreshCommunicationCounts, activeModule, communicationJobsReady\]/);
assert.doesNotMatch(app, /loadPendingSmsCount\(/, 'menu nie liczy już samej kolejki');

console.log('PASS WAWIS 14.78 — licznik SMS w menu = klienci na liście modułu SMS (także w weekend), urządzenia co 10 min, awaryjnie kolejka.');
