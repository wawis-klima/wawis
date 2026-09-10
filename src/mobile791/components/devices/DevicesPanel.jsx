import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppModal from '../modals/AppModal.jsx';
import { IconCalendar, IconCheckCircle, IconMail, IconMapPin, IconPhone, IconUsers } from '../ui.jsx';
import {
  DEVICE_STATUSES,
  createEmptyDeviceForm,
  fetchAdminDevices,
  normalizeDeviceRecord,
  normalizeDeviceStatus,
  saveDeviceRecord,
  deleteDeviceRecord,
  updateDeviceStatus,
  fetchDeviceSmsHistory,
} from '../../modules/devices-fetch.js';
import SmsHistoryCard from '../sms/SmsHistoryCard.jsx';
import { normalizeDatabaseErrorMessage } from '../../modules/database-errors.js';
import { MAX_INDOOR_UNITS_PER_DEVICE, getDeviceIndoorSerials } from '../../modules/job-devices.js';

async function loadDevicesXlsxImportModule() {
  return import('../../utils/xlsxImport.js');
}

const STATUS_LABELS = {
  aktywne: 'Aktywne',
  do_serwisu: 'Do serwisu',
  zdemontowane: 'Zdemontowane',
};

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('pl-PL');
}

function formatInstallationDate(value) {
  if (!value) return 'Brak daty montażu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pl-PL').format(date);
}

function getFriendlyError(error) {
  return normalizeDatabaseErrorMessage(error, 'Wystąpił nieznany błąd.');
}

function getStatusBadgeClass(status) {
  const normalized = normalizeDeviceStatus(status);
  if (normalized === 'do_serwisu') return 'badgeAmber';
  if (normalized === 'zdemontowane') return 'badgeSlate';
  return 'badgeGreen';
}

function getDeviceSourceLabel(sourceKind) {
  const normalized = normalizeText(sourceKind).toLocaleLowerCase('pl-PL');
  if (normalized === 'job') return 'Montaż + devices';
  if (normalized === 'job_fallback') return 'Fallback z montażu';
  if (normalized === 'manual_import') return 'Import XLSX';
  if (normalized === 'manual') return 'Ręcznie';
  return 'Tabela devices';
}

function getDeviceSourceBadgeClass(sourceKind) {
  const normalized = normalizeText(sourceKind).toLocaleLowerCase('pl-PL');
  if (normalized === 'job_fallback') return 'badgeAmber';
  if (normalized === 'manual_import') return 'badgeBlue';
  if (normalized === 'manual') return 'badgePurple';
  return 'badgeGreen';
}

