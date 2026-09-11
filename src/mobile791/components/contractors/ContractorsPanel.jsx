import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppModal from '../modals/AppModal.jsx';
import ClientVoiceInput, { VoiceFieldButton } from '../../../components/voice/ClientVoiceInput.jsx';
import { IconMail, IconMapPin, IconPhone, IconUsers } from '../ui.jsx';
import {
  analyzeContractorImportRows,
  buildContractorsWithJobFallback,
  createEmptyContractorAddress,
  findContractorDuplicates,
  getEmptyContractorForm,
  isJobDerivedContractor,
  normalizeContractorRecord,
} from '../../modules/contractors.js';
import {
  loadContractors,
  removeContractor,
  removeJobFallbackContractor,
  saveContractor,
  syncContractorJobs,
} from '../../modules/contractors-fetch.js';
import { getJobDeviceRows } from '../../modules/job-devices.js';
import { normalizeDatabaseErrorMessage } from '../../modules/database-errors.js';
import { normalizeVoiceEmail, normalizeVoicePhone } from '../../modules/client-voice-input.js';

const PAGE_SIZE = 10;

async function loadContractorsXlsxImportModule() {
  return import('../../utils/xlsxImport.js');
}

async function loadContractorsXlsxExportModule() {
  return import('../../utils/xlsxExport.js');
}

function getFriendlyError(error) {
  return normalizeDatabaseErrorMessage(error, 'Wystąpił nieznany błąd.');
}

function normalizeSearch(value) {
  return String(value || '').trim().toLocaleLowerCase('pl-PL');
}

