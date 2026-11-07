// WAWIS 14.32 — instalator przypisany do starych montaży w próbach szczelności. SQL: scripts/leak-test-installer-sql-v1432.sh.
// E2E: leak-test-installer-v1432.spec.js. Tutaj: moduł zapisu (fallback przed migracją), migracja, rejestracja testów.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLeakInstallers, saveLeakTest } from '../src/modules/leak-tests.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const calls = [];
const fake = (handlers) => ({ rpc: async (name, args) => { calls.push([name, args]); return handlers[name] ? handlers[name](args) : { data: null, error: { message: `Could not find the function public.${name}` } }; } });
const draft = { jobId: 'j', testDate: '2026-05-05', temperature: '16', result: 'pozytywny' };

// Po migracji: zapis z instalatorem przez v1432.
await saveLeakTest({ supabase: fake({ leak_test_save_v1432: () => ({ data: true, error: null }) }), ...draft, installerId: 'w', needsInstaller: true });
assert.deepEqual(calls.at(-1), ['leak_test_save_v1432', { p_job_id: 'j', p_test_date: '2026-05-05', p_temperature_c: 16, p_result: 'pozytywny', p_installer_id: 'w' }]);
// Stary montaż bez wybranego instalatora — nic nie wysyła.
const before = calls.length;
await assert.rejects(saveLeakTest({ supabase: fake({}), ...draft, needsInstaller: true }), /Wybierz instalatora/);
assert.equal(calls.length, before, 'bez instalatora brak zapytania');
// Baza przed 14.32: montaż z instalatorem z aplikacji zapisuje się jak w 14.28.
await saveLeakTest({ supabase: fake({ leak_test_save_v1428: () => ({ data: true, error: null }) }), ...draft });
assert.deepEqual(calls.slice(-2).map(([name]) => name), ['leak_test_save_v1432', 'leak_test_save_v1428']);
assert.equal(await loadLeakInstallers({ supabase: fake({}) }), null, 'przed migracją: brak listy, bez błędu');
await assert.rejects(saveLeakTest({ supabase: fake({ leak_test_save_v1432: () => ({ data: null, error: { message: 'leak_installer_required' } }) }), ...draft, installerId: 'x' }), /Wybierz instalatora/);

const sql = read('supabase/migrations/20261107100000_leak_test_installer_v1432.sql');
assert.match(sql, /add column if not exists installer_id uuid references public\.profiles\(id\) on delete set null/);
assert.doesNotMatch(sql, /\b(update|delete from|insert into) public\.jobs\b/i, 'montaż (jobs) bez zmian');
assert.doesNotMatch(sql, /drop table|truncate|delete from public\.leak/i, 'bez usuwania danych');
assert.equal((sql.match(/coalesce\(j\.completed_by, r\.installer_id\) = (auth\.uid\(\)|v_uid)/g) || []).length, 3, 'podpis tylko instalatora protokołu');
assert.match(sql, /raise exception 'leak_installer_required'/);
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261107100000_leak_test_installer_v1432\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/leak-test-installer-sql-v1432\.sh"/);

const panel = read('src/components/leak-tests/LeakTestsPanel.jsx');
assert.match(panel, /return row\?\.installer_from_app === false;/, 'wybór tylko przy montażach bez instalatora z aplikacji');
assert.match(panel, /data-testid="leak-test-installer"/);
assert.match(read('src/mobile791/modules/leak-test-protocol-pdf.js'), /const performedBy = clean\(person\?\.full_name\) \|\| clean\(record\?\.installer_name\);/);
console.log('PASS WAWIS 14.32 — instalator w próbach szczelności: wybór przy starych montażach, montaż bez zmian, zgodność przed migracją.');