function normalizeCompanyName(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function isAddressLikeNote(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /\d/.test(text) && /,|ul\.|al\.|pl\.|os\.|\b\d{2}-\d{3}\b/i.test(text);
}

function cleanAddressLikeNote(value, city = '') {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  const normalizedCity = String(city || '').trim();
  if (normalizedCity) {
    const escaped = normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escaped}\\s*[•,.-]*\\s*`, 'iu'), '').trim();
  }
  return text;
}

function getClientMeta(device) {
  const address = isAddressLikeNote(device?.notes)
    ? cleanAddressLikeNote(device?.notes, device?.contractor_city)
    : '';
  if (address) return address;
  return String(device?.contractor_city || '').trim();
}

function getDeviceMeta(device) {
  const note = String(device?.notes || '').trim();
  if (!note || isAddressLikeNote(note)) return '';

  const normalized = normalizeText(note);
  const hiddenMeta = new Set([
    'urządzenie ręczne',
    'urzadzenie reczne',
    'manual',
    'manual_import',
    'job',
    'job_fallback',
  ]);
  if (hiddenMeta.has(normalized)) return '';

  return note;
}

function analyzeDeviceImportRows({ contractors = [], existingDevices = [], importedRows = [] }) {
  const contractorBuckets = new Map();
  contractors.forEach((contractor) => {
    const key = normalizeCompanyName(contractor?.company_name);
    if (!key) return;
    const bucket = contractorBuckets.get(key) || [];
    bucket.push(contractor);
    contractorBuckets.set(key, bucket);
  });

  const existingSerials = new Map();
  existingDevices.forEach((device) => {
    const serial = normalizeText(device?.serial_number);
    if (!serial) return;
    existingSerials.set(serial, device);
  });

  const seenImportSerials = new Map();
  const accepted = [];
  const duplicates = [];
  const invalidRows = [];

  importedRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const contractorName = String(row?.contractor_name || '').trim();
    const model = String(row?.model || '').trim();
    const serialNumber = String(row?.serial_number || '').trim();
    const installationDate = String(row?.installation_date || '').trim();
    const notes = String(row?.notes || '').trim();
    const status = normalizeDeviceStatus(row?.status || 'aktywne');

    if (!contractorName) {
      invalidRows.push({ rowNumber, reason: 'Brak nazwy kontrahenta w wierszu importu.' });
      return;
    }
    if (!model && !serialNumber) {
      invalidRows.push({ rowNumber, reason: 'Brak modelu i numeru seryjnego. Podaj przynajmniej jedno z tych pól.' });
      return;
    }

    const contractorMatches = contractorBuckets.get(normalizeCompanyName(contractorName)) || [];
    if (!contractorMatches.length) {
      invalidRows.push({ rowNumber, reason: `Nie znaleziono kontrahenta „${contractorName}” w bazie administratora.` });
      return;
    }
    if (contractorMatches.length > 1) {
      invalidRows.push({ rowNumber, reason: `Nazwa „${contractorName}” pasuje do wielu kontrahentów. Ujednolić nazwę w bazie lub w pliku XLSX.` });
      return;
    }

    const normalizedSerial = normalizeText(serialNumber);
    if (normalizedSerial && existingSerials.has(normalizedSerial)) {
      duplicates.push({
        rowNumber,
        reason: `Numer seryjny ${serialNumber} już istnieje w katalogu urządzeń.`,
        record: row,
      });
      return;
    }
    if (normalizedSerial && seenImportSerials.has(normalizedSerial)) {
      duplicates.push({
        rowNumber,
        reason: `Numer seryjny ${serialNumber} pojawia się już w innym wierszu tego samego pliku (wiersz ${seenImportSerials.get(normalizedSerial)}).`,
        record: row,
      });
      return;
    }
    if (normalizedSerial) {
      seenImportSerials.set(normalizedSerial, rowNumber);
    }

    accepted.push({
      rowNumber,
      record: normalizeDeviceRecord({
        ...createEmptyDeviceForm(contractorMatches[0].id),
        contractor_id: contractorMatches[0].id,
        contractor_name: contractorMatches[0].company_name,
        model,
        serial_number: serialNumber,
        installation_date: installationDate,
        status,
        notes,
        source_kind: 'manual_import',
      }),
    });
  });

  return {
    accepted,
    duplicates,
    invalidRows,
    summary: {
      total: importedRows.length,
      accepted: accepted.length,
      duplicates: duplicates.length,
      invalid: invalidRows.length,
    },
  };
}

export default function DevicesPanel({ supabase, jobs = [], isAdmin, refreshAll, contractors = [] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [devices, setDevices] = useState([]);
  const [sourceMode, setSourceMode] = useState('loading');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [busyStatusId, setBusyStatusId] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importReview, setImportReview] = useState(null);
  const [editDevice, setEditDevice] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteDevice, setDeleteDevice] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [historyDevice, setHistoryDevice] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [selectedClientDevice, setSelectedClientDevice] = useState(null);
  const importInputRef = useRef(null);
  const hasActiveFilters = Boolean(String(search || '').trim()) || statusFilter !== 'all';

  async function loadDevices({ silent = false, trySync = true } = {}) {
    if (!isAdmin) return;
    if (!silent) setLoading(true);
    setErrorMessage('');
    try {
      const result = await fetchAdminDevices({ supabase, isAdmin, jobs, trySync });
      setDevices(result.devices || []);
      setSourceMode(result.source || 'devices-rpc');
      setInfoMessage(result.staleReason || '');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDevices({ trySync: true });
  }, [isAdmin, supabase]);

  useEffect(() => {
    void loadDevices({ silent: true, trySync: false });
  }, [jobs]);

  const visibleDevices = useMemo(() => {
    const normalizedQuery = normalizeText(search);
    return devices.filter((device) => {
      if (statusFilter !== 'all' && normalizeDeviceStatus(device.status) !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        device.contractor_name,
        device.contractor_city,
        device.contractor_phone,
        device.contractor_email,
        device.model,
        device.serial_number,
        device.installation_date,
        device.notes,
        device.status,
      ].some((value) => normalizeText(value).includes(normalizedQuery));
    });
  }, [devices, search, statusFilter]);

  const counters = useMemo(() => ({
    total: devices.length,
  }), [devices]);

  async function handleStatusChange(device, nextStatus) {
    if (sourceMode !== 'devices-rpc') {
      setInfoMessage('Zmiana statusu będzie dostępna po wdrożeniu SQL modułu devices do Supabase.');
      return;
    }

    const normalizedStatus = normalizeDeviceStatus(nextStatus);
    const previousStatus = normalizeDeviceStatus(device.status);
    if (normalizedStatus === previousStatus) return;

    setBusyStatusId(String(device.id));
    setErrorMessage('');
    setInfoMessage('');
    const previousDevices = devices;
    setDevices((current) => current.map((item) => (item.id === device.id ? { ...item, status: normalizedStatus } : item)));

    try {
      const saved = await updateDeviceStatus({
        supabase,
        deviceId: device.id,
        status: normalizedStatus,
        isAdmin,
      });
      setDevices((current) => current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
      setInfoMessage(`Status urządzenia został zmieniony na „${STATUS_LABELS[normalizedStatus]}”.`);
      if (typeof refreshAll === 'function') {
        await refreshAll();
      }
    } catch (error) {
      setDevices(previousDevices);
      setErrorMessage(getFriendlyError(error));
    } finally {
      setBusyStatusId('');
    }
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const { parseXlsxDevicesFile } = await loadDevicesXlsxImportModule();
      const importedRows = await parseXlsxDevicesFile(file);
      if (!importedRows.length) throw new Error('Wybrany plik XLSX nie zawiera żadnych wierszy urządzeń do importu.');
      const analysis = analyzeDeviceImportRows({ contractors, existingDevices: devices, importedRows });
      setImportReview({ ...analysis, fileName: file.name || 'urzadzenia.xlsx' });
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      setImportBusy(false);
    }
  }

  async function handleConfirmImport() {
    if (sourceMode !== 'devices-rpc') {
      setImportReview(null);
      setInfoMessage('Import XLSX wymaga wdrożenia SQL modułu devices do Supabase. Aktualnie panel działa w trybie fallback z montaży.');
      return;
    }
    if (!importReview?.accepted?.length) {
      setImportReview(null);
      setInfoMessage('Brak nowych urządzeń do importu.');
      return;
    }

    setImportBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      let importedCount = 0;
      for (const entry of importReview.accepted) {
        await saveDeviceRecord({ supabase, device: entry.record, isAdmin });
        importedCount += 1;
      }
      await loadDevices({ trySync: false });
      if (typeof refreshAll === 'function') await refreshAll();
      setImportReview(null);
      setInfoMessage(`Import XLSX zakończony. Dodano ${importedCount} urządzeń, wykryto ${importReview.summary.duplicates} duplikatów i ${importReview.summary.invalid} błędnych wierszy.`);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setImportBusy(false);
    }
  }

  function openDeviceEditor(device) {
    setEditDevice(normalizeDeviceRecord(device));
    setErrorMessage('');
    setInfoMessage('');
  }

  function openDeviceDeleteConfirm(device) {
    setDeleteDevice(normalizeDeviceRecord(device));
    setErrorMessage('');
    setInfoMessage('');
  }

  async function handleConfirmDeleteDevice() {
    if (!deleteDevice) return;
    setDeleteBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const removedDeviceId = String(deleteDevice.id || '');
      await deleteDeviceRecord({ supabase, device: deleteDevice, isAdmin });
      await loadDevices({ trySync: false });
      if (removedDeviceId) {
        setDevices((current) => current.filter((item) => String(item.id) !== removedDeviceId));
      }
      if (typeof refreshAll === 'function') await refreshAll();
      setDeleteDevice(null);
      setInfoMessage(deleteDevice.source_kind === 'job_fallback'
        ? 'Urządzenie z montażu zostało usunięte z katalogu.'
        : 'Urządzenie zostało usunięte.');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function openDeviceHistory(device) {
    setHistoryDevice(normalizeDeviceRecord(device));
    setHistoryBusy(true);
    setHistoryLogs([]);
    setErrorMessage('');
    try {
      const logs = await fetchDeviceSmsHistory({ supabase, device, isAdmin });
      setHistoryLogs(logs);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setHistoryBusy(false);
    }
  }

  function handleResetFilters() {
    setSearch('');
    setStatusFilter('all');
  }

  function updateEditIndoorUnit(indoorIndex, value) {
    setEditDevice((prev) => {
      if (!prev) return prev;
      const indoorSerials = getDeviceIndoorSerials(prev, { keepEmpty: true });
      const nextIndoorSerials = [...indoorSerials];
      nextIndoorSerials[indoorIndex] = value;
      return {
        ...prev,
        indoor_serial_number: nextIndoorSerials[0] || '',
        indoor_serial_numbers: nextIndoorSerials,
      };
    });
  }

  function addEditIndoorUnit() {
    setEditDevice((prev) => {
      if (!prev) return prev;
      const indoorSerials = getDeviceIndoorSerials(prev, { keepEmpty: true });
      if (indoorSerials.length >= MAX_INDOOR_UNITS_PER_DEVICE) return prev;
      const nextIndoorSerials = [...indoorSerials, ''];
      return {
        ...prev,
        indoor_serial_number: nextIndoorSerials[0] || '',
        indoor_serial_numbers: nextIndoorSerials,
      };
    });
  }

  function removeEditIndoorUnit(indoorIndex) {
    setEditDevice((prev) => {
      if (!prev) return prev;
      const indoorSerials = getDeviceIndoorSerials(prev, { keepEmpty: true });
      const nextIndoorSerials = indoorSerials.length <= 1
        ? ['']
        : indoorSerials.filter((_, itemIndex) => itemIndex !== indoorIndex);
      return {
        ...prev,
        indoor_serial_number: nextIndoorSerials[0] || '',
        indoor_serial_numbers: nextIndoorSerials,
      };
    });
  }

  async function handleSaveEditDevice() {
    if (!editDevice) return;
    setEditBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const saved = await saveDeviceRecord({ supabase, device: editDevice, isAdmin });
      await loadDevices({ trySync: false });
      if (typeof refreshAll === 'function') await refreshAll();
      setEditDevice(null);
      setInfoMessage(saved.source_kind === 'job_fallback'
        ? 'Urządzenie z montażu zostało zaktualizowane.'
        : 'Urządzenie zostało zapisane.');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setEditBusy(false);
    }
  }

  if (!isAdmin) {
    return <div className="card">Moduł urządzeń jest dostępny tylko dla administratora.</div>;
  }

  return (
    <div className="devicesModulePage desktopModuleShell">
      <div className="devicesHero card premiumCard desktopHeroCard">
        <div className="devicesHeroIntro">
          <div className="sectionPill">Katalog administratora</div>
          <h1>Urządzenia</h1>
          <p>
            Osobny katalog urządzeń zsynchronizowany z montażami. Model, numer seryjny i data montażu są
            zasilane z modułu Montaże, a status urządzenia jest utrzymywany niezależnie pod przyszły serwis i SMS.
          </p>
          <div className="devicesSourceNote">
            <span className={`badge ${sourceMode === 'devices-rpc' ? 'badgeGreen' : 'badgeAmber'}`}>
              {sourceMode === 'devices-rpc' ? 'Źródło: tabela devices' : 'Źródło awaryjne: montaże'}
            </span>
          </div>
        </div>
        <div className="devicesSummaryGrid devicesSummaryGridSingle">
          <div className="devicesSummaryItem"><span>Wszystkie urządzenia</span><strong>{counters.total}</strong></div>
        </div>
      </div>

      <div className="devicesToolbar card desktopFilterCard">
        <div className="devicesToolbarTop">
          <div>
            <div className="sectionPill">Filtry i akcje</div>
            <h3 className="devicesToolbarTitle">Przegląd urządzeń na desktopie</h3>
          </div>
          <div className="devicesToolbarMeta">
            <span>{loading ? 'Ładowanie...' : `Znaleziono ${visibleDevices.length} urządzeń`}</span>
            {hasActiveFilters ? <button type="button" className="btn ghostBtn desktopToolbarActionBtn desktopToolbarActionBtnTight" onClick={handleResetFilters}>Wyczyść filtry</button> : null}
          </div>
        </div>
        <div className="devicesToolbarGrid">
          <input
            className="input devicesSearchInput"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj po kliencie, modelu, numerze seryjnym, telefonie, mieście lub notatce..."
          />
          <select className="input devicesStatusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Wszystkie statusy</option>
            {DEVICE_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
          <div className="devicesToolbarActions">
            <button type="button" className="btn secondary desktopToolbarActionBtn" onClick={() => importInputRef.current?.click()} disabled={importBusy || editBusy || deleteBusy}>
              {importBusy ? 'Analiza XLSX...' : 'Import XLSX'}
            </button>
            <button type="button" className="btn secondary desktopToolbarActionBtn" onClick={() => void loadDevices({ trySync: true })} disabled={loading || !!busyStatusId || deleteBusy}>
              Odśwież urządzenia
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx"
            onChange={(event) => void handleImportFileChange(event)}
            style={{ display: 'none' }}
          />
        </div>
        {infoMessage ? <div className="devicesInfoBanner">{infoMessage}</div> : null}
        {errorMessage ? <div className="devicesErrorBanner">{errorMessage}</div> : null}
      </div>

      <section className="card devicesTableCard desktopDataCard">
        <div className="devicesSectionHeader">
          <h3>Lista urządzeń</h3>
          <span>{loading ? 'Ładowanie...' : `${visibleDevices.length} pozycji`}</span>
        </div>

        {!loading && !devices.length ? (
          <div className="devicesEmptyState">
            Brak urządzeń w katalogu. Dodaj model lub numer seryjny w montażu, albo użyj „Import XLSX”, a potem uruchom SQL synchronizujący tabelę <code>devices</code>.
          </div>
        ) : null}

        {!loading && devices.length > 0 && !visibleDevices.length ? (
          <div className="devicesEmptyState">Brak urządzeń spełniających kryteria wyszukiwania.</div>
        ) : null}

        {visibleDevices.length ? (
          <>
            <div className="tableWrap devicesTableWrap devicesDesktopList">
              <table className="jobTable devicesTable" aria-label="Tabela urządzeń">
                <colgroup>
                  <col className="devicesColContractor" />
                  <col className="devicesColModel" />
                  <col className="devicesColSerial" />
                  <col className="devicesColDate" />
                  <col className="devicesColStatus" />
                  <col className="devicesColActions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Klient</th>
                    <th>Urządzenie</th>
                    <th>Numer seryjny</th>
                    <th>Data montażu</th>
                    <th>Status</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDevices.map((device) => (
                    <tr key={device.id}>
                      <td>
                        <button type="button" className="devicesClientButton" onClick={() => setSelectedClientDevice(device)} aria-label={`Pokaż dane klienta ${device.contractor_name || 'bez klienta'}`}>
                          <strong>{device.contractor_name || 'Bez klienta'}</strong>
                          <span>{getClientMeta(device) || 'Brak miasta'}</span>
                          <span>{device.contractor_phone || device.contractor_email || 'Brak kontaktu'}</span>
                        </button>
                      </td>
                      <td>
                        <div className="devicesPrimaryCell">
                          <strong>{device.model || 'Brak modelu'}</strong>
                          {getDeviceMeta(device) ? <span>{getDeviceMeta(device)}</span> : null}
                          <span className={`badge ${getDeviceSourceBadgeClass(device.source_kind)} devicesSourceBadge`}>{getDeviceSourceLabel(device.source_kind)}</span>
                        </div>
                      </td>
                      <td>{device.serial_number || 'Brak numeru seryjnego'}</td>
                      <td>{formatInstallationDate(device.installation_date)}</td>
                      <td><span className={`badge ${getStatusBadgeClass(device.status)} devicesStatusBadge`}>{STATUS_LABELS[normalizeDeviceStatus(device.status)]}</span></td>
                      <td>
                        <div className="devicesTableActions devicesTableActionsStacked">
                          <button type="button" className="btn ghostBtn devicesActionBtn devicesActionBtnCompact" onClick={() => openDeviceEditor(device)} disabled={deleteBusy}>Edytuj</button>
                          <button type="button" className="btn secondary devicesActionBtn devicesActionBtnCompact" onClick={() => void openDeviceHistory(device)} disabled={deleteBusy}>Historia SMS</button>
                          <button type="button" className="btn dangerGhostBtn devicesActionBtn devicesActionBtnCompact" onClick={() => openDeviceDeleteConfirm(device)} disabled={deleteBusy}>Usuń</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="devicesMobileList" role="list" aria-label="Lista urządzeń">
              {visibleDevices.map((device) => (
                <article key={`mobile-${device.id}`} className="devicesMobileCard" role="listitem">
                  <div className="devicesMobileCardHeader">
                    <div>
                      <div className="sectionPill">Urządzenie</div>
                      <h4>{device.model || 'Brak modelu'}</h4>
                    </div>
                    <span className={`badge ${getStatusBadgeClass(device.status)} devicesStatusBadge`}>{STATUS_LABELS[normalizeDeviceStatus(device.status)]}</span>
                  </div>
                  <div className="devicesMobileGrid">
                    <div className="contractorsPreviewItem">
                      <span className="infoLabelWithIcon"><IconUsers /><span>Klient</span></span>
                      <strong>{device.contractor_name || 'Bez klienta'}</strong>
                    </div>
                    <div className="contractorsPreviewItem">
                      <span className="infoLabelWithIcon"><IconCheckCircle /><span>Numer seryjny</span></span>
                      <strong>{device.serial_number || 'Brak numeru seryjnego'}</strong>
                    </div>
                    <div className="contractorsPreviewItem">
                      <span className="infoLabelWithIcon"><IconCalendar /><span>Data montażu</span></span>
                      <strong>{formatInstallationDate(device.installation_date)}</strong>
                    </div>
                    <div className="contractorsPreviewItem">
                      <span className="infoLabelWithIcon"><IconPhone /><span>Telefon</span></span>
                      <strong>{device.contractor_phone || 'Brak telefonu'}</strong>
                    </div>
                    <div className="contractorsPreviewItem">
                      <span className="infoLabelWithIcon"><IconMapPin /><span>Miasto</span></span>
                      <strong>{device.contractor_city || 'Brak miasta'}</strong>
                    </div>
                    <div className="contractorsPreviewItem">
                      <span className="infoLabelWithIcon"><IconCheckCircle /><span>Źródło</span></span>
                      <strong>{getDeviceSourceLabel(device.source_kind)}</strong>
                    </div>
                    <label className="inputLabel contractorsPreviewItem devicesMobileStatusField">
                      <span className="infoLabelWithIcon"><IconCheckCircle /><span>Status urządzenia</span></span>
                      <select
                        className="input devicesRowStatusSelect"
                        value={normalizeDeviceStatus(device.status)}
                        onChange={(event) => void handleStatusChange(device, event.target.value)}
                        disabled={sourceMode !== 'devices-rpc' || busyStatusId === String(device.id)}
                      >
                        {DEVICE_STATUSES.map((status) => (
                          <option key={`mobile-${device.id}-${status}`} value={status}>{STATUS_LABELS[status]}</option>
                        ))}
                      </select>
                    </label>
                    <div className="devicesTableActions"><button type="button" className="btn ghostBtn" onClick={() => openDeviceEditor(device)}>Edytuj urządzenie</button><button type="button" className="btn secondary" onClick={() => void openDeviceHistory(device)}>Historia SMS</button></div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <AppModal open={Boolean(importReview)} onClose={() => !importBusy && setImportReview(null)} contentClassName="card contractorsImportDialog">
        {importReview ? (
          <>
            <div className="contractorsModalHeader contractorsImportHeader">
              <div>
                <div className="sectionPill">Import XLSX urządzeń</div>
                <h3>Analiza pliku {importReview.fileName}</h3>
                <p>Importujemy tylko rekordy powiązane z istniejącym kontrahentem. Duplikaty są sprawdzane głównie po numerze seryjnym.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setImportReview(null)} disabled={importBusy}>Zamknij</button>
            </div>
            <div className="contractorsImportSummaryGrid">
              <div className="contractorsImportSummaryItem"><span>Wszystkie wiersze</span><strong>{importReview.summary.total}</strong></div>
              <div className="contractorsImportSummaryItem"><span>Nowe do importu</span><strong>{importReview.summary.accepted}</strong></div>
              <div className="contractorsImportSummaryItem contractorsImportSummaryWarn"><span>Duplikaty</span><strong>{importReview.summary.duplicates}</strong></div>
              <div className="contractorsImportSummaryItem contractorsImportSummaryMuted"><span>Błędne wiersze</span><strong>{importReview.summary.invalid}</strong></div>
            </div>

            <div className="contractorsImportScrollableArea">
              {importReview.accepted.length ? (
                <div className="contractorsImportSection">
                  <div className="contractorsSectionHeader"><h3>Urządzenia gotowe do importu</h3><span>{importReview.accepted.length}</span></div>
                  <div className="contractorsImportList contractorsImportListCompact">
                    {importReview.accepted.slice(0, 12).map(({ rowNumber, record }) => (
                      <div key={`accepted-device-${rowNumber}-${record.serial_number || record.model}`} className="contractorsImportItem contractorsImportItemAccepted">
                        <div>
                          <strong>Wiersz {rowNumber}: {record.contractor_name || 'Brak kontrahenta'}</strong>
                          <div className="contractorsImportItemMeta">{[record.model, record.serial_number, record.installation_date].filter(Boolean).join(' • ') || 'Brak danych urządzenia'}</div>
                        </div>
                        <span className="contractorsImportBadge contractorsImportBadgeAccepted">nowy</span>
                      </div>
                    ))}
                  </div>
                  {importReview.accepted.length > 12 ? <div className="contractorsImportOverflowNote">Na podglądzie pokazujemy pierwsze 12 nowych urządzeń. Do importu trafią wszystkie rekordy oznaczone jako nowe.</div> : null}
                </div>
              ) : null}

              {importReview.duplicates.length ? (
                <div className="contractorsImportSection">
                  <div className="contractorsSectionHeader"><h3>Duplikaty wykryte w pliku lub bazie</h3><span>{importReview.duplicates.length}</span></div>
                  <div className="contractorsImportList">
                    {importReview.duplicates.map(({ rowNumber, reason, record }) => (
                      <div key={`device-duplicate-${rowNumber}`} className="contractorsImportItem contractorsImportItemDuplicate">
                        <div>
                          <strong>Wiersz {rowNumber}: {record.contractor_name || 'Brak kontrahenta'}</strong>
                          <div className="contractorsImportItemMeta">{[record.model, record.serial_number].filter(Boolean).join(' • ') || 'Brak danych urządzenia'}</div>
                          <div className="contractorsImportItemReason">{reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {importReview.invalidRows.length ? (
                <div className="contractorsImportSection">
                  <div className="contractorsSectionHeader"><h3>Błędne wiersze</h3><span>{importReview.invalidRows.length}</span></div>
                  <div className="contractorsImportList">
                    {importReview.invalidRows.map(({ rowNumber, reason }) => (
                      <div key={`device-invalid-${rowNumber}-${reason}`} className="contractorsImportItem contractorsImportItemInvalid">
                        <div>
                          <strong>Wiersz {rowNumber}</strong>
                          <div className="contractorsImportItemReason">{reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="contractorsModalActions contractorsImportActions">
              <button type="button" className="btn" onClick={() => void handleConfirmImport()} disabled={importBusy || !importReview.accepted.length}>
                {importBusy ? 'Importowanie...' : `Importuj tylko nowe (${importReview.summary.accepted})`}
              </button>
              <button type="button" className="btn ghostBtn" onClick={() => setImportReview(null)} disabled={importBusy}>Anuluj</button>
            </div>
          </>
        ) : null}
      </AppModal>

      <AppModal open={Boolean(deleteDevice)} onClose={() => !deleteBusy && setDeleteDevice(null)} contentClassName="card contractorsDetailsDialog">
        {deleteDevice ? (
          <>
            <div className="contractorsModalHeader">
              <div>
                <div className="sectionPill">Usuwanie urządzenia</div>
                <h3>{deleteDevice.model || 'Urządzenie bez modelu'}</h3>
                <p>
                  Czy na pewno chcesz usunąć to urządzenie z katalogu?
                  {deleteDevice.source_kind === 'job_fallback' || deleteDevice.source_kind === 'job'
                    ? ' Dane urządzenia zostaną wyczyszczone także w powiązanym montażu, bez usuwania samego montażu.'
                    : ''}
                </p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setDeleteDevice(null)} disabled={deleteBusy}>Zamknij</button>
            </div>

            <div className="contractorsDetailsGrid">
              <div className="contractorsPreviewItem contractorsPreviewItemFull">
                <span className="infoLabelWithIcon"><IconUsers /><span>Klient</span></span>
                <strong>{deleteDevice.contractor_name || 'Bez klienta'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Model</span></span>
                <strong>{deleteDevice.model || 'Brak modelu'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Numer seryjny</span></span>
                <strong>{deleteDevice.serial_number || 'Brak numeru seryjnego'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Źródło</span></span>
                <strong>{getDeviceSourceLabel(deleteDevice.source_kind)}</strong>
              </div>
            </div>

            <div className="contractorsModalActions">
              <button type="button" className="btn deleteCardBtn" onClick={() => void handleConfirmDeleteDevice()} disabled={deleteBusy}>
                {deleteBusy ? 'Usuwanie...' : 'Usuń urządzenie'}
              </button>
              <button type="button" className="btn ghostBtn" onClick={() => setDeleteDevice(null)} disabled={deleteBusy}>Anuluj</button>
            </div>
          </>
        ) : null}
      </AppModal>

      <AppModal open={Boolean(editDevice)} onClose={() => !editBusy && setEditDevice(null)} contentClassName="card contractorsDetailsDialog">
        {editDevice ? (
          <>
            <div className="contractorsModalHeader">
              <div>
                <div className="sectionPill">Edycja urządzenia</div>
                <h3>{editDevice.contractor_name || 'Urządzenie kontrahenta'}</h3>
                <p>{editDevice.source_kind === 'job_fallback' ? 'Edytujesz urządzenie zapisane w montażu.' : 'Edytujesz rekord z tabeli devices.'}</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setEditDevice(null)} disabled={editBusy}>Zamknij</button>
            </div>

            <div className="contractorsDetailsGrid">
              <label className="inputLabel contractorsPreviewItem contractorsPreviewItemFull">
                <span className="infoLabelWithIcon"><IconUsers /><span>Kontrahent</span></span>
                <strong>{editDevice.contractor_name || 'Bez przypisanego kontrahenta'}</strong>
              </label>
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Model urządzenia</span></span>
                <input className="input" value={editDevice.model || ''} onChange={(event) => setEditDevice((prev) => ({ ...prev, model: event.target.value }))} />
              </label>
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Numer seryjny JZ</span></span>
                <input className="input" value={editDevice.outdoor_serial_number || ''} onChange={(event) => setEditDevice((prev) => ({ ...prev, outdoor_serial_number: event.target.value }))} />
              </label>
              <div className="contractorsPreviewItem contractorsPreviewItemFull jobIndoorUnitsBlock">
                <div className="jobIndoorUnitsHeader">
                  <div>
                    <strong>Jednostki wewnętrzne</strong>
                    <span>Możesz zapisać do {MAX_INDOOR_UNITS_PER_DEVICE} numerów JW dla jednego urządzenia multi.</span>
                  </div>
                  <button
                    type="button"
                    className="btn secondary jobIndoorUnitAddBtn"
                    onClick={addEditIndoorUnit}
                    disabled={getDeviceIndoorSerials(editDevice, { keepEmpty: true }).length >= MAX_INDOOR_UNITS_PER_DEVICE || editBusy}
                  >
                    + Dodaj tylko jednostkę wewnętrzną
                  </button>
                </div>
                <div className="jobIndoorUnitsList">
                  {getDeviceIndoorSerials(editDevice, { keepEmpty: true }).map((serial, indoorIndex) => (
                    <label className="inputLabel jobIndoorUnitField" key={`edit-device-indoor-${indoorIndex}`}>
                      <span>Numer seryjny JW {indoorIndex + 1}</span>
                      <div className="jobIndoorUnitInputRow">
                        <input className="input" value={serial || ''} onChange={(event) => updateEditIndoorUnit(indoorIndex, event.target.value)} />
                        {getDeviceIndoorSerials(editDevice, { keepEmpty: true }).length > 1 ? (
                          <button type="button" className="fieldClearBtn jobIndoorUnitRemoveBtn" onClick={() => removeEditIndoorUnit(indoorIndex)} disabled={editBusy}>Usuń JW</button>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {editDevice.legacy_serial_number && !getDeviceIndoorSerials(editDevice).length && !editDevice.outdoor_serial_number ? (
                <div className="contractorsPreviewItem contractorsPreviewItemFull devicesLegacySerialNote">
                  Stary zapis numeru seryjnego: <strong>{editDevice.legacy_serial_number}</strong>. Zostanie zachowany, jeśli nie wpiszesz numerów JW/JZ.
                </div>
              ) : null}
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCalendar /><span>Data montażu</span></span>
                <input className="input" type="date" value={editDevice.installation_date || ''} onChange={(event) => setEditDevice((prev) => ({ ...prev, installation_date: event.target.value }))} />
              </label>
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Status urządzenia</span></span>
                <select className="input" value={normalizeDeviceStatus(editDevice.status)} onChange={(event) => setEditDevice((prev) => ({ ...prev, status: event.target.value }))}>
                  {DEVICE_STATUSES.map((status) => <option key={`edit-${status}`} value={status}>{STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label className="inputLabel contractorsPreviewItem contractorsPreviewItemFull">
                <span className="infoLabelWithIcon"><IconMapPin /><span>Notatki</span></span>
                <textarea className="input textarea" rows={4} value={editDevice.notes || ''} onChange={(event) => setEditDevice((prev) => ({ ...prev, notes: event.target.value }))} />
              </label>
            </div>

            <div className="contractorsModalActions">
              <button type="button" className="btn" onClick={() => void handleSaveEditDevice()} disabled={editBusy}>
                {editBusy ? 'Zapisywanie...' : 'Zapisz urządzenie'}
              </button>
              <button type="button" className="btn ghostBtn" onClick={() => setEditDevice(null)} disabled={editBusy}>Anuluj</button>
            </div>
          </>
        ) : null}
      </AppModal>




      <AppModal open={Boolean(selectedClientDevice)} onClose={() => setSelectedClientDevice(null)} contentClassName="card contractorsDetailsDialog devicesClientDetailsDialog">
        {selectedClientDevice ? (
          <>
            <div className="contractorsModalHeader">
              <div>
                <div className="sectionPill">Dane klienta</div>
                <h3>{selectedClientDevice.contractor_name || 'Bez klienta'}</h3>
                <p>{[getClientMeta(selectedClientDevice), selectedClientDevice.contractor_phone || selectedClientDevice.contractor_email].filter(Boolean).join(' • ') || 'Brak danych kontaktowych'}</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setSelectedClientDevice(null)}>Zamknij</button>
            </div>

            <div className="contractorsDetailsGrid devicesClientDetailsGrid">
              <div className="contractorsPreviewItem contractorsPreviewItemFull">
                <span className="infoLabelWithIcon"><IconUsers /><span>Klient</span></span>
                <strong>{selectedClientDevice.contractor_name || 'Bez klienta'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconMapPin /><span>Adres / miasto</span></span>
                <strong>{getClientMeta(selectedClientDevice) || selectedClientDevice.contractor_city || 'Brak miasta'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconPhone /><span>Telefon</span></span>
                <strong>{selectedClientDevice.contractor_phone || 'Brak telefonu'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconMail /><span>E-mail</span></span>
                <strong>{selectedClientDevice.contractor_email || 'Brak e-maila'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Urządzenie</span></span>
                <strong>{selectedClientDevice.model || 'Brak modelu'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Numer seryjny</span></span>
                <strong>{selectedClientDevice.serial_number || 'Brak numeru seryjnego'}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCalendar /><span>Data montażu</span></span>
                <strong>{formatInstallationDate(selectedClientDevice.installation_date)}</strong>
              </div>
              <div className="contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Źródło danych</span></span>
                <strong>{getDeviceSourceLabel(selectedClientDevice.source_kind)}</strong>
              </div>
            </div>
          </>
        ) : null}
      </AppModal>

      <AppModal open={Boolean(historyDevice)} onClose={() => !historyBusy && setHistoryDevice(null)} contentClassName="card contractorsDetailsDialog">
        {historyDevice ? (
          <>
            <div className="contractorsModalHeader">
              <div>
                <div className="sectionPill">Historia SMS urządzenia</div>
                <h3>{historyDevice.contractor_name || historyDevice.model || 'Urządzenie'}</h3>
                <p>{[historyDevice.model, historyDevice.serial_number, historyDevice.installation_date ? `Montaż: ${formatInstallationDate(historyDevice.installation_date)}` : ''].filter(Boolean).join(' • ')}</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setHistoryDevice(null)} disabled={historyBusy}>Zamknij</button>
            </div>
            {historyBusy ? <div className="card">Ładowanie historii SMS...</div> : <SmsHistoryCard logs={historyLogs} />}
          </>
        ) : null}
      </AppModal>

    </div>
  );
}
