import React, { useEffect, useMemo, useRef, useState } from 'react';
import SmsQueueTable from './SmsQueueTable.jsx';
import SmsSettingsCard from './SmsSettingsCard.jsx';
import SmsHistoryCard from './SmsHistoryCard.jsx';
import SmsSentThisMonthCard from './SmsSentThisMonthCard.jsx';
import SmsUnsentCard from './SmsUnsentCard.jsx';
import SmsClientDetailsCard from './SmsClientDetailsCard.jsx';
import SmsDeviceDetailsCard from './SmsDeviceDetailsCard.jsx';
import { buildReminderMessage, buildSmsTargets, calculateServiceDueDate, deriveSmsQueue, formatSmsDate, getDefaultSmsSettings, getSentThisMonthLogs, getSmsStatusLabel, getSmsSummary } from '../../modules/sms.js';
import { loadSmsHistoryPage, loadSmsModuleData, loadSmsSettingsOnly, saveSmsSettings } from '../../modules/sms-fetch.js';
import { approveAndSendSmsLogs, deleteServiceSmsQueueItems, generateServiceSmsQueue, sendUnsentSmsLog, sendManualServiceSms, sendTestSms } from '../../modules/sms-send.js';
import { buildUnsentSmsLogs } from '../../modules/sms-unsent.js';
import { buildFallbackDevicesFromJobs, fetchAdminDevices } from '../../modules/devices-fetch.js';
import { normalizeDatabaseErrorMessage } from '../../modules/database-errors.js';
import { refreshSmsMutation, refreshSmsMutationForVisibleHistory, refreshSmsMutationWithHistory } from '../../modules/sms-ui-flow.js';
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
    return { label: getSmsStatusLabel(status), tone: 'planned' };
  }
  if (status === 'error') {
    const providerAccepted = Boolean(row?.latestLog?.provider_message_id || row?.queueLog?.provider_message_id);
    return { label: providerAccepted ? 'Niedostarczony' : 'Błąd', tone: 'warning' };
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
    return { label: getSmsStatusLabel(normalized), tone: 'planned' };
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
    activeSummaryView === 'sentThisMonth' ? 'Data wysyłki' : 'Termin serwisu',
    'Status SMS',
  ];

  const csvRows = rows.map((row) => [
    row.client,
    row.model,
    row.serial_number,
    row.city,
    row.phone,
    activeSummaryView === 'sentThisMonth' ? row.sent_at : row.service_due_date,
    row.statusLabel,
  ]);

  const csv = [headers, ...csvRows]
    .map((line) => line.map((item) => `"${String(item || '').replaceAll('"', '""')}"`).join(';'))
    .join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = activeSummaryView === 'queue'
    ? `sms-kolejka-${stamp}.csv`
    : activeSummaryView === 'unsent'
      ? `sms-niewyslane-${stamp}.csv`
      : `sms-wyslane-${stamp}.csv`;
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
  const queueLogs = [
    row.queueLog,
    ...(Array.isArray(row.queueLogs) ? row.queueLogs : []),
  ].filter((log, index, rows) => (
    log?.id && rows.findIndex((item) => item?.id === log.id) === index
  ));

  const canonical = queueLogs.sort((left, right) => (
    Number(right?.reminder_group_primary === true) - Number(left?.reminder_group_primary === true)
    || new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
  ))[0];

  if (canonical?.id) return canonical.id;
  const groupedIds = Array.isArray(row.grouped_queue_log_ids) ? row.grouped_queue_log_ids.filter(Boolean) : [];
  return groupedIds[0] || null;
}

function getRowsForDeletePayload(row = {}) {
  const groupedRows = Array.isArray(row.grouped_sms_rows) ? row.grouped_sms_rows.filter(Boolean) : [];
  return groupedRows.length ? groupedRows : [row];
}

function getDeleteLogIds(row = {}) {
  return [...new Set([
    row.retryLogId,
    row.id,
    row.queueLog?.id,
    row.latestLog?.id,
    ...(Array.isArray(row.queueLogs) ? row.queueLogs.map((item) => item?.id) : []),
    ...(Array.isArray(row.grouped_queue_log_ids) ? row.grouped_queue_log_ids : []),
    ...(Array.isArray(row.grouped_log_ids) ? row.grouped_log_ids : []),
  ].map((value) => normalizeText(value)).filter(Boolean))];
}

