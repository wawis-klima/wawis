import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addFuelEntry, addFuelVehicle, calculateFuelConsumptionStats, calculateFuelMonthlyReport, checkFuelOdometerProgression, checkRapidFuelRefill, normalizeFuelTankCapacity, normalizeRegistrationNumber, updateFuelEntry, updateFuelVehicleTankCapacity } from '../src/modules/fuel.js';
import { normalizeOdometerAiResult } from '../src/modules/fuel-odometer-ai.js';
import { extractLabeledOdometer, selectOdometerOcrConsensus } from '../src/modules/fuel-odometer-ocr.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(normalizeRegistrationNumber('  sza 12345 '), 'SZA 12345');
assert.equal(normalizeOdometerAiResult({ odometer_km: 125400, confidence: .94, display_kind: 'odometer', visible_digits: '125400' }).odometerKm, 125400);
assert.throws(() => normalizeOdometerAiResult({ odometer_km: 321, confidence: .99, display_kind: 'trip' }), /główn.*licznik/i);
assert.equal(extractLabeledOdometer('ODO 125 400 km'), 125400);
assert.equal(extractLabeledOdometer('TRIP A 321.4 km'), null, 'Lokalny OCR nie może uznać licznika dziennego.');
assert.equal(selectOdometerOcrConsensus([
  { text: 'ODO 125400 km', confidence: 70 },
  { text: '125400 km ODO', confidence: 67 },
]).odometerKm, 125400, 'Dwa zgodne przebiegi lokalnego OCR powinny zostać zaakceptowane.');
assert.equal(selectOdometerOcrConsensus([{ text: 'ODO 125400 km', confidence: 60 }]).reliable, false, 'Niepewny pojedynczy odczyt musi przejść do OpenAI.');
assert.deepEqual(checkFuelOdometerProgression({ previousKm: 125400, nextKm: 126000 }), { status: 'ok', deltaKm: 600 });
assert.deepEqual(checkFuelOdometerProgression({ previousKm: 125400, nextKm: 124900 }), { status: 'lower', deltaKm: -500 });
assert.deepEqual(checkFuelOdometerProgression({ previousKm: 125400, nextKm: 128000 }), { status: 'confirm', deltaKm: 2600 });
assert.deepEqual(checkFuelOdometerProgression({ previousKm: 125400, nextKm: 131000 }), { status: 'photo_required', deltaKm: 5600 });
assert.deepEqual(checkFuelOdometerProgression({ previousKm: 125400, nextKm: 131000, hasPhoto: true }), { status: 'confirm', deltaKm: 5600 });
assert.deepEqual(checkRapidFuelRefill({ previousKm: 125400, nextKm: 125460 }), { shouldConfirm: true, deltaKm: 60 });
assert.deepEqual(checkRapidFuelRefill({ previousKm: 125400, nextKm: 125500 }), { shouldConfirm: false, deltaKm: 100 });

const consumptionStats = calculateFuelConsumptionStats([
  { id: 'fuel-3', liters: 45, odometer_km: 101100, fueled_at: '2026-09-03T08:00:00Z' },
  { id: 'fuel-1', liters: 40, odometer_km: 100000, fueled_at: '2026-09-01T08:00:00Z' },
  { id: 'fuel-2', liters: 48, odometer_km: 100600, fueled_at: '2026-09-02T08:00:00Z' },
]);
assert.equal(consumptionStats.intervalCount, 2, 'Pierwszy wpis ustala punkt startowy i nie może sam tworzyć spalania.');
assert.equal(consumptionStats.totalDistanceKm, 1100);
assert.equal(consumptionStats.totalLitersConsumed, 93);
assert.ok(Math.abs(consumptionStats.averageConsumption - (93 / 1100 * 100)) < 0.000001, 'Średnia ma być ważona łącznym dystansem.');
assert.equal(consumptionStats.lastConsumption, 9);
assert.equal(calculateFuelConsumptionStats([{ liters: 50, odometer_km: 125000, fueled_at: '2026-09-01T08:00:00Z' }]).averageConsumption, null, 'Po pierwszym tankowaniu spalanie nie jest jeszcze dostępne.');

