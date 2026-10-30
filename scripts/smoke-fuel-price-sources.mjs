// WAWIS — źródła ceny „na stacji” dla oszczędności (decyzja właściciela 30.10.2026):
// 1) AutoCentrum — średnia tygodniowa ON dla Śląska, 2) zapaliwo.pl — średnia dzienna dla Śląska,
// 3) urzędowa cena maksymalna. Testy na fragmentach prawdziwych stron z 30.10.2026.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseAutocentrumWeekly,
  parseZapaliwoSlaskieDiesel,
  resolveWeekLabel,
} from '../supabase/functions/fuel-reference-prices/parse.js';
import { calculateFuelSavings, findStationPrice, fuelVatRateForDate } from '../src/modules/fuel-savings.js';

// 1. Odczyt stron.
const autocentrum = parseAutocentrumWeekly(fs.readFileSync('tests/fixtures/fuel-prices/autocentrum-slaskie-on-2026-10-30.html', 'utf8'), '2026-10-30');
assert.equal(autocentrum.length, 14, 'ostatnie 3 miesiące tygodni');
assert.deepEqual(autocentrum.at(-1), { periodStart: '2026-10-26', periodEnd: '2026-10-29', label: '26.10 - 29.10', gross: 7.98 });
assert.deepEqual(autocentrum.find((row) => row.periodStart === '2026-10-05'), { periodStart: '2026-10-05', periodEnd: '2026-10-11', label: '5.10 - 11.10', gross: 7.86 });
assert.equal(autocentrum[0].periodStart, '2026-07-31');
assert.deepEqual(resolveWeekLabel('29.12 - 4.01', '2027-01-05'), { periodStart: '2026-12-29', periodEnd: '2027-01-04' }, 'tydzień na przełomie roku');
assert.equal(resolveWeekLabel('5.10-11.10', 'zła data'), null);
assert.deepEqual(parseAutocentrumWeekly('<canvas data-chart=\'{"labels":["5.10 - 11.10"],"datasets":[{"label":"dolno\\u015bl\\u0105skie ON","data":[7.5]}]}\'>', '2026-10-30'), [], 'nie myli z dolnośląskim');

assert.equal(parseZapaliwoSlaskieDiesel(fs.readFileSync('tests/fixtures/fuel-prices/zapaliwo-2026-10-30.html', 'utf8')), 7.98, 'ON dla Śląskiego, nie Dolnośląskiego');
assert.equal(parseZapaliwoSlaskieDiesel('<th>Województwo</th><th>Pb95</th><th>Diesel (ON)</th><th>Pb98</th><td>Śląskie</td><td>6,44 zł</td><td>7,98 zł</td><td>6,91 zł</td>'), null, 'inna kolejność kolumn = brak (nie zgadujemy)');

// 2. VAT: obwieszczenie → okres programu „Ceny Paliwa Niżej” → 23%.
assert.equal(fuelVatRateForDate('2026-10-15', []), 8);
assert.equal(fuelVatRateForDate('2027-01-02', []), 23, 'po programie standardowy VAT');
assert.equal(fuelVatRateForDate('2027-01-02', [{ eli: 'x', act_pos: 1, valid_from: '2027-01-01', diesel_net: 7.4, diesel_gross: 7.99, vat_rate: 8 }]), 8, 'przedłużony program widać w obwieszczeniu');

// 3. Kolejność źródeł.
const market = [
  { source: 'autocentrum', region: 'slaskie', period_start: '2026-10-05', period_end: '2026-10-11', diesel_gross: 7.86, label: '5.10 - 11.10', source_url: 'https://www.autocentrum.pl/paliwa/ceny-paliw/slaskie/on/' },
  { source: 'autocentrum', region: 'slaskie', period_start: '2026-10-12', period_end: '2026-10-18', diesel_gross: 7.8, label: '12.10 - 18.10', source_url: 'https://www.autocentrum.pl/paliwa/ceny-paliw/slaskie/on/' },
  { source: 'autocentrum', region: 'slaskie', period_start: '2026-10-19', period_end: '2026-10-25', diesel_gross: 7.92, label: '19.10 - 25.10', source_url: 'https://www.autocentrum.pl/paliwa/ceny-paliw/slaskie/on/' },
  { source: 'zapaliwo', region: 'slaskie', period_start: '2026-10-30', period_end: '2026-10-30', diesel_gross: 7.98, label: 'śląskie 2026-10-30', source_url: 'https://zapaliwo.pl/' },
];
const official = [
  { eli: 'MP/2026/974', act_pos: 974, valid_from: '2026-10-07', diesel_net: 7.22, diesel_gross: 7.8, vat_rate: 8, source_url: 'https://api.sejm.gov.pl/eli/acts/MP/2026/974/text/O/M20260974.pdf' },
  { eli: 'MP/2026/1036', act_pos: 1036, valid_from: '2026-10-27', diesel_net: 7.57, diesel_gross: 8.18, vat_rate: 8, source_url: 'https://api.sejm.gov.pl/eli/acts/MP/2026/1036/text/O/M20261036.pdf' },
];
const week = findStationPrice({ marketPrices: market, referencePrices: official, dateKey: '2026-10-09' });
assert.equal(week.source, 'autocentrum');
assert.equal(week.gross, 7.86);
assert.ok(Math.abs(week.net - 7.86 / 1.08) < 1e-9, 'netto = brutto / 1,08');
const day = findStationPrice({ marketPrices: market, referencePrices: official, dateKey: '2026-11-01' });
assert.equal(day.source, 'zapaliwo', 'brak tygodnia w AutoCentrum → dzienna średnia (do 3 dni wstecz)');
assert.equal(day.gross, 7.98);
const fallback = findStationPrice({ marketPrices: market, referencePrices: official, dateKey: '2026-10-28' });
assert.equal(fallback.source, 'urzedowa', 'brak średnich na ten dzień → cena urzędowa');
assert.equal(fallback.net, 7.57);
assert.equal(findStationPrice({ marketPrices: market, referencePrices: official, dateKey: '2026-11-10' }), null, 'zbyt stara średnia dzienna i brak obwieszczenia = brak');

