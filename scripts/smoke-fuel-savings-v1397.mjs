// WAWIS 13.97 — oszczędności na własnym zbiorniku: odczyt cen z obwieszczeń, liczenie FIFO, tylko administrator.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  addDays,
  isFuelPriceAct,
  parseDieselPrice,
  parsePublishedOnFromText,
  pdfUrlForAct,
  resolveValidFrom,
} from '../supabase/functions/fuel-reference-prices/parse.js';
import { calculateFuelSavings, findReferencePrice, normalizeFuelPricePerLiter, warsawDateKey } from '../src/modules/fuel-savings.js';

// 1. Treść obwieszczenia w formacie z Monitora Polskiego (MP 2026 poz. 1036 — API Sejmu podaje datę 23.10, dokument 26.10).
const act1036 = `MONITOR POLSKI DZIENNIK URZĘDOWY RZECZYPOSPOLITEJ POLSKIEJ Warszawa, dnia 26 października 2026 r. Poz. 1036
OB W IE S Z CZ E N I E M IN I S TR A EN E RG II 1) z dnia 26 października 2026 r. w sprawie maksymalnej ceny paliw ciekłych na stacji paliw
Na podstawie art. 34a ust. 5 ustawy z dnia 16 lutego 2007 r. o zapasach ropy naftowej ... na stacji paliw:
1) dla benzyny silnikowej bezołowiowej 95 (CN 2710 12 45): a) wynosi 6,09 zł za 1 dm3, b) powiększona o podatek od towarów i usług wynosi 6,58 zł za 1 l;
2) dla benzyny silnikowej bezołowiowej 98 (CN 2710 12 49): a) wynosi 6,90 zł za 1 dm3, b) powiększona o podatek od towarów i usług wynosi 7,45 zł za 1 l;
3) dla oleju napędowego (CN 2710 19 42, 2710 19 44 i 2710 20 11): a) wynosi 7,57 zł za 1 dm3, b) powiększona o podatek od towarów i usług wynosi 8,18 zł za 1 l;`;
assert.deepEqual(parseDieselPrice(act1036), { net: 7.57, gross: 8.18, vatRate: 8 }, 'cena oleju napędowego (nie benzyny)');
assert.equal(parsePublishedOnFromText(act1036), '2026-10-26', 'data z dokumentu, nie z metadanych API');
assert.equal(resolveValidFrom({ text: act1036, promulgation: '2026-10-23' }), '2026-10-27', 'obowiązuje od dnia po ogłoszeniu');
assert.equal(resolveValidFrom({ text: 'brak dat', promulgation: '2026-10-09' }), '2026-10-10');
assert.equal(resolveValidFrom({ text: 'cena obowiązująca w dniach 10–12 października 2026 r.', promulgation: '2026-10-09' }), '2026-10-10');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(parseDieselPrice('dla oleju napędowego: wynosi 7,22 zł za 1 dm3, powiększona o podatek wynosi 8,88 zł za 1 l').vatRate, 23);
assert.equal(parseDieselPrice('brak oleju w treści'), null);
assert.equal(parseDieselPrice('dla oleju napędowego: wynosi 99,22 zł za 1 dm3'), null, 'niepełna lub absurdalna cena = brak');
assert.equal(pdfUrlForAct({ year: 2026, pos: 974 }), 'https://api.sejm.gov.pl/eli/acts/MP/2026/974/text/O/M20260974.pdf');
assert.equal(isFuelPriceAct({ publisher: 'MP', title: 'Obwieszczenie Ministra Energii z dnia 6 października 2026 r. w sprawie maksymalnej ceny paliw ciekłych na stacji paliw' }), true);
assert.equal(isFuelPriceAct({ publisher: 'MP', title: 'Obwieszczenie Prezesa GUS w sprawie cen' }), false);

// 2. Liczenie na danych z produkcji (28.10.2026): dostawa 5000 l po 7,25 zł brutto (VAT 8%) i trzy tankowania.
const movements = [
  { id: 'open', movement_type: 'opening', delta_liters: 5000, happened_at: '2026-10-07T07:57:00Z', purchase_gross_per_liter: 7.25, purchase_vat_rate: 8, purchase_net_per_liter: 6.713 },
  { id: 'r1', movement_type: 'refuel', delta_liters: -56.9, fuel_entry_id: 'e1', happened_at: '2026-10-09T12:48:01Z' },
  { id: 'r2', movement_type: 'refuel', delta_liters: -56.73, fuel_entry_id: 'e2', happened_at: '2026-10-12T05:49:27Z' },
  { id: 'r3', movement_type: 'refuel', delta_liters: -51.87, fuel_entry_id: 'e3', happened_at: '2026-10-21T06:07:59Z' },
];
const referencePrices = [
  { eli: 'MP/2026/974', act_pos: 974, valid_from: '2026-10-07', diesel_net: 7.22, diesel_gross: 7.8 },
  { eli: 'MP/2026/983', act_pos: 983, valid_from: '2026-10-09', diesel_net: 7.24, diesel_gross: 7.82 },
  { eli: 'MP/2026/985', act_pos: 985, valid_from: '2026-10-10', diesel_net: 7.46, diesel_gross: 8.06 },
  { eli: 'MP/2026/1022', act_pos: 1022, valid_from: '2026-10-21', diesel_net: 7.39, diesel_gross: 7.98 },
];
const entries = [{ id: 'e1', vehicle_id: 'v1' }, { id: 'e2', vehicle_id: 'v1' }, { id: 'e3', vehicle_id: 'v2' }];
const vehicles = [{ id: 'v1', registration_number: 'SZA 6149G' }, { id: 'v2', registration_number: 'SZA 0673A' }];
const result = calculateFuelSavings({ movements, referencePrices, entries, vehicles, now: new Date('2026-10-28T10:00:00Z') });