assert.equal(normalizeFuelTankCapacity('60'), 60);
assert.equal(normalizeFuelTankCapacity('80,5'), 80.5);
assert.equal(normalizeFuelTankCapacity(''), null);
assert.throws(() => normalizeFuelTankCapacity('0'), /pojemność baku/i);

const anomalyStats = calculateFuelConsumptionStats([
  { id: 'a0', liters: 10, odometer_km: 100000, fueled_at: '2026-09-01T08:00:00Z' },
  { id: 'a1', liters: 50, odometer_km: 100625, fueled_at: '2026-09-02T08:00:00Z' },
  { id: 'a2', liters: 48, odometer_km: 101225, fueled_at: '2026-09-03T08:00:00Z' },
  { id: 'a3', liters: 60, odometer_km: 101725, fueled_at: '2026-09-04T08:00:00Z' },
]);
assert.equal(anomalyStats.intervals.length, 3);
assert.equal(anomalyStats.lastConsumption, 12);
assert.equal(anomalyStats.lastConsumptionUnusual, true, '12 l/100 km powinno zostać oznaczone jako nietypowe względem wcześniejszych ~8 l/100 km.');
assert.ok(anomalyStats.lastConsumptionChangePercent > 40);
const noEarlyAnomaly = calculateFuelConsumptionStats([
  { id: 'b0', liters: 10, odometer_km: 100000, fueled_at: '2026-09-01T08:00:00Z' },
  { id: 'b1', liters: 60, odometer_km: 100500, fueled_at: '2026-09-02T08:00:00Z' },
]);
assert.equal(noEarlyAnomaly.lastConsumptionUnusual, false, 'Pierwszy wyliczony interwał nie może generować alarmu bez historii.');

const monthlyReport = calculateFuelMonthlyReport({
  monthKey: '2026-09',
  vehicles: [{ id: 'v1', vehicle_name: 'Doblo', registration_number: 'SZA 1' }],
  entries: [
    { id: 'm0', vehicle_id: 'v1', liters: 10, odometer_km: 100000, fueled_at: '2026-08-31T08:00:00Z' },
    { id: 'm1', vehicle_id: 'v1', liters: 50, odometer_km: 100625, fueled_at: '2026-09-05T08:00:00Z' },
    { id: 'm2', vehicle_id: 'v1', liters: 48, odometer_km: 101225, fueled_at: '2026-09-20T08:00:00Z' },
  ],
});
assert.equal(monthlyReport.totals.tankings, 2);
assert.equal(monthlyReport.totals.fueledLiters, 98);
assert.equal(monthlyReport.totals.distanceKm, 1225);
assert.ok(monthlyReport.totals.averageConsumption > 7 && monthlyReport.totals.averageConsumption < 9);

await assert.rejects(
  addFuelEntry({ supabase: null, isAdmin: false, vehicleId: 'vehicle', liters: '40', odometerKm: '1000' }),
  /aktywnego połączenia/i,
);

