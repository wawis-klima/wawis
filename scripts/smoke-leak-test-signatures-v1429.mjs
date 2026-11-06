// WAWIS 14.29 — podpis protokołów szczelności składa wyłącznie sam instalator (telefon), na swoich, widzianych
// protokołach; wzór w bazie; zmiana danych usuwa podpis. SQL: scripts/leak-test-signatures-sql-v1429.sh. E2E: leak-test-sign-v1429.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadOwnPendingLeakTests, signOwnLeakTests } from '../src/modules/leak-tests.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const calls = [];
const fake = (data, error = null) => ({ rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } });

assert.equal(await signOwnLeakTests({ supabase: fake(0), jobIds: [] }), 0, 'pusta lista — bez zapytania');
assert.equal(calls.length, 0);
assert.equal(await signOwnLeakTests({ supabase: fake(2), jobIds: ['a', 'b'], imagePng: 'data:image/png;base64,AAAA' }), 2);
assert.deepEqual(calls.at(-1), ['leak_test_sign_own_v1429', { p_job_ids: ['a', 'b'], p_image_png: 'data:image/png;base64,AAAA' }]);
await signOwnLeakTests({ supabase: fake(1), jobIds: ['a'], imagePng: null });
assert.deepEqual(calls.at(-1), ['leak_test_sign_own_v1429', { p_job_ids: ['a'], p_image_png: null }], 'zapisany wzór');
await assert.rejects(signOwnLeakTests({ supabase: fake(1), jobIds: ['a'], imagePng: 'x' }), /obraz/);
await assert.rejects(signOwnLeakTests({ supabase: fake(null, { message: 'leak_sign_no_saved_signature' }), jobIds: ['a'] }), /podpisz palcem/);
assert.deepEqual(await loadOwnPendingLeakTests({ supabase: fake([{ job_id: 'a' }]) }), [{ job_id: 'a' }]);

const sql = read('supabase/migrations/20261106140000_leak_test_signatures_v1429.sql');
assert.match(sql, /where r\.job_id = any\(p_job_ids\) and j\.completed_by = v_uid/, 'tylko własne, zatwierdzone protokoły');
assert.doesNotMatch(sql, /leak_test_sign_v1429\(|p_profile_id/, 'administrator nie podpisuje za instalatora');
assert.match(sql, /signature_id = case when \(public\.leak_test_records\.test_date/, 'zmiana danych usuwa podpis');
assert.match(sql, /revoke all on public\.leak_test_signatures from public, anon, authenticated;/);
assert.doesNotMatch(sql, /\b(update public\.jobs|delete from public\.jobs|delete from public\.leak)/i);
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261106140000_leak_test_signatures_v1429\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/leak-test-signatures-sql-v1429\.sh"/);

const banner = read('src/mobile791/components/leak-tests/LeakTestSignBanner.jsx');
assert.match(banner, /signOwnLeakTests\(\{ supabase, jobIds: rows\.map\(\(row\) => row\.job_id\), imagePng \}\)/, 'podpis na protokoły z widocznej listy');
assert.match(banner, /if \(!rows\.length && !message\) return null;/, 'bez protokołów — nic na ekranie');
assert.doesNotMatch(banner, /localStorage|indexedDB|caches\./, 'nic w pamięci telefonu');
assert.match(read('src/mobile791/App.jsx'), /<LeakTestSignBanner supabase=\{supabase\} userId=\{sessionUser\?\.id \|\| ""\} \/>/);
assert.match(read('src/components/leak-tests/LeakTestsPanel.jsx'), /Czeka na podpis instalatora \(w jego aplikacji\)/);

console.log('PASS WAWIS 14.29 — podpis protokołów szczelności: sam instalator, swoje zatwierdzone protokoły, wzór w bazie, zmiana danych usuwa podpis.');
