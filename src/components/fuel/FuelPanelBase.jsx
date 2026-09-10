import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addFuelEntry,
  calculateFuelConsumptionStats,
  calculateFuelMonthlyReport,
  checkFuelOdometerProgression,
  checkRapidFuelRefill,
  deleteFuelEntry,
  getFuelOdometerPhotoUrl,
  loadFuelModuleData,
  normalizeFuelTankCapacity,
  updateFuelEntry,
  updateFuelVehicleTankCapacity,
} from '../../modules/fuel.js';
import { sendFuelEntryPush } from '../../modules/fuel-push.js';
import { readOdometerPhoto } from '../../modules/fuel-odometer-reader.js';

const WARSAW_DATE_TIME = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const HISTORY_PAGE_SIZE = 5;

function compactFuelHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}.${values.month}.${values.year}`;
}

function creatorInitials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';
  return `${first}${last}`.toLocaleUpperCase('pl-PL');
}

function formatFuelDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : WARSAW_DATE_TIME.format(date);
}

function getRegistration(entry, vehicles) {
  const vehicle = entry?.fuel_vehicles || vehicles.find((item) => item.id === entry?.vehicle_id);
  return vehicle ? getVehicleLabel(vehicle) : 'Nieznany pojazd';
}

function getVehicleLabel(vehicle) {
  const name = String(vehicle?.vehicle_name || '').trim();
  const registration = String(vehicle?.registration_number || '').trim();
  return name ? `${name} — ${registration}` : registration;
}

function formatEntryCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count === 1) return '1 tankowanie';
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${count} tankowania`;
  return `${count} tankowań`;
}

function formatLitersTotal(value) {
  return `${Number(value || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} l`;
}

function formatConsumption(value) {
  const consumption = Number(value);
  if (!Number.isFinite(consumption) || consumption <= 0) return '—';
  return `${consumption.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} l/100 km`;
}

function formatTankCapacity(value) {
  const capacity = Number(value);
  if (!Number.isFinite(capacity) || capacity <= 0) return 'Bak nieustawiony';
  return `Bak ${capacity.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} l`;
}

function formatAnomalyPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return '';
  return `${percent >= 0 ? '+' : ''}${Math.round(percent)}%`;
}

function getWarsawMonthKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month ? `${values.year}-${values.month}` : '';
}

function formatMonthLabel(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Wybrany miesiąc';
  const date = new Date(`${match[1]}-${match[2]}-15T12:00:00Z`);
  const label = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', month: 'long', year: 'numeric' }).format(date);
  return label ? label[0].toUpperCase() + label.slice(1) : monthKey;
}

