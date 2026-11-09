// WAWIS 14.42 — miejscowość z kodem pocztowym („42-400 Zawiercie”) → wyszukiwanie pogody bez kodu (aplikacja i serwer).
// SQL: scripts/leak-test-city-postal-sql-v1442.sh (PostgreSQL 16, atrapa pg_net).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clearWeatherCacheForTests, dailyMeanTemperature, normalizeCity } from '../src/modules/weather-daily-mean.js';

assert.equal(normalizeCity('42-400 Zawiercie'), 'Zawiercie');
assert.equal(normalizeCity(' 42 - 427  Pradła '), 'Pradła');
assert.equal(normalizeCity('41-300, Dąbrowa  Górnicza'), 'Dąbrowa Górnicza');
assert.equal(normalizeCity('Zawiercie'), 'Zawiercie');
clearWeatherCacheForTests();
const calls = [];
const fetchImpl = async (url) => { calls.push(url); return { ok: true, json: async () => (url.includes('geocoding') ? { results: [{ latitude: 50.49, longitude: 19.42 }] } : { daily: { temperature_2m_mean: [4.4] } }) }; };
assert.equal(await dailyMeanTemperature({ city: '42-400 Zawiercie', date: '2026-10-01', fetchImpl, now: new Date('2026-11-09T10:00:00Z') }), 4);
assert.match(calls[0], /[?&]name=Zawiercie&/, 'geokodowanie bez kodu pocztowego');

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261109180000_leak_test_city_postal_v1442.sql');
assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /btrim\(j\.city\)/, 'serwer: wszędzie nazwa bez kodu');
assert.doesNotMatch(sql, /\b(update|delete from|insert into) public\.jobs\b/i, 'montaże bez zmian');
const afterFunction = sql.slice(sql.indexOf('revoke all on function private.leak_test_temperature_tick_v1435()'));
assert.doesNotMatch(afterFunction, /\b(update|delete from|insert into) public\./i, 'jednorazowa poprawka tylko w kolejce (private)');
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261109180000_leak_test_city_postal_v1442\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/leak-test-city-postal-sql-v1442\.sh"/);
console.log('PASS WAWIS 14.42 — miejscowość bez kodu pocztowego (aplikacja i serwer).');
