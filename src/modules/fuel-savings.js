// WAWIS 13.97 — oszczędności na paliwie ze zbiornika (tylko administrator, tylko wersja na komputer).
//
// Dla każdego tankowania ze zbiornika: koszt litrów z dostaw (kolejka FIFO — najpierw najstarsza dostawa)
// porównany z ceną, jaką firma zapłaciłaby na stacji tego dnia. Cena na stacji = urzędowa maksymalna cena
// oleju napędowego (obwieszczenie Ministra Energii, Monitor Polski) obowiązująca w dniu tankowania.
// Wszystko liczone NETTO (firma odlicza VAT). Stacje mogą sprzedawać taniej niż cena maksymalna,
// więc wynik to górne oszacowanie oszczędności — interfejs mówi to wprost.

const DAY_MS = 86400000;
export const FUEL_REFERENCE_MAX_AGE_DAYS = 7;

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

export function warsawDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function netPurchasePrice(movement = {}) {
  const net = Number(movement.purchase_net_per_liter);
  if (Number.isFinite(net) && net > 0) return net;
  const gross = Number(movement.purchase_gross_per_liter);
  const vat = Number(movement.purchase_vat_rate);
  if (Number.isFinite(gross) && gross > 0 && Number.isFinite(vat)) return round4(gross / (1 + vat / 100));
  return null;
}

/**
 * Cena urzędowa obowiązująca w danym dniu: najnowsze obwieszczenie z valid_from <= dzień
 * (przy dwóch z tym samym dniem — późniejsza pozycja). Starsza niż 7 dni = brak (luka w danych).
 */
export function findReferencePrice(referencePrices = [], dateKey = '') {
  if (!dateKey) return null;
  let best = null;
  for (const price of Array.isArray(referencePrices) ? referencePrices : []) {
    const validFrom = String(price?.valid_from || '');
    if (!validFrom || validFrom > dateKey) continue;
    if (!best
      || validFrom > best.valid_from
      || (validFrom === best.valid_from && Number(price.act_pos || 0) > Number(best.act_pos || 0))) {
      best = price;
    }
  }
  if (!best) return null;
  const ageDays = (Date.parse(`${dateKey}T12:00:00Z`) - Date.parse(`${best.valid_from}T12:00:00Z`)) / DAY_MS;
  return ageDays > FUEL_REFERENCE_MAX_AGE_DAYS ? null : best;
}

/**
 * @param {{ movements: Array, referencePrices: Array, entries?: Array, vehicles?: Array, now?: Date }} input
 */