function sortAlphabetically(items) {
  return [...items].sort((left, right) => {
    const byName = String(left?.company_name || '').localeCompare(String(right?.company_name || ''), 'pl', {
      numeric: true,
      sensitivity: 'base',
    });
    if (byName !== 0) return byName;
    return String(left?.city || '').localeCompare(String(right?.city || ''), 'pl', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function getPrimaryAddressText(contractor) {
  const street = String(contractor?.street || '').trim();
  const city = String(contractor?.city || '').trim();
  return [city, street].filter(Boolean).join(', ') || 'Brak adresu';
}

function getInitials(name = '') {
  const words = String(name)
    .toLocaleUpperCase('pl-PL')
    .match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0] || ''}${words[1][0] || ''}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function updatePrimaryAddress(form, patch) {
  const source = Array.isArray(form?.addresses) && form.addresses.length
    ? form.addresses.map((address) => ({ ...address }))
    : [createEmptyContractorAddress({ city: form?.city || '', street: form?.street || '', is_primary: true })];
  let primaryIndex = source.findIndex((address) => address?.is_primary);
  if (primaryIndex < 0) primaryIndex = 0;
  source[primaryIndex] = { ...source[primaryIndex], ...patch, is_primary: true };
  return source.map((address, index) => ({ ...address, is_primary: index === primaryIndex }));
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...candidates].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const nodes = [];
  let previous = 0;
  for (const value of pages) {
    if (previous && value - previous > 1) nodes.push(<span key={`gap-${previous}`} className="contractorsV1062PageGap">…</span>);
    nodes.push(
      <button
        key={value}
        type="button"
        className={`contractorsV1062PageButton${page === value ? ' isActive' : ''}`}
        onClick={() => onPage(value)}
        aria-current={page === value ? 'page' : undefined}
      >
        {value}
      </button>,
    );
    previous = value;
  }

  return (
    <div className="contractorsV1062Pagination">
      <button type="button" className="contractorsV1062PageButton" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Poprzednia strona">‹</button>
      <div className="contractorsV1062PageNumbers">{nodes}</div>
      <button type="button" className="contractorsV1062PageButton" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Następna strona">›</button>
    </div>
  );
}

function ExpandedContractorDetails({ contractor, devices, onEdit, onDelete, busy }) {
  const addresses = Array.isArray(contractor?.addresses) ? contractor.addresses : [];
  const extraAddresses = addresses.filter((address) => !address?.is_primary && (address?.city || address?.street));
  return (
    <div className="contractorsV1062Expanded" onClick={(event) => event.stopPropagation()}>
      <div className="contractorsV1062DetailsGrid">
        <div className="contractorsV1062DetailItem"><span>Osoba kontaktowa</span><strong>{contractor.contact_person || '—'}</strong></div>
        <div className="contractorsV1062DetailItem"><span>NIP</span><strong>{contractor.nip || '—'}</strong></div>
        <div className="contractorsV1062DetailItem"><span>Status</span><strong>{contractor.is_active !== false ? 'Aktywny' : 'Nieaktywny'}</strong></div>
        <div className="contractorsV1062DetailItem"><span>Dodano</span><strong>{formatDate(contractor.created_at)}</strong></div>
      </div>

      {extraAddresses.length ? (
        <div className="contractorsV1062ExtraBlock">
          <span className="contractorsV1062ExtraLabel">Dodatkowe adresy</span>
          {extraAddresses.map((address) => (
            <div key={address.id || `${address.city}-${address.street}`} className="contractorsV1062ExtraLine">
              <IconMapPin />
              <span>{[address.city, address.street].filter(Boolean).join(', ')}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="contractorsV1062ExtraBlock">
        <span className="contractorsV1062ExtraLabel">Urządzenia</span>
        <strong>{devices.length}</strong>
        {devices.slice(0, 3).map((device, index) => (
          <div key={device.id || `${device.model}-${index}`} className="contractorsV1062DeviceLine">
            <span>{device.model || 'Urządzenie bez modelu'}</span>
            <small>{device.serial_number || ''}</small>
          </div>
        ))}
        {devices.length > 3 ? <small className="contractorsV1062Muted">+ {devices.length - 3} kolejnych</small> : null}
      </div>

      {contractor.notes ? (
        <div className="contractorsV1062ExtraBlock">
          <span className="contractorsV1062ExtraLabel">Uwagi</span>
          <p>{contractor.notes}</p>
        </div>
      ) : null}

      {isJobDerivedContractor(contractor) ? <div className="contractorsV1062FallbackNote">Wpis pochodzi z montaży i nie jest jeszcze zapisanym kontrahentem.</div> : null}

      <div className="contractorsV1062ExpandedActions">
        <button type="button" className="btn contractorsV1062SmallBtn" onClick={() => onEdit(contractor)}>{isJobDerivedContractor(contractor) ? 'Utwórz kontrahenta' : 'Edytuj'}</button>
        <button type="button" className="btn ghostBtn contractorsV1062SmallBtn dangerGhostBtn" onClick={() => void onDelete(contractor)} disabled={busy}>Usuń</button>
      </div>
    </div>
  );
}

export default function ContractorsPanel({ supabase, isAdmin, refreshAll, jobs = [], requestedContractorId = null }) {
  const [contractors, setContractors] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [activeView, setActiveView] = useState('list');
  const [form, setForm] = useState(getEmptyContractorForm());
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [importReview, setImportReview] = useState(null);
  const [deletedFallbackJobIds, setDeletedFallbackJobIds] = useState([]);
  const importInputRef = useRef(null);

  async function reloadContractors() {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await loadContractors({ supabase, isAdmin });
      setContractors(data);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reloadContractors(); }, [supabase, isAdmin]);

  const jobsForFallback = useMemo(() => {
    if (!deletedFallbackJobIds.length) return jobs;
    const hidden = new Set(deletedFallbackJobIds.map((id) => String(id)));
    return (jobs || []).filter((job) => !hidden.has(String(job?.id || '')));
  }, [deletedFallbackJobIds, jobs]);

  const allContractors = useMemo(() => sortAlphabetically(buildContractorsWithJobFallback(contractors, jobsForFallback)), [contractors, jobsForFallback]);

  const filteredContractors = useMemo(() => {
    const needle = normalizeSearch(search);
    if (!needle) return allContractors;
    return allContractors.filter((item) => [item.company_name, item.contact_person, item.phone, item.email, item.city, item.street, item.nip, item.notes].some((value) => normalizeSearch(value).includes(needle)));
  }, [allContractors, search]);

  const totalPages = Math.max(1, Math.ceil(filteredContractors.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => filteredContractors.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filteredContractors, safePage]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  useEffect(() => {
    if (!requestedContractorId || !isAdmin || !allContractors.length) return;
    const index = allContractors.findIndex((item) => String(item.id) === String(requestedContractorId));
    if (index < 0) return;
    setSearch('');
    setActiveView('list');
    setExpandedId(String(requestedContractorId));
    setPage(Math.floor(index / PAGE_SIZE) + 1);
  }, [allContractors, isAdmin, requestedContractorId]);

  const duplicateMatches = useMemo(() => findContractorDuplicates(contractors, form), [contractors, form]);

  function getContractorDevices(contractor) {
    const fallbackJobIds = new Set((contractor?.source_job_ids || []).map((id) => String(id)));
    return (jobs || [])
      .filter((job) => isJobDerivedContractor(contractor) ? fallbackJobIds.has(String(job?.id || '')) : String(job?.contractor_id || '') === String(contractor?.id || ''))
      .flatMap((job) => getJobDeviceRows(job).map((device, index) => ({ id: `${job.id || 'job'}:${index}`, model: device.model || '', serial_number: device.serial_number || '' })));
  }

  function toggleContractor(contractor) {
    const id = String(contractor?.id || '');
    setExpandedId((current) => current === id ? null : id);
    setInfoMessage('');
    setErrorMessage('');
  }

  function startNewContractor(seed = null) {
    const base = seed ? normalizeContractorRecord(seed) : getEmptyContractorForm();
    setForm(seed ? {
      ...getEmptyContractorForm(),
      company_name: base.company_name,
      contact_person: base.contact_person,
      phone: base.phone,
      email: base.email,
      city: base.city,
      street: base.street,
      addresses: base.addresses?.length ? base.addresses : [createEmptyContractorAddress({ city: base.city, street: base.street })],
    } : getEmptyContractorForm());
    setExpandedId(null);
    setActiveView('new');
    setErrorMessage('');
    setInfoMessage(seed ? 'Uzupełnij dane i zapisz kontrahenta. Istniejące montaże z tą nazwą zostaną przypięte do nowego wpisu.' : '');
  }

  function startEdit(contractor) {
    if (isJobDerivedContractor(contractor)) { startNewContractor(contractor); return; }
    setForm(normalizeContractorRecord(contractor));
    setExpandedId(null);
    setActiveView('edit');
    setErrorMessage('');
    setInfoMessage('');
  }

  function closeEditor() {
    setForm(getEmptyContractorForm());
    setActiveView('list');
    setErrorMessage('');
  }

  function applyVoiceContractorData(data) {
    setForm((prev) => {
      const city = data.formattedCity || prev.city || '';
      const street = data.formattedStreet || prev.street || '';
      return {
        ...prev,
        company_name: data.clientName || prev.company_name,
        phone: data.phone || prev.phone,
        email: data.email || prev.email,
        city,
        street,
        addresses: updatePrimaryAddress(prev, { city, street }),
      };
    });
  }

  async function handleSave() {
    if (duplicateMatches.length && !form.id) {
      setErrorMessage('Podobny kontrahent już istnieje w bazie. Otwórz istniejący wpis albo popraw dane.');
      return;
    }
    setSaveBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const wasExisting = Boolean(form.id);
      const previous = wasExisting ? contractors.find((item) => String(item.id) === String(form.id)) || null : null;
      const saved = await saveContractor({ supabase, contractor: form, isAdmin });
      const syncSummary = saved?.id ? await syncContractorJobs({ supabase, contractor: saved, previousContractor: previous, isAdmin }) : null;
      setContractors((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
      });
      setActiveView('list');
      setExpandedId(String(saved.id || ''));
      setForm(getEmptyContractorForm());
      const synced = (syncSummary?.linkedJobsUpdated || 0) + (syncSummary?.legacyJobsUpdated || 0);
      if (typeof refreshAll === 'function' && (wasExisting || synced)) await refreshAll();
      setInfoMessage(wasExisting ? 'Zmiany kontrahenta zostały zapisane.' : 'Nowy kontrahent został dodany.');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDelete(contractor) {
    if (!contractor) return;
    const label = contractor.company_name || 'bez nazwy';
    const isFallback = isJobDerivedContractor(contractor);
    const prompt = isFallback ? `„${label}” pochodzi z montażu. Usunięcie wpisu usunie powiązane zlecenie/zlecenia. Kontynuować?` : `Usunąć kontrahenta „${label}”?`;
    if (!window.confirm(prompt)) return;

    setDeleteBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      if (isFallback) {
        const result = await removeJobFallbackContractor({ supabase, contractor, jobs, isAdmin });
        setDeletedFallbackJobIds((current) => [...new Set([...current, ...(result.deletedJobIds || [])])]);
      } else {
        await removeContractor({ supabase, contractorId: contractor.id, isAdmin });
        setContractors((current) => current.filter((item) => item.id !== contractor.id));
      }
      setExpandedId(null);
      if (typeof refreshAll === 'function') await refreshAll();
      setInfoMessage('Wpis został usunięty.');
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setDeleteBusy(false);
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
      const rows = await parseXlsxContractorsFile(file);
      if (!rows.length) throw new Error('Wybrany plik XLSX nie zawiera żadnych wierszy do importu.');
      setImportReview({ ...analyzeContractorImportRows(contractors, rows), fileName: file.name || 'import.xlsx' });
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      setImportBusy(false);
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
    try {
      let importedCount = 0;
      for (const entry of importReview.accepted) {
        await saveContractor({ supabase, contractor: entry.record, isAdmin });
        importedCount += 1;
      }
      await reloadContractors();
      setImportReview(null);
      setPage(1);
      setInfoMessage(`Import XLSX zakończony. Dodano ${importedCount} kontrahentów.`);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleExportXlsx() {
    setExportBusy(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const { exportContractorsToXlsx, triggerBlobDownload } = await loadContractorsXlsxExportModule();
      const { blob, fileName } = exportContractorsToXlsx(sortAlphabetically(contractors));
      triggerBlobDownload(blob, fileName);
      setInfoMessage(`Eksport XLSX zakończony. Wyeksportowano ${contractors.length} kontrahentów.`);
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setExportBusy(false);
    }
  }

  if (!isAdmin) return <div className="card">Moduł kontrahentów jest dostępny tylko dla administratora.</div>;

  return (
    <div className="contractorsV1062Page">
      {activeView === 'list' ? (
        <>
          <div className="contractorsV1062SearchWrap">
            <span className="contractorsV1062SearchIcon" aria-hidden="true">⌕</span>
            <input className="contractorsV1062Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj kontrahenta, telefonu, adresu lub e-maila" aria-label="Szukaj kontrahenta" />
          </div>

          <div className="contractorsV1062Actions">
            <div className="contractorsV1062StatCard"><span>Wszyscy kontrahenci</span><div><IconUsers /><strong>{allContractors.length}</strong></div></div>
            <button type="button" className="contractorsV1062ActionCard" onClick={() => startNewContractor()}><strong>＋</strong><span>Nowy<br />kontrahent</span></button>
            <button type="button" className="contractorsV1062ActionCard" onClick={() => importInputRef.current?.click()} disabled={importBusy || saveBusy || deleteBusy}><strong>⇧</strong><span>{importBusy ? 'Analiza…' : 'Import XLSX'}</span></button>
            <button type="button" className="contractorsV1062ActionCard" onClick={() => void handleExportXlsx()} disabled={exportBusy || importBusy || !contractors.length}><strong>⇩</strong><span>{exportBusy ? 'Eksport…' : 'Export XLSX'}</span></button>
            <input ref={importInputRef} type="file" accept=".xlsx" onChange={(event) => void handleImportFileChange(event)} hidden />
          </div>

          {infoMessage ? <div className="successBox contractorsV1062Message">{infoMessage}</div> : null}
          {errorMessage ? <div className="errorBox contractorsV1062Message">{errorMessage}</div> : null}

          <section className="contractorsV1062List" aria-label="Lista kontrahentów">
            {loading ? <div className="contractorsV1062Empty">Ładowanie kontrahentów…</div> : null}
            {!loading && !filteredContractors.length ? <div className="contractorsV1062Empty">Brak kontrahentów spełniających kryteria wyszukiwania.</div> : null}
            {!loading && pageItems.map((contractor) => {
              const id = String(contractor.id || '');
              const expanded = expandedId === id;
              return (
                <article key={id || contractor.company_name} className={`contractorsV1062Card${expanded ? ' isExpanded' : ''}`}>
                  <button type="button" className="contractorsV1062CardMain" onClick={() => toggleContractor(contractor)} aria-expanded={expanded}>
                    <span className="contractorsV1062Avatar">{getInitials(contractor.company_name)}</span>
                    <span className="contractorsV1062CardContent">
                      <strong className="contractorsV1062Name">{contractor.company_name || 'Bez nazwy'}</strong>
                      <span className="contractorsV1062Meta"><IconMapPin />{getPrimaryAddressText(contractor)}</span>
                      <span className="contractorsV1062ContactRow">
                        <span className="contractorsV1062Meta"><IconPhone />{contractor.phone || 'Brak telefonu'}</span>
                        <span className="contractorsV1062Meta"><IconMail />{contractor.email || 'Brak e-maila'}</span>
                      </span>
                    </span>
                    <span className="contractorsV1062Chevron" aria-hidden="true">{expanded ? '⌃' : '›'}</span>
                  </button>
                  {expanded ? <ExpandedContractorDetails contractor={contractor} devices={getContractorDevices(contractor)} onEdit={startEdit} onDelete={handleDelete} busy={deleteBusy || saveBusy} /> : null}
                </article>
              );
            })}
          </section>

          {!loading && filteredContractors.length ? (
            <div className="contractorsV1062Footer">
              <span className="contractorsV1062PerPage">10 na stronę</span>
              <Pagination page={safePage} totalPages={totalPages} onPage={(next) => { setPage(next); setExpandedId(null); }} />
              <span className="contractorsV1062Range">{Math.min((safePage - 1) * PAGE_SIZE + 1, filteredContractors.length)}–{Math.min(safePage * PAGE_SIZE, filteredContractors.length)} z {filteredContractors.length}</span>
            </div>
          ) : null}
        </>
      ) : (
        <section className="card contractorsV1062Editor">
          <div className="contractorsV1062EditorHead">
            <div><span className="sectionPill">Kontrahenci</span><h2>{activeView === 'edit' ? 'Edytuj kontrahenta' : 'Nowy kontrahent'}</h2></div>
            <button type="button" className="btn ghostBtn" onClick={closeEditor} disabled={saveBusy}>Zamknij</button>
          </div>

          {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
          {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}

          <ClientVoiceInput onApply={applyVoiceContractorData} disabled={saveBusy} />

          <div className="contractorsV1062FormGrid">
            <label className="contractorsField contractorsV1062Full"><span>Nazwa kontrahenta</span><div className="voiceFieldRow"><input className="input" value={form.company_name} onChange={(event) => setForm((prev) => ({ ...prev, company_name: event.target.value }))} placeholder="Nazwa firmy albo imię i nazwisko" /><VoiceFieldButton label="Nazwa kontrahenta" onValue={(value) => setForm((prev) => ({ ...prev, company_name: value }))} disabled={saveBusy} /></div></label>
            <label className="contractorsField"><span>Osoba kontaktowa</span><input className="input" value={form.contact_person} onChange={(event) => setForm((prev) => ({ ...prev, contact_person: event.target.value }))} placeholder="Osoba kontaktowa" /></label>
            <label className="contractorsField"><span>Telefon</span><div className="voiceFieldRow"><input className="input" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Telefon" /><VoiceFieldButton label="Telefon" onValue={(value) => setForm((prev) => ({ ...prev, phone: value }))} transformValue={normalizeVoicePhone} disabled={saveBusy} /></div></label>
            <label className="contractorsField"><span>E-mail</span><div className="voiceFieldRow"><input className="input" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="adres@email.pl" /><VoiceFieldButton label="Email" onValue={(value) => setForm((prev) => ({ ...prev, email: value }))} transformValue={normalizeVoiceEmail} disabled={saveBusy} /></div></label>
            <label className="contractorsField"><span>Miasto</span><input className="input" value={form.city} onChange={(event) => { const city = event.target.value; setForm((prev) => ({ ...prev, city, addresses: updatePrimaryAddress(prev, { city }) })); }} placeholder="Miasto" /></label>
            <label className="contractorsField"><span>Ulica i numer</span><input className="input" value={form.street} onChange={(event) => { const street = event.target.value; setForm((prev) => ({ ...prev, street, addresses: updatePrimaryAddress(prev, { street }) })); }} placeholder="Ulica i numer" /></label>
            <label className="contractorsField"><span>NIP</span><input className="input" value={form.nip} onChange={(event) => setForm((prev) => ({ ...prev, nip: event.target.value }))} placeholder="NIP" /></label>
            <label className="contractorsField contractorsV1062Full"><span>Uwagi</span><textarea className="input contractorsTextarea" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Uwagi do kontrahenta" /></label>
          </div>

          <label className="inlineCheckboxLabel contractorsCheckbox"><input type="checkbox" checked={form.is_active !== false} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} /><span>Kontrahent aktywny</span></label>

          {duplicateMatches.length && !form.id ? <div className="errorBox"><strong>Podobny kontrahent już istnieje w bazie.</strong><div>{duplicateMatches.slice(0, 3).map(({ contractor }) => contractor.company_name).join(', ')}</div></div> : null}

          <div className="contractorsActions contractorsV1062EditorActions">
            <button type="button" className="btn" onClick={() => void handleSave()} disabled={saveBusy || deleteBusy || (duplicateMatches.length > 0 && !form.id)}>{saveBusy ? 'Zapisywanie…' : 'Zapisz kontrahenta'}</button>
            <button type="button" className="btn ghostBtn" onClick={closeEditor} disabled={saveBusy}>Anuluj</button>
          </div>
        </section>
      )}

      <AppModal open={Boolean(importReview)} onClose={() => !importBusy && setImportReview(null)} contentClassName="card contractorsImportDialog">
        {importReview ? (
          <div className="contractorsV1062ImportReview">
            <div className="contractorsV1062EditorHead"><div><span className="sectionPill">Import XLSX</span><h3>{importReview.fileName}</h3></div><button type="button" className="btn ghostBtn" onClick={() => setImportReview(null)} disabled={importBusy}>Zamknij</button></div>
            <div className="contractorsV1062ImportStats"><div><span>Nowe</span><strong>{importReview.summary.accepted}</strong></div><div><span>Duplikaty</span><strong>{importReview.summary.duplicates}</strong></div><div><span>Błędne</span><strong>{importReview.summary.invalid}</strong></div></div>
            <p>Importujemy wyłącznie nowe rekordy. Duplikaty i błędne wiersze zostaną pominięte.</p>
            <div className="contractorsV1062EditorActions"><button type="button" className="btn" onClick={() => void handleConfirmImport()} disabled={importBusy || !importReview.accepted.length}>{importBusy ? 'Importowanie…' : `Importuj ${importReview.accepted.length} nowych`}</button><button type="button" className="btn ghostBtn" onClick={() => setImportReview(null)} disabled={importBusy}>Anuluj</button></div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
