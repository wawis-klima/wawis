function assertFuelAccess({ supabase }) {
  if (!supabase) throw new Error('Moduł tankowań wymaga aktywnego połączenia.');
}

function assertAdminAccess({ supabase, isAdmin }) {
  assertFuelAccess({ supabase });
  if (!isAdmin) throw new Error('Tylko administrator może zarządzać flotą i usuwać tankowania.');
}

const FUEL_ODOMETER_BUCKET = 'fuel-odometer-photos';
export const FUEL_ODOMETER_WARNING_DELTA_KM = 2000;
export const FUEL_ODOMETER_PHOTO_REQUIRED_DELTA_KM = 5000;
export const FUEL_CONSUMPTION_ANOMALY_MIN_PRIOR_INTERVALS = 2;
export const FUEL_CONSUMPTION_ANOMALY_THRESHOLD_RATIO = 1.30;
export const FUEL_CONSUMPTION_ANOMALY_MIN_DELTA_L_PER_100_KM = 1.5;
export const FUEL_RAPID_REFUEL_WARNING_DISTANCE_KM = 100;

export function normalizeFuelTankCapacity(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
    throw new Error('Pojemność baku musi być większa od 0 i nie może przekraczać 500 litrów.');
  }
  return Math.round(parsed * 100) / 100;
}

export function calculateFuelConsumptionIntervals(entries = []) {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      ...entry,
      litersValue: Number(entry?.liters),
      odometerValue: Number(entry?.odometer_km),
      fueledAtValue: new Date(entry?.fueled_at || entry?.created_at || 0).getTime(),
    }))
    .filter((entry) => (
      Number.isFinite(entry.litersValue)
      && entry.litersValue > 0
      && Number.isInteger(entry.odometerValue)
      && entry.odometerValue >= 0
    ))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.fueledAtValue) ? left.fueledAtValue : 0;
      const rightTime = Number.isFinite(right.fueledAtValue) ? right.fueledAtValue : 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.odometerValue - right.odometerValue;
    });

  const intervals = [];
  let priorDistanceKm = 0;
  let priorLiters = 0;
  let priorIntervalCount = 0;

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    const distanceKm = current.odometerValue - previous.odometerValue;
    if (distanceKm <= 0) continue;

    const consumption = (current.litersValue / distanceKm) * 100;
    const baselineConsumption = priorDistanceKm > 0 ? (priorLiters / priorDistanceKm) * 100 : null;
    const changePercent = Number.isFinite(baselineConsumption) && baselineConsumption > 0
      ? ((consumption - baselineConsumption) / baselineConsumption) * 100
      : null;
    const unusualHigh = (
      priorIntervalCount >= FUEL_CONSUMPTION_ANOMALY_MIN_PRIOR_INTERVALS
      && Number.isFinite(baselineConsumption)
      && consumption >= baselineConsumption * FUEL_CONSUMPTION_ANOMALY_THRESHOLD_RATIO
      && consumption - baselineConsumption >= FUEL_CONSUMPTION_ANOMALY_MIN_DELTA_L_PER_100_KM
    );

    intervals.push({
      entryId: current.id || null,
      previousEntryId: previous.id || null,
      distanceKm,
      liters: current.litersValue,
      consumption,
      baselineConsumption,
      changePercent,
      unusualHigh,
    });

    priorDistanceKm += distanceKm;
    priorLiters += current.litersValue;
    priorIntervalCount += 1;
  }

  return intervals;
}

export function calculateFuelConsumptionStats(entries = []) {
  const intervals = calculateFuelConsumptionIntervals(entries);
  const totalDistanceKm = intervals.reduce((sum, interval) => sum + interval.distanceKm, 0);
  const totalLitersConsumed = intervals.reduce((sum, interval) => sum + interval.liters, 0);
  const lastInterval = intervals.length ? intervals[intervals.length - 1] : null;

  return {
    intervalCount: intervals.length,
    totalDistanceKm,
    totalLitersConsumed,
    averageConsumption: totalDistanceKm > 0 ? (totalLitersConsumed / totalDistanceKm) * 100 : null,
    lastConsumption: lastInterval?.consumption ?? null,
    lastConsumptionBaseline: lastInterval?.baselineConsumption ?? null,
    lastConsumptionChangePercent: lastInterval?.changePercent ?? null,
    lastConsumptionUnusual: Boolean(lastInterval?.unusualHigh),
    intervals,
  };
}

function makePhotoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeRegistrationNumber(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function checkFuelOdometerProgression({ previousKm, nextKm, hasPhoto = false } = {}) {
  const previous = Number(previousKm);
  const next = Number(nextKm);
  if (!Number.isInteger(previous) || !Number.isInteger(next) || previous < 0 || next < 0) {
    return { status: 'invalid', deltaKm: null };
  }

  const deltaKm = next - previous;
  if (deltaKm < 0) return { status: 'lower', deltaKm };
  if (deltaKm > FUEL_ODOMETER_PHOTO_REQUIRED_DELTA_KM && !hasPhoto) {
    return { status: 'photo_required', deltaKm };
  }
  if (deltaKm > FUEL_ODOMETER_WARNING_DELTA_KM) return { status: 'confirm', deltaKm };
  return { status: 'ok', deltaKm };
}

export function checkRapidFuelRefill({ previousKm, nextKm } = {}) {
  const previous = Number(previousKm);
  const next = Number(nextKm);
  if (!Number.isInteger(previous) || !Number.isInteger(next) || previous < 0 || next < 0) {
    return { shouldConfirm: false, deltaKm: null };
  }
  const deltaKm = next - previous;
  return {
    shouldConfirm: deltaKm >= 0 && deltaKm < FUEL_RAPID_REFUEL_WARNING_DISTANCE_KM,
    deltaKm,
  };
}

function getWarsawMonthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month ? `${values.year}-${values.month}` : '';
}

export function calculateFuelMonthlyReport({ entries = [], vehicles = [], monthKey = '' } = {}) {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(String(monthKey || '')) ? String(monthKey) : '';
  const vehicleList = Array.isArray(vehicles) ? vehicles : [];
  const entryList = Array.isArray(entries) ? entries : [];

  const rows = vehicleList.map((vehicle) => {
    const vehicleEntries = entryList.filter((entry) => entry.vehicle_id === vehicle.id);
    const monthEntries = vehicleEntries.filter((entry) => getWarsawMonthKey(entry.fueled_at || entry.created_at) === normalizedMonth);
    const intervals = calculateFuelConsumptionIntervals(vehicleEntries).filter((interval) => {
      const currentEntry = vehicleEntries.find((entry) => entry.id === interval.entryId);
      return currentEntry && getWarsawMonthKey(currentEntry.fueled_at || currentEntry.created_at) === normalizedMonth;
    });
    const distanceKm = intervals.reduce((sum, interval) => sum + interval.distanceKm, 0);
    const consumedLiters = intervals.reduce((sum, interval) => sum + interval.liters, 0);
    const fueledLiters = monthEntries.reduce((sum, entry) => sum + (Number(entry.liters) || 0), 0);
    return {
      vehicle,
      tankings: monthEntries.length,
      fueledLiters,
      distanceKm,
      averageConsumption: distanceKm > 0 ? (consumedLiters / distanceKm) * 100 : null,
    };
  });

  const totals = rows.reduce((summary, row) => ({
    tankings: summary.tankings + row.tankings,
    fueledLiters: summary.fueledLiters + row.fueledLiters,
    distanceKm: summary.distanceKm + row.distanceKm,
  }), { tankings: 0, fueledLiters: 0, distanceKm: 0 });
  const totalConsumedLiters = rows.reduce((sum, row) => {
    if (!row.distanceKm || !row.averageConsumption) return sum;
    return sum + ((row.averageConsumption * row.distanceKm) / 100);
  }, 0);

  return {
    monthKey: normalizedMonth,
    rows,
    totals: {
      ...totals,
      averageConsumption: totals.distanceKm > 0 ? (totalConsumedLiters / totals.distanceKm) * 100 : null,
    },
  };
}

