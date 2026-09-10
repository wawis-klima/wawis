import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppModal from '../modals/AppModal.jsx';
import ClientVoiceInput, { VoiceFieldButton } from '../../../components/voice/ClientVoiceInput.jsx';
import { IconUsers, IconMail, IconMapPin, IconPhone, IconFileText, IconCheckCircle } from '../ui.jsx';
import {
  analyzeContractorImportRows,
  buildContractorsWithJobFallback,
  createEmptyContractorAddress,
  findContractorDuplicates,
  getContractorAddress,
  getEmptyContractorForm,
  isJobDerivedContractor,
  normalizeContractorRecord,
} from '../../modules/contractors.js';
import { loadContractors, removeContractor, removeJobFallbackContractor, saveContractor, syncContractorJobs } from '../../modules/contractors-fetch.js';
import { createEmptyDeviceForm, fetchContractorDevices, normalizeDeviceStatus, saveDeviceRecord } from '../../modules/devices-fetch.js';
import { getJobDeviceRows } from '../../modules/job-devices.js';
import { normalizeDatabaseErrorMessage } from '../../modules/database-errors.js';
import { normalizeVoiceEmail, normalizeVoicePhone } from '../../modules/client-voice-input.js';


async function loadContractorsXlsxImportModule() {
  return import('../../utils/xlsxImport.js');
}

async function loadContractorsXlsxExportModule() {
  return import('../../utils/xlsxExport.js');
}

const SORT_FIELDS = {
  // legacy smoke guard: handleSort('street') remains supported in release checks even though ulica jest teraz pokazywana pod nazwą.
  company_name: 'Nazwa',
  contact_location: 'Nazwa i adres',
  phone: 'Telefon',
  email: 'Email',
  nip: 'NIP',
};

function getFriendlyError(error) {
  return normalizeDatabaseErrorMessage(error, 'Wystąpił nieznany błąd.');
}

function getContractorAddressLines(contractor) {
  const street = String(contractor?.street || '').trim();
  const city = String(contractor?.city || '').trim();
  return [street, city].filter(Boolean);
}

function getCompositeSortValue(contractor) {
  return [
    String(contractor?.company_name || '').trim(),
    String(contractor?.street || '').trim(),
    String(contractor?.city || '').trim(),
  ].join(' ').toLocaleLowerCase('pl-PL');
}

function getSortValue(contractor, field) {
  if (field === 'contact_location') return getCompositeSortValue(contractor);
  return String(contractor?.[field] || '').toLocaleLowerCase('pl-PL');
}

function sortContractors(items, sortConfig = { field: 'company_name', direction: 'asc' }) {
  const directionFactor = sortConfig.direction === 'desc' ? -1 : 1;
  return [...items].sort((left, right) => {
    const leftValue = getSortValue(left, sortConfig.field);
    const rightValue = getSortValue(right, sortConfig.field);
    const compared = leftValue.localeCompare(rightValue, 'pl', { numeric: true, sensitivity: 'base' });
    if (compared !== 0) return compared * directionFactor;
    return String(left?.company_name || '').localeCompare(String(right?.company_name || ''), 'pl', { numeric: true, sensitivity: 'base' });
  });
}