export function calculateFuelSavings({ movements = [], referencePrices = [], entries = [], vehicles = [], now = new Date() } = {}) {
  const ordered = (Array.isArray(movements) ? movements : [])
    .filter((movement) => movement && Number.isFinite(Number(movement.delta_liters)))
    .slice()
    .sort((a, b) => Date.parse(a.happened_at) - Date.parse(b.happened_at) || String(a.id).localeCompare(String(b.id)));

  const entriesById = new Map((Array.isArray(entries) ? entries : []).map((entry) => [String(entry.id), entry]));
  const vehiclesById = new Map((Array.isArray(vehicles) ? vehicles : []).map((vehicle) => [String(vehicle.id), vehicle]));

  const batches = [];
  const refuels = [];
  const deliveriesWithoutPrice = [];

  for (const movement of ordered) {
    const liters = Number(movement.delta_liters);
    const type = String(movement.movement_type || '');
    if (type === 'opening' || type === 'delivery') {
      const price = netPurchasePrice(movement);
      batches.push({ id: movement.id, happenedAt: movement.happened_at, liters, remaining: liters, netPrice: price, grossPrice: Number(movement.purchase_gross_per_liter) || null, vatRate: Number(movement.purchase_vat_rate) || null, note: movement.note || '' });
      if (price == null) deliveriesWithoutPrice.push({ id: movement.id, happenedAt: movement.happened_at, liters });
      continue;
    }
    if (type === 'adjustment' && liters > 0) {
      // Dodatnia korekta (np. pomiar) — litry trafiają do bieżącej partii, w jej cenie.
      const current = batches.find((batch) => batch.remaining > 0.0001) || batches[batches.length - 1];
      if (current) current.remaining = round4(current.remaining + liters);
      continue;
    }

    // Tankowanie albo ujemna korekta — pobieramy z najstarszych partii.
    let toTake = Math.abs(liters);
    let cost = 0;
    let unpriced = 0;
    const parts = [];
    for (const batch of batches) {
      if (toTake <= 0.0001) break;
      if (batch.remaining <= 0.0001) continue;
      const take = Math.min(batch.remaining, toTake);
      batch.remaining = round4(batch.remaining - take);
      toTake = round4(toTake - take);
      if (batch.netPrice == null) unpriced += take;
      else cost += take * batch.netPrice;
      parts.push({ batchId: batch.id, liters: round2(take), netPrice: batch.netPrice });
    }
    if (type !== 'refuel') continue;

    const dateKey = warsawDateKey(movement.happened_at);
    const reference = findReferencePrice(referencePrices, dateKey);
    const pricedLiters = Math.abs(liters) - unpriced - toTake;
    const tankNetPerLiter = pricedLiters > 0.0001 ? cost / pricedLiters : null;
    const stationNetPerLiter = reference ? Number(reference.diesel_net) : null;
    const complete = reference != null && unpriced <= 0.0001 && toTake <= 0.0001 && tankNetPerLiter != null;
    const entry = entriesById.get(String(movement.fuel_entry_id || '')) || null;
    const vehicle = entry ? vehiclesById.get(String(entry.vehicle_id || '')) || null : null;

    refuels.push({
      id: movement.id,
      happenedAt: movement.happened_at,
      dateKey,
      monthKey: dateKey.slice(0, 7),
      liters: round2(Math.abs(liters)),
      vehicleLabel: vehicle ? (vehicle.registration_number || vehicle.vehicle_name || 'Samochód') : 'Samochód',
      tankNetPerLiter: tankNetPerLiter == null ? null : round4(tankNetPerLiter),
      tankCostNet: round2(cost),
      stationNetPerLiter,
      stationGrossPerLiter: reference ? Number(reference.diesel_gross) : null,
      stationCostNet: reference ? round2(Math.abs(liters) * stationNetPerLiter) : null,
      savingsNet: complete ? round2(Math.abs(liters) * stationNetPerLiter - cost) : null,
      reference: reference ? { eli: reference.eli, validFrom: reference.valid_from, sourceUrl: reference.source_url } : null,
      missingReason: complete ? '' : (!reference ? 'Brak ceny urzędowej z tego dnia' : 'Brak ceny zakupu dostawy'),
      parts,
    });
  }

  const counted = refuels.filter((row) => row.savingsNet != null);
  const totalSavings = round2(counted.reduce((sum, row) => sum + row.savingsNet, 0));
  const countedLiters = round2(counted.reduce((sum, row) => sum + row.liters, 0));
  const monthKey = warsawDateKey(now).slice(0, 7);
  const monthRows = counted.filter((row) => row.monthKey === monthKey);

  const byMonth = new Map();
  for (const row of counted) {
    const current = byMonth.get(row.monthKey) || { monthKey: row.monthKey, liters: 0, savingsNet: 0, refuels: 0 };
    current.liters = round2(current.liters + row.liters);
    current.savingsNet = round2(current.savingsNet + row.savingsNet);
    current.refuels += 1;
    byMonth.set(row.monthKey, current);
  }

  // Co zostało w zbiorniku i ile jest warte w porównaniu z dzisiejszą ceną na stacji.
  const todayReference = findReferencePrice(referencePrices, warsawDateKey(now));
  const remainingLiters = round2(batches.reduce((sum, batch) => sum + Math.max(0, batch.remaining), 0));
  const remainingPriced = batches.filter((batch) => batch.remaining > 0.0001 && batch.netPrice != null);
  const remainingCost = remainingPriced.reduce((sum, batch) => sum + batch.remaining * batch.netPrice, 0);
  const remainingPricedLiters = remainingPriced.reduce((sum, batch) => sum + batch.remaining, 0);
  const potentialSavings = todayReference && remainingPricedLiters > 0
    ? round2(remainingPricedLiters * Number(todayReference.diesel_net) - remainingCost)
    : null;

  return {
    refuels: refuels.slice().reverse(),
    totalSavingsNet: totalSavings,
    countedLiters,
    averageSavingsPerLiter: countedLiters > 0 ? round4(totalSavings / countedLiters) : null,
    monthSavingsNet: round2(monthRows.reduce((sum, row) => sum + row.savingsNet, 0)),
    monthLiters: round2(monthRows.reduce((sum, row) => sum + row.liters, 0)),
    months: [...byMonth.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    uncountedRefuels: refuels.filter((row) => row.savingsNet == null).length,
    deliveriesWithoutPrice,
    batches: batches.map((batch) => ({ ...batch, remaining: round2(Math.max(0, batch.remaining)) })),
    remainingLiters,
    todayReference,
    potentialSavingsNet: potentialSavings,
  };
}

function assertAdmin({ supabase, isAdmin }) {
  if (!supabase) throw new Error('Brak połączenia z bazą.');
  if (!isAdmin) throw new Error('Oszczędności na paliwie widzi tylko administrator.');
}

/** Dociąga brakujące ceny urzędowe (funkcja Edge). Błąd nie blokuje widoku — zwraca opis. */
export async function syncFuelReferencePrices({ supabase, isAdmin }) {
  assertAdmin({ supabase, isAdmin });
  try {
    const { data, error } = await supabase.functions.invoke('fuel-reference-prices', { body: {} });
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, ...(data || {}) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function loadFuelSavingsData({ supabase, isAdmin }) {
  assertAdmin({ supabase, isAdmin });
  const [movementsResult, pricesResult] = await Promise.all([
    supabase
      .from('fuel_tank_movements')
      .select('id, movement_type, delta_liters, fuel_entry_id, note, happened_at, purchase_gross_per_liter, purchase_vat_rate, purchase_net_per_liter')
      .order('happened_at', { ascending: true })
      .limit(5000),
    supabase
      .from('fuel_reference_prices')
      .select('eli, act_pos, promulgated_on, valid_from, diesel_net, diesel_gross, vat_rate, source_url')
      .order('valid_from', { ascending: true })
      .limit(5000),
  ]);
  if (movementsResult.error) throw movementsResult.error;
  if (pricesResult.error) throw pricesResult.error;
  return {
    movements: Array.isArray(movementsResult.data) ? movementsResult.data : [],
    referencePrices: Array.isArray(pricesResult.data) ? pricesResult.data : [],
  };
}

export function normalizeFuelPricePerLiter(value) {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 50) {
    throw new Error('Podaj cenę za litr brutto, np. 7,25.');
  }
  return Math.round(parsed * 10000) / 10000;
}

export async function setFuelDeliveryPrice({ supabase, isAdmin, movementId, grossPerLiter, vatRate = 8 }) {
  assertAdmin({ supabase, isAdmin });
  const { data, error } = await supabase.rpc('admin_set_fuel_purchase_price_v1389', {
    p_movement_id: movementId,
    p_gross_per_liter: normalizeFuelPricePerLiter(grossPerLiter),
    p_vat_rate: Number(vatRate),
  });
  if (error) throw error;
  return data;
}
