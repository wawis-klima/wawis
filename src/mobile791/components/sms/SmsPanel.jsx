import React, { useEffect, useMemo, useRef, useState } from 'react';
import SmsQueueTable from './SmsQueueTable.jsx';
import SmsSettingsCard from './SmsSettingsCard.jsx';
import SmsHistoryCard from './SmsHistoryCard.jsx';
import SmsSentThisMonthCard from './SmsSentThisMonthCard.jsx';
import SmsClientDetailsCard from './SmsClientDetailsCard.jsx';
import SmsDeviceDetailsCard from './SmsDeviceDetailsCard.jsx';
import { buildReminderMessage, buildSmsTargets, calculateServiceDueDate, deriveSmsQueue, formatSmsDate, getDefaultSmsSettings, getSentThisMonthLogs, getSmsStatusLabel, getSmsSummary } from '../../modules/sms.js';
import { loadSmsModuleData, saveSmsSettings } from '../../modules/sms-fetch.js';
import { approveAndSendSmsLogs, deleteServiceSmsQueueItems, generateServiceSmsQueue, sendManualServiceSms } from '../../modules/sms-send.js';
import { fetchAdminDevices } from '../../modules/devices-fetch.js';
import { IconClock, IconFileText, IconFilter, IconMapPin, IconMessageCircle, IconPhone, IconRefresh, IconUsers } from '../ui';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSearch(text) {
  return normalizeText(text).toLocaleLowerCase('pl-PL');
}

