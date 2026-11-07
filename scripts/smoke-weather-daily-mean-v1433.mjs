// WAWIS 14.33 — średnia temperatura dnia badania (Open-Meteo): archiwum dla starszych dni, dane bieżące dla
// ostatnich, null dla przyszłości i braku danych, wyjątek przy błędzie sieci. E2E: leak-test-installer-v1432.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clearWeatherCacheForTests, dailyMeanTemperature } from '../src/modules/weather-daily-mean.js';

const calls = [];
const fakeFetch = (handler) => async (url) => { calls.push(url); const body = handler(url); return { ok: body !== 'fail', status: body === 'fail' ? 500 : 200, json: async () => body }; };
const geo = { results: [{ name: 'Zawiercie', latitude: 50.49, longitude: 19.42 }] };
const now = new Date('2026-11-07T08:00:00Z');

clearWeatherCacheForTests();
let fetchImpl = fakeFetch((url) => (url.includes('geocoding') ? geo : { daily: { temperature_2m_mean: [7.6] } }));
assert.equal(await dailyMeanTemperature({ city: 'Zawiercie', date: '2026-10-01', fetchImpl, now }), 8);
assert.match(calls.at(-1), /^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?latitude=50\.49&longitude=19\.42&start_date=2026-10-01&end_date=2026-10-01&daily=temperature_2m_mean&timezone=Europe%2FWarsaw$/);
const before = calls.length;
assert.equal(await dailyMeanTemperature({ city: ' zawiercie ', date: '2026-10-01', fetchImpl, now }), 8, 'pamięć podręczna');
assert.equal(calls.length, before, 'bez ponownego zapytania');

// Ostatnie dni: archiwum puste → dane bieżące.
clearWeatherCacheForTests(); calls.length = 0;
fetchImpl = fakeFetch((url) => (url.includes('geocoding') ? geo : url.includes('archive') ? { daily: { temperature_2m_mean: [null] } } : { daily: { temperature_2m_mean: [3.2] } }));
assert.equal(await dailyMeanTemperature({ city: 'Zawiercie', date: '2026-11-05', fetchImpl, now }), 3);
assert.ok(calls.some((url) => url.startsWith('https://api.open-meteo.com/v1/forecast?')), 'dane bieżące dla ostatnich dni');
assert.ok(!calls.some((url) => url.includes('archive')), '2 dni temu — bez archiwum');

assert.equal(await dailyMeanTemperature({ city: 'Zawiercie', date: '2026-11-09', fetchImpl, now }), null, 'przyszłość');
assert.equal(await dailyMeanTemperature({ city: '', date: '2026-10-01', fetchImpl, now }), null, 'bez miejscowości');
clearWeatherCacheForTests();
assert.equal(await dailyMeanTemperature({ city: 'Xyz', date: '2026-10-01', fetchImpl: fakeFetch(() => ({ results: [] })), now }), null, 'nieznana miejscowość');
clearWeatherCacheForTests();
await assert.rejects(dailyMeanTemperature({ city: 'Zawiercie', date: '2026-10-01', fetchImpl: fakeFetch(() => 'fail'), now }), /HTTP 500/, 'błąd sieci ≠ brak danych');

const panel = fs.readFileSync(new URL('../src/components/leak-tests/LeakTestsPanel.jsx', import.meta.url), 'utf8');
assert.match(panel, /dailyMeanTemperature\(\{ city: row\.city, date \}\)/);
assert.match(panel, /if \(!current \|\| current\.testDate !== date \|\| String\(current\.temperature \|\| ''\)\.trim\(\)\) return prev;/, 'nie nadpisuje wpisanej temperatury');
assert.doesNotMatch(panel, /saveLeakTest\([^)]*tempAuto/, 'podpowiedź nie zapisuje się sama');
console.log('PASS WAWIS 14.33 — średnia temperatura dnia badania: archiwum / dane bieżące, pamięć, bez nadpisywania wpisu.');