assert.equal(findReferencePrice(referencePrices, '2026-10-12').eli, 'MP/2026/985', 'weekendowe obwieszczenie obowiązuje do następnego');
assert.equal(findReferencePrice(referencePrices, '2026-11-20'), null, 'cena starsza niż 7 dni = brak (luka)');
assert.equal(warsawDateKey('2026-10-31T23:30:00Z'), '2026-11-01', 'dzień tankowania wg czasu polskiego');
const byId = Object.fromEntries(result.refuels.map((row) => [row.id, row]));
assert.equal(byId.r1.savingsNet, 29.99);
assert.equal(byId.r2.savingsNet, 42.38);
assert.equal(byId.r3.savingsNet, 35.12);
assert.equal(byId.r3.vehicleLabel, 'SZA 0673A');
assert.equal(result.totalSavingsNet, 107.49);
assert.equal(result.countedLiters, 165.5);
assert.equal(result.remainingLiters, 4834.5);
assert.equal(result.monthSavingsNet, 107.49);
assert.equal(result.deliveriesWithoutPrice.length, 0);
assert.equal(result.refuels[0].id, 'r3', 'najnowsze tankowanie na górze');

// 3. FIFO przez dwie dostawy i dostawa bez ceny.
const fifo = calculateFuelSavings({
  movements: [
    { id: 'a', movement_type: 'opening', delta_liters: 100, happened_at: '2026-10-07T07:00:00Z', purchase_net_per_liter: 6 },
    { id: 'b', movement_type: 'delivery', delta_liters: 100, happened_at: '2026-10-08T07:00:00Z' },
    { id: 'c', movement_type: 'refuel', delta_liters: -80, happened_at: '2026-10-09T07:00:00Z' },
    { id: 'd', movement_type: 'refuel', delta_liters: -40, happened_at: '2026-10-09T09:00:00Z' },
  ],
  referencePrices,
  now: new Date('2026-10-09T10:00:00Z'),
});
const fifoById = Object.fromEntries(fifo.refuels.map((row) => [row.id, row]));
assert.equal(fifoById.c.savingsNet, round(80 * 7.24 - 80 * 6));
assert.equal(fifoById.d.savingsNet, null, 'część litrów z dostawy bez ceny — nie liczymy na ślepo');
assert.equal(fifoById.d.missingReason, 'Brak ceny zakupu dostawy');
assert.equal(fifo.deliveriesWithoutPrice.length, 1);
function round(value) { return Math.round(value * 100) / 100; }

assert.equal(normalizeFuelPricePerLiter('7,25'), 7.25);
assert.throws(() => normalizeFuelPricePerLiter('0'));

// 4. Tylko administrator i tylko komputer; dane cen w bazie tylko dla administratora.
const base = fs.readFileSync('src/components/fuel/FuelPanelBase.jsx', 'utf8');
assert.match(base, /const displayVehicleOverview = Boolean\(showVehicleOverview && isAdmin\);/);
assert.match(base, /\{displayVehicleOverview \? \(\s*<section className="fuelCard fuelSavings"[^]*?<FuelSavingsPanel/, 'zakładka tylko w widoku administratora na komputerze');
assert.match(base, /displayVehicleOverview && String\(tankDeliveryPrice \|\| ''\)\.trim\(\)/, 'cena dostawy tylko na komputerze');
const panel = fs.readFileSync('src/components/fuel/FuelSavingsPanel.jsx', 'utf8');
assert.match(panel, /if \(!isAdmin\) return null;/);
const mobileApp = fs.readFileSync('src/mobile791/App.jsx', 'utf8');
assert.doesNotMatch(mobileApp, /showVehicleOverview/, 'telefon nie włącza widoku administratora floty');
const migration = fs.readFileSync('supabase/migrations/20261028103628_fuel_savings_v1389.sql', 'utf8');
assert.match(migration, /create policy fuel_reference_prices_admin_select[^;]*using \(\(select public\.current_user_is_admin\(\)\)\)/);
assert.match(migration, /revoke all on table public\.fuel_reference_prices from public, anon, authenticated;/);
assert.match(migration, /raise exception 'Tylko administrator może ustawiać cenę paliwa\.'/);
const fn = fs.readFileSync('supabase/functions/fuel-reference-prices/index.ts', 'utf8');
assert.match(fn, /rpc\("current_user_is_admin"\)[^]*isAdmin !== true\) return json\(\{ error: "Tylko administrator/, 'zapis cen tylko po sprawdzeniu administratora');

console.log('OK smoke-fuel-savings-v1397: ceny z obwieszczeń, oszczędność 107,49 zł netto na danych z 28.10, FIFO, tylko administrator');
