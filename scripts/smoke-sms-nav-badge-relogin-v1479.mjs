// WAWIS 14.79 — licznik SMS po ponownym logowaniu z kodem z telefonu (zgłoszenie właściciela 22.11.2026 10:38).
// RED na 14.78: licznik liczył się przed wpisaniem kodu; baza zwracała wtedy 0 urządzeń (sesja aal1), a pusta lista
// zostawała w pamięci 10 min — licznik znikał po wylogowaniu i zalogowaniu.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSmsListCount } from '../src/modules/communication-counters.js';

const due = new Date(); due.setDate(due.getDate() - 1);
const install = new Date(due); install.setMonth(install.getMonth() - 11);
const rows = ['d1', 'd2', 'd3'].map((id, i) => ({ id, contractor_id: `c-${id}`, contractor_name: `Klient ${id}`,
  contractor_phone: `60010020${i}`, contractor_city: 'Poręba', contractor_street: 'Zakładowa 1', model: 'Rotenso',
  serial_number: `SN-${id}`, installation_date: install.toISOString().slice(0, 10), status: 'aktywne', sms_consent: true, sms_reminder_enabled: true }));

function fake(deviceAnswers) {
  const calls = [];
  return {
    calls,
    rpc(name) {
      calls.push(name);
      if (name === 'admin_get_sms_module_snapshot') return Promise.resolve({ data: { settings: {}, queue_logs: [] }, error: null });
      if (name.startsWith('admin_list_devices_with_contractor')) return Promise.resolve({ data: deviceAnswers.shift() ?? rows, error: null });
      return Promise.resolve({ data: null, error: { message: name } });
    },
  };
}

// 1. Pierwszy odczyt pusty (sesja przed kodem) — nie zapamiętany; zaraz potem pełna lista = 3.
const sb = fake([[], rows]);
const t0 = Date.now();
assert.equal(await loadSmsListCount({ supabase: sb, jobs: [], now: t0, userId: 'admin' }), 0);
assert.equal(await loadSmsListCount({ supabase: sb, jobs: [], now: t0 + 60_000, userId: 'admin' }), 3, 'pusty wynik nie blokuje licznika na 10 min');
// 2. Pełna lista zapamiętana dla tego samego konta…
await loadSmsListCount({ supabase: sb, jobs: [], now: t0 + 120_000, userId: 'admin' });
assert.equal(sb.calls.filter((n) => n.startsWith('admin_list_devices')).length, 2, 'pełna lista z pamięci');
// …ale nie dla innego konta.
await loadSmsListCount({ supabase: sb, jobs: [], now: t0 + 180_000, userId: 'inny' });
assert.equal(sb.calls.filter((n) => n.startsWith('admin_list_devices')).length, 3, 'inne konto = świeży odczyt');

// 3. Aplikacja liczy dopiero po potwierdzeniu kodem i odświeża po jego wpisaniu.
const app = fs.readFileSync('src/App.jsx', 'utf8');
assert.match(app, /const communicationReady = mfaGate\.status === "ok";/);
assert.match(app, /if \(!isAdmin \|\| !supabase \|\| !communicationReady\) return;/);
assert.match(app, /if \(!isAdmin \|\| !sessionUser\?\.id \|\| !communicationReady\) return undefined;/);
assert.match(app, /\[isAdmin, sessionUser\?\.id, communicationReady, refreshCommunicationCounts, activeModule, communicationJobsReady\]/);
assert.ok(app.indexOf('const mfaGate = useMfaGate(') < app.indexOf('const communicationReady'), 'bramka kodu przed licznikiem');

console.log('PASS WAWIS 14.79 — licznik SMS po ponownym logowaniu: liczony po kodzie z telefonu, pusty wynik nie zapamiętany, pamięć per konto.');
