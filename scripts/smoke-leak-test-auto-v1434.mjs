// WAWIS 14.34 — protokół szczelności przy zakończeniu montażu (baza) + temperatura w tle (aplikacja).
// SQL: scripts/leak-test-auto-sql-v1434.sh (PostgreSQL 16, w tym awaria nie blokuje zakończenia). E2E: leak-test-auto-v1434.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setLeakTestTemperature } from '../src/modules/leak-tests.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const calls = [];
const fake = (data, error = null) => ({ rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } });
assert.equal(await setLeakTestTemperature({ supabase: fake(true), jobId: 'j', temperature: 7 }), true);
assert.deepEqual(calls.at(-1), ['leak_test_set_temperature_v1434', { p_job_id: 'j', p_temperature_c: 7 }]);
assert.equal(await setLeakTestTemperature({ supabase: fake(null, { message: 'Could not find the function public.leak_test_set_temperature_v1434 (PGRST202)' }), jobId: 'j', temperature: 7 }), false, 'przed migracją: bez błędu');
assert.equal(await setLeakTestTemperature({ supabase: fake(true), jobId: 'j', temperature: null }), false, 'bez temperatury nic nie wysyła');

const sql = read('supabase/migrations/20261107140000_leak_test_auto_v1434.sql');
assert.match(sql, /after insert or update of status on public\.jobs/);
assert.match(sql, /exception when others then\s+raise warning/, 'awaria nie blokuje zakończenia montażu');
assert.match(sql, /on conflict \(job_id\) do nothing;\s+perform public\.leak_test_autosign_v1433\(new\.completed_by, new\.id\);/);
assert.match(sql, /\(new\.completed_at at time zone 'Europe\/Warsaw'\)::date/, 'data badania = dzień zakończenia (czas polski)');
assert.match(sql, /r\.temperature_c is null/, 'temperatura w tle nie nadpisuje');
assert.doesNotMatch(sql, /\b(update|delete from) public\.jobs\b/i, 'montaże bez zmian');
assert.doesNotMatch(sql, /drop table|truncate|delete from public\./i);
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261107140000_leak_test_auto_v1434\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/leak-test-auto-sql-v1434\.sh"/);
const pdf = read('src/mobile791/modules/leak-test-protocol-pdf.js');
assert.match(pdf, /leakRecord = await withBackgroundTemperature\(\{ supabase, job, record: leakRecord \}\);/);
assert.match(read('src/components/leak-tests/LeakTestsPanel.jsx'), /setLeakTestTemperature\(\{ supabase, jobId: row\.job_id, temperature: mean \}\)/);
// Podgląd wzorów podpisów pracowników — tylko administrator.
assert.match(sql, /create or replace function public\.staff_signatures_admin_list_v1434\(\)[\s\S]*?if not public\.current_user_is_admin\(\) then/);
assert.match(read('src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx'), /\{profile\?\.role === 'Administrator' \? <StaffSignaturesAdminCard supabase=\{supabase\} \/> : null\}/);
console.log('PASS WAWIS 14.34 — protokół przy zakończeniu montażu, temperatura w tle, bez blokowania zakończenia.');