export async function loadFuelModuleData({ supabase, isAdmin, entryLimit = 100 }) {
  assertFuelAccess({ supabase });
  const safeEntryLimit = Math.min(Math.max(Number(entryLimit) || 100, 1), 1000);

  const [vehiclesResult, entriesResult] = await Promise.all([
    supabase
      .from('fuel_vehicles')
      .select('id, vehicle_name, registration_number, is_active, tank_capacity_liters, last_odometer_km, last_fueled_at, created_at, updated_at')
      .order('registration_number', { ascending: true }),
    supabase
      .from('fuel_entries')
      .select('id, vehicle_id, fueled_at, liters, odometer_km, odometer_photo_path, odometer_ai_confidence, odometer_read_source, created_by, created_at, corrected_by, corrected_at, correction_count, original_liters, original_odometer_km, fuel_vehicles(vehicle_name, registration_number, tank_capacity_liters), creator:profiles!fuel_entries_created_by_fkey(full_name), corrector:profiles!fuel_entries_corrected_by_fkey(full_name)')
      .order('fueled_at', { ascending: false })
      .limit(safeEntryLimit),
  ]);

  if (vehiclesResult.error) throw vehiclesResult.error;
  if (entriesResult.error) throw entriesResult.error;

  return {
    vehicles: Array.isArray(vehiclesResult.data) ? vehiclesResult.data : [],
    entries: Array.isArray(entriesResult.data) ? entriesResult.data : [],
  };
}