export default function FuelPanel({ supabase, isAdmin, showVehicleOverview = false, logDiagnostic = () => {} }) {
  const [vehicles, setVehicles] = useState([]);
  const [entries, setEntries] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [liters, setLiters] = useState('');
  const [odometerMode, setOdometerMode] = useState('manual');
  const [odometerKm, setOdometerKm] = useState('');
  const [odometerPhotoBlob, setOdometerPhotoBlob] = useState(null);
  const [odometerPhotoPreview, setOdometerPhotoPreview] = useState('');
  const [odometerConfidence, setOdometerConfidence] = useState(null);
  const [odometerSource, setOdometerSource] = useState('');
  const [readingLabel, setReadingLabel] = useState('');
  const [manualCorrection, setManualCorrection] = useState(false);
  const [readingOdometer, setReadingOdometer] = useState(false);
  const [photoViewerUrl, setPhotoViewerUrl] = useState('');
  const [historyVehicleId, setHistoryVehicleId] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [capacityEditorOpen, setCapacityEditorOpen] = useState(false);
  const [capacityDrafts, setCapacityDrafts] = useState({});
  const [reportMonth, setReportMonth] = useState(() => getWarsawMonthKey());
  const [editingEntryId, setEditingEntryId] = useState('');
  const [editLiters, setEditLiters] = useState('');
  const [editOdometerKm, setEditOdometerKm] = useState('');
  const [entryFormExpanded, setEntryFormExpanded] = useState(() => !showVehicleOverview);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.is_active), [vehicles]);
  const lastOdometerForVehicle = useMemo(() => {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    const rawFleetOdometer = vehicle?.last_odometer_km;
    const fleetOdometer = rawFleetOdometer === null || rawFleetOdometer === undefined || rawFleetOdometer === ''
      ? null
      : Number(rawFleetOdometer);
    const matching = entries.filter((entry) => entry.vehicle_id === vehicleId);
    const visibleOdometer = matching.length ? Math.max(...matching.map((entry) => Number(entry.odometer_km) || 0)) : null;
    if (Number.isInteger(fleetOdometer) && fleetOdometer >= 0) {
      return visibleOdometer === null ? fleetOdometer : Math.max(fleetOdometer, visibleOdometer);
    }
    return visibleOdometer;
  }, [entries, vehicleId, vehicles]);
  const displayVehicleOverview = Boolean(showVehicleOverview && isAdmin);
  const compactMobileAdmin = Boolean(isAdmin && !displayVehicleOverview);
  const entryFormCollapsible = displayVehicleOverview;
  const isEntryFormExpanded = !entryFormCollapsible || entryFormExpanded;
  const vehicleStats = useMemo(() => vehicles.map((vehicle) => {
    const vehicleEntries = entries.filter((entry) => entry.vehicle_id === vehicle.id);
    const consumption = calculateFuelConsumptionStats(vehicleEntries);
    return {
      vehicle,
      count: vehicleEntries.length,
      liters: vehicleEntries.reduce((sum, entry) => sum + (Number(entry.liters) || 0), 0),
      lastEntry: vehicleEntries[0] || null,
      consumption,
    };
  }), [entries, vehicles]);
  const fleetConsumption = useMemo(() => {
    const totals = vehicleStats.reduce((summary, item) => ({
      distanceKm: summary.distanceKm + item.consumption.totalDistanceKm,
      liters: summary.liters + item.consumption.totalLitersConsumed,
      intervals: summary.intervals + item.consumption.intervalCount,
    }), { distanceKm: 0, liters: 0, intervals: 0 });
    return totals.distanceKm > 0 ? (totals.liters / totals.distanceKm) * 100 : null;
  }, [vehicleStats]);
  const visibleEntries = useMemo(() => (
    displayVehicleOverview && historyVehicleId
      ? entries.filter((entry) => entry.vehicle_id === historyVehicleId)
      : entries
  ), [displayVehicleOverview, entries, historyVehicleId]);
  const historyTotalPages = Math.max(1, Math.ceil(visibleEntries.length / HISTORY_PAGE_SIZE));
  const pagedVisibleEntries = useMemo(() => {
    if (!compactMobileAdmin) return visibleEntries;
    const safePage = Math.min(historyPage, historyTotalPages);
    const start = (safePage - 1) * HISTORY_PAGE_SIZE;
    return visibleEntries.slice(start, start + HISTORY_PAGE_SIZE);
  }, [compactMobileAdmin, historyPage, historyTotalPages, visibleEntries]);
  const selectedHistoryVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === historyVehicleId) || null,
    [historyVehicleId, vehicles],
  );
  const selectedFuelVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) || null,
    [vehicleId, vehicles],
  );
  const consumptionByEntryId = useMemo(() => {
    const map = new Map();
    vehicleStats.forEach((item) => item.consumption.intervals.forEach((interval) => {
      if (interval.entryId) map.set(interval.entryId, interval);
    }));
    return map;
  }, [vehicleStats]);
  const allLiters = useMemo(
    () => entries.reduce((sum, entry) => sum + (Number(entry.liters) || 0), 0),
    [entries],
  );

  const monthlyReport = useMemo(
    () => calculateFuelMonthlyReport({ entries, vehicles, monthKey: reportMonth }),
    [entries, reportMonth, vehicles],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadFuelModuleData({ supabase, isAdmin, entryLimit: displayVehicleOverview ? 1000 : 100 });
      setVehicles(data.vehicles);
      setEntries(data.entries);
      setHistoryVehicleId((current) => data.vehicles.some((vehicle) => vehicle.id === current) ? current : '');
      setVehicleId((current) => {
        if (data.vehicles.some((vehicle) => vehicle.id === current && vehicle.is_active)) return current;
        return data.vehicles.find((vehicle) => vehicle.is_active)?.id || '';
      });
    } catch (loadError) {
      setError(loadError?.message || 'Nie udało się pobrać danych tankowań.');
      logDiagnostic('fuel.load.failed', { module: 'fuel', error: loadError });
    } finally {
      setLoading(false);
    }
  }, [displayVehicleOverview, isAdmin, logDiagnostic, supabase]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (compactMobileAdmin) setHistoryPage(1);
  }, [compactMobileAdmin, visibleEntries.length]);
  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);
  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timerId);
  }, []);

  function resetOdometerPhoto() {
    setOdometerKm('');
    setOdometerPhotoBlob(null);
    setOdometerPhotoPreview('');
    setOdometerConfidence(null);
    setOdometerSource('');
    setReadingLabel('');
    setManualCorrection(false);
  }

  function selectOdometerMode(nextMode) {
    if (nextMode === odometerMode) return;
    resetOdometerPhoto();
    setOdometerMode(nextMode);
  }

  async function handleOdometerPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReadingOdometer(true);
    setError('');
    setMessage('');
    resetOdometerPhoto();
    try {
      const result = await readOdometerPhoto({
        file,
        supabase,
        onProgress: ({ label }) => setReadingLabel(label || 'Odczytuję licznik…'),
      });
      setOdometerPhotoBlob(result.blob);
      setOdometerPhotoPreview(result.imageDataUrl);
      setOdometerKm(String(result.odometerKm));
      setOdometerConfidence(result.confidence);
      setOdometerSource(result.source);
      logDiagnostic('fuel.odometer.read.completed', {
        module: 'fuel',
        confidence: result.confidence,
        readSource: result.source,
        openAiFallback: result.source === 'openai',
      });
    } catch (readError) {
      setError(readError?.message || 'Nie udało się odczytać licznika. Zrób zdjęcie ponownie.');
      logDiagnostic('fuel.odometer.read.failed', { module: 'fuel', error: readError });
    } finally {
      setReadingOdometer(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!odometerKm) throw new Error('Wpisz prawidłowy stan licznika.');
      if (odometerMode === 'photo' && !odometerPhotoBlob) throw new Error('Zrób zdjęcie licznika i potwierdź odczyt przed zapisem.');
      const parsedOdometer = Number(String(odometerKm).replace(/\s/g, ''));
      if (lastOdometerForVehicle !== null) {
        const progression = checkFuelOdometerProgression({
          previousKm: lastOdometerForVehicle,
          nextKm: parsedOdometer,
          hasPhoto: odometerMode === 'photo' && Boolean(odometerPhotoBlob),
        });
        if (progression.status === 'lower') {
          throw new Error(`Stan licznika nie może być niższy niż ostatnio zapisane ${lastOdometerForVehicle.toLocaleString('pl-PL')} km.`);
        }
        if (progression.status === 'photo_required') {
          throw new Error(`Przebieg wzrósł o ${progression.deltaKm.toLocaleString('pl-PL')} km. Przy różnicy powyżej 5 000 km popraw wartość albo wybierz opcję „Zrób zdjęcie”.`);
        }
        if (progression.status === 'confirm') {
          const confirmed = window.confirm(
            `Sprawdź przebieg przed zapisem.\n\nPoprzednio: ${lastOdometerForVehicle.toLocaleString('pl-PL')} km\nTeraz: ${parsedOdometer.toLocaleString('pl-PL')} km\nRóżnica: ${progression.deltaKm.toLocaleString('pl-PL')} km\n\nCzy wpisany przebieg jest prawidłowy?`,
          );
          if (!confirmed) return;
        }
        const rapidRefill = checkRapidFuelRefill({ previousKm: lastOdometerForVehicle, nextKm: parsedOdometer });
        if (rapidRefill.shouldConfirm) {
          const parsedLiters = Number(String(liters).replace(',', '.'));
          const confirmed = window.confirm(
            `Nietypowo szybkie ponowne tankowanie.\n\nOd poprzedniego tankowania przejechano tylko ${rapidRefill.deltaKm.toLocaleString('pl-PL')} km.\nWpisano: ${Number.isFinite(parsedLiters) ? parsedLiters.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) : liters} l.\n\nSprawdź pojazd, litry i przebieg. Czy mimo to zapisać tankowanie?`,
          );
          if (!confirmed) return;
        }
      }
      const saved = await addFuelEntry({
        supabase,
        isAdmin,
        vehicleId,
        liters,
        tankCapacityLiters: selectedFuelVehicle?.tank_capacity_liters ?? null,
        odometerKm,
        odometerPhotoBlob: odometerMode === 'photo' ? odometerPhotoBlob : null,
        odometerAiConfidence: odometerMode === 'photo' && !manualCorrection ? odometerConfidence : null,
        odometerReadSource: odometerMode === 'photo' && !manualCorrection ? odometerSource : 'manual',
      });
      setEntries((current) => [saved, ...current]);
      if (!isAdmin && saved?.id) {
        try {
          await sendFuelEntryPush({ supabase, fuelEntryId: saved.id });
          logDiagnostic('fuel.push.completed', { module: 'fuel', fuelEntryId: saved.id });
        } catch (pushError) {
          console.warn('Tankowanie zapisano, ale push do administratora nie został wysłany:', pushError?.message || pushError);
          logDiagnostic('fuel.push.failed', { module: 'fuel', fuelEntryId: saved.id, error: pushError });
        }
      }
      setLiters('');
      resetOdometerPhoto();
      setMessage(odometerMode === 'photo'
        ? 'Tankowanie i zdjęcie licznika zostały zapisane. Czas nadał serwer.'
        : 'Tankowanie z ręcznie wpisanym przebiegiem zostało zapisane. Czas nadał serwer.');
      logDiagnostic('fuel.save.completed', {
        module: 'fuel',
        odometerMode,
        odometerCorrected: odometerMode === 'photo' && manualCorrection,
      });
    } catch (saveError) {
      setError(saveError?.message || 'Nie udało się zapisać tankowania.');
      logDiagnostic('fuel.save.failed', { module: 'fuel', error: saveError });
    } finally {
      setBusy(false);
    }
  }

  function handleToggleCapacityEditor() {
    if (!capacityEditorOpen) {
      setCapacityDrafts(Object.fromEntries(vehicles.map((vehicle) => [
        vehicle.id,
        vehicle.tank_capacity_liters === null || vehicle.tank_capacity_liters === undefined ? '' : String(vehicle.tank_capacity_liters),
      ])));
    }
    setCapacityEditorOpen((current) => !current);
  }

  async function handleSaveTankCapacities() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const changedVehicles = vehicles.filter((vehicle) => {
        const draft = String(capacityDrafts[vehicle.id] ?? '').trim().replace(',', '.');
        const current = vehicle.tank_capacity_liters === null || vehicle.tank_capacity_liters === undefined
          ? ''
          : String(Number(vehicle.tank_capacity_liters));
        return draft !== current;
      });
      if (!changedVehicles.length) {
        setCapacityEditorOpen(false);
        setMessage('Pojemności baków są bez zmian.');
        return;
      }
      changedVehicles.forEach((vehicle) => normalizeFuelTankCapacity(capacityDrafts[vehicle.id] ?? ''));
      const updatedVehicles = [];
      for (const vehicle of changedVehicles) {
        const updated = await updateFuelVehicleTankCapacity({
          supabase,
          isAdmin,
          vehicleId: vehicle.id,
          tankCapacityLiters: capacityDrafts[vehicle.id] ?? '',
        });
        updatedVehicles.push(updated);
      }
      const updatedById = new Map(updatedVehicles.map((vehicle) => [vehicle.id, vehicle]));
      setVehicles((current) => current.map((vehicle) => updatedById.get(vehicle.id) || vehicle));
      setCapacityEditorOpen(false);
      setMessage('Pojemności baków zostały zapisane.');
      logDiagnostic('fuel.vehicle-capacity.save.completed', { module: 'fuel', count: updatedVehicles.length });
    } catch (capacityError) {
      setError(capacityError?.message || 'Nie udało się zapisać pojemności baków.');
      logDiagnostic('fuel.vehicle-capacity.save.failed', { module: 'fuel', error: capacityError });
    } finally {
      setBusy(false);
    }
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id);
    setEditLiters(String(entry.liters ?? ''));
    setEditOdometerKm(String(entry.odometer_km ?? ''));
    setError('');
    setMessage('');
  }

  function cancelEditEntry() {
    setEditingEntryId('');
    setEditLiters('');
    setEditOdometerKm('');
  }

  async function handleSaveEditedEntry(entry) {
    const vehicle = vehicles.find((item) => item.id === entry.vehicle_id);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateFuelEntry({
        supabase,
        isAdmin,
        entryId: entry.id,
        liters: editLiters,
        odometerKm: editOdometerKm,
        tankCapacityLiters: vehicle?.tank_capacity_liters ?? null,
      });
      setEntries((current) => current.map((item) => item.id === updated.id ? updated : item));
      cancelEditEntry();
      setMessage('Tankowanie zostało poprawione. Oryginalny autor i czas wpisu pozostają zachowane.');
      logDiagnostic('fuel.entry.correct.completed', { module: 'fuel', fuelEntryId: entry.id });
    } catch (editError) {
      setError(editError?.message || 'Nie udało się poprawić tankowania.');
      logDiagnostic('fuel.entry.correct.failed', { module: 'fuel', fuelEntryId: entry.id, error: editError });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry(entry) {
    if (!window.confirm(`Usunąć wpis dla ${getRegistration(entry, vehicles)} z ${formatFuelDate(entry.fueled_at)}?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await deleteFuelEntry({ supabase, isAdmin, entryId: entry.id, photoPath: entry.odometer_photo_path });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setMessage(result.photoDeleteError ? 'Wpis usunięto, ale zdjęcie wymaga późniejszego posprzątania.' : 'Wpis tankowania i zdjęcie zostały usunięte.');
      if (result.photoDeleteError) logDiagnostic('fuel.photo.delete.failed', { module: 'fuel', error: result.photoDeleteError });
    } catch (deleteError) {
      setError(deleteError?.message || 'Nie udało się usunąć wpisu.');
      logDiagnostic('fuel.delete.failed', { module: 'fuel', error: deleteError });
    } finally {
      setBusy(false);
    }
  }

  async function handleShowPhoto(entry) {
    setError('');
    try {
      const signedUrl = await getFuelOdometerPhotoUrl({ supabase, isAdmin, photoPath: entry.odometer_photo_path });
      setPhotoViewerUrl(signedUrl);
    } catch (photoError) {
      setError(photoError?.message || 'Nie udało się otworzyć zdjęcia licznika.');
      logDiagnostic('fuel.photo.open.failed', { module: 'fuel', error: photoError });
    }
  }

  return (
    <section className={`fuelModule ${compactMobileAdmin ? 'fuelModuleCompactMobile' : ''}`} aria-labelledby="fuel-module-title">
      <header className={`fuelModuleHeader ${compactMobileAdmin ? 'fuelModuleHeaderMobile' : ''}`}> 
        <div>
          <span className="fuelEyebrow">{isAdmin ? 'Flota firmowa · widok administratora' : 'Flota firmowa · Twoje tankowania'}</span>
          <h2 id="fuel-module-title">Tankowania</h2>
          {displayVehicleOverview ? (
            <p>Wybierz pojazd, wpisz litry i podaj przebieg ręcznie albo odczytaj go ze zdjęcia. Czas nada serwer.</p>
          ) : null}
        </div>
        <button type="button" className="fuelRefreshButton" onClick={() => void refresh()} disabled={busy || loading}>Odśwież</button>
      </header>

      {error ? <div className="fuelAlert fuelAlertError" role="alert">{error}</div> : null}
      {message ? <div className="fuelAlert fuelAlertSuccess" role="status">{message}</div> : null}

      <div className="fuelGrid fuelGridSingle">
        <form className={`fuelCard fuelEntryForm ${entryFormCollapsible && !isEntryFormExpanded ? 'isCollapsed' : ''}`} onSubmit={handleSubmit}>
          <div className="fuelCardHeading fuelEntryCardHeading">
            <div><span className="fuelStep">1</span><h3>Nowe tankowanie</h3></div>
            <div className="fuelEntryHeadingActions">
              {isEntryFormExpanded ? <span className="fuelAutomaticTime">{WARSAW_DATE_TIME.format(now)}</span> : null}
              {entryFormCollapsible ? (
                <button
                  type="button"
                  className="fuelCollapseButton"
                  aria-expanded={isEntryFormExpanded}
                  aria-controls="fuel-entry-form-body"
                  onClick={() => setEntryFormExpanded((current) => !current)}
                >
                  <span>{isEntryFormExpanded ? 'Zwiń' : 'Rozwiń'}</span>
                  <b aria-hidden="true">{isEntryFormExpanded ? '▲' : '▼'}</b>
                </button>
              ) : null}
            </div>
          </div>

          {isEntryFormExpanded ? (
            <div id="fuel-entry-form-body" className="fuelEntryFormBody">
          <label className="fuelField">
            <span>Numer rejestracyjny</span>
            <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={busy || !activeVehicles.length} required>
              <option value="">{activeVehicles.length ? 'Wybierz pojazd' : 'Najpierw dodaj pojazd'}</option>
              {activeVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{getVehicleLabel(vehicle)}</option>)}
            </select>
          </label>

          <label className="fuelField fuelLitersField">
            <span>Ilość paliwa</span>
            <div className="fuelInputWithUnit"><input value={liters} onChange={(event) => setLiters(event.target.value)} inputMode="decimal" placeholder="np. 48,5" required /><b>l</b></div>
            {displayVehicleOverview && selectedFuelVehicle?.tank_capacity_liters ? <small>{formatTankCapacity(selectedFuelVehicle.tank_capacity_liters)}</small> : null}
          </label>

          <div className="fuelOdometerSection">
            <div className="fuelOdometerHeading">
              <div><strong>Stan licznika</strong><span>Wpisz przebieg ręcznie albo odczytaj go ze zdjęcia.</span></div>
              {lastOdometerForVehicle !== null ? <small>Ostatnio: {lastOdometerForVehicle.toLocaleString('pl-PL')} km</small> : null}
            </div>
            <div className="fuelOdometerModeSwitch" role="group" aria-label="Sposób podania stanu licznika">
              <button type="button" className={odometerMode === 'manual' ? 'isActive' : ''} aria-pressed={odometerMode === 'manual'} onClick={() => selectOdometerMode('manual')} disabled={busy || readingOdometer}>Wpisz ręcznie</button>
              <button type="button" className={odometerMode === 'photo' ? 'isActive' : ''} aria-pressed={odometerMode === 'photo'} onClick={() => selectOdometerMode('photo')} disabled={busy || readingOdometer}>Zrób zdjęcie</button>
            </div>

            {odometerMode === 'manual' ? (
              <label className="fuelField fuelOdometerManual">
                <span>Przebieg</span>
                <div className="fuelInputWithUnit"><input value={odometerKm} onChange={(event) => setOdometerKm(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="np. 125400" min="0" max="5000000" required /><b>km</b></div>
                <small>Zdjęcie nie jest wymagane.</small>
              </label>
            ) : (
              <label className={`fuelCameraButton ${readingOdometer ? 'isReading' : ''}`}>
                <input type="file" accept="image/*" capture="environment" onChange={(event) => void handleOdometerPhoto(event)} disabled={busy || readingOdometer} />
                <span className="fuelCameraIcon" aria-hidden="true">▣</span>
                <span>{readingOdometer ? (readingLabel || 'Odczytuję licznik…') : odometerPhotoBlob ? 'Zrób zdjęcie ponownie' : 'Zrób zdjęcie licznika'}</span>
              </label>
            )}

            {odometerMode === 'photo' && odometerPhotoPreview ? (
              <div className="fuelOdometerResult">
                <img src={odometerPhotoPreview} alt="Zdjęcie licznika do potwierdzenia" />
                <div className="fuelOdometerReadout">
                  <span>{manualCorrection ? 'Wartość poprawiona' : odometerSource === 'local_ocr' ? 'Lokalny OCR odczytał' : 'OpenAI odczytało'}</span>
                  {manualCorrection ? (
                    <div className="fuelInputWithUnit"><input value={odometerKm} onChange={(event) => setOdometerKm(event.target.value.replace(/\D/g, ''))} inputMode="numeric" aria-label="Poprawiony stan licznika" autoFocus required /><b>km</b></div>
                  ) : <strong>{Number(odometerKm).toLocaleString('pl-PL')} km</strong>}
                  <small>{manualCorrection ? 'Porównaj cyfry ze zdjęciem.' : `${odometerSource === 'local_ocr' ? 'Bez wysyłania do OpenAI · ' : 'Sprawdzone przez OpenAI · '}pewność ${Math.round(Number(odometerConfidence || 0) * 100)}%`}</small>
                  <button type="button" className="fuelCorrectionButton" onClick={() => setManualCorrection((current) => !current)} disabled={busy}>
                    {manualCorrection ? 'Zakończ poprawianie' : 'Popraw odczyt awaryjnie'}
                  </button>
                </div>
                <p><b>Sprawdź cyfry na zdjęciu przed zapisaniem.</b> AI może się pomylić przy odblasku lub nieostrym ujęciu.</p>
              </div>
            ) : null}
          </div>

          <button className="fuelPrimaryButton" type="submit" disabled={busy || loading || readingOdometer || !activeVehicles.length || !odometerKm || (odometerMode === 'photo' && !odometerPhotoBlob)}>{busy ? 'Zapisywanie…' : 'Potwierdź i zapisz tankowanie'}</button>
            </div>
          ) : null}
        </form>
      </div>

      {displayVehicleOverview ? (
        <section className="fuelCard fuelVehicleOverview" aria-labelledby="fuel-vehicle-overview-title">
          <div className="fuelCardHeading">
            <div><span className="fuelStep">2</span><h3 id="fuel-vehicle-overview-title">Tankowania według samochodu</h3></div>
            <div className="fuelVehicleOverviewActions">
              <span>Kliknij samochód, aby pokazać jego historię</span>
              <button type="button" className="fuelCapacityToggle" onClick={handleToggleCapacityEditor} disabled={busy}>{capacityEditorOpen ? 'Zamknij baki' : 'Ustaw baki'}</button>
            </div>
          </div>
          {capacityEditorOpen ? (
            <div className="fuelCapacityEditor">
              <div className="fuelCapacityEditorHeading"><strong>Pojemność baków</strong><span>Ustaw raz dla każdego samochodu. Puste pole wyłącza kontrolę pojemności.</span></div>
              <div className="fuelCapacityRows">
                {vehicles.map((vehicle) => (
                  <label key={vehicle.id} className="fuelCapacityRow">
                    <span><strong>{getVehicleLabel(vehicle)}</strong><small>{vehicle.is_active ? 'Aktywny' : 'Ukryty'}</small></span>
                    <div className="fuelInputWithUnit"><input value={capacityDrafts[vehicle.id] ?? ''} onChange={(event) => setCapacityDrafts((current) => ({ ...current, [vehicle.id]: event.target.value.replace(/[^0-9,.]/g, '') }))} inputMode="decimal" placeholder="np. 60" disabled={busy} /><b>l</b></div>
                  </label>
                ))}
              </div>
              <div className="fuelCapacityEditorFooter"><button type="button" className="fuelPrimaryButton" onClick={() => void handleSaveTankCapacities()} disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz pojemności'}</button></div>
            </div>
          ) : null}
          <div className="fuelVehicleSummaryTable">
            <div className="fuelVehicleSummaryHeader" aria-hidden="true">
              <span>Samochód</span><span>Liczba tankowań</span><span>Łącznie paliwa</span><span>Śr. spalanie</span><span>Ostatnie tankowanie</span>
            </div>
            <button type="button" className={`fuelVehicleSummaryRow ${historyVehicleId ? '' : 'isActive'}`} aria-pressed={!historyVehicleId} onClick={() => setHistoryVehicleId('')}>
              <span><strong>Wszystkie samochody</strong><small>Pełna historia floty</small></span>
              <b>{formatEntryCount(entries.length)}</b>
              <span>{formatLitersTotal(allLiters)}</span>
              <span>{formatConsumption(fleetConsumption)}</span>
              <span>{entries[0] ? formatFuelDate(entries[0].fueled_at) : '—'}</span>
            </button>
            {vehicleStats.map(({ vehicle, count, liters: vehicleLiters, lastEntry, consumption }) => (
              <button key={vehicle.id} type="button" className={`fuelVehicleSummaryRow ${historyVehicleId === vehicle.id ? 'isActive' : ''}`} aria-pressed={historyVehicleId === vehicle.id} onClick={() => setHistoryVehicleId(vehicle.id)}>
                <span><strong>{getVehicleLabel(vehicle)}</strong><small>{formatTankCapacity(vehicle.tank_capacity_liters)} · {vehicle.is_active ? 'Aktywny' : 'Ukryty'}</small></span>
                <b>{formatEntryCount(count)}</b>
                <span>{formatLitersTotal(vehicleLiters)}</span>
                <span className="fuelConsumptionCell"><span className="fuelConsumptionValue">{formatConsumption(consumption.averageConsumption)}</span>{consumption.lastConsumptionUnusual ? <small className="fuelAnomalyBadge">Nietypowe ostatnie {formatAnomalyPercent(consumption.lastConsumptionChangePercent)}</small> : null}</span>
                <span>{lastEntry ? formatFuelDate(lastEntry.fueled_at) : '—'}</span>
              </button>
            ))}
          </div>
          <p className="fuelConsumptionNote">Średnie spalanie jest liczone od drugiego tankowania: litry zatankowane do pełna ÷ przejechane kilometry × 100. Nietypowo wysokie spalanie jest oznaczane po zebraniu co najmniej dwóch wcześniejszych wyników.</p>
        </section>
      ) : null}

      {displayVehicleOverview ? (
        <section className="fuelCard fuelMonthlyReport" aria-labelledby="fuel-monthly-report-title">
          <div className="fuelCardHeading fuelMonthlyReportHeading">
            <div><span className="fuelStep">3</span><h3 id="fuel-monthly-report-title">Raport miesięczny floty</h3></div>
            <label className="fuelMonthPicker"><span>Miesiąc</span><input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} /></label>
          </div>
          <div className="fuelMonthlySummary">
            <div><span>{formatMonthLabel(reportMonth)}</span><strong>{monthlyReport.totals.distanceKm.toLocaleString('pl-PL')} km</strong><small>przejechane</small></div>
            <div><span>Tankowania</span><strong>{monthlyReport.totals.tankings}</strong><small>{formatLitersTotal(monthlyReport.totals.fueledLiters)}</small></div>
            <div><span>Średnie spalanie</span><strong>{formatConsumption(monthlyReport.totals.averageConsumption)}</strong><small>cała flota</small></div>
          </div>
          <div className="fuelMonthlyTable">
            <div className="fuelMonthlyTableHeader"><span>Samochód</span><span>Tankowania</span><span>Litry</span><span>Kilometry</span><span>Śr. spalanie</span></div>
            {monthlyReport.rows.map((row) => (
              <div key={row.vehicle.id} className="fuelMonthlyTableRow">
                <span><strong>{getVehicleLabel(row.vehicle)}</strong></span>
                <span>{row.tankings}</span>
                <span>{formatLitersTotal(row.fueledLiters)}</span>
                <span>{row.distanceKm.toLocaleString('pl-PL')} km</span>
                <span>{formatConsumption(row.averageConsumption)}</span>
              </div>
            ))}
          </div>
          <p className="fuelConsumptionNote">Kilometry i spalanie są przypisane do miesiąca, w którym kończy się odcinek między kolejnymi tankowaniami do pełna.</p>
        </section>
      ) : null}

      <div className="fuelCard fuelHistory">
        <div className={`fuelCardHeading ${compactMobileAdmin ? 'fuelHistoryHeading' : ''}`}>
          <div><span className="fuelStep">{displayVehicleOverview ? '4' : '2'}</span><h3>{selectedHistoryVehicle ? `Historia: ${getVehicleLabel(selectedHistoryVehicle)}` : isAdmin ? 'Wszystkie tankowania' : 'Moje tankowania'}</h3></div>
          <span>{visibleEntries.length} wpisów</span>
          {compactMobileAdmin ? (
            <button type="button" className="fuelHistoryRefreshIcon" onClick={() => void refresh()} disabled={busy || loading} aria-label="Odśwież tankowania" title="Odśwież">↻</button>
          ) : null}
        </div>
        {loading ? <p className="fuelEmpty">Ładowanie historii…</p> : visibleEntries.length ? (
          <div className="fuelHistoryList">
            {pagedVisibleEntries.map((entry) => {
              const interval = displayVehicleOverview ? consumptionByEntryId.get(entry.id) : null;
              return (
                <article key={entry.id} className={`fuelHistoryRow ${interval?.unusualHigh ? 'hasConsumptionAnomaly' : ''} ${editingEntryId === entry.id ? 'isEditing' : ''}`}>
                  <div className="fuelHistoryVehicle">
                    <strong>{getRegistration(entry, vehicles)}</strong>
                    {compactMobileAdmin ? (
                      <span className="fuelHistoryMeta">
                        <span className="fuelHistoryDate">{compactFuelHistoryDate(entry.fueled_at)}</span>
                        {isAdmin && entry?.creator?.full_name ? (
                          <span className="fuelCreatorBadge" title={`Dodał: ${entry.creator.full_name}`} aria-label={`Dodał: ${entry.creator.full_name}`}>{creatorInitials(entry.creator.full_name)}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span>{formatFuelDate(entry.fueled_at)}{isAdmin && entry?.creator?.full_name ? ` · dodał: ${entry.creator.full_name}` : ''}</span>
                    )}
                    {Number(entry.correction_count || 0) > 0 ? <small className="fuelCorrectionMeta">Skorygowano {entry.correction_count}×{entry.corrected_at ? ` · ${formatFuelDate(entry.corrected_at)}` : ''}{entry?.corrector?.full_name ? ` · ${entry.corrector.full_name}` : ''}</small> : null}
                    {interval?.unusualHigh ? <small className="fuelAnomalyBadge">Nietypowe spalanie {formatConsumption(interval.consumption)} · {formatAnomalyPercent(interval.changePercent)}</small> : null}
                  </div>
                  <div className="fuelHistoryValue"><strong>{Number(entry.liters).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} l</strong><span>{Number(entry.odometer_km).toLocaleString('pl-PL')} km · {entry.odometer_read_source === 'local_ocr' ? 'OCR' : entry.odometer_read_source === 'manual' ? (entry.odometer_photo_path ? 'korekta' : 'ręcznie') : 'AI'}</span>{interval ? <small>Spalanie: {formatConsumption(interval.consumption)}</small> : null}</div>
                  <div className="fuelHistoryActions">
                    {entry.odometer_photo_path ? <button type="button" className="fuelPhotoButton" onClick={() => void handleShowPhoto(entry)} disabled={busy}>Zdjęcie</button> : null}
                    {displayVehicleOverview ? <button type="button" className="fuelEditButton" onClick={() => startEditEntry(entry)} disabled={busy || editingEntryId === entry.id}>Edytuj</button> : null}
                    {isAdmin ? <button type="button" className="fuelDeleteButton" onClick={() => void handleDeleteEntry(entry)} disabled={busy}>Usuń</button> : null}
                  </div>
                  {editingEntryId === entry.id ? (
                    <div className="fuelEditPanel">
                      <div className="fuelEditOriginal">
                        <strong>Popraw tankowanie</strong>
                        <span>Pierwotnie: {entry.original_liters ?? entry.liters} l · {Number(entry.original_odometer_km ?? entry.odometer_km).toLocaleString('pl-PL')} km</span>
                      </div>
                      <label className="fuelField"><span>Litry</span><div className="fuelInputWithUnit"><input value={editLiters} onChange={(event) => setEditLiters(event.target.value.replace(/[^0-9,.]/g, ''))} inputMode="decimal" /><b>l</b></div></label>
                      <label className="fuelField"><span>Przebieg</span><div className="fuelInputWithUnit"><input value={editOdometerKm} onChange={(event) => setEditOdometerKm(event.target.value.replace(/\D/g, ''))} inputMode="numeric" /><b>km</b></div></label>
                      <div className="fuelEditActions"><button type="button" onClick={cancelEditEntry} disabled={busy}>Anuluj</button><button type="button" className="fuelEditSaveButton" onClick={() => void handleSaveEditedEntry(entry)} disabled={busy}>Zapisz korektę</button></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <p className="fuelEmpty">Brak zapisanych tankowań.</p>}
        {compactMobileAdmin && !loading && visibleEntries.length > 0 && historyTotalPages > 1 ? (
          <nav className="fuelHistoryPagination" aria-label="Strony historii tankowań">
            <button type="button" className="fuelHistoryPageArrow" onClick={() => setHistoryPage((current) => Math.max(1, current - 1))} disabled={historyPage === 1} aria-label="Poprzednia strona">‹</button>
            <div className="fuelHistoryPageNumbers">
              {Array.from({ length: historyTotalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button key={pageNumber} type="button" className={`fuelHistoryPageButton ${historyPage === pageNumber ? 'isActive' : ''}`} aria-current={historyPage === pageNumber ? 'page' : undefined} onClick={() => setHistoryPage(pageNumber)}>{pageNumber}</button>
              ))}
            </div>
            <button type="button" className="fuelHistoryPageArrow" onClick={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))} disabled={historyPage === historyTotalPages} aria-label="Następna strona">›</button>
          </nav>
        ) : null}
      </div>

      {photoViewerUrl ? (
        <div className="fuelPhotoOverlay" role="dialog" aria-modal="true" aria-label="Zdjęcie licznika" onClick={() => setPhotoViewerUrl('')}>
          <div className="fuelPhotoDialog" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setPhotoViewerUrl('')} aria-label="Zamknij zdjęcie">×</button>
            <img src={photoViewerUrl} alt="Zapisane zdjęcie licznika" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