let insertedPayload = null;
let uploadedPath = '';
let uploadCount = 0;
let sessionCount = 0;
const fakeQuery = {
  insert(payload) { insertedPayload = payload; return this; },
  select() { return this; },
  async single() {
    return { data: { id: 'entry', ...insertedPayload, fueled_at: '2026-09-08T14:30:00Z' }, error: null };
  },
};
const fakeSupabase = {
  auth: { async getSession() { sessionCount += 1; return { data: { session: { user: { id: 'worker-1' } } } }; } },
  from(table) { assert.equal(table, 'fuel_entries'); return fakeQuery; },
  storage: {
    from(bucket) {
      assert.equal(bucket, 'fuel-odometer-photos');
      return {
        async upload(photoPath) { uploadCount += 1; uploadedPath = photoPath; return { data: {}, error: null }; },
        async remove() { return { data: {}, error: null }; },
      };
    },
  },
};
const photo = new Blob(['odometer'], { type: 'image/jpeg' });
await addFuelEntry({
  supabase: fakeSupabase,
  isAdmin: false,
  vehicleId: 'vehicle',
  liters: '48,5',
  odometerKm: '125400',
  odometerPhotoBlob: photo,
  odometerAiConfidence: .94,
  odometerReadSource: 'local_ocr',
});
assert.match(uploadedPath, /^worker-1\/.*\.jpg$/, 'Zdjęcie pracownika musi trafić wyłącznie do jego katalogu.');
assert.equal(insertedPayload.vehicle_id, 'vehicle');
assert.equal(insertedPayload.liters, 48.5);
assert.equal(insertedPayload.odometer_km, 125400);
assert.equal(insertedPayload.odometer_photo_path, uploadedPath);
assert.equal(insertedPayload.odometer_ai_confidence, .94);
assert.equal(insertedPayload.odometer_read_source, 'local_ocr');
assert.equal(Object.hasOwn(insertedPayload, 'fueled_at'), false, 'Czas ma nadawać baza, nie telefon.');

insertedPayload = null;
uploadedPath = '';
await addFuelEntry({
  supabase: fakeSupabase,
  isAdmin: false,
  vehicleId: 'vehicle',
  liters: '20',
  odometerKm: '125500',
  odometerReadSource: 'manual',
});
assert.equal(uploadCount, 1, 'Ręczny przebieg nie może uruchamiać wysyłania zdjęcia.');
assert.equal(sessionCount, 1, 'Ręczny przebieg nie potrzebuje osobnego odczytu sesji do Storage.');
assert.equal(uploadedPath, '');
assert.equal(insertedPayload.odometer_km, 125500);
assert.equal(insertedPayload.odometer_photo_path, null);
assert.equal(insertedPayload.odometer_ai_confidence, null);
assert.equal(insertedPayload.odometer_read_source, 'manual');
await assert.rejects(
  addFuelEntry({ supabase: fakeSupabase, isAdmin: false, vehicleId: 'vehicle', liters: '61', tankCapacityLiters: '60', odometerKm: '125600' }),
  /pojemność baku.*60/i,
);
await assert.rejects(
  addFuelVehicle({ supabase: fakeSupabase, isAdmin: false, registrationNumber: 'SZA 11111' }),
  /tylko administrator/i,
);

let vehicleUpdatePayload = null;
const fakeVehicleSupabase = {
  from(table) {
    assert.equal(table, 'fuel_vehicles');
    return {
      update(payload) { vehicleUpdatePayload = payload; return this; },
      eq() { return this; },
      select() { return this; },
      async single() { return { data: { id: 'vehicle', vehicle_name: 'Doblo', registration_number: 'SZA 1', is_active: true, ...vehicleUpdatePayload }, error: null }; },
    };
  },
};
const updatedVehicle = await updateFuelVehicleTankCapacity({ supabase: fakeVehicleSupabase, isAdmin: true, vehicleId: 'vehicle', tankCapacityLiters: '60,5' });
assert.equal(vehicleUpdatePayload.tank_capacity_liters, 60.5);
assert.equal(updatedVehicle.tank_capacity_liters, 60.5);

let correctedPayload = null;
const fakeCorrectionSupabase = {
  from(table) {
    assert.equal(table, 'fuel_entries');
    return {
      update(payload) { correctedPayload = payload; return this; },
      eq() { return this; },
      select() { return this; },
      async single() { return { data: { id: 'entry-1', vehicle_id: 'vehicle', fueled_at: '2026-09-09T08:00:00Z', created_by: 'worker-1', created_at: '2026-09-09T08:00:00Z', correction_count: 1, ...correctedPayload }, error: null }; },
    };
  },
};
const correctedEntry = await updateFuelEntry({ supabase: fakeCorrectionSupabase, isAdmin: true, entryId: 'entry-1', liters: '47,5', odometerKm: '125480', tankCapacityLiters: '60' });
assert.equal(correctedPayload.liters, 47.5);
assert.equal(correctedPayload.odometer_km, 125480);
assert.equal(correctedEntry.correction_count, 1);

