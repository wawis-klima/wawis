// WAWIS 14.35 — temperatura protokołu szczelności uzupełniana przez serwer (pg_cron + pg_net, Open-Meteo).
// SQL z atrapą pg_net: scripts/leak-test-temperature-cron-sql-v1435.sh. Tutaj: kształt migracji i rejestracja.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261107150000_leak_test_temperature_cron_v1435.sql');
assert.match(sql, /cron\.schedule\('wawis-leak-test-temperature-v1435', '\*\/5 \* \* \* \*', 'select private\.leak_test_temperature_tick_v1435\(\);'\)/);
assert.match(sql, /update public\.leak_test_records set temperature_c = round\(v_mean, 0\), updated_at = now\(\)\s+where job_id = q\.job_id and temperature_c is null;/, 'tylko gdy brak temperatury');
assert.match(sql, /revoke all on function private\.leak_test_temperature_tick_v1435\(\) from public, anon, authenticated;/);
assert.match(sql, /revoke all on private\.leak_test_city_coords_v1435, private\.leak_test_temperature_queue_v1435 from public, anon, authenticated;/);
assert.match(sql, /limit 20/, 'ograniczenie zapytań na przebieg');
assert.match(sql, /'https:\/\/geocoding-api\.open-meteo\.com\/v1\/search'/);
assert.match(sql, /when v_age >= 5 then 'https:\/\/archive-api\.open-meteo\.com\/v1\/archive' else 'https:\/\/api\.open-meteo\.com\/v1\/forecast'/);
assert.doesNotMatch(sql, /\b(update|delete from|insert into) public\.jobs\b/i, 'montaże bez zmian');
assert.doesNotMatch(sql, /client|phone|email|street/i, 'do serwisu pogodowego tylko miejscowość i data');
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261107150000_leak_test_temperature_cron_v1435\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/leak-test-temperature-cron-sql-v1435\.sh"/);
console.log('PASS WAWIS 14.35 — temperatura protokołu z serwera co 5 minut, bez nadpisywania, bez danych klienta.');