export async function addFuelVehicle({ supabase, isAdmin, registrationNumber }) {
  assertAdminAccess({ supabase, isAdmin });
  const normalized = normalizeRegistrationNumber(registrationNumber);
  if (normalized.length < 2) throw new Error('Wpisz prawidłowy numer rejestracyjny.');

  const { data, error } = await supabase
    .from('fuel_vehicles')
    .insert({ registration_number: normalized })
    .select('id, vehicle_name, registration_number, is_active, tank_capacity_liters, last_odometer_km, last_fueled_at, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ten numer rejestracyjny jest już na liście.');
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function updateFuelVehicleTankCapacity({ supabase, isAdmin, vehicleId, tankCapacityLiters }) {
  assertAdminAccess({ supabase, isAdmin });
  if (!vehicleId) throw new Error('Nie wybrano pojazdu.');
  const normalizedCapacity = normalizeFuelTankCapacity(tankCapacityLiters);
  const { data, error } = await supabase
    .from('fuel_vehicles')
    .update({ tank_capacity_liters: normalizedCapacity, updated_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .select('id, vehicle_name, registration_number, is_active, tank_capacity_liters, last_odometer_km, last_fueled_at, created_at, updated_at')
    .single();
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function setFuelVehicleActive({ supabase, isAdmin, vehicleId, isActive }) {
  assertAdminAccess({ supabase, isAdmin });
  const { data, error } = await supabase
    .from('fuel_vehicles')
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .select('id, vehicle_name, registration_number, is_active, tank_capacity_liters, last_odometer_km, last_fueled_at, created_at, updated_at')
    .single();
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function addFuelEntry({
  supabase,
  isAdmin,
  vehicleId,
  liters,
  tankCapacityLiters = null,
  odometerKm,
  odometerPhotoBlob,
  odometerAiConfidence,
  odometerReadSource,
}) {
  assertFuelAccess({ supabase });
  const parsedLiters = Number(String(liters).replace(',', '.'));
  const parsedOdometer = Number(String(odometerKm).replace(/\s/g, ''));
  if (!vehicleId) throw new Error('Wybierz numer rejestracyjny.');
  if (!Number.isFinite(parsedLiters) || parsedLiters <= 0 || parsedLiters > 500) {
    throw new Error('Ilość paliwa musi być większa od 0 i nie może przekraczać 500 litrów.');
  }
  const normalizedCapacity = normalizeFuelTankCapacity(tankCapacityLiters);
  if (normalizedCapacity !== null && parsedLiters > normalizedCapacity) {
    throw new Error(`Nie można zatankować ${parsedLiters.toLocaleString('pl-PL')} l. Pojemność baku tego samochodu to ${normalizedCapacity.toLocaleString('pl-PL')} l.`);
  }
  if (!Number.isInteger(parsedOdometer) || parsedOdometer < 0 || parsedOdometer > 5000000) {
    throw new Error('Wpisz prawidłowy, pełny stan licznika.');
  }
  const hasPhoto = odometerPhotoBlob !== null && odometerPhotoBlob !== undefined;
  if (hasPhoto && (!(odometerPhotoBlob instanceof Blob) || !String(odometerPhotoBlob.type || '').startsWith('image/'))) {
    throw new Error('Wybrany plik nie jest prawidłowym zdjęciem licznika.');
  }

  let photoPath = null;
  if (hasPhoto) {
    const sessionResult = await supabase.auth.getSession();
    const userId = String(sessionResult?.data?.session?.user?.id || '').trim();
    if (!userId) throw new Error('Sesja użytkownika wygasła. Zaloguj się ponownie.');
    photoPath = `${userId}/${Date.now()}-${makePhotoId()}.jpg`;
    const uploadResult = await supabase.storage
      .from(FUEL_ODOMETER_BUCKET)
      .upload(photoPath, odometerPhotoBlob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
    if (uploadResult.error) throw uploadResult.error;
  }

  try {
    const confidence = Math.max(0, Math.min(1, Number(odometerAiConfidence || 0)));
    const readSource = hasPhoto && ['local_ocr', 'openai', 'manual'].includes(odometerReadSource)
      ? odometerReadSource
      : hasPhoto ? 'openai' : 'manual';
    const { data, error } = await supabase
      .from('fuel_entries')
      .insert({
        vehicle_id: vehicleId,
        liters: parsedLiters,
        odometer_km: parsedOdometer,
        odometer_photo_path: photoPath,
        odometer_ai_confidence: hasPhoto ? confidence : null,
        odometer_read_source: readSource,
      })
      .select('id, vehicle_id, fueled_at, liters, odometer_km, odometer_photo_path, odometer_ai_confidence, odometer_read_source, created_by, created_at, corrected_by, corrected_at, correction_count, original_liters, original_odometer_km, fuel_vehicles(vehicle_name, registration_number, tank_capacity_liters), creator:profiles!fuel_entries_created_by_fkey(full_name), corrector:profiles!fuel_entries_corrected_by_fkey(full_name)')
      .single();
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    if (photoPath) await supabase.storage.from(FUEL_ODOMETER_BUCKET).remove([photoPath]).catch(() => {});
    throw error;
  }
}

export async function updateFuelEntry({
  supabase,
  isAdmin,
  entryId,
  liters,
  odometerKm,
  tankCapacityLiters = null,
}) {
  assertAdminAccess({ supabase, isAdmin });
  if (!entryId) throw new Error('Nie wybrano tankowania do poprawy.');
  const parsedLiters = Number(String(liters).replace(',', '.'));
  const parsedOdometer = Number(String(odometerKm).replace(/\s/g, ''));
  if (!Number.isFinite(parsedLiters) || parsedLiters <= 0 || parsedLiters > 500) {
    throw new Error('Ilość paliwa musi być większa od 0 i nie może przekraczać 500 litrów.');
  }
  const normalizedCapacity = normalizeFuelTankCapacity(tankCapacityLiters);
  if (normalizedCapacity !== null && parsedLiters > normalizedCapacity) {
    throw new Error(`Nie można zatankować ${parsedLiters.toLocaleString('pl-PL')} l. Pojemność baku tego samochodu to ${normalizedCapacity.toLocaleString('pl-PL')} l.`);
  }
  if (!Number.isInteger(parsedOdometer) || parsedOdometer < 0 || parsedOdometer > 5000000) {
    throw new Error('Wpisz prawidłowy, pełny stan licznika.');
  }

  const { data, error } = await supabase
    .from('fuel_entries')
    .update({ liters: parsedLiters, odometer_km: parsedOdometer })
    .eq('id', entryId)
    .select('id, vehicle_id, fueled_at, liters, odometer_km, odometer_photo_path, odometer_ai_confidence, odometer_read_source, created_by, created_at, corrected_by, corrected_at, correction_count, original_liters, original_odometer_km, fuel_vehicles(vehicle_name, registration_number, tank_capacity_liters), creator:profiles!fuel_entries_created_by_fkey(full_name), corrector:profiles!fuel_entries_corrected_by_fkey(full_name)')
    .single();
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function deleteFuelEntry({ supabase, isAdmin, entryId, photoPath = '' }) {
  assertAdminAccess({ supabase, isAdmin });
  const { error } = await supabase.from('fuel_entries').delete().eq('id', entryId);
  if (error) throw error;
  if (photoPath) {
    const removeResult = await supabase.storage.from(FUEL_ODOMETER_BUCKET).remove([photoPath]);
    return { photoDeleteError: removeResult.error || null };
  }
  return { photoDeleteError: null };
}

export async function getFuelOdometerPhotoUrl({ supabase, isAdmin, photoPath }) {
  assertFuelAccess({ supabase });
  if (!photoPath) throw new Error('Ten wpis nie ma zapisanego zdjęcia licznika.');
  const { data, error } = await supabase.storage.from(FUEL_ODOMETER_BUCKET).createSignedUrl(photoPath, 120);
  if (error) throw error;
  return data?.signedUrl || '';
}
