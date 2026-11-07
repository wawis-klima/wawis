// WAWIS 14.33 — wzór podpisu pracownika (Diagnostyka) i automatyczny podpis protokołów z datą badania.
// SQL: scripts/signature-pattern-sql-v1433.sh (PostgreSQL 16). E2E: signature-pattern-v1433.spec.js (także na buildzie).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadOwnSignaturePattern, saveOwnSignaturePattern } from '../src/modules/leak-tests.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const calls = [];
const fake = (data, error = null) => ({ rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } });

assert.equal(await saveOwnSignaturePattern({ supabase: fake(3), imagePng: 'data:image/png;base64,AAAA' }), 3);
assert.deepEqual(calls.at(-1), ['staff_signature_save_own_v1433', { p_image_png: 'data:image/png;base64,AAAA' }]);
await assert.rejects(saveOwnSignaturePattern({ supabase: fake(0), imagePng: 'x' }), /obraz/);
assert.equal(await loadOwnSignaturePattern({ supabase: fake([]) }), null, 'brak wzoru');
assert.deepEqual(await loadOwnSignaturePattern({ supabase: fake([{ image_png: 'data:image/png;base64,B', created_at: '2026-11-07' }]) }),
  { imagePng: 'data:image/png;base64,B', createdAt: '2026-11-07' });
// Błąd odczytu ≠ brak wzoru.
await assert.rejects(loadOwnSignaturePattern({ supabase: fake(null, { message: 'Could not find the function public.staff_signature_get_own_v1433 (PGRST202)' }) }), /aktualizacji bazy \(14\.33\)/);

const sql = read('supabase/migrations/20261107120000_signature_pattern_v1433.sql');
assert.match(sql, /signed_at = \(r\.test_date \+ time '12:00'\) at time zone 'Europe\/Warsaw'/, 'data podpisu = data badania');
assert.match(sql, /revoke all on function public\.leak_test_autosign_v1433\(uuid, uuid\) from public, anon, authenticated;/, 'autopodpis tylko wewnętrzny');
assert.equal((sql.match(/perform public\.leak_test_autosign_v1433\(/g) || []).length, 2, 'zapis 14.32 i 14.28 podpisują ze wzoru');
assert.match(sql, /where s\.profile_id = auth\.uid\(\)/, 'pracownik widzi tylko swój wzór');
assert.doesNotMatch(sql, /\b(update|delete from|insert into) public\.jobs\b/i, 'montaże bez zmian');
assert.doesNotMatch(sql, /drop table|truncate|delete from public\./i, 'bez usuwania danych');
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261107120000_signature_pattern_v1433\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/signature-pattern-sql-v1433\.sh"/);

const diag = read('src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx');
assert.match(diag, /<SignaturePatternCard supabase=\{supabase\} profile=\{profile\} \/>/);
const card = read('src/mobile791/components/diagnostics/SignaturePatternCard.jsx');
assert.doesNotMatch(card, /localStorage|indexedDB|caches\./, 'wzór w bazie, nie w telefonie');
assert.match(read('playwright.built.config.js'), /'signature-pattern-v1433\.spec\.js'/, 'okno wzoru sprawdzane na buildzie (style telefonu)');
console.log('PASS WAWIS 14.33 — wzór podpisu w diagnostyce, automatyczny podpis protokołów z datą badania, montaże bez zmian.');
