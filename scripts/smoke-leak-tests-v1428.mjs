// WAWIS 14.28 — próby szczelności: walidacja wpisu, zapytania tylko przez funkcje administratora, zakładka.
// SQL: scripts/leak-tests-sql-v1428.sh (prawdziwy PostgreSQL). E2E: leak-tests-panel-v1428.spec.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { countFilledLeakTests, defaultLeakTestDate, loadLeakTest, saveLeakTest, validateLeakTestDraft } from '../src/modules/leak-tests.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

assert.deepEqual(validateLeakTestDraft({ testDate: '2026-05-02', temperature: '18,5', result: 'pozytywny' }),
  { ok: true, value: { testDate: '2026-05-02', temperature: 18.5, result: 'pozytywny' } });
assert.equal(validateLeakTestDraft({ testDate: '', temperature: '18', result: 'pozytywny' }).ok, false);
assert.equal(validateLeakTestDraft({ testDate: '2026-05-02', temperature: '', result: 'pozytywny' }).ok, false, 'temperatura wymagana — nie wpisujemy za użytkownika');
assert.equal(validateLeakTestDraft({ testDate: '2026-05-02', temperature: '99', result: 'pozytywny' }).ok, false);
assert.equal(validateLeakTestDraft({ testDate: '2026-05-02', temperature: '18', result: 'dobry' }).ok, false);
assert.equal(defaultLeakTestDate('2026-04-22T23:30:00Z'), '2026-04-23', 'data zakończenia w strefie Europe/Warsaw');
assert.equal(defaultLeakTestDate(''), '');
assert.equal(countFilledLeakTests([{ test_date: '2026-01-01' }, { test_date: null }]), 1);

const calls = [];
const fake = (data, error = null) => ({ rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } });
await saveLeakTest({ supabase: fake(true), jobId: 'j1', testDate: '2026-05-02', temperature: '18', result: 'pozytywny' });
assert.deepEqual(calls.at(-1), ['leak_test_save_v1428', { p_job_id: 'j1', p_test_date: '2026-05-02', p_temperature_c: 18, p_result: 'pozytywny' }]);
await assert.rejects(saveLeakTest({ supabase: fake(false), jobId: 'j1', testDate: '2026-05-02', temperature: '18', result: 'pozytywny' }), /nie jest zakończony/);
await assert.rejects(saveLeakTest({ supabase: fake(true), jobId: 'j1', testDate: '2026-05-02', temperature: '', result: 'pozytywny' }), /Temperatura/);
assert.equal(await loadLeakTest({ supabase: fake([]), jobId: 'j1' }), null);
assert.deepEqual(await loadLeakTest({ supabase: fake([{ test_date: '2026-05-02', temperature_c: 18, result: 'pozytywny' }]), jobId: 'j1' }),
  { test_date: '2026-05-02', temperature_c: 18, result: 'pozytywny' });
await assert.rejects(loadLeakTest({ supabase: fake(null, { message: 'Could not find the function public.leak_test_get_v1428 (PGRST202)' }), jobId: 'j1' }), /brak migracji 14\.28/);

const sql = read('supabase/migrations/20261106130000_leak_tests_v1428.sql');
assert.match(sql, /create table if not exists public\.leak_test_records/);
assert.match(sql, /revoke all on public\.leak_test_records from public, anon, authenticated;/);
assert.equal((sql.match(/if not public\.current_user_is_admin\(\) then/g) || []).length, 3, 'lista, odczyt, zapis — tylko administrator');
assert.match(sql, /where j\.status = 'Zakończone' and j\.completed_by is not null/, 'montaże z aplikacji z instalatorem');
assert.doesNotMatch(sql, /\b(update public\.jobs|delete from public\.jobs|alter table public\.jobs)\b/i, 'bez zmian montaży');
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261106130000_leak_tests_v1428\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/leak-tests-sql-v1428\.sh"/);

const pdf = read('src/mobile791/modules/leak-test-protocol-pdf.js');
assert.match(pdf, /field\(doc, 'Temperatura przeprowadzania próby:', data\.temperature, y, \{ suffix: '\[°C\]' \}\)/);
assert.match(pdf, /field\(doc, 'Data badania:', data\.testDate \? `\$\{data\.testDate\} r\.` : '', y\)/);
assert.match(pdf, /result: record\?\.test_date && \['pozytywny', 'negatywny'\]\.includes\(record\?\.result\) \? record\.result : ''/, 'bez wpisu — pola puste');
const shell = read('src/components/layout/AdminDesktopShell.jsx');
assert.match(shell, /\{ key: 'leaktests', label: 'Próby szczelności', icon: IconGaugeModern, target: 'leaktests' \}/);
const app = read('src/App.jsx');
assert.match(app, /activeModule === "leaktests" \? \(\n\s+<LeakTestsPanel supabase=\{supabase\} \/>/);
assert.match(app, /"requests", "leaktests"\]/);

console.log('PASS WAWIS 14.28 — próby szczelności: walidacja, funkcje administratora, zakładka, PDF z danymi z protokołu.');