const desktopApp = read('src/App.jsx');
const mobileApp = read('src/mobile791/App.jsx');
const desktopModules = read('src/components/layout/ModuleSwitcher.jsx');
const mobileModules = read('src/mobile791/components/layout/ModuleSwitcher.jsx');
const baseMigration = read('supabase/setup-fuel-module-v10.14.sql');
const photoMigration = read('supabase/setup-fuel-odometer-photo-v10.15.sql');
const sourceMigration = read('supabase/setup-fuel-odometer-source-v10.16.sql');
const workerMigration = read('supabase/setup-fuel-fleet-worker-access-v10.17.sql');
const odometerGuardMigration = read('supabase/setup-fuel-odometer-guard-v10.19.sql');
const tankCapacityMigration = read('supabase/setup-fuel-tank-capacity-v10.25.sql');
const productionMigration = read('supabase/setup-fuel-production-v10.26.sql');
const mobileLayout = read('src/mobile791/components/layout/AppAuthenticatedLayout.jsx');
const mainLayout = read('src/components/layout/AppAuthenticatedLayout.jsx');
const panel = read('src/components/fuel/FuelPanel.jsx');
const fuelPushSource = read('src/modules/fuel-push.js');
const pushEdge = read('supabase/functions/send-fuel-entry-push/index.ts');
const endpoint = read('api/read-odometer-ai.js');
const reader = read('src/modules/fuel-odometer-reader.js');