function getReminderGroupId(row = {}) {
  return normalizeText(
    row.reminder_group_id
    || row.queueLog?.reminder_group_id
    || row.latestLog?.reminder_group_id
    || row.linkedTarget?.reminder_group_id
  ) || null;
}

function SmsTestCard({ phone, setPhone, busy, onSend }) {
  return (
    <section className="smsDesktopFiltersCard">
      <div className="smsDesktopFiltersGrid">
        <label className="smsDesktopSearchField">
          <span className="smsDesktopSearchIcon"><IconPhone /></span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="Numer do testu SMS, np. 600 000 000"
          />
        </label>
      </div>
      <div className="smsDesktopFiltersActions">
        <div className="smsDesktopFiltersLeftActions">
          <strong>SMS testowy</strong>
          <span>Stała wiadomość kontrolna; nie tworzy klienta, zlecenia ani wpisu w historii serwisowej.</span>
        </div>
        <button
          type="button"
          className="smsDesktopExportBtn desktopToolbarActionBtn"
          onClick={onSend}
          disabled={busy || !normalizeText(phone)}
        >
          <IconMessageCircle /> {busy ? 'Wysyłanie…' : 'Wyślij testowy SMS'}
        </button>
      </div>
    </section>
  );
}

export default function SmsPanel({ supabase, jobs, isAdmin, isMobile = false, refreshAll, onOpenJob, onOpenContractor, requestedSection = 'sms' }) {
  const [settings, setSettings] = useState(getDefaultSmsSettings());
  const [logs, setLogs] = useState([]);
  const [sentMonthSourceLogs, setSentMonthSourceLogs] = useState([]);
  const [unsentLogs, setUnsentLogs] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendingUnsentIds, setSendingUnsentIds] = useState([]);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [autoRefreshBusy, setAutoRefreshBusy] = useState(false);
  const [testSmsBusy, setTestSmsBusy] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedUnsentIds, setSelectedUnsentIds] = useState([]);
  const [infoMessage, setInfoMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [deviceCatalogWarning, setDeviceCatalogWarning] = useState('');
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
  const sentThisMonthLogs = useMemo(() => getSentThisMonthLogs(sentMonthSourceLogs), [sentMonthSourceLogs]);
  const summary = useMemo(() => ({
    ...getSmsSummary(targets, queue, logs),
    sentThisMonth: sentThisMonthLogs.length,
  }), [targets, queue, logs, sentThisMonthLogs]);
  const isDesktopAdmin = isAdmin && !isMobile;
  const isSettingsOnlyView = isDesktopAdmin && ['settings', 'sms_templates'].includes(requestedSection);
  const settingsOnlyTitle = requestedSection === 'sms_templates' ? 'Szablony SMS' : 'Ustawienia modułu SMS';

  const autoRefreshLockRef = useRef(false);
  const smsSendLockRef = useRef(false);
  const lastAutoRefreshRef = useRef(0);

  async function refreshDeviceCatalog() {
    try {
      const devicesResult = await fetchAdminDevices({ supabase, isAdmin, jobs, trySync: false });
      if (Array.isArray(devicesResult?.devices)) setDevices(devicesResult.devices);
      setDeviceCatalogWarning(normalizeText(devicesResult?.staleReason));
    } catch (error) {
      const message = normalizeDatabaseErrorMessage(error, 'Nie udało się odświeżyć pełnej bazy urządzeń dla modułu SMS.');
      setDeviceCatalogWarning(message);
      console.warn('Nie udało się odświeżyć pełnej bazy urządzeń dla modułu SMS.', message);
    }
  }

  async function reloadSmsData({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setDevices(buildFallbackDevicesFromJobs(jobs));
    }
    setErrorMessage('');
    try {
      const data = await loadSmsModuleData({ supabase, isAdmin });
      setSettings(data.settings || getDefaultSmsSettings());
      setLogs(data.logs || []);
      setSentMonthSourceLogs(data.sentThisMonthLogs || data.logs || []);
      setUnsentLogs(data.unsentLogs || []);
      if (!showHistory) {
        setHistoryLogs([]);
        setHistoryPage(1);
        setHistoryTotal(0);
      }

      // Katalog urządzeń jest odświeżany także po cichych reloadach, żeby
      // generator, retry i usuwanie nie pracowały na starej liście urządzeń.
      const deviceRefresh = refreshDeviceCatalog();
      if (silent) await deviceRefresh;
      else void deviceRefresh;
    } catch (error) {
      setErrorMessage(normalizeDatabaseErrorMessage(error, 'Nie udało się załadować modułu SMS.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function reloadSettingsOnly() {
    setLoading(true);
    setErrorMessage('');
    try {
      const nextSettings = await loadSmsSettingsOnly({ supabase, isAdmin });
      setSettings(nextSettings || getDefaultSmsSettings());
    } catch (error) {
      setErrorMessage(normalizeDatabaseErrorMessage(error, 'Nie udało się załadować ustawień SMS.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSettingsOnlyView) {
      void reloadSettingsOnly();
      return;
    }
    void reloadSmsData();
  }, [supabase, isAdmin, isSettingsOnlyView]);

  useEffect(() => {
    if (!isAdmin || !supabase || isSettingsOnlyView) return undefined;

    // Wejście do modułu ma tylko odczytać snapshot. Generator kolejki nie może
    // startować równolegle z pierwszym odczytem i dublować ciężkich zapytań.
    lastAutoRefreshRef.current = Date.now();

    const intervalId = window.setInterval(() => {
      void refreshQueueAutomatically();
    }, 300000);

    const handleVisibilityOrFocus = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastAutoRefreshRef.current > 300000) {
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
  }, [isAdmin, supabase, isSettingsOnlyView]);

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

  async function loadFullHistoryPage(page = 1) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    setHistoryBusy(true);
    setErrorMessage('');
    try {
      const result = await loadSmsHistoryPage({
        supabase,
        isAdmin,
        page: normalizedPage,
        pageSize: 50,
      });
      setHistoryLogs(result.rows || []);
      setHistoryPage(result.page || normalizedPage);
      setHistoryTotal(result.total || 0);
    } catch (error) {
      setErrorMessage(normalizeDatabaseErrorMessage(error, 'Nie udało się załadować pełnej historii SMS.'));
    } finally {
      setHistoryBusy(false);
    }
  }

  async function handleToggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    await loadFullHistoryPage(1);
  }

  async function handleSaveSettings() {
    setSaveBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const saved = await saveSmsSettings({ supabase, settings, isAdmin });
      setSettings((prev) => ({ ...prev, ...saved, sending_mode: 'approval' }));
      setInfoMessage('Ustawienia modułu SMS zostały zapisane.');
    } catch (error) {
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      setSaveBusy(false);
    }
  }

  async function refreshQueueAutomatically({ showBusy = false, showMessage = false } = {}) {
    if (autoRefreshLockRef.current) return;

    autoRefreshLockRef.current = true;
    lastAutoRefreshRef.current = Date.now();
    if (showBusy) setAutoRefreshBusy(true);
    if (showMessage) {
      setInfoMessage('');
      setErrorMessage('');
    }

    try {
      const result = await generateServiceSmsQueue({ supabase });
      if (showMessage) {
        setInfoMessage(`Lista klientów odświeżyła się automatycznie. Dodano ${result.createdCount || 0} nowych pozycji oczekujących.`);
      }
      await reloadSmsData({ silent: true });
    } catch (error) {
      if (showMessage) {
        setErrorMessage(normalizeDatabaseErrorMessage(error));
      } else {
        console.error('Automatic SMS queue refresh failed', error);
      }
    } finally {
      autoRefreshLockRef.current = false;
      if (showBusy) setAutoRefreshBusy(false);
    }
  }

  async function handleSendSelected() {
    if (smsSendLockRef.current || deleteBusy) return;
    const selectedRows = queue.filter((job) => selectedIds.includes(job.selectionKey));
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Na pewno wysłać ${selectedRows.length} zaznaczonych SMS-ów? Wysyłki nie można cofnąć.`)) return;

    smsSendLockRef.current = true;
    setSendBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const retryRows = selectedRows.filter((row) => (
        String(row?.rowStatus || '').trim().toLowerCase() === 'error'
        && row?.latestLog?.id
      ));
      const retryKeys = new Set(retryRows.map((row) => row.selectionKey));
      const regularRows = selectedRows.filter((row) => !retryKeys.has(row.selectionKey));
      const approvalIds = [...new Set(regularRows.map(getPrimaryQueueLogId).filter(Boolean))];
      const manualRows = regularRows.filter((job) => !getPrimaryQueueLogId(job));
      let sentCount = 0;

      for (const row of retryRows) {
        const result = await sendUnsentSmsLog({ supabase, log: row.latestLog });
        sentCount += result.sentCount || 0;
      }

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
      await refreshSmsMutationWithHistory({
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
      });
    } catch (error) {
      await reloadSmsData({ silent: true });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      smsSendLockRef.current = false;
      setSendBusy(false);
    }
  }

  async function handleSendTestSms() {
    if (testSmsBusy) return;
    setTestSmsBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const result = await sendTestSms({ supabase, phone: testSmsPhone });
      const providerId = normalizeText(result?.providerMessageId);
      setInfoMessage(`SMS testowy został przyjęty przez SMSAPI${providerId ? ` (ID: ${providerId})` : ''}.`);
    } catch (error) {
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      setTestSmsBusy(false);
    }
  }

  async function handleSendNow(job) {
    if (smsSendLockRef.current || deleteBusy) return;
    smsSendLockRef.current = true;
    setSendBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const rowStatus = String(job?.rowStatus || '').trim().toLowerCase();
      const approvalId = getPrimaryQueueLogId(job);
      if (rowStatus === 'error' && job?.latestLog?.id) {
        await sendUnsentSmsLog({ supabase, log: job.latestLog });
      } else if (approvalId) {
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
      await refreshSmsMutationWithHistory({
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
      });
    } catch (error) {
      await reloadSmsData({ silent: true });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      smsSendLockRef.current = false;
      setSendBusy(false);
    }
  }

  function buildDeletePayload(rows) {
    const seen = new Set();
    return rows.flatMap((row) => getRowsForDeletePayload(row).flatMap((targetRow) => {
      const reminderGroupId = getReminderGroupId(targetRow) || getReminderGroupId(row);
      const logIds = getDeleteLogIds({ ...row, ...targetRow });
      const base = {
        reminderGroupId,
        deviceId: targetRow.target_type === 'device' ? targetRow.id : (targetRow.device_id || row.device_id || null),
        jobId: targetRow.target_type === 'job' ? targetRow.id : (targetRow.source_job_id || targetRow.job_id || targetRow.queueLog?.job_id || row.job_id || null),
        client: targetRow.client || targetRow.title || row.client || row.title || null,
        phone: targetRow.sms_recipient_phone || targetRow.phone || row.sms_recipient_phone || row.phone || null,
        message: buildReminderMessage(targetRow, settings),
        reminderCycle: targetRow.reminder_cycle || row.reminder_cycle || null,
        reminderDueDate: targetRow.reminder_due_date || targetRow.service_due_date || row.reminder_due_date || row.service_due_date || null,
      };

      if (reminderGroupId) {
        const key = `group:${reminderGroupId}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...base, logId: logIds[0] || null }];
      }

      return logIds
        .filter((logId) => {
          const key = `log:${logId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((logId) => ({ ...base, logId }));
    }));
  }

  function reportDeleteResult(result, noun = 'pozycji') {
    const deletedCount = Math.max(0, Number(result?.deletedCount) || 0);
    const failures = Array.isArray(result?.failures) ? result.failures : [];
    if (deletedCount > 0) {
      setInfoMessage(`Usunięto ${deletedCount} ${noun} z listy SMS.`);
    }
    if (failures.length > 0) {
      const details = failures.slice(0, 3).map((item) => normalizeText(item?.error)).filter(Boolean).join(' | ');
      setErrorMessage(`Nie udało się usunąć ${failures.length} pozycji.${details ? ` ${details}` : ''}`);
    }
    return { deletedCount, failures };
  }

  async function handleDeleteSelected() {
    if (deleteBusy || sendBusy) return;
    const selectedRows = queue.filter((job) => selectedIds.includes(job.selectionKey));
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Usunąć ${selectedRows.length} zaznaczonych pozycji z kolejki SMS? Operacja obejmie tylko zaznaczone wiersze.`)) return;

    setDeleteBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const result = await deleteServiceSmsQueueItems({ supabase, rows: buildDeletePayload(selectedRows) });
      setSelectedIds([]);
      setShowHistory(true);
      await refreshSmsMutationWithHistory({
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
        afterRefresh: () => reportDeleteResult(result, 'pozycji'),
      });
    } catch (error) {
      await refreshSmsMutation({ reloadSmsData, refreshAll });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleDeleteNow(job) {
    if (deleteBusy || sendBusy) return;
    if (!window.confirm(`Usunąć pozycję ${job.client || job.title || 'Klient'} z kolejki SMS?`)) return;
    setDeleteBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const result = await deleteServiceSmsQueueItems({ supabase, rows: buildDeletePayload([job]) });
      setShowHistory(true);
      await refreshSmsMutationWithHistory({
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
        afterRefresh: () => reportDeleteResult(result, 'pozycji'),
      });
    } catch (error) {
      await refreshSmsMutation({ reloadSmsData, refreshAll });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleRetryUnsentSelected() {
    if (smsSendLockRef.current || deleteBusy) return;
    const selectedRows = unsentRows.filter((row) => (row.canSend ?? row.canSelect) && selectedUnsentIds.includes(row.selectionKey));
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Na pewno wysłać ponownie ${selectedRows.length} zaznaczonych SMS-ów? Wysyłki nie można cofnąć.`)) return;

    smsSendLockRef.current = true;
    setSendBusy(true);
    setSendingUnsentIds(selectedRows.map((row) => row.selectionKey).filter(Boolean));
    setInfoMessage('');
    setErrorMessage('');

    let sentCount = 0;
    const failures = [];

    try {
      for (const row of selectedRows) {
        try {
          const result = await sendUnsentSmsLog({ supabase, log: row });
          sentCount += result.sentCount;
        } catch (error) {
          failures.push(`${row.client}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      setSelectedUnsentIds([]);
      await refreshSmsMutationForVisibleHistory({
        showHistory,
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
      });
      if (sentCount > 0) {
        setInfoMessage(`Wysłano ${sentCount} wiadomości SMS.`);
      }
      if (failures.length > 0) {
        setErrorMessage(`Nie udało się wysłać ${failures.length} pozycji. ${failures.slice(0, 3).join(' | ')}`);
      }

    } finally {
      smsSendLockRef.current = false;
      setSendingUnsentIds([]);
      setSendBusy(false);
    }
  }

  async function handleRetryUnsentNow(row) {
    if (smsSendLockRef.current || !(row?.canSend ?? row?.canSelect)) return;

    smsSendLockRef.current = true;
    setSendBusy(true);
    setSendingUnsentIds(row?.selectionKey ? [row.selectionKey] : []);
    setInfoMessage('');
    setErrorMessage('');

    try {
      await sendUnsentSmsLog({ supabase, log: row });
      setInfoMessage(`SMS dla klienta ${row.client || 'Klient'} został wysłany.`);
      await refreshSmsMutationForVisibleHistory({
        showHistory,
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
      });
    } catch (error) {
      await refreshSmsMutationForVisibleHistory({
        showHistory,
        reloadSmsData,
        refreshAll: showHistory ? refreshAll : undefined,
        loadFullHistoryPage,
      });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      smsSendLockRef.current = false;
      setSendingUnsentIds([]);
      setSendBusy(false);
    }
  }

  function toggleUnsentOne(selectionKey) {
    if (!selectionKey) return;
    setSelectedUnsentIds((prev) => (
      prev.includes(selectionKey)
        ? prev.filter((id) => id !== selectionKey)
        : [...prev, selectionKey]
    ));
  }

  function toggleUnsentAll(checked, rows = []) {
    const pageKeys = rows.filter((row) => row.canDelete).map((row) => row.selectionKey).filter(Boolean);
    setSelectedUnsentIds((prev) => {
      if (checked) return [...new Set([...prev, ...pageKeys])];
      const pageSet = new Set(pageKeys);
      return prev.filter((id) => !pageSet.has(id));
    });
  }

  function buildUnsentDeletePayload(rows = []) {
    const seen = new Set();
    return rows.flatMap((row) => {
      const reminderGroupId = getReminderGroupId(row);
      const logIds = getDeleteLogIds(row);

      if (reminderGroupId) {
        const key = `group:${reminderGroupId}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ logId: logIds[0] || null, reminderGroupId }];
      }

      return logIds
        .filter((logId) => {
          const key = `log:${logId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((logId) => ({ logId }));
    });
  }

  async function handleDeleteUnsentSelected() {
    if (deleteBusy || sendBusy) return;
    const selectedRows = unsentRows.filter((row) => row.canDelete && selectedUnsentIds.includes(row.selectionKey));
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Usunąć ${selectedRows.length} zaznaczonych pozycji z listy Niewysłane? Operacja obejmie tylko zaznaczone wiersze.`)) return;

    setDeleteBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const result = await deleteServiceSmsQueueItems({ supabase, rows: buildUnsentDeletePayload(selectedRows) });
      setSelectedUnsentIds([]);
      await refreshSmsMutationForVisibleHistory({
        showHistory,
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
        afterRefresh: () => reportDeleteResult(result, 'niewysłanych pozycji'),
      });
    } catch (error) {
      await refreshSmsMutation({ reloadSmsData, refreshAll });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleDeleteUnsentNow(row) {
    if (deleteBusy || sendBusy || !row?.canDelete) return;
    if (!window.confirm(`Usunąć pozycję ${row.client || 'Klient'} z listy Niewysłane?`)) return;
    setDeleteBusy(true);
    setInfoMessage('');
    setErrorMessage('');
    try {
      const result = await deleteServiceSmsQueueItems({ supabase, rows: buildUnsentDeletePayload([row]) });
      setSelectedUnsentIds((prev) => prev.filter((id) => id !== row.selectionKey));
      await refreshSmsMutationForVisibleHistory({
        showHistory,
        reloadSmsData,
        refreshAll,
        loadFullHistoryPage,
        afterRefresh: () => reportDeleteResult(result, 'niewysłanych pozycji'),
      });
    } catch (error) {
      await refreshSmsMutation({ reloadSmsData, refreshAll });
      setErrorMessage(normalizeDatabaseErrorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  function toggleOne(logId) {
    if (!logId) return;
    setSelectedIds((prev) => (prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]));
  }

  function toggleAll(checked, rows = queue) {
    const pageKeys = rows.filter((job) => job.canSelect).map((job) => job.selectionKey).filter(Boolean);
    setSelectedIds((prev) => {
      if (checked) return [...new Set([...prev, ...pageKeys])];
      const pageSet = new Set(pageKeys);
      return prev.filter((id) => !pageSet.has(id));
    });
  }

  const targetByIdentity = useMemo(() => {
    const map = new Map();
    targets.forEach((target) => {
      const key = target.target_type === 'device' ? `device:${target.id}` : `job:${target.id}`;
      map.set(key, target);
    });
    return map;
  }, [targets]);

  const unsentRows = useMemo(() => buildUnsentSmsLogs({ unsentLogs, queue }).map((log) => {
    const identity = log.device_id ? `device:${log.device_id}` : (log.job_id ? `job:${log.job_id}` : '');
    const target = log.linkedTarget || targetByIdentity.get(identity) || null;
    const groupedIds = Array.isArray(log.grouped_log_ids) ? log.grouped_log_ids.filter(Boolean) : [];
    const retryLogId = log.id || groupedIds[0] || null;
    const dueDate = log.reminder_due_date || '';
    return {
      ...log,
      key: `unsent:${retryLogId || log.id}`,
      selectionKey: `unsent:${retryLogId || log.id}`,
      retryLogId,
      client: log.client || target?.client || 'Klient',
      addressLine: [normalizeText(target?.street), normalizeText(target?.city)].filter(Boolean).join(', '),
      model: normalizeText(target?.model) || 'Urządzenie serwisowe',
      serial_number: normalizeText(target?.serial_number) || '—',
      city: normalizeText(target?.city) || '—',
      phone: normalizeText(target?.sms_recipient_phone || target?.phone || log.phone) || '—',
      service_due_date: dueDate,
      formattedDueDate: formatSmsDate(dueDate),
      cycleLabel: log.reminder_cycle ? `Cykl ${log.reminder_cycle}` : '',
      statusLabel: getSmsStatusLabel(log.status),
      reason: log.status === 'pending_approval'
        ? 'Wymaga zatwierdzenia wysyłki.'
        : normalizeText(log.error_message) || 'Przekroczono okno wysyłki.',
      linkedTarget: target,
      canSend: Boolean(retryLogId && target),
      canDelete: Boolean(retryLogId),
      canSelect: Boolean(retryLogId),
    };
  }), [unsentLogs, queue, targetByIdentity]);

  useEffect(() => {
    setSelectedUnsentIds((prev) => prev.filter((id) => (
      unsentRows.some((row) => row.selectionKey === id)
    )));
  }, [unsentRows]);

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
    const when = log.sent_at || log.approved_at || log.created_at || '';
    const deliveredWhen = log.delivered_at || '';
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
      delivered_at: deliveredWhen ? new Date(deliveredWhen).toISOString().slice(0, 10) : '',
      formattedDeliveredAt: formatSmsDate(deliveredWhen),
      relativeDateLabel: when ? 'Bieżący miesiąc' : '',
      statusLabel: presentation.label,
      statusTone: presentation.tone,
      statusValue: presentation.tone,
      linkedTarget: target,
    };
  }), [sentThisMonthLogs, targetByIdentity]);

  const cityOptions = useMemo(() => {
    const values = new Set();
    [...queueRows, ...sentRows, ...unsentRows].forEach((row) => {
      if (row.city && row.city !== '—') values.add(row.city);
    });
    return [...values].sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }));
  }, [queueRows, sentRows, unsentRows]);

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

  const filteredUnsentRows = useMemo(() => {
    const search = normalizeSearch(searchQuery);
    return unsentRows.filter((row) => {
      if (cityFilter !== 'all' && row.city !== cityFilter) return false;
      if (!search) return true;
      const haystack = normalizeSearch([row.client, row.model, row.serial_number, row.city, row.phone, row.addressLine, row.reason].join(' '));
      return haystack.includes(search);
    });
  }, [unsentRows, searchQuery, cityFilter]);

  const activeRows = activeSummaryView === 'queue'
    ? filteredQueueRows
    : activeSummaryView === 'unsent'
      ? filteredUnsentRows
      : filteredSentRows;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pagedRows = activeRows.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setSelectedIds([]);
    setSelectedUnsentIds([]);
  }, [activeSummaryView, searchQuery, cityFilter]);

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
          <button type="button" className={`smsSummaryCard smsSummaryCardButton ${activeSummaryView === 'unsent' ? 'active' : ''}`} onClick={() => setActiveSummaryView('unsent')}>
            <div className="smsSummaryCardBody">
              <span>Niewysłane</span>
              <strong>{unsentRows.length}</strong>
              <small>Przypomnienia oczekujące na zatwierdzenie lub ponowną wysyłkę.</small>
            </div>
          </button>
        </div>

        {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
        {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}
        {deviceCatalogWarning && !isSettingsOnlyView ? <div className="errorBox">{deviceCatalogWarning}</div> : null}
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
                  onToggleAll={(checked) => toggleAll(checked, pagedRows)}
                  onSendSelected={handleSendSelected}
                  onDeleteSelected={handleDeleteSelected}
                  sendBusy={sendBusy}
                  deleteBusy={deleteBusy}
                  autoRefreshBusy={autoRefreshBusy}
                  onSendNow={handleSendNow}
                  onDeleteNow={handleDeleteNow}
                  selectedClientKey={selectedClient?.selectionKey || ''}
                  onSelectClient={(row) => { setSelectedClient(row); setSelectedDevice(null); }}
                  onSelectDevice={(row) => { setSelectedDevice(row); setSelectedClient(null); }}
                  onPageChange={setCurrentPage}
                />
              ) : activeSummaryView === 'unsent' ? (
                <SmsUnsentCard
                  rows={filteredUnsentRows}
                  pageRows={pagedRows}
                  currentPage={currentPageSafe}
                  totalPages={totalPages}
                  totalRows={filteredUnsentRows.length}
                  selectedIds={selectedUnsentIds}
                  onToggleOne={toggleUnsentOne}
                  onToggleAll={(checked) => toggleUnsentAll(checked, pagedRows)}
                  onSendSelected={handleRetryUnsentSelected}
                  onDeleteSelected={handleDeleteUnsentSelected}
                  onSendNow={handleRetryUnsentNow}
                  onDeleteNow={handleDeleteUnsentNow}
                  sendBusy={sendBusy}
                  sendingIds={sendingUnsentIds}
                  deleteBusy={deleteBusy}
                  onPageChange={setCurrentPage}
                  onSelectLog={(row) => { setSelectedClient(row.linkedTarget || row); setSelectedDevice(null); }}
                  onSelectDevice={(row) => { setSelectedDevice(row.linkedTarget || row); setSelectedClient(null); }}
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
          </div>
        </section>

        {infoMessage ? <div className="successBox">{infoMessage}</div> : null}
        {errorMessage ? <div className="errorBox">{errorMessage}</div> : null}
        {deviceCatalogWarning && !isSettingsOnlyView ? <div className="errorBox">{deviceCatalogWarning}</div> : null}
        {loading ? <div className="card premiumCard">Ładowanie ustawień SMS...</div> : null}

        {!loading ? (
          <>
            <SmsSettingsCard settings={settings} setSettings={setSettings} onSave={handleSaveSettings} saveBusy={saveBusy} isAdmin={isAdmin} />
            {requestedSection === 'sms_templates' ? (
              <SmsTestCard
                phone={testSmsPhone}
                setPhone={setTestSmsPhone}
                busy={testSmsBusy}
                onSend={handleSendTestSms}
              />
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="smsModulePage smsDesktopMockupPage">
      <section className="smsDesktopHeaderCard">
        <div className="smsDesktopHeaderCopy">
          <h1>SMS – przypomnienia serwisowe</h1>
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
        <button type="button" className={`smsDesktopMetricCard ${activeSummaryView === 'unsent' ? 'active' : ''}`} onClick={() => setActiveSummaryView('unsent')}>
          <div className="smsDesktopMetricBody">
            <strong>Niewysłane</strong>
            <div className="smsDesktopMetricValue">{unsentRows.length}</div>
            <small>Przypomnienia oczekujące na zatwierdzenie lub ponowną wysyłkę</small>
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
              onToggleAll={(checked) => toggleAll(checked, pagedRows)}
              onSendSelected={handleSendSelected}
              onDeleteSelected={handleDeleteSelected}
              sendBusy={sendBusy}
              sendingIds={sendingUnsentIds}
              deleteBusy={deleteBusy}
              autoRefreshBusy={autoRefreshBusy}
              onSendNow={handleSendNow}
              onDeleteNow={handleDeleteNow}
              selectedClientKey={selectedClient?.selectionKey || ''}
              onSelectClient={(row) => { setSelectedClient(row); setSelectedDevice(null); }}
              onSelectDevice={(row) => { setSelectedDevice(row); setSelectedClient(null); }}
              onPageChange={setCurrentPage}
            />
          ) : activeSummaryView === 'unsent' ? (
            <SmsUnsentCard
              rows={filteredUnsentRows}
              pageRows={pagedRows}
              currentPage={currentPageSafe}
              totalPages={totalPages}
              totalRows={filteredUnsentRows.length}
              selectedIds={selectedUnsentIds}
              onToggleOne={toggleUnsentOne}
              onToggleAll={(checked) => toggleUnsentAll(checked, pagedRows)}
              onSendSelected={handleRetryUnsentSelected}
              onDeleteSelected={handleDeleteUnsentSelected}
              onSendNow={handleRetryUnsentNow}
              onDeleteNow={handleDeleteUnsentNow}
              sendBusy={sendBusy}
              deleteBusy={deleteBusy}
              onPageChange={setCurrentPage}
              onSelectLog={(row) => { setSelectedClient(row.linkedTarget || row); setSelectedDevice(null); }}
              onSelectDevice={(row) => { setSelectedDevice(row.linkedTarget || row); setSelectedClient(null); }}
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
            <button type="button" className="smsDesktopInlineLink" onClick={() => setShowSettings((prev) => !prev)}>Zarządzaj szablonami SMS</button>
            <button type="button" className="smsDesktopInlineLink" onClick={() => void handleToggleHistory()}>{showHistory ? 'Ukryj pełną historię' : 'Pokaż pełną historię'}</button>
          </div>

          {showSettings ? (
            <SmsSettingsCard settings={settings} setSettings={setSettings} onSave={handleSaveSettings} saveBusy={saveBusy} isAdmin={isAdmin} />
          ) : null}

          {showHistory ? (
            <SmsHistoryCard
              logs={historyLogs}
              currentPage={historyPage}
              pageSize={50}
              totalRows={historyTotal}
              onPageChange={(page) => void loadFullHistoryPage(page)}
              busy={historyBusy}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