function getRelativeDateLabel(dateStr) {
  if (!dateStr) return '';
  const base = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(base.getTime())) return '';
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((base.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Dzisiaj';
  if (diff === 1) return 'Jutro';
  if (diff < 0) return `${Math.abs(diff)} dni temu`;
  return `Za ${diff} dni`;
}

function getQueueStatusPresentation(row) {
  const status = String(row.rowStatus || '').toLowerCase();
  if (['provider_sent', 'sent', 'delivered'].includes(status)) {
    return { label: 'Wysłany', tone: 'sent' };
  }
  if (status === 'pending_approval') {
    return { label: 'Zaplanowany', tone: 'planned' };
  }
  if (status === 'error') {
    return { label: 'Błąd', tone: 'warning' };
  }
  if (!row.sms_consent || !(row.sms_recipient_phone || row.phone)) {
    return { label: 'Nie dotyczy', tone: 'muted' };
  }
  return { label: 'Oczekuje', tone: 'waiting' };
}

function getSentStatusPresentation(status) {
  const normalized = String(status || '').toLowerCase();
  if (['provider_sent', 'sent', 'delivered'].includes(normalized)) {
    return { label: 'Wysłany', tone: 'sent' };
  }
  if (normalized === 'pending_approval') {
    return { label: 'Zaplanowany', tone: 'planned' };
  }
  if (normalized === 'error') {
    return { label: 'Błąd', tone: 'warning' };
  }
  return { label: getSmsStatusLabel(status), tone: 'muted' };
}

function getGroupedDeviceLabel(count) {
  const value = Number(count) || 0;
  if (value <= 1) return '';
  if (value < 5) return `${value} urządzenia w jednym SMS-ie`;
  return `${value} urządzeń w jednym SMS-ie`;
}

function getGroupedDeviceSummary(row) {
  const devices = Array.isArray(row.grouped_devices) ? row.grouped_devices : [];
  const count = Number(row.grouped_device_count || devices.length || 0);
  if (count <= 1) return '';
  const models = devices
    .map((device) => normalizeText(device?.model))
    .filter(Boolean)
    .slice(0, 3);
  const suffix = count > models.length ? ` +${count - models.length}` : '';
  return [getGroupedDeviceLabel(count), models.length ? `${models.join(', ')}${suffix}` : 'jeden SMS do klienta'].filter(Boolean).join(' • ');
}

function exportRowsAsCsv(rows, activeSummaryView) {
  const headers = [
    'Klient',
    'Model urządzenia',
    'Numer seryjny',
    'Miasto',
    'Kontakt',
    activeSummaryView === 'queue' ? 'Termin serwisu' : 'Data wysyłki',
    'Status SMS',
  ];

  const csvRows = rows.map((row) => [
    row.client,
    row.model,
    row.serial_number,
    row.city,
    row.phone,
    activeSummaryView === 'queue' ? row.service_due_date : row.sent_at,
    row.statusLabel,
  ]);

  const csv = [headers, ...csvRows]
    .map((line) => line.map((item) => `"${String(item || '').replaceAll('"', '""')}"`).join(';'))
    .join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = activeSummaryView === 'queue' ? `sms-kolejka-${stamp}.csv` : `sms-wyslane-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function getPrimaryQueueTarget(row = {}) {
  const groupedRows = Array.isArray(row.grouped_sms_rows) ? row.grouped_sms_rows.filter(Boolean) : [];
  return groupedRows[0] || row;
}

function getPrimaryQueueLogId(row = {}) {
  if (row.queueLog?.id) return row.queueLog.id;
  const groupedIds = Array.isArray(row.grouped_queue_log_ids) ? row.grouped_queue_log_ids.filter(Boolean) : [];
  return groupedIds[0] || null;
}

function getRowsForDeletePayload(row = {}) {
  const groupedRows = Array.isArray(row.grouped_sms_rows) ? row.grouped_sms_rows.filter(Boolean) : [];
  return groupedRows.length ? groupedRows : [row];
}

export default function SmsPanel({ supabase, jobs, isAdmin, isMobile = false, refreshAll, onOpenJob, onOpenContractor, requestedSection = 'sms' }) {
  const [settings, setSettings] = useState(getDefaultSmsSettings());
  const [logs, setLogs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [autoRefreshBusy, setAutoRefreshBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [infoMessage, setInfoMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSummaryView, setActiveSummaryView] = useState('queue');
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const targets = useMemo(() => buildSmsTargets({ jobs, devices }), [jobs, devices]);
  const queue = useMemo(() => deriveSmsQueue(targets, logs), [targets, logs]);
  const summary = useMemo(() => getSmsSummary(targets, queue, logs), [targets, queue, logs]);
  const sentThisMonthLogs = useMemo(() => getSentThisMonthLogs(logs), [logs]);
  const isDesktopAdmin = isAdmin && !isMobile;
  const isSettingsOnlyView = isDesktopAdmin && ['settings', 'sms_templates'].includes(requestedSection);
  const settingsOnlyTitle = requestedSection === 'sms_templates' ? 'Szablony SMS' : 'Ustawienia modułu SMS';
  const settingsOnlyDescription = requestedSection === 'sms_templates'
    ? 'Edytuj treść wiadomości wysyłanej klientom jako przypomnienie o przeglądzie.'
    : 'Zmień ustawienia modułu SMS bez otwierania kolejki, historii wysyłek i tabel przypomnień.';

  const autoRefreshLockRef = useRef(false);
  const lastAutoRefreshRef = useRef(0);

  async function reloadSmsData({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErrorMessage('');
    try {
      const [data, devicesResult] = await Promise.all([
        loadSmsModuleData({ supabase, isAdmin }),
        fetchAdminDevices({ supabase, isAdmin, jobs, trySync: false }),
      ]);
      setSettings(data.settings || getDefaultSmsSettings());
      setLogs(data.logs || []);
      setDevices(devicesResult.devices || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void reloadSmsData();
  }, [supabase, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !supabase) return undefined;

    void refreshQueueAutomatically({ showBusy: true });

    const intervalId = window.setInterval(() => {
      void refreshQueueAutomatically();
    }, 300000);

    const handleVisibilityOrFocus = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastAutoRefreshRef.current > 60000) {
        void refreshQueueAutomatically();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isAdmin, supabase]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => queue.some((job) => job.selectionKey === id)));
  }, [queue]);

  useEffect(() => {
    setSelectedClient((prev) => {
      if (!prev?.selectionKey) return null;
      return queue.find((item) => item.selectionKey === prev.selectionKey) || null;
    });
  }, [queue]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeSummaryView, searchQuery, cityFilter]);

  useEffect(() => {
    if (requestedSection === 'settings' || requestedSection === 'sms_templates') {
      setShowSettings(true);
      setShowHistory(false);
      setSelectedClient(null);
      return;
    }

    if (requestedSection === 'sms') {
      setShowSettings(false);
      setShowHistory(false);
    }
  }, [requestedSection]);

  async function handleSaveSettings() {
    setSaveBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const saved = await saveSmsSettings({ supabase, settings, isAdmin });
      setSettings((prev) => ({ ...prev, ...saved, sending_mode: 'approval' }));
      setInfoMessage('Ustawienia modułu SMS zostały zapisane.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveBusy(false);
    }
  }

  async function refreshQueueAutomatically({ showBusy = false, showMessage = false } = {}) {
    if (autoRefreshLockRef.current) return;

    autoRefreshLockRef.current = true;
    if (showBusy) setAutoRefreshBusy(true);
    if (showMessage) {
      setInfoMessage('');
      setErrorMessage('');
    }

    try {
      const result = await generateServiceSmsQueue({ supabase });
      lastAutoRefreshRef.current = Date.now();
      if (showMessage) {
        setInfoMessage(`Lista klientów odświeżyła się automatycznie. Dodano ${result.createdCount || 0} nowych pozycji oczekujących.`);
      }
      await Promise.allSettled([reloadSmsData({ silent: true }), refreshAll?.()]);
    } catch (error) {
      if (showMessage) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } else {
        console.error('Automatic SMS queue refresh failed', error);
      }
    } finally {
      autoRefreshLockRef.current = false;
      if (showBusy) setAutoRefreshBusy(false);
    }
  }

  async function handleSendSelected() {
    setSendBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const selectedRows = queue.filter((job) => selectedIds.includes(job.selectionKey));
      const approvalIds = [...new Set(selectedRows.map(getPrimaryQueueLogId).filter(Boolean))];
      const manualRows = selectedRows.filter((job) => !getPrimaryQueueLogId(job));
      let sentCount = 0;

      if (approvalIds.length > 0) {
        const result = await approveAndSendSmsLogs({ supabase, logIds: approvalIds });
        sentCount += result.sentCount || 0;
      }

      for (const row of manualRows) {
        const primary = getPrimaryQueueTarget(row);
        if (primary.target_type === 'device') {
          await sendManualServiceSms({ supabase, deviceId: primary.id, reminderCycle: row.reminder_cycle, reminderDueDate: row.reminder_due_date || row.service_due_date });
        } else {
          await sendManualServiceSms({ supabase, jobId: primary.id, reminderCycle: row.reminder_cycle, reminderDueDate: row.reminder_due_date || row.service_due_date });
        }
        sentCount += 1;
      }

      setInfoMessage(`Wysłano ${sentCount} wiadomości SMS.`);
      setSelectedIds([]);
      setShowHistory(true);
      setActiveSummaryView('sentThisMonth');
      await Promise.allSettled([reloadSmsData({ silent: true }), refreshAll?.()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSendBusy(false);
    }
  }

  async function handleSendNow(job) {
    setSendBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const approvalId = getPrimaryQueueLogId(job);
      if (approvalId) {
        await approveAndSendSmsLogs({ supabase, logIds: [approvalId] });
      } else {
        const primary = getPrimaryQueueTarget(job);
        if (primary.target_type === 'device') {
          await sendManualServiceSms({ supabase, deviceId: primary.id, reminderCycle: job.reminder_cycle, reminderDueDate: job.reminder_due_date || job.service_due_date });
        } else {
          await sendManualServiceSms({ supabase, jobId: primary.id, reminderCycle: job.reminder_cycle, reminderDueDate: job.reminder_due_date || job.service_due_date });
        }
      }
      setInfoMessage(`SMS dla klienta ${job.client || job.title} został wysłany.`);
      setShowHistory(true);
      setActiveSummaryView('sentThisMonth');
      await Promise.allSettled([reloadSmsData({ silent: true }), refreshAll?.()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSendBusy(false);
    }
  }

  function buildDeletePayload(rows) {
    return rows.flatMap((row) => getRowsForDeletePayload(row).map((targetRow) => ({
      logId: targetRow.queueLog?.id || null,
      deviceId: targetRow.target_type === 'device' ? targetRow.id : (targetRow.device_id || null),
      jobId: targetRow.target_type === 'job' ? targetRow.id : (targetRow.source_job_id || targetRow.job_id || targetRow.queueLog?.job_id || null),
      client: targetRow.client || targetRow.title || row.client || row.title || null,
      phone: targetRow.sms_recipient_phone || targetRow.phone || row.sms_recipient_phone || row.phone || null,
      message: buildReminderMessage(targetRow, settings),
      reminderCycle: targetRow.reminder_cycle || row.reminder_cycle || null,
      reminderDueDate: targetRow.reminder_due_date || targetRow.service_due_date || row.reminder_due_date || row.service_due_date || null,
    })));
  }

  async function handleDeleteSelected() {
    setSendBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const selectedRows = queue.filter((job) => selectedIds.includes(job.selectionKey));
      if (selectedRows.length === 0) {
        throw new Error('Nie wybrano SMS-ów do usunięcia.');
      }
      const result = await deleteServiceSmsQueueItems({ supabase, rows: buildDeletePayload(selectedRows) });
      const deletedCount = result.deletedCount || selectedRows.length;
      setInfoMessage(`Usunięto ${deletedCount} pozycji z kolejki SMS.`);
      setSelectedIds([]);
      setShowHistory(true);
      await Promise.allSettled([reloadSmsData({ silent: true }), refreshAll?.()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSendBusy(false);
    }
  }

  async function handleDeleteNow(job) {
    setSendBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      await deleteServiceSmsQueueItems({ supabase, rows: buildDeletePayload([job]) });
      setInfoMessage(`Pozycja ${job.client || job.title} została usunięta z kolejki SMS.`);
      setShowHistory(true);
      await Promise.allSettled([reloadSmsData({ silent: true }), refreshAll?.()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSendBusy(false);
    }
  }

  function toggleOne(logId) {
    if (!logId) return;
    setSelectedIds((prev) => (prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]));
  }

  function toggleAll(checked, rows = queue) {
    setSelectedIds(checked ? rows.filter((job) => job.canSelect).map((job) => job.selectionKey).filter(Boolean) : []);
  }

  const targetByIdentity = useMemo(() => {
    const map = new Map();
    targets.forEach((target) => {
      const key = target.target_type === 'device' ? `device:${target.id}` : `job:${target.id}`;
      map.set(key, target);
    });
    return map;
  }, [targets]);

  const queueRows = useMemo(() => queue.map((row) => {
    const presentation = getQueueStatusPresentation(row);
    return {
      ...row,
      key: row.selectionKey || `${row.target_type}:${row.id}`,
      client: row.client || row.title || 'Klient',
      addressLine: [normalizeText(row.street), normalizeText(row.city)].filter(Boolean).join(', '),
      model: getGroupedDeviceLabel(row.grouped_device_count) || normalizeText(row.model) || 'Brak modelu urządzenia',
      modelMeta: getGroupedDeviceSummary(row) || (row.target_type === 'device' ? 'Urządzenie z katalogu' : 'Urządzenie z montażu'),
      serial_number: Number(row.grouped_device_count || 0) > 1 ? 'Wiele numerów' : (normalizeText(row.serial_number) || '—'),
      city: normalizeText(row.city) || '—',
      phone: normalizeText(row.sms_recipient_phone || row.phone) || '—',
      service_due_date: row.service_due_date || row.reminder_due_date || '',
      relativeDateLabel: getRelativeDateLabel(row.service_due_date || row.reminder_due_date || ''),
      statusLabel: presentation.label,
      statusTone: presentation.tone,
      statusValue: presentation.tone,
      canSelect: Boolean(row.canSelect),
    };
  }), [queue]);

  const sentRows = useMemo(() => sentThisMonthLogs.map((log) => {
    const identity = log.device_id ? `device:${log.device_id}` : (log.job_id ? `job:${log.job_id}` : '');
    const target = targetByIdentity.get(identity) || null;
    const when = log.delivered_at || log.sent_at || log.approved_at || log.created_at || '';
    const presentation = getSentStatusPresentation(log.status);
    return {
      ...log,
      key: log.id,
      client: log.client || target?.client || 'Klient',
      addressLine: [normalizeText(target?.street), normalizeText(target?.city)].filter(Boolean).join(', '),
      model: normalizeText(target?.model) || 'Urządzenie serwisowe',
      modelMeta: target?.target_type === 'device' ? 'Historia wysyłki z katalogu urządzeń' : 'Historia wysyłki z montażu',
      serial_number: normalizeText(target?.serial_number) || '—',
      city: normalizeText(log.city || target?.city) || '—',
      phone: normalizeText(log.phone || target?.sms_recipient_phone || target?.phone) || '—',
      sent_at: when ? new Date(when).toISOString().slice(0, 10) : '',
      formattedSentAt: formatSmsDate(when),
      relativeDateLabel: when ? 'Bieżący miesiąc' : '',
      statusLabel: presentation.label,
      statusTone: presentation.tone,
      statusValue: presentation.tone,
      linkedTarget: target,
    };
  }), [sentThisMonthLogs, targetByIdentity]);

  const cityOptions = useMemo(() => {
    const values = new Set();
    [...queueRows, ...sentRows].forEach((row) => {
      if (row.city && row.city !== '—') values.add(row.city);
    });
    return [...values].sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }));
  }, [queueRows, sentRows]);

  const filteredQueueRows = useMemo(() => {
    const search = normalizeSearch(searchQuery);
    return queueRows.filter((row) => {
      if (cityFilter !== 'all' && row.city !== cityFilter) return false;
      if (!search) return true;
      const haystack = normalizeSearch([row.client, row.model, row.serial_number, row.city, row.phone, row.addressLine].join(' '));
      return haystack.includes(search);
    });
  }, [queueRows, searchQuery, cityFilter]);

  const filteredSentRows = useMemo(() => {
    const search = normalizeSearch(searchQuery);
    return sentRows.filter((row) => {
      if (cityFilter !== 'all' && row.city !== cityFilter) return false;
      if (!search) return true;
      const haystack = normalizeSearch([row.client, row.model, row.serial_number, row.city, row.phone, row.addressLine].join(' '));
      return haystack.includes(search);
    });
  }, [sentRows, searchQuery, cityFilter]);

  const activeRows = activeSummaryView === 'queue' ? filteredQueueRows : filteredSentRows;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pagedRows = activeRows.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function clearFilters() {
    setSearchQuery('');
    setCityFilter('all');
  }

  function handleExportCurrentView() {
    exportRowsAsCsv(activeRows, activeSummaryView);
  }

  const queueCountLabel = filteredQueueRows.length === 1 ? 'klient' : 'klientów';
  const sentCountLabel = filteredSentRows.length === 1 ? 'wiadomość' : 'wiadomości';

  if (!isDesktopAdmin) {
    return (
      <div className="smsModulePage desktopModuleShell">
        <div className="smsHero card premiumCard desktopHeroCard">
          <div className="smsHeroIntro">
            <div className="sectionPill">Moduł serwisowy</div>
            <h1>Powiadomienia SMS o przeglądzie</h1>
            <p>Zarządzaj kolejką przypomnień serwisowych i przełączaj się między aktywną listą klientów a historią wysyłek z bieżącego miesiąca.</p>
          </div>
          <div className="smsHeroMeta">
            <div className="desktopHeroHint">
              <span>Tryb pracy</span>
              <strong>Panel administratora</strong>
            </div>
            <div className="desktopHeroHint">
              <span>Aktywny widok</span>
              <strong>{activeSummaryView === 'queue' ? 'Kolejka do wysyłki' : 'Historia bieżącego miesiąca'}</strong>
            </div>
          </div>
        </div>

        <div className="smsSummaryGrid smsSummaryGridCompact">
          <button type="button" className={`smsSummaryCard smsSummaryCardButton ${activeSummaryView === 'queue' ? 'active' : ''}`} onClick={() => setActiveSummaryView('queue')}>
            <div className="smsSummaryCardBody">
              <span>Klienci na liście</span>
              <strong>{summary.tracked}</strong>
              <small>Aktywna kolejka klientów z urządzeniami gotowymi do przypomnienia serwisowego.</small>
            </div>
          </button>
          <button type="button" className={`smsSummaryCard smsSummaryCardButton ${activeSummaryView === 'sentThisMonth' ? 'active' : ''}`} onClick={() => setActiveSummaryView('sentThisMonth')}>
            <div className="smsSummaryCardBody">
              <span>Wysłane w tym miesiącu</span>
              <strong>{summary.sentThisMonth}</strong>
              <small>Historia skutecznie wysłanych przypomnień SMS z bieżącego miesiąca.</small>
            </div>
          </button>
        </div>

        {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
        {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}
        {loading ? <div className="card">Ładowanie modułu SMS...</div> : null}

        {!loading ? (
          <div className="smsGrid smsGridSingleColumn desktopDataRegion">
            <div className="smsMainColumn">
              {activeSummaryView === 'queue' ? (
                <SmsQueueTable
                  rows={filteredQueueRows}
                  pageRows={pagedRows}
                  currentPage={currentPageSafe}
                  totalPages={totalPages}
                  totalRows={filteredQueueRows.length}
                  selectedIds={selectedIds}
                  onToggleOne={toggleOne}
                  onToggleAll={(checked) => toggleAll(checked, filteredQueueRows)}
                  onSendSelected={handleSendSelected}
                  onDeleteSelected={handleDeleteSelected}
                  sendBusy={sendBusy}
                  autoRefreshBusy={autoRefreshBusy}
                  onSendNow={handleSendNow}
                  onDeleteNow={handleDeleteNow}
                  selectedClientKey={selectedClient?.selectionKey || ''}
                  onSelectClient={(row) => { setSelectedClient(row); setSelectedDevice(null); }}
                  onSelectDevice={(row) => { setSelectedDevice(row); setSelectedClient(null); }}
                  onPageChange={setCurrentPage}
                />
              ) : (
                <SmsSentThisMonthCard rows={filteredSentRows} pageRows={pagedRows} currentPage={currentPageSafe} totalPages={totalPages} totalRows={filteredSentRows.length} onPageChange={setCurrentPage} />
              )}

              {selectedClient ? <SmsClientDetailsCard client={selectedClient} onClose={() => setSelectedClient(null)} onOpenJob={onOpenJob} onOpenContractor={onOpenContractor} /> : null}
              {selectedDevice ? <SmsDeviceDetailsCard device={selectedDevice} onClose={() => setSelectedDevice(null)} /> : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (isSettingsOnlyView) {
    return (
      <div className="smsModulePage smsDesktopMockupPage smsSettingsOnlyPage">
        <section className="smsDesktopHeaderCard smsSettingsOnlyHeader">
          <div className="smsDesktopHeaderCopy">
            <h1>{settingsOnlyTitle}</h1>
            <p>{settingsOnlyDescription}</p>
          </div>
        </section>

        {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
        {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}
        {loading ? <div className="card premiumCard">Ładowanie ustawień SMS...</div> : null}

        {!loading ? (
          <SmsSettingsCard settings={settings} setSettings={setSettings} onSave={handleSaveSettings} saveBusy={saveBusy} isAdmin={isAdmin} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="smsModulePage smsDesktopMockupPage">
      <section className="smsDesktopHeaderCard">
        <div className="smsDesktopHeaderCopy">
          <h1>SMS – przypomnienia serwisowe</h1>
          <p>Zarządzaj przypomnieniami serwisowymi i komunikacją SMS do klientów.</p>
        </div>
      </section>

      <section className="smsDesktopSummaryGrid">
        <button type="button" className={`smsDesktopMetricCard ${activeSummaryView === 'queue' ? 'active' : ''}`} onClick={() => setActiveSummaryView('queue')}>
          <div className="smsDesktopMetricBody">
            <strong>Klienci na liście</strong>
            <div className="smsDesktopMetricValue">{summary.tracked}</div>
            <small>Wszyscy klienci z urządzeniami i zaplanowanymi serwisami</small>
          </div>
          <span className="smsDesktopMetricArrow">›</span>
        </button>

        <button type="button" className={`smsDesktopMetricCard ${activeSummaryView === 'sentThisMonth' ? 'active' : ''}`} onClick={() => setActiveSummaryView('sentThisMonth')}>
          <div className="smsDesktopMetricBody">
            <strong>Wysłane w tym miesiącu</strong>
            <div className="smsDesktopMetricValue">{summary.sentThisMonth}</div>
            <small>SMS-y serwisowe wysłane do klientów</small>
          </div>
          <span className="smsDesktopMetricArrow">›</span>
        </button>
      </section>

      <section className="smsDesktopFiltersCard">
        <div className="smsDesktopFiltersGrid">
          <label className="smsDesktopSearchField">
            <span className="smsDesktopSearchIcon"><IconFilter /></span>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Szukaj po kliencie, modelu, numerze seryjnym, mieście, telefonie..." />
          </label>

          <label className="smsDesktopSelectField">
            <span><IconMapPin /></span>
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              <option value="all">Wszystkie miasta</option>
              {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
        </div>

        <div className="smsDesktopFiltersActions">
          <div className="smsDesktopFiltersLeftActions">
            <button type="button" className="smsDesktopSubtleBtn desktopToolbarActionBtn"><IconFilter /> Więcej filtrów</button>
            <button type="button" className="smsDesktopGhostBtn desktopToolbarActionBtn" onClick={clearFilters}>Wyczyść filtry</button>
            <button type="button" className="smsDesktopGhostBtn desktopToolbarActionBtn" onClick={() => refreshQueueAutomatically({ showBusy: true, showMessage: true })}>
              <IconRefresh /> {autoRefreshBusy ? 'Odświeżanie…' : 'Odśwież listę'}
            </button>
          </div>
          <button type="button" className="smsDesktopExportBtn desktopToolbarActionBtn" onClick={handleExportCurrentView}><IconFileText /> Eksportuj do XLSX</button>
        </div>
      </section>

      {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
      {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}
      {loading ? <div className="card premiumCard">Ładowanie modułu SMS...</div> : null}

      {!loading ? (
        <>
          {activeSummaryView === 'queue' ? (
            <SmsQueueTable
              rows={filteredQueueRows}
              pageRows={pagedRows}
              currentPage={currentPageSafe}
              totalPages={totalPages}
              totalRows={filteredQueueRows.length}
              selectedIds={selectedIds}
              onToggleOne={toggleOne}
              onToggleAll={(checked) => toggleAll(checked, filteredQueueRows)}
              onSendSelected={handleSendSelected}
              onDeleteSelected={handleDeleteSelected}
              sendBusy={sendBusy}
              autoRefreshBusy={autoRefreshBusy}
              onSendNow={handleSendNow}
              onDeleteNow={handleDeleteNow}
              selectedClientKey={selectedClient?.selectionKey || ''}
              onSelectClient={(row) => { setSelectedClient(row); setSelectedDevice(null); }}
              onSelectDevice={(row) => { setSelectedDevice(row); setSelectedClient(null); }}
              onPageChange={setCurrentPage}
            />
          ) : (
            <SmsSentThisMonthCard
              rows={filteredSentRows}
              pageRows={pagedRows}
              currentPage={currentPageSafe}
              totalPages={totalPages}
              totalRows={filteredSentRows.length}
              onPageChange={setCurrentPage}
              onSelectLog={(row) => {
                const linked = row.linkedTarget || row;
                const queueMatch = linked?.source_job_id
                  ? queue.find((item) => String(item.source_job_id || item.id) === String(linked.source_job_id || linked.id))
                  : null;
                setSelectedClient(queueMatch || row);
                setSelectedDevice(null);
              }}
              onSelectDevice={(row) => { setSelectedDevice(row); setSelectedClient(null); }}
            />
          )}

          {selectedClient ? <SmsClientDetailsCard client={selectedClient} onClose={() => setSelectedClient(null)} onOpenJob={onOpenJob} onOpenContractor={onOpenContractor} /> : null}
          {selectedDevice ? <SmsDeviceDetailsCard device={selectedDevice} onClose={() => setSelectedDevice(null)} /> : null}

          <div className="smsDesktopInfoStrip">
            <span className="smsDesktopInfoIcon">i</span>
            <span>SMS-y są wysyłane automatycznie na 7 dni przed terminem serwisu.</span>
            <button type="button" className="smsDesktopInlineLink" onClick={() => setShowSettings((prev) => !prev)}>Zarządzaj szablonami SMS</button>
            <button type="button" className="smsDesktopInlineLink" onClick={() => setShowHistory((prev) => !prev)}>Pokaż pełną historię</button>
          </div>

          {showSettings ? (
            <SmsSettingsCard settings={settings} setSettings={setSettings} onSave={handleSaveSettings} saveBusy={saveBusy} isAdmin={isAdmin} />
          ) : null}

          {showHistory ? <SmsHistoryCard logs={logs} /> : null}
        </>
      ) : null}
    </div>
  );
}