assert.match(desktopApp, /activeModule === ["']fuel["']/);
assert.match(desktopApp, /showVehicleOverview/, 'Desktop ma włączać zestawienie tankowań według samochodu.');
assert.match(mobileApp, /activeModule === ["']fuel["']/);
assert.doesNotMatch(mobileApp, /showVehicleOverview/, 'Mobilna wersja nie może włączać tabeli samochodów.');
assert.doesNotMatch(mobileApp, /!isAdmin[^\n]*activeModule === ["']fuel["']/, 'Mobilny pracownik nie może być wyrzucany z modułu paliwa.');
assert.match(desktopModules, /id: ["']fuel["']/);
assert.match(mobileModules, /id: ["']fuel["']/);
assert.doesNotMatch(mobileModules, /diagnostics|Diag\./i, 'Diagnostyka ma zniknąć wyłącznie z mobilnego menu.');
assert.doesNotMatch(mobileModules, /Urządzenia/, 'Urządzenia mają być całkowicie usunięte z mobilnego przełącznika.');
assert.match(mobileModules, /\["jobs", "fuel"\]\.includes\(module\.id\)/, 'Pracownik mobilny ma mieć dokładnie Montaże i Paliwo.');

assert.match(baseMigration, /alter table public\.fuel_vehicles enable row level security/i);
assert.match(baseMigration, /alter table public\.fuel_entries enable row level security/i);
assert.ok((baseMigration.match(/current_user_is_admin\(\)/g) || []).length >= 8, 'Każda operacja obu tabel musi wymagać administratora.');
assert.match(baseMigration, /fueled_at timestamptz not null default now\(\)/i);

assert.match(photoMigration, /'fuel-odometer-photos',[\s\S]*false/i, 'Bucket zdjęć licznika musi być prywatny.');
assert.ok((photoMigration.match(/current_user_is_admin\(\)/g) || []).length >= 3, 'Zdjęcia licznika muszą być chronione rolą administratora.');
assert.match(photoMigration, /storage\.foldername\(name\).*auth\.uid\(\)/s);
assert.match(sourceMigration, /odometer_read_source/);
assert.match(sourceMigration, /local_ocr.*openai.*manual/s);
for (const registration of ['SZA 6149G', 'SZA 0673A', 'SZA 60398', 'EL 8GP61', 'KR 9UH22']) assert.match(workerMigration, new RegExp(registration));
assert.match(workerMigration, /created_by = \(select auth\.uid\(\)\)[\s\S]*current_user_is_admin\(\)/, 'Pracownik ma widzieć swoje wpisy, a administrator wszystkie.');
assert.match(workerMigration, /fuel_vehicles_fleet_select[\s\S]*is_active[\s\S]*current_user_is_admin\(\)/);
assert.match(workerMigration, /storage\.foldername\(name\).*auth\.uid\(\)/s);
assert.match(odometerGuardMigration, /last_odometer_km/);
assert.match(odometerGuardMigration, /odometer_delta > 5000[\s\S]*odometer_photo_path/);
assert.match(odometerGuardMigration, /odometer_delta < 0/);
assert.match(odometerGuardMigration, /security definer[\s\S]*set search_path = ''/);
assert.match(odometerGuardMigration, /revoke all on function private\.validate_fuel_entry_odometer_v1019\(\) from public, anon, authenticated/);
assert.match(tankCapacityMigration, /tank_capacity_liters numeric\(6,2\)/);
assert.match(tankCapacityMigration, /new\.liters > vehicle_capacity/);
assert.match(tankCapacityMigration, /security definer[\s\S]*set search_path = ''/);
assert.match(tankCapacityMigration, /revoke all on function private\.validate_fuel_entry_capacity_v1025\(\) from public, anon, authenticated/);
assert.match(productionMigration, /corrected_by uuid/);
assert.match(productionMigration, /original_liters numeric\(7,2\)/);
assert.match(productionMigration, /new\.created_by := old\.created_by/);
assert.match(productionMigration, /new\.correction_count := coalesce\(old\.correction_count, 0\) \+ 1/);
assert.match(productionMigration, /Poprawiony przebieg nie może być niższy niż poprzednie tankowanie/);
assert.match(productionMigration, /Poprawiony przebieg nie może być wyższy niż następne tankowanie/);
assert.match(panel, /type="file" accept="image\/\*" capture="environment"/);
assert.match(panel, /Sprawdź cyfry na zdjęciu przed zapisaniem/);
assert.match(panel, /odometerPhotoBlob/);
assert.match(panel, /Wpisz ręcznie/);
assert.match(panel, /placeholder="np\. 125400"/, 'Formularz ma pozwalać zapisać przebieg bez zdjęcia.');
assert.match(panel, /Zdjęcie nie jest wymagane/);
assert.match(panel, /fuelGrid fuelGridSingle/);
assert.doesNotMatch(panel, /<h3>Flota firmowa<\/h3>/, 'Panel zarządzania flotą nie powinien zajmować miejsca w module tankowań.');
assert.doesNotMatch(panel, /handleAddVehicle|handleToggleVehicle/, 'Ukryty panel floty nie powinien pozostawiać martwej obsługi w komponencie.');
assert.match(panel, /Tankowania według samochodu/);
assert.match(panel, /useState\(\(\) => !showVehicleOverview\)/, 'Desktopowy formularz tankowania ma startować zwinięty, a mobile rozwinięty.');
assert.match(panel, /const entryFormCollapsible = displayVehicleOverview/);
assert.match(panel, /displayVehicleOverview \? \([\s\S]*Wybierz pojazd, wpisz litry i podaj przebieg/, 'Instrukcja nagłówka paliwa ma być widoczna tylko w desktopowym zestawieniu.');

assert.match(panel, /aria-expanded=\{isEntryFormExpanded\}/);
assert.match(panel, /Rozwiń/);
assert.match(panel, /Zwiń/);
assert.match(panel, /Liczba tankowań/);
assert.match(panel, /Śr\. spalanie/);
assert.match(panel, /Ustaw baki/);
assert.match(panel, /Pojemność baków/);
assert.match(panel, /updateFuelVehicleTankCapacity/);
assert.match(panel, /Nietypowe ostatnie/);
assert.match(panel, /Nietypowe spalanie/);
assert.match(panel, /displayVehicleOverview \? consumptionByEntryId/, 'Oznaczenia nietypowego spalania mają pozostać tylko na desktopie.');
assert.match(panel, /calculateFuelConsumptionStats/);
assert.match(panel, /litry zatankowane do pełna ÷ przejechane kilometry × 100/);
assert.match(panel, /Historia: /);
assert.match(panel, /Raport miesięczny floty/);
assert.match(panel, /type="month"/);
assert.match(panel, /Zapisz korektę/);
assert.match(panel, /Nietypowo szybkie ponowne tankowanie/);
assert.match(panel, /updateFuelEntry/);
assert.match(desktopApp, /showVehicleOverview=\{!isMobile\}/, 'Zestawienie floty i raport mają być tylko na desktopie.');
assert.match(mobileApp, /!\["jobs", "fuel"\]\.includes\(activeModule\)/, 'Pracownik mobilny ma móc pozostać w module Paliwo.');
assert.match(mobileApp, /isAdmin && isMobile && activeModule === "devices"/, 'Administrator mobilny ma być wyprowadzany z modułu Urządzenia.');
assert.doesNotMatch(mobileLayout, /Widzisz wszystkie tankowania|Widzisz wyłącznie własne tankowania/, 'Mobilny moduł paliwa nie powinien marnować miejsca na opis.');
assert.doesNotMatch(mainLayout, /Testowy rejestr paliwa/, 'Moduł paliwa nie jest już testowy.');
assert.match(panel, /entryLimit: displayVehicleOverview \? 1000 : 100/, 'Desktop powinien pobierać szerszą historię do zestawienia floty.');
assert.match(panel, /FUEL_ODOMETER_WARNING_DELTA_KM|checkFuelOdometerProgression/);
assert.match(panel, /rawFleetOdometer === null \|\| rawFleetOdometer === undefined \|\| rawFleetOdometer === ''/, 'Brak pierwszego przebiegu musi pozostać nullem, a nie zostać zamieniony na 0 km.');
assert.doesNotMatch(panel, /const fleetOdometer = Number\(vehicle\?\.last_odometer_km\)/, 'Pierwszy przebieg nie może być liczony jako skok od 0 km.');
assert.match(panel, /Przy różnicy powyżej 5 000 km/);
assert.match(endpoint, /profiles\?id=eq\./, 'Endpoint ma potwierdzać rolę w tabeli profiles.');
assert.doesNotMatch(endpoint, /user_metadata.*role/s, 'Endpoint nie może ufać roli z user_metadata.');
assert.match(endpoint, /administrator.*pracownik/, 'Odczyt zapasowy OpenAI musi działać dla administratora i pracownika.');
assert.match(endpoint, /nigdy licznika dziennego TRIP A\/B/);
assert.match(endpoint, /OPENAI_API_KEY/);
assert.match(reader, /readOdometerLocally[\s\S]*readPreparedOdometerWithAi/, 'Najpierw ma działać OCR, a dopiero potem OpenAI.');
assert.match(reader, /local\.reliable/);


assert.match(fuelPushSource, /eventType: 'fuel_entry_created'/, 'Zapis tankowania pracownika musi wywołać osobny typ push.');
assert.match(panel, /!isAdmin && saved\?\.id[\s\S]*sendFuelEntryPush/, 'Push o tankowaniu ma być wysyłany wyłącznie po udanym zapisie pracownika.');
assert.match(panel, /Tankowanie zapisano, ale push do administratora nie został wysłany/, 'Awaria push nie może być mylona z awarią zapisu tankowania.');
assert.match(fuelPushSource, /send-fuel-entry-push/);
assert.match(pushEdge, /String\(entry\.created_by \|\| ""\) !== String\(authData\.user\.id\)/, 'Edge Function musi potwierdzić autora tankowania.');
assert.match(pushEdge, /deliveryLogType = `fuel_entry:\$\{entry\.id\}`/, 'Push tankowania musi być idempotentny dla konkretnego wpisu.');
assert.match(pushEdge, /title: "Zatankowano samochód"/);
assert.match(pushEdge, /vehicleLabel[\s\S]*litersLabel[\s\S]*odometerLabel/, 'Treść push musi zawierać auto, litry i przebieg.');
console.log('Fuel production access, monthly report, correction audit, rapid-refill warning and v10.26 regression checks passed.');