// 4. Wynik na danych z produkcji (3 tankowania od dostawy 7.10): 93,21 zł netto (wcześniej 107,49 wg ceny maksymalnej).
const result = calculateFuelSavings({
  movements: [
    { id: 'open', movement_type: 'opening', delta_liters: 5000, happened_at: '2026-10-07T07:57:00Z', purchase_gross_per_liter: 7.25, purchase_vat_rate: 8, purchase_net_per_liter: 6.713 },
    { id: 'r1', movement_type: 'refuel', delta_liters: -56.9, happened_at: '2026-10-09T12:48:01Z' },
    { id: 'r2', movement_type: 'refuel', delta_liters: -56.73, happened_at: '2026-10-12T05:49:27Z' },
    { id: 'r3', movement_type: 'refuel', delta_liters: -51.87, happened_at: '2026-10-21T06:07:59Z' },
  ],
  referencePrices: official,
  marketPrices: market,
  now: new Date('2026-10-30T10:00:00Z'),
});
const byId = Object.fromEntries(result.refuels.map((row) => [row.id, row]));
assert.equal(byId.r1.savingsNet, 32.14);
assert.equal(byId.r2.savingsNet, 28.89);
assert.equal(byId.r3.savingsNet, 32.18);
assert.equal(byId.r3.reference.source, 'autocentrum');
assert.equal(result.totalSavingsNet, 93.21);
assert.equal(result.todayReference.source, 'zapaliwo');

// 5. Funkcja Edge i przygotowana migracja.
const fn = fs.readFileSync('supabase/functions/fuel-reference-prices/index.ts', 'utf8');
assert.doesNotMatch(fn, /probe-wob|xlsx/, 'biuletyn UE odrzucony przez właściciela — bez martwego kodu');
const snapshot = fn.slice(fn.indexOf('if (request.headers.get("x-wawis-snapshot") === "1")'), fn.indexOf('const supabaseUrl = Deno.env.get("SUPABASE_URL")'));
assert.match(snapshot, /syncMarketPrices\(createClient\(url, key\), \{ respectRateLimit: true \}\)/);
assert.doesNotMatch(snapshot, /fuel_reference_prices|fuel_tank_movements|purchase_/, 'tryb codzienny zapisuje tylko publiczne średnie ceny');
assert.match(fn, /from\("fuel_market_prices"\)\.upsert\(rows, \{ onConflict: "source,region,period_start" \}\)/);
assert.match(fn, /rpc\("current_user_is_admin"\)[^]*isAdmin !== true\) return json/);
const migrationFile = 'supabase/migrations/20261030102441_fuel_market_prices_slaskie.sql';
const pending = fs.readFileSync(migrationFile, 'utf8');
assert.match(pending, /wdrożone 30\.10\.2026 na polecenie właściciela/);
assert.match(pending, /create policy fuel_market_prices_admin_select[^;]*current_user_is_admin/);
assert.match(pending, /revoke all on table public\.fuel_market_prices from public, anon, authenticated;/);
assert.doesNotMatch(pending, /\b(drop table|delete from|truncate)\b/i, 'nic nie jest usuwane');
assert.ok(!fs.existsSync('supabase/pending/fuel_market_prices_slaskie.sql'), 'plik przeniesiony z pending do migracji');
const registry = JSON.parse(fs.readFileSync('supabase/PRODUCTION-MIGRATIONS.json', 'utf8'));
const applied = registry.migrations.find((row) => row.version === '20261030102441');
assert.equal(applied?.md5, 'c038d9c5a5a80c2e2bef7112e717d4f4', 'treść identyczna z SQL wykonanym na produkcji');
const rebuild = JSON.parse(fs.readFileSync('supabase/rebuild/manifest-v1089.json', 'utf8'));
assert.ok(JSON.stringify(rebuild).includes(migrationFile), 'migracja w manifeście odtworzenia bazy');
const loader = fs.readFileSync('src/modules/fuel-savings.js', 'utf8');
assert.match(loader, /if \(marketResult\.error\) console\.warn/, 'brak tabeli średnich nie psuje zakładki (zostają ceny urzędowe)');

console.log('OK smoke-fuel-price-sources: AutoCentrum → zapaliwo.pl → urzędowa; Śląsk 93,21 zł netto; tryb codzienny tylko ceny publiczne');