function DetailRow({ label, value, icon }) {
  return (
    <div className="contractorsPreviewItem">
      <span className="infoLabelWithIcon">{icon}<span>{label}</span></span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function formatImportReasons(reasons = []) {
  if (!reasons.length) return 'wymaga sprawdzenia';
  return reasons.join(' / ');
}

export default function ContractorsPanel({ supabase, isAdmin, refreshAll, jobs = [], requestedContractorId = null }) {
  const [contractors, setContractors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(getEmptyContractorForm());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [activeView, setActiveView] = useState('none');
  const [sortConfig, setSortConfig] = useState({ field: 'company_name', direction: 'asc' });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [importReview, setImportReview] = useState(null);
  const [contractorDevicesRemote, setContractorDevicesRemote] = useState([]);
  const [deviceEditor, setDeviceEditor] = useState(null);
  const [deviceSaveBusy, setDeviceSaveBusy] = useState(false);
  const [deletedFallbackJobIds, setDeletedFallbackJobIds] = useState([]);
  const importInputRef = useRef(null);

  async function reloadContractors() {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await loadContractors({ supabase, isAdmin });
      setContractors(data);
      setSelectedId((prev) => (prev && data.some((item) => item.id === prev) ? prev : null));
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadContractors();
  }, [supabase, isAdmin]);

  const jobsForContractorFallback = useMemo(() => {
    if (!deletedFallbackJobIds.length) return jobs;
    const hiddenIds = new Set(deletedFallbackJobIds.map((id) => String(id)));
    return (jobs || []).filter((job) => !hiddenIds.has(String(job?.id || '')));
  }, [deletedFallbackJobIds, jobs]);

  useEffect(() => {
    if (!deletedFallbackJobIds.length) return;
    setDeletedFallbackJobIds((prev) => prev.filter((id) => (jobs || []).some((job) => String(job?.id || '') === String(id))));
  }, [deletedFallbackJobIds.length, jobs]);

  const contractorsWithJobFallback = useMemo(
    () => buildContractorsWithJobFallback(contractors, jobsForContractorFallback),
    [contractors, jobsForContractorFallback],
  );

  const jobFallbackContractorsCount = useMemo(
    () => contractorsWithJobFallback.filter((item) => isJobDerivedContractor(item)).length,
    [contractorsWithJobFallback],
  );

  useEffect(() => {
    if (!selectedId) {
      if (activeView !== 'edit') setForm(getEmptyContractorForm());
      return;
    }
    const selectedContractor = contractorsWithJobFallback.find((item) => item.id === selectedId);
    if (selectedContractor) setForm(normalizeContractorRecord(selectedContractor));
  }, [selectedId, contractorsWithJobFallback, activeView]);

  useEffect(() => {
    if (!requestedContractorId || !isAdmin) return;
    setSelectedId(String(requestedContractorId));
    setDetailsOpen(true);
    setActiveView('none');
  }, [requestedContractorId, isAdmin]);

  const selectedContractor = useMemo(
    () => contractorsWithJobFallback.find((item) => item.id === selectedId) || null,
    [contractorsWithJobFallback, selectedId],
  );


  const selectedContractorDevicesFromJobs = useMemo(() => {
    if (!selectedContractor?.id) return [];
    const fallbackJobIds = new Set(selectedContractor.source_job_ids || []);
    return (jobs || [])
      .filter((job) => isJobDerivedContractor(selectedContractor) ? fallbackJobIds.has(job?.id) : String(job?.contractor_id || '') === String(selectedContractor.id))
      .flatMap((job) => getJobDeviceRows(job).map((device, index) => ({
        id: index === 0 ? job.id : `${job.id}::device-${index + 1}`,
        model: device.model || '',
        serial_number: device.serial_number || '',
        installation_date: job.installation_date || '',
        status: 'aktywne',
        city: job.city || '',
        street: job.street || '',
        notes: '',
        source_job_id: job.id,
        source_kind: 'job_fallback',
      })))
      .sort((left, right) => new Date(right?.installation_date || right?.created_at || 0) - new Date(left?.installation_date || left?.created_at || 0));
  }, [jobs, selectedContractor]);

  const selectedContractorDevices = contractorDevicesRemote.length ? contractorDevicesRemote : selectedContractorDevicesFromJobs;

  const duplicateMatches = useMemo(
    () => findContractorDuplicates(contractors, form),
    [contractors, form],
  );


  useEffect(() => {
    let cancelled = false;

    async function loadSelectedContractorDevices() {
      if (!selectedContractor?.id || isJobDerivedContractor(selectedContractor) || !detailsOpen || !isAdmin) {
        setContractorDevicesRemote([]);
        return;
      }

      try {
        const data = await fetchContractorDevices({
          supabase,
          contractorId: selectedContractor.id,
          isAdmin,
          jobs,
        });
        if (!cancelled) {
          setContractorDevicesRemote(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.warn('Nie udało się pobrać urządzeń kontrahenta z modułu devices.', error?.message || error);
        if (!cancelled) setContractorDevicesRemote([]);
      }
    }

    void loadSelectedContractorDevices();
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, isAdmin, jobs, selectedContractor, supabase]);

  const visibleContractors = useMemo(() => {
    const normalizedQuery = search.trim().toLocaleLowerCase('pl-PL');
    const filtered = !normalizedQuery
      ? contractorsWithJobFallback
      : contractorsWithJobFallback.filter((item) => [
          item.company_name,
          item.contact_person,
          item.phone,
          item.email,
          item.city,
          item.street,
          item.nip,
          item.notes,
        ].some((value) => String(value || '').toLocaleLowerCase('pl-PL').includes(normalizedQuery)));
    return sortContractors(filtered, sortConfig);
  }, [contractorsWithJobFallback, search, sortConfig]);

  function handleSort(field) {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function getSortLabel(field) {
    if (sortConfig.field !== field) return SORT_FIELDS[field];
    return `${SORT_FIELDS[field]} ${sortConfig.direction === 'asc' ? '↑' : '↓'}`;
  }

  function applyVoiceContractorData(data) {
    setForm((prev) => {
      const addresses = Array.isArray(prev.addresses) && prev.addresses.length
        ? prev.addresses.map((address) => ({ ...address }))
        : [createEmptyContractorAddress()];
      const primaryIndex = Math.max(0, addresses.findIndex((address) => address.is_primary));
      const primary = addresses[primaryIndex] || createEmptyContractorAddress();
      const city = data.formattedCity || primary.city || prev.city || '';
      const street = data.formattedStreet || primary.street || prev.street || '';
      addresses[primaryIndex] = { ...primary, city, street, is_primary: true };
      return {
        ...prev,
        company_name: data.clientName || prev.company_name,
        phone: data.phone || prev.phone,
        email: data.email || prev.email,
        city,
        street,
        addresses,
      };
    });
  }

  async function handleSave() {
    if (duplicateMatches.length) {
      setErrorMessage('Podany kontrahent wygląda na duplikat. Wybierz istniejący wpis albo popraw dane przed zapisem.');
      setInfoMessage('');
      return;
    }
    setSaveBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const wasExisting = Boolean(form.id);
      const previousContractor = wasExisting
        ? contractors.find((item) => String(item.id) === String(form.id)) || null
        : null;
      const saved = await saveContractor({ supabase, contractor: form, isAdmin });
      let syncSummary = null;
      if (saved?.id) {
        syncSummary = await syncContractorJobs({
          supabase,
          contractor: saved,
          previousContractor,
          isAdmin,
        });
      }
      setContractors((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved];
      });
      setSelectedId(saved.id || null);
      setActiveView('list');
      setDetailsOpen(false);
      setForm(getEmptyContractorForm());
      const syncedJobsCount = (syncSummary?.linkedJobsUpdated || 0) + (syncSummary?.legacyJobsUpdated || 0);
      if (typeof refreshAll === 'function' && (wasExisting || syncedJobsCount)) {
        await refreshAll();
      }
      if (wasExisting) {
        setInfoMessage(
          syncedJobsCount
            ? `Zmiany kontrahenta zostały zapisane. Zsynchronizowano ${syncedJobsCount} montaży.`
            : 'Zmiany kontrahenta zostały zapisane.',
        );
      } else {
        setInfoMessage(
          syncedJobsCount
            ? 'Nowy kontrahent został dodany. Przypięto ' + syncedJobsCount + ' montaży z tą nazwą.'
            : 'Nowy kontrahent został dodany.',
        );
      }
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDeleteById(contractor) {
    if (isJobDerivedContractor(contractor)) {
      const sourceJobIds = (contractor?.source_job_ids || []).filter(Boolean);
      const relatedJobsCount = sourceJobIds.length || 1;
      const relatedJobsLabel = relatedJobsCount === 1 ? 'powiązane zlecenie' : `${relatedJobsCount} powiązane zlecenia`;
      const shouldDeleteFallback = window.confirm(
        `„${contractor.company_name || 'bez nazwy'}” pochodzi z montażu bez zapisanego kontrahenta. Usunięcie tego wpisu usunie ${relatedJobsLabel} z modułu Montaże. Kontynuować?`,
      );
      if (!shouldDeleteFallback) return;

      setDeleteBusy(true);
      setErrorMessage('');
      setInfoMessage('');
      try {
        const result = await removeJobFallbackContractor({ supabase, contractor, jobs, isAdmin });
        setDeletedFallbackJobIds((prev) => [...new Set([...prev, ...(result.deletedJobIds || [])])]);
        if (selectedId === contractor.id) {
          setSelectedId(null);
          setForm(getEmptyContractorForm());
          setDetailsOpen(false);
        }
        if (activeView === 'edit' && form.id === contractor.id) {
          setActiveView('none');
          setForm(getEmptyContractorForm());
        }
        if (typeof refreshAll === 'function') await refreshAll();
        const deletedJobs = result.deletedJobs || 0;
        setInfoMessage(deletedJobs === 1
          ? 'Wpis z montażu został usunięty razem z powiązanym zleceniem.'
          : `Wpis z montażu został usunięty razem z ${deletedJobs} powiązanymi zleceniami.`);
      } catch (error) {
        setErrorMessage(getFriendlyError(error));
      } finally {
        setDeleteBusy(false);
      }
      return;
    }

    if (!contractor?.id) return;
    const shouldDelete = window.confirm(`Usunąć kontrahenta „${contractor.company_name || 'bez nazwy'}”?`);
    if (!shouldDelete) return;
    setDeleteBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      await removeContractor({ supabase, contractorId: contractor.id, isAdmin });
      setContractors((prev) => prev.filter((item) => item.id !== contractor.id));
      if (selectedId === contractor.id) {
        setSelectedId(null);
        setForm(getEmptyContractorForm());
        setDetailsOpen(false);
      }
      if (activeView === 'edit' && form.id === contractor.id) {
        setActiveView('none');
        setForm(getEmptyContractorForm());
      }
      setInfoMessage('Kontrahent został usunięty.');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleDelete() {
    if (!form.id) {
      setForm(getEmptyContractorForm());
      setSelectedId(null);
      setActiveView('none');
      return;
    }
    await handleDeleteById(form);
  }

  function handleShowAllContractors() {
    const nextView = activeView === 'list' ? 'none' : 'list';
    setSearch('');
    setSelectedId(null);
    setDetailsOpen(false);
    setForm(getEmptyContractorForm());
    setActiveView(nextView);
    setInfoMessage('');
    setErrorMessage('');
  }

  function handleNewContractor() {
    const nextView = activeView === 'new' ? 'none' : 'new';
    setSelectedId(null);
    setDetailsOpen(false);
    setForm(getEmptyContractorForm());
    setActiveView(nextView);
    setInfoMessage('');
    setErrorMessage('');
  }

  function handleCreateContractorFromJob(contractor) {
    const normalized = normalizeContractorRecord(contractor);
    setSelectedId(null);
    setDetailsOpen(false);
    setForm({
      ...getEmptyContractorForm(),
      company_name: normalized.company_name,
      contact_person: normalized.contact_person,
      phone: normalized.phone,
      email: normalized.email,
      city: normalized.city,
      street: normalized.street,
      notes: '',
      is_active: true,
    });
    setActiveView('new');
    setInfoMessage('Uzupełnij dane i zapisz kontrahenta. Po zapisie istniejące montaże z tą nazwą zostaną przypięte do kontrahenta.');
    setErrorMessage('');
  }

  function handleOpenDetails(contractor) {
    setSelectedId(contractor?.id || null);
    setForm(normalizeContractorRecord(contractor));
    setDetailsOpen(true);
    setInfoMessage('');
    setErrorMessage('');
  }

  function handleStartEdit(contractor) {
    if (isJobDerivedContractor(contractor)) {
      handleCreateContractorFromJob(contractor);
      return;
    }
    setSelectedId(contractor?.id || null);
    setForm(normalizeContractorRecord(contractor));
    setDetailsOpen(false);
    setActiveView('edit');
    setInfoMessage('');
    setErrorMessage('');
  }



  function handleOpenDeviceEditor(device) {
    const selectedContractorIdForDevice = isJobDerivedContractor(selectedContractor) ? "" : selectedContractor?.id || "";
    setDeviceEditor({
      ...createEmptyDeviceForm(selectedContractorIdForDevice),
      ...device,
      contractor_id: device?.contractor_id || selectedContractorIdForDevice,
      contractor_name: selectedContractor?.company_name || device?.contractor_name || '',
      status: normalizeDeviceStatus(device?.status || 'aktywne'),
    });
    setErrorMessage('');
    setInfoMessage('');
  }

  async function handleSaveDeviceEditor() {
    if (!deviceEditor) return;
    setDeviceSaveBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      await saveDeviceRecord({ supabase, device: deviceEditor, isAdmin });
      if (typeof refreshAll === 'function') await refreshAll();
      if (selectedContractor?.id) {
        const data = await fetchContractorDevices({
          supabase,
          contractorId: selectedContractor.id,
          isAdmin,
          jobs,
        });
        setContractorDevicesRemote(Array.isArray(data) ? data : []);
      }
      setDeviceEditor(null);
      setInfoMessage('Urządzenie kontrahenta zostało zapisane.');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setDeviceSaveBusy(false);
    }
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const { parseXlsxContractorsFile } = await loadContractorsXlsxImportModule();
      const importedRows = await parseXlsxContractorsFile(file);
      if (!importedRows.length) throw new Error('Wybrany plik XLSX nie zawiera żadnych wierszy do importu.');
      const analysis = analyzeContractorImportRows(contractors, importedRows);
      setImportReview({ ...analysis, fileName: file.name || 'import.xlsx' });
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      setImportBusy(false);
    }
  }


  async function handleExportXlsx() {
    setExportBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const { exportContractorsToXlsx, triggerBlobDownload } = await loadContractorsXlsxExportModule();
      const { blob, fileName } = exportContractorsToXlsx(sortContractors(contractors, { field: 'company_name', direction: 'asc' }));
      triggerBlobDownload(blob, fileName);
      setInfoMessage(`Eksport XLSX zakończony. Wyeksportowano ${contractors.length} kontrahentów.`);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleConfirmImport() {
    if (!importReview?.accepted?.length) {
      setImportReview(null);
      setInfoMessage('Brak nowych rekordów do importu.');
      return;
    }
    setImportBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      let importedCount = 0;
      for (const entry of importReview.accepted) {
        await saveContractor({ supabase, contractor: entry.record, isAdmin });
        importedCount += 1;
      }
      const duplicateCount = importReview.summary.duplicates;
      const invalidCount = importReview.summary.invalid;
      await reloadContractors();
      setImportReview(null);
      setActiveView('list');
      setDetailsOpen(false);
      setInfoMessage(`Import XLSX zakończony. Dodano ${importedCount} kontrahentów, wykryto ${duplicateCount} duplikatów i ${invalidCount} błędnych wierszy.`);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setImportBusy(false);
    }
  }

  if (!isAdmin) {
    return <div className="card">Moduł kontrahentów jest dostępny tylko dla administratora.</div>;
  }

  return (
    <div className="contractorsModulePage">
      <div className="contractorsHero card premiumCard">
        <div>
          <h1>Kontrahenci</h1>
        </div>
        <div className="contractorsHeroActions contractorsHeroActionsWide">
          <button
            type="button"
            className={`contractorsHeroStat contractorsHeroStatButton ${activeView === 'list' ? 'contractorsHeroStatActive' : ''}`}
            onClick={handleShowAllContractors}
            title="Pokaż pełną listę kontrahentów"
          ><span>Wszyscy kontrahenci</span><strong>{contractorsWithJobFallback.length}</strong></button>
          <button
            type="button"
            className={`contractorsHeroStat contractorsHeroStatButton contractorsHeroStatSecondary ${activeView === 'new' ? 'contractorsHeroStatActive' : activeView === 'edit' ? 'contractorsHeroStatMuted' : ''}`}
            onClick={handleNewContractor}
            title="Dodaj nowego kontrahenta"
          ><span>Nowy kontrahent</span><strong>+</strong></button>
          <button
            type="button"
            className="contractorsHeroStat contractorsHeroStatButton contractorsHeroStatSecondary"
            onClick={() => importInputRef.current?.click()}
            title="Zaimportuj kontrahentów z pliku XLSX"
            disabled={importBusy || saveBusy || deleteBusy}
          ><span>{importBusy ? 'Analiza XLSX...' : 'Import XLSX'}</span><strong>⇪</strong></button>
          <button
            type="button"
            className="contractorsHeroStat contractorsHeroStatButton contractorsHeroStatSecondary"
            onClick={() => void handleExportXlsx()}
            title="Wyeksportuj kontrahentów do pliku XLSX"
            disabled={exportBusy || importBusy || saveBusy || deleteBusy || !contractors.length}
          ><span>{exportBusy ? 'Eksport XLSX...' : 'Export XLSX'}</span><strong>⇩</strong></button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx"
            onChange={(event) => void handleImportFileChange(event)}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
      {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}

      {activeView === 'none' ? (
        <section className="card contractorsPlaceholderCard">
          <div className="contractorsEmptyState">Wybierz u góry „Wszyscy kontrahenci”, aby otworzyć listę, „Nowy kontrahent”, aby dodać wpis, albo „Import XLSX”, aby najpierw przeanalizować plik Excel przed właściwym importem.</div>
        </section>
      ) : null}

      {activeView === 'list' ? (
        <>
          <div className="contractorsToolbar card">
            <input
              className="input contractorsSearchInput"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj po nazwie, telefonie, emailu, NIP, mieście lub ulicy..."
            />
            <div className="contractorsToolbarActions">
              <button type="button" className="btn desktopToolbarActionBtn" onClick={() => void reloadContractors()} disabled={loading || importBusy || exportBusy}>Odśwież listę</button>
            </div>
          </div>

          <section className="card contractorsTableCard">
            <div className="contractorsSectionHeader">
              <h3>Wszyscy kontrahenci</h3>
              <span>{visibleContractors.length} pozycji{jobFallbackContractorsCount ? ' • ' + jobFallbackContractorsCount + ' z montaży do zapisania' : ''}</span>
            </div>
            {loading ? <div className="contractorsEmptyState">Ładowanie listy kontrahentów...</div> : null}
            {!loading && !visibleContractors.length ? <div className="contractorsEmptyState">Brak kontrahentów spełniających kryteria wyszukiwania.</div> : null}
            {!loading && visibleContractors.length ? (
              <>
                <div className="tableWrap contractorsTableWrap contractorsDesktopList">
                  <table className="jobTable contractorsTable" aria-label="Tabela kontrahentów">
                    <colgroup>
                      <col className="contractorsColName" />
                      <col className="contractorsColPhone" />
                      <col className="contractorsColEmail contractorsColEmailWide" />
                      <col className="contractorsColNip" />
                      <col className="contractorsColActions contractorsColActionsWide" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th><button type="button" className="tableSortBtn" onClick={() => handleSort('contact_location')}>{getSortLabel('contact_location')}</button></th>
                        <th><button type="button" className="tableSortBtn" onClick={() => handleSort('phone')}>{getSortLabel('phone')}</button></th>
                        <th><button type="button" className="tableSortBtn" onClick={() => handleSort('email')}>{getSortLabel('email')}</button></th>
                        <th><button type="button" className="tableSortBtn" onClick={() => handleSort('nip')}>{getSortLabel('nip')}</button></th>
                        <th>Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleContractors.map((contractor) => {
                        const addressLines = getContractorAddressLines(contractor);
                        return (
                          <tr key={contractor.id || contractor.company_name} className={selectedId === contractor.id && detailsOpen ? 'selected' : ''}>
                            <td>
                              <button type="button" className="contractorRowLink contractorPrimaryCell" onClick={() => handleOpenDetails(contractor)} title="Pokaż dane kontrahenta">
                                <span className="contractorPrimaryCellTitle">{contractor.company_name || 'Bez nazwy'}</span>
                                <span className="contractorPrimaryCellMeta">{addressLines.length ? addressLines.join(' • ') : 'Brak adresu'}</span>
                              </button>
                            </td>
                            <td className="contractorsCellCompact">{contractor.phone || '—'}</td>
                            <td className="contractorsCellEllipsis" title={contractor.email || '—'}>{contractor.email || '—'}</td>
                            <td className="contractorsCellCompact">{contractor.nip || '—'}</td>
                            <td>
                              <div className="contractorRowActions">
                                <button type="button" className="btn contractorsRowBtn" onClick={() => handleStartEdit(contractor)}>Edytuj</button>
                                <button type="button" className="btn contractorsRowBtn dangerGhostBtn" onClick={() => void handleDeleteById(contractor)} disabled={deleteBusy || saveBusy}>Usuń</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="contractorsMobileList" role="list" aria-label="Lista kontrahentów">
                  {visibleContractors.map((contractor) => {
                    const addressLines = getContractorAddressLines(contractor);
                    return (
                      <article key={`mobile-${contractor.id || contractor.company_name}`} className="contractorMobileCard" role="listitem">
                        <button
                          type="button"
                          className="contractorMobilePrimary"
                          onClick={() => handleOpenDetails(contractor)}
                          title="Pokaż dane kontrahenta"
                        >
                          <span className="contractorMobileTitle">{contractor.company_name || 'Bez nazwy'}</span>
                          <span className="contractorMobileAddress">{addressLines.length ? addressLines.join(' • ') : 'Brak adresu'}</span>
                        </button>
                        <div className="contractorMobileMeta">
                          <div className="contractorMobileMetaItem">
                            <span>Telefon</span>
                            <strong>{contractor.phone || '—'}</strong>
                          </div>
                          <div className="contractorMobileMetaItem">
                            <span>Email</span>
                            <strong title={contractor.email || '—'}>{contractor.email || '—'}</strong>
                          </div>
                          <div className="contractorMobileMetaItem">
                            <span>NIP</span>
                            <strong>{contractor.nip || '—'}</strong>
                          </div>
                        </div>
                        <div className="contractorMobileActions">
                          <button type="button" className="btn contractorsRowBtn" onClick={() => handleStartEdit(contractor)}>Edytuj</button>
                          <button type="button" className="btn contractorsRowBtn dangerGhostBtn" onClick={() => void handleDeleteById(contractor)} disabled={deleteBusy || saveBusy}>Usuń</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {activeView === 'new' || activeView === 'edit' ? (
        <section className="card contractorsEditorCard contractorsEditorCardStacked">
          <div className="contractorsSectionHeader">
            <h3>{form.id ? 'Edycja kontrahenta' : 'Nowy kontrahent'}</h3>
            <span>{form.id ? 'Zapisujesz istniejący wpis' : 'Wprowadź dane nowego wpisu poniżej'}</span>
          </div>

          <div className="contractorsVoiceEntry">
            <ClientVoiceInput onApply={applyVoiceContractorData} disabled={saveBusy} />
          </div>

          <div className="contractorsFormGrid">
            <label className="contractorsField contractorsFieldFull">
              <span>Nazwa kontrahenta</span>
              <div className="voiceFieldRow">
                <input className="input" value={form.company_name} onChange={(event) => setForm((prev) => ({ ...prev, company_name: event.target.value }))} placeholder="Nazwa firmy albo imię i nazwisko" />
                <VoiceFieldButton label="Nazwa kontrahenta" onValue={(value) => setForm((prev) => ({ ...prev, company_name: value }))} disabled={saveBusy} />
              </div>
            </label>

            <label className="contractorsField">
              <span>Osoba kontaktowa</span>
              <div className="voiceFieldRow">
                <input className="input" value={form.contact_person} onChange={(event) => setForm((prev) => ({ ...prev, contact_person: event.target.value }))} placeholder="Osoba kontaktowa" />
                <VoiceFieldButton label="Osoba kontaktowa" onValue={(value) => setForm((prev) => ({ ...prev, contact_person: value }))} disabled={saveBusy} />
              </div>
            </label>

            <label className="contractorsField">
              <span>Telefon</span>
              <div className="voiceFieldRow">
                <input className="input" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Telefon kontaktowy" />
                <VoiceFieldButton label="Telefon" onValue={(value) => setForm((prev) => ({ ...prev, phone: value }))} transformValue={normalizeVoicePhone} disabled={saveBusy} />
              </div>
            </label>

            <label className="contractorsField">
              <span>Email</span>
              <div className="voiceFieldRow">
                <input className="input" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="adres@email.pl" />
                <VoiceFieldButton label="Email" onValue={(value) => setForm((prev) => ({ ...prev, email: value }))} transformValue={normalizeVoiceEmail} disabled={saveBusy} />
              </div>
            </label>

            <label className="contractorsField">
              <span>Miasto</span>
              <div className="voiceFieldRow">
                <input className="input" value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} placeholder="Miasto" />
                <VoiceFieldButton label="Miejscowość" onValue={(value) => setForm((prev) => ({ ...prev, city: value }))} disabled={saveBusy} />
              </div>
            </label>

            <label className="contractorsField">
              <span>Ulica</span>
              <div className="voiceFieldRow">
                <input className="input" value={form.street} onChange={(event) => setForm((prev) => ({ ...prev, street: event.target.value }))} placeholder="Ulica i numer" />
                <VoiceFieldButton label="Ulica i numer" onValue={(value) => setForm((prev) => ({ ...prev, street: value }))} disabled={saveBusy} />
              </div>
            </label>

            <label className="contractorsField">
              <span>NIP (opcjonalnie)</span>
              <input className="input" value={form.nip} onChange={(event) => setForm((prev) => ({ ...prev, nip: event.target.value }))} placeholder="np. 1234567890" />
            </label>
          </div>

          {duplicateMatches.length ? (
            <div className="contractorsDuplicateBox errorBox">
              <strong>Podobny kontrahent już istnieje w bazie.</strong>
              <p>Sprawdź poniższe wpisy i nie dodawaj duplikatu, jeśli to ten sam klient.</p>
              <div className="contractorsDuplicateList">
                {duplicateMatches.map(({ contractor, reasons }) => (
                  <div key={contractor.id || `${contractor.company_name}-${contractor.phone}-${contractor.email}`} className="contractorsDuplicateItem">
                    <div className="contractorsDuplicateItemContent">
                      <span className="contractorsDuplicateItemTitle">{contractor.company_name || 'Bez nazwy'}</span>
                      <span className="contractorsDuplicateItemMeta">{[contractor.phone, contractor.email, contractor.street, contractor.city, contractor.nip].filter(Boolean).join(' • ') || 'Brak dodatkowych danych'}</span>
                      <span className="contractorsDuplicateItemReason">Duplikat po: {reasons.join(' / ')}</span>
                    </div>
                    <div className="contractorsDuplicateActions">
                      <button type="button" className="btn ghostBtn contractorsDuplicateOpenBtn" onClick={() => handleOpenDetails(contractor)}>Otwórz istniejącego kontrahenta</button>
                      <button type="button" className="btn contractorsDuplicateEditBtn" onClick={() => handleStartEdit(contractor)}>Edytuj istniejącego kontrahenta</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <label className="contractorsField contractorsFieldFull">
            <span>Notatki</span>
            <textarea className="input contractorsTextarea" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Dowolne ustalenia, warunki współpracy, godziny kontaktu..." />
          </label>

          <label className="inlineCheckboxLabel contractorsCheckbox">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
            <span>Kontrahent aktywny</span>
          </label>

          <div className="contractorsActions">
            <button type="button" className="btn" onClick={() => void handleSave()} disabled={saveBusy || deleteBusy || importBusy || exportBusy || duplicateMatches.length}>
              {saveBusy ? 'Zapisywanie...' : 'Zapisz kontrahenta'}
            </button>
            <button type="button" className="btn" onClick={handleDelete} disabled={saveBusy || deleteBusy || importBusy || exportBusy}>
              {deleteBusy ? 'Usuwanie...' : form.id ? 'Usuń kontrahenta' : 'Wyczyść formularz'}
            </button>
            <button type="button" className="btn ghostBtn" onClick={() => { setSelectedId(null); setForm(getEmptyContractorForm()); setActiveView('none'); }} disabled={saveBusy || deleteBusy || importBusy || exportBusy}>
              Zamknij formularz
            </button>
          </div>
        </section>
      ) : null}

      <AppModal open={Boolean(importReview)} onClose={() => !importBusy && setImportReview(null)} contentClassName="card contractorsImportDialog">
        {importReview ? (
          <>
            <div className="contractorsModalHeader contractorsImportHeader">
              <div>
                <div className="sectionPill">Import XLSX</div>
                <h3>Analiza pliku {importReview.fileName}</h3>
                <p>Importujemy tylko nowe rekordy. Duplikaty wykrywamy wyłącznie po nazwie 1:1, telefonie, emailu i NIP.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setImportReview(null)} disabled={importBusy}>Zamknij</button>
            </div>

            <div className="contractorsImportSummaryGrid">
              <div className="contractorsImportSummaryItem"><span>Wszystkie wiersze</span><strong>{importReview.summary.total}</strong></div>
              <div className="contractorsImportSummaryItem"><span>Nowe do importu</span><strong>{importReview.summary.accepted}</strong></div>
              <div className="contractorsImportSummaryItem contractorsImportSummaryWarn"><span>Duplikaty</span><strong>{importReview.summary.duplicates}</strong></div>
              <div className="contractorsImportSummaryItem contractorsImportSummaryMuted"><span>Błędne wiersze</span><strong>{importReview.summary.invalid}</strong></div>
            </div>

            {importReview.accepted.length ? (
              <div className="contractorsImportSection">
                <div className="contractorsSectionHeader"><h3>Nowe rekordy do importu</h3><span>{importReview.accepted.length}</span></div>
                <div className="contractorsImportList">
                  {importReview.accepted.slice(0, 12).map(({ rowNumber, record }) => (
                    <div key={`accepted-${rowNumber}-${record.company_name}`} className="contractorsImportItem contractorsImportItemAccepted">
                      <div>
                        <strong>Wiersz {rowNumber}: {record.company_name || 'Bez nazwy'}</strong>
                        <div className="contractorsImportItemMeta">{[record.phone, record.email, record.nip].filter(Boolean).join(' • ') || 'Brak danych kontaktowych'}</div>
                      </div>
                      <span className="contractorsImportBadge contractorsImportBadgeAccepted">nowy</span>
                    </div>
                  ))}
                  {importReview.accepted.length > 12 ? <div className="contractorsImportOverflowNote">Pokazano pierwsze 12 rekordów. Pozostałe zostaną zaimportowane tak samo.</div> : null}
                </div>
              </div>
            ) : null}

            {importReview.duplicates.length ? (
              <div className="contractorsImportSection">
                <div className="contractorsSectionHeader"><h3>Duplikaty wykryte w pliku lub bazie</h3><span>{importReview.duplicates.length}</span></div>
                <div className="contractorsImportList">
                  {importReview.duplicates.map(({ rowNumber, record, duplicateType, reasons, matchedExisting, matchedImportRow }) => (
                    <div key={`duplicate-${rowNumber}-${record.company_name}`} className="contractorsImportItem contractorsImportItemDuplicate">
                      <div className="contractorsImportItemMain">
                        <strong>Wiersz {rowNumber}: {record.company_name || 'Bez nazwy'}</strong>
                        <div className="contractorsImportItemMeta">{[record.phone, record.email, record.nip].filter(Boolean).join(' • ') || 'Brak danych kontaktowych'}</div>
                        <div className="contractorsImportItemReason">Duplikat po: {formatImportReasons(reasons)}</div>
                        {matchedImportRow ? <div className="contractorsImportHint">Duplikat także wewnątrz pliku względem wiersza {matchedImportRow}.</div> : null}
                      </div>
                      <div className="contractorsImportMatches">
                        {matchedExisting.length ? matchedExisting.map((item) => (
                          <button key={item.id || item.company_name} type="button" className="btn ghostBtn contractorsImportOpenBtn" onClick={() => handleOpenDetails(item)}>
                            Otwórz: {item.company_name || 'kontrahent'}
                          </button>
                        )) : <span className="contractorsImportHint">Duplikat wykryty tylko w samym pliku.</span>}
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
                    <div key={`invalid-${rowNumber}-${reason}`} className="contractorsImportItem contractorsImportItemInvalid">
                      <div>
                        <strong>Wiersz {rowNumber}</strong>
                        <div className="contractorsImportItemReason">{reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="contractorsModalActions">
              <button type="button" className="btn" onClick={() => void handleConfirmImport()} disabled={importBusy || !importReview.accepted.length}>
                {importBusy ? 'Importowanie...' : `Importuj tylko nowe (${importReview.summary.accepted})`}
              </button>
              <button type="button" className="btn ghostBtn" onClick={() => setImportReview(null)} disabled={importBusy}>Anuluj</button>
            </div>
          </>
        ) : null}
      </AppModal>

      <AppModal open={detailsOpen && Boolean(selectedContractor)} onClose={() => setDetailsOpen(false)} contentClassName="card contractorsDetailsModal contractorsDetailsDialog">
        {selectedContractor ? (
          <>
            <div className="contractorsModalHeader">
              <div>
                <div className="sectionPill">Szczegóły kontrahenta</div>
                <h3>{selectedContractor.company_name || 'Bez nazwy'}</h3>
                <p>{getContractorAddress(selectedContractor) || 'Brak adresu'}</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setDetailsOpen(false)}>Zamknij</button>
            </div>

            <div className="contractorsDetailsGrid">
              <div className="contractorsDetailsColumn">
                <DetailRow label="Firma" value={selectedContractor.company_name} icon={<IconUsers />} />
                <DetailRow label="Osoba kontaktowa" value={selectedContractor.contact_person} icon={<IconUsers />} />
                <DetailRow label="Telefon" value={selectedContractor.phone} icon={<IconPhone />} />
                <DetailRow label="Email" value={selectedContractor.email} icon={<IconMail />} />
              </div>
              <div className="contractorsDetailsColumn">
                <DetailRow label="Miasto" value={selectedContractor.city} icon={<IconMapPin />} />
                <DetailRow label="Ulica" value={selectedContractor.street} icon={<IconMapPin />} />
                <DetailRow label="NIP" value={selectedContractor.nip} icon={<IconFileText />} />
                <DetailRow label="Status" value={selectedContractor.is_active ? 'Aktywny' : 'Nieaktywny'} icon={<IconFileText />} />
              </div>
            </div>

            <div className="contractorsPreviewItem contractorsPreviewItemFull contractorsNotesCard">
              <span className="infoLabelWithIcon"><IconFileText /><span>Notatki</span></span>
              <strong>{selectedContractor.notes || '—'}</strong>
            </div>

            <div className="contractorsPreviewItem contractorsPreviewItemFull contractorsNotesCard">
              <span className="infoLabelWithIcon"><IconFileText /><span>Urządzenia kontrahenta</span></span>
              {selectedContractorDevices.length ? (
                <div className="contractorDevicesList" role="list" aria-label="Urządzenia powiązane z kontrahentem">
                  {selectedContractorDevices.map((job) => (
                    <div key={job.id} className="contractorDeviceItem" role="listitem">
                      <strong>{job.model || 'Brak modelu'}</strong>
                      <span>{job.serial_number || 'Brak numeru seryjnego'}</span>
                      <span>
                        {[job.installation_date ? `Montaż: ${job.installation_date}` : '', job.city, job.street, job.status ? `Status: ${job.status}` : ''].filter(Boolean).join(' • ') || 'Brak dodatkowych danych'}
                      </span>
                      <button type="button" className="btn ghostBtn contractorsImportOpenBtn" onClick={() => handleOpenDeviceEditor(job)}>Edytuj urządzenie</button>
                    </div>
                  ))}
                </div>
              ) : (
                <strong>Brak urządzeń przypiętych do tego kontrahenta.</strong>
              )}
            </div>

            <div className="contractorsModalActions">
              <button type="button" className="btn" onClick={() => handleStartEdit(selectedContractor)}>Edytuj</button>
              <button type="button" className="btn dangerGhostBtn" disabled={deleteBusy || saveBusy} onClick={() => void handleDeleteById(selectedContractor)}>Usuń</button>
              <button type="button" className="btn ghostBtn" onClick={() => setDetailsOpen(false)}>Zamknij okno</button>
            </div>
          </>
        ) : null}
      </AppModal>

      <AppModal open={Boolean(deviceEditor)} onClose={() => !deviceSaveBusy && setDeviceEditor(null)} contentClassName="card contractorsDetailsDialog">
        {deviceEditor ? (
          <>
            <div className="contractorsModalHeader">
              <div>
                <div className="sectionPill">Edycja urządzenia</div>
                <h3>{selectedContractor?.company_name || 'Urządzenie kontrahenta'}</h3>
                <p>Możesz poprawić model, numer seryjny i datę montażu bez wychodzenia ze szczegółów kontrahenta.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setDeviceEditor(null)} disabled={deviceSaveBusy}>Zamknij</button>
            </div>

            <div className="contractorsDetailsGrid">
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Model urządzenia</span></span>
                <input className="input" value={deviceEditor.model || ''} onChange={(event) => setDeviceEditor((prev) => ({ ...prev, model: event.target.value }))} />
              </label>
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconCheckCircle /><span>Numer seryjny</span></span>
                <input className="input" value={deviceEditor.serial_number || ''} onChange={(event) => setDeviceEditor((prev) => ({ ...prev, serial_number: event.target.value }))} />
              </label>
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconFileText /><span>Data montażu</span></span>
                <input className="input" type="date" value={deviceEditor.installation_date || ''} onChange={(event) => setDeviceEditor((prev) => ({ ...prev, installation_date: event.target.value }))} />
              </label>
              <label className="inputLabel contractorsPreviewItem">
                <span className="infoLabelWithIcon"><IconFileText /><span>Status urządzenia</span></span>
                <select className="input" value={normalizeDeviceStatus(deviceEditor.status)} onChange={(event) => setDeviceEditor((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="aktywne">Aktywne</option>
                  <option value="do_serwisu">Do serwisu</option>
                  <option value="zdemontowane">Zdemontowane</option>
                </select>
              </label>
              <label className="inputLabel contractorsPreviewItem contractorsPreviewItemFull">
                <span className="infoLabelWithIcon"><IconFileText /><span>Notatki</span></span>
                <textarea className="input textarea" rows={4} value={deviceEditor.notes || ''} onChange={(event) => setDeviceEditor((prev) => ({ ...prev, notes: event.target.value }))} />
              </label>
            </div>

            <div className="contractorsModalActions">
              <button type="button" className="btn" onClick={() => void handleSaveDeviceEditor()} disabled={deviceSaveBusy}>
                {deviceSaveBusy ? 'Zapisywanie...' : 'Zapisz urządzenie'}
              </button>
              <button type="button" className="btn ghostBtn" onClick={() => setDeviceEditor(null)} disabled={deviceSaveBusy}>Anuluj</button>
            </div>
          </>
        ) : null}
      </AppModal>
    </div>
  );
}
