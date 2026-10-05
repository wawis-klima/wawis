import { getDeviceIndoorSerials, getJobDeviceRows } from './job-devices.js';

const DEFAULT_TEMPLATE = 'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}';
const DEFAULT_REMINDER_YEARS = 5;
const ACTIVE_WINDOW_DAYS = 62;

function parseIsoDateParts(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatIsoParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addMonthsClampedIso(value, monthsToAdd) {
  const parts = parseIsoDateParts(value);
  if (!parts) return '';
  const zeroBased = (parts.year * 12) + (parts.month - 1) + monthsToAdd;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return formatIsoParts(year, month, day);
}

function isoDateToDay(value) {
  const parts = parseIsoDateParts(value);
  if (!parts) return 0;
  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

function addDaysIso(value, days) {
  const dayNumber = isoDateToDay(value);
  if (!dayNumber) return '';
  const date = new Date((dayNumber + days) * 86400000);
  return formatIsoParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function getWarsawIsoDate(value = new Date()) {
  if (typeof value === 'string') {
    const parsed = parseIsoDateParts(value);
    if (parsed) return formatIsoParts(parsed.year, parsed.month, parsed.day);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function normalizePositiveInteger(value, fallback = DEFAULT_REMINDER_YEARS) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatSmsDate(dateStr = '') {
  const parts = parseIsoDateParts(dateStr);
  if (parts) return `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}.${parts.year}`;
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw' }).format(date);
}

export function calculateServiceDueDate(installationDate) {
  return addMonthsClampedIso(installationDate, 11) || null;
}

export function getReminderSchedule(installationDate, reminderYears = DEFAULT_REMINDER_YEARS) {
  if (!parseIsoDateParts(installationDate)) return [];
  const maxYears = normalizePositiveInteger(reminderYears);
  const schedule = [];

  for (let cycle = 1; cycle <= maxYears; cycle += 1) {
    const dueDate = addMonthsClampedIso(installationDate, 11 + ((cycle - 1) * 12));
    if (!dueDate) continue;
    const expiresOn = addDaysIso(dueDate, ACTIVE_WINDOW_DAYS);
    const dueDay = isoDateToDay(dueDate);
    const expiresDay = isoDateToDay(expiresOn);
    schedule.push({
      cycle,
      dueDate,
      dueDay,
      expiresOn,
      expiresDay,
      dueTs: dueDay,
      expiresAt: expiresDay,
    });
  }

  return schedule;
}

export function getCurrentReminderCycle(installationDate, reminderYears = DEFAULT_REMINDER_YEARS, today = new Date()) {
  const schedule = getReminderSchedule(installationDate, reminderYears);
  const todayDay = isoDateToDay(getWarsawIsoDate(today));
  if (!todayDay) return null;

  let activeCycle = null;
  let expiredCycle = null;

  for (const item of schedule) {
    if (item.dueDay > todayDay) break;
    if (todayDay <= item.expiresDay) activeCycle = item;
    else expiredCycle = item;
  }

  return { activeCycle, expiredCycle, schedule };
}

export function getDefaultSmsSettings() {
  return {
    id: null,
    is_enabled: true,
    sending_mode: 'approval',
    sender_name: '',
    service_phone: '',
    company_name: 'Wawis Klimatyzacja',
    template_service_reminder: DEFAULT_TEMPLATE,
  };
}

export function buildReminderMessage(job, settings) {
  const safeSettings = settings || getDefaultSmsSettings();
  const dueDate = job.reminder_due_date || job.service_due_date || calculateServiceDueDate(job.installation_date) || '';
  return (safeSettings.template_service_reminder || DEFAULT_TEMPLATE)
    .replaceAll('{client}', job.client || job.contractor_name || job.title || 'Kliencie')
    .replaceAll('{service_phone}', safeSettings.service_phone || job.sms_recipient_phone || job.phone || '')
    .replaceAll('{company_name}', safeSettings.company_name || 'Wawis Klimatyzacja')
    .replaceAll('{installation_date}', formatSmsDate(job.installation_date))
    .replaceAll('{service_due_date}', formatSmsDate(dueDate));
}

function normalizeLogStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function getLogIdentity(log = {}) {
  if (log.device_id) return `device:${log.device_id}`;
  if (log.job_id) return `job:${log.job_id}`;
  return '';
}

function getDeviceSnapshot(device = {}) {
  return {
    id: String(device.id || ''),
    model: device.model || '',
    serial_number: device.serial_number || '',
    indoor_serial_number: device.indoor_serial_number || '',
    indoor_serial_numbers: getDeviceIndoorSerials(device),
    outdoor_serial_number: device.outdoor_serial_number || '',
    legacy_serial_number: device.legacy_serial_number || '',
    installation_date: device.installation_date || '',
    source_kind: device.source_kind || 'device',
  };
}

function appendGroupedDevice(target, device = {}) {
  const snapshot = getDeviceSnapshot(device);
  if (!snapshot.id) return target;
  const existing = Array.isArray(target.grouped_devices) ? target.grouped_devices : [];
  if (!existing.some((item) => String(item.id || '') === snapshot.id)) {
    existing.push(snapshot);
  }
  target.grouped_devices = existing;
  target.grouped_device_count = existing.length;
  if (!target.primary_device_id) target.primary_device_id = snapshot.id;
  if (!target.model && snapshot.model) target.model = snapshot.model;
  if (!target.serial_number && snapshot.serial_number) target.serial_number = snapshot.serial_number;
  if (!target.installation_date && snapshot.installation_date) target.installation_date = snapshot.installation_date;
  return target;
}

function getRecordLogIdentities(record = {}) {
  const identities = [];
  const pushIdentity = (type, id) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const identity = `${type}:${normalizedId}`;
    if (!identities.includes(identity)) identities.push(identity);
  };

  const deviceId = record.device_id || (record.target_type === 'device' ? record.id : '');
  if (deviceId) pushIdentity('device', deviceId);

  if (!deviceId || record.target_type !== 'device') {
    const jobId = normalizeSourceJobId(record.source_job_id || record.job_id || (record.target_type === 'job' ? record.id : ''));
    pushIdentity('job', jobId);
  }

  for (const device of record.grouped_devices || []) {
    pushIdentity('device', device?.id);
  }

  return identities;
}

function pickLogForIdentities(logMap, identities = [], cycle = 1) {
  for (const identity of identities) {
    const log = logMap.get(`${identity}:${cycle}`);
    if (log) return log;
  }
  return null;
}

function pickLatestLogForIdentities(latestLogByIdentity, identities = []) {
  let latest = null;
  let latestTime = 0;
  for (const identity of identities) {
    const log = latestLogByIdentity.get(identity);
    if (!log) continue;
    const time = new Date(log.delivered_at || log.sent_at || log.approved_at || log.created_at || 0).getTime();
    if (!latest || time >= latestTime) {
      latest = log;
      latestTime = time;
    }
  }
  return latest;
}

function normalizeSmsKeyPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl-PL')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSmsPhone(value) {
  const raw = String(value || '').trim();
  if (!raw || !/^[0-9+()\s.-]+$/.test(raw)) return '';
  let digits = raw.replace(/\D+/g, '');
  if (digits.length === 13 && digits.startsWith('0048')) digits = digits.slice(2);
  else if (digits.length === 9) digits = `48${digits}`;
  return digits.length === 11 && digits.startsWith('48') ? digits : '';
}

function normalizeSourceJobId(value) {
  return String(value || '').trim().split('::')[0].trim();
}

function getSmsCustomerBaseKey(record = {}) {
  const phone = normalizeSmsPhone(record.sms_recipient_phone || record.phone);
  if (phone) return `phone:${phone}`;

  const contractorId = String(record.contractor_id || '').trim();
  if (contractorId) return `contractor:${contractorId}`;

  const name = normalizeSmsKeyPart(record.contractor_name || record.client || record.title);
  const street = normalizeSmsKeyPart(record.contractor_street || record.street);
  const city = normalizeSmsKeyPart(record.contractor_city || record.city);
  const fallback = [name, street, city].filter(Boolean).join('|');
  return fallback ? `client:${fallback}` : '';
}

function getSmsCustomerCycleKey(record = {}, cycle = 1, dueDate = '') {
  const base = getSmsCustomerBaseKey(record);
  if (!base || !dueDate) return '';
  return `${base}:due:${dueDate}:cycle:${cycle}`;
}

function getSmsDueTime(value) {
  return isoDateToDay(value);
}

function getSmsLogEventTime(log = {}) {
  return new Date(log.delivered_at || log.sent_at || log.approved_at || log.created_at || 0).getTime() || 0;
}

function getSmsSendEventTime(log = {}) {
  return new Date(log.sent_at || log.approved_at || log.created_at || 0).getTime() || 0;
}

function getSmsSendMonthKey(log = {}) {
  const timestamp = getSmsSendEventTime(log);
  if (!timestamp) return '';
  return getWarsawIsoDate(new Date(timestamp)).slice(0, 7);
}

function getSmsLogStatusPriority(status) {
  switch (normalizeLogStatus(status)) {
    case 'delivered': return 1;
    case 'provider_sent': return 2;
    case 'sent': return 3;
    case 'pending_approval': return 4;
    case 'approved': return 5;
    case 'error': return 6;
    case 'not_sent': return 7;
    case 'deleted': return 8;
    case 'dismissed': return 8;
    default: return 9;
  }
}

function getSmsLogPrimaryPriority(log = {}) {
  return log?.reminder_group_primary === true ? 0 : 1;
}

function isQueueFinalizedSmsLog(log = {}) {
  const status = normalizeLogStatus(log.status);
  if (['provider_sent', 'sent', 'delivered'].includes(status)) return true;
  if (!['deleted', 'dismissed', 'not_sent'].includes(status)) return false;

  // Dla trwałej grupy miękki stan końcowy blokuje kolejkę tylko wtedy,
  // gdy dotyczy kanonicznego primary. Stary secondary "deleted" nie może
  // ukryć nowszego pending primary tej samej grupy.
  const groupId = String(log.reminder_group_id || '').trim();
  return !groupId || log.reminder_group_primary === true;
}

function isPreferredSmsLog(candidate = {}, current = null) {
  if (!current) return true;
  const statusDelta = getSmsLogStatusPriority(candidate.status) - getSmsLogStatusPriority(current.status);
  if (statusDelta !== 0) return statusDelta < 0;
  const primaryDelta = getSmsLogPrimaryPriority(candidate) - getSmsLogPrimaryPriority(current);
  if (primaryDelta !== 0) return primaryDelta < 0;
  return getSmsLogEventTime(candidate) >= getSmsLogEventTime(current);
}

function isSmsReminderWindowMatch(leftDueDate, rightDueDate, windowDays = ACTIVE_WINDOW_DAYS) {
  const leftTs = getSmsDueTime(leftDueDate);
  const rightTs = getSmsDueTime(rightDueDate);
  if (!leftTs || !rightTs) return false;
  return Math.abs(leftTs - rightTs) <= windowDays;
}

function addCustomerLogToMap(map, log = {}) {
  const key = getSmsCustomerBaseKey(log);
  if (!key) return;
  const rows = map.get(key) || [];
  rows.push(log);
  map.set(key, rows);
}

function getSmsReminderGroupId(log = {}) {
  return String(log?.reminder_group_id || '').trim();
}

function isPersistedReminderGroupMatch(log = {}, dueDate = '') {
  const groupId = getSmsReminderGroupId(log);
  if (!groupId) return false;
  const dueTs = getSmsDueTime(dueDate);
  const anchorTs = getSmsDueTime(log.reminder_group_anchor_date);
  const windowEndTs = getSmsDueTime(log.reminder_group_window_end_date);
  return Boolean(dueTs && anchorTs && windowEndTs && dueTs >= anchorTs && dueTs <= windowEndTs);
}

function pickCustomerWindowLog(map, customerKey, dueDate) {
  if (!customerKey || !dueDate) return null;
  const matches = (map.get(customerKey) || [])
    .filter((log) => (
      isPersistedReminderGroupMatch(log, dueDate)
      || (!getSmsReminderGroupId(log) && isSmsReminderWindowMatch(log.reminder_due_date, dueDate))
    ))
    .sort((a, b) => (
      Number(!isPersistedReminderGroupMatch(a, dueDate)) - Number(!isPersistedReminderGroupMatch(b, dueDate))
      || getSmsLogStatusPriority(a.status) - getSmsLogStatusPriority(b.status)
      || getSmsLogPrimaryPriority(a) - getSmsLogPrimaryPriority(b)
      || Math.abs(getSmsDueTime(a.reminder_due_date) - getSmsDueTime(dueDate)) - Math.abs(getSmsDueTime(b.reminder_due_date) - getSmsDueTime(dueDate))
      || getSmsLogEventTime(b) - getSmsLogEventTime(a)
    ));
  return matches[0] || null;
}

export function groupSmsLogsByCustomerWindow(logs = []) {
  const durableGroups = new Map();
  const legacyByCustomer = new Map();
  const ungrouped = [];

  const pushGroupedCluster = (grouped, clusterLogs, customerKey, reminderGroupId = '') => {
    const ranked = [...clusterLogs].sort((a, b) => (
      getSmsLogStatusPriority(a.status) - getSmsLogStatusPriority(b.status)
      || getSmsLogPrimaryPriority(a) - getSmsLogPrimaryPriority(b)
      || getSmsLogEventTime(b) - getSmsLogEventTime(a)
    ));
    const canonical = ranked[0] || clusterLogs[0];
    const dueDates = [...new Set(clusterLogs.map((log) => String(log.reminder_due_date || '')).filter(Boolean))].sort();
    const cycles = [...new Set(clusterLogs.map((log) => Number.parseInt(String(log.reminder_cycle ?? ''), 10)).filter((value) => Number.isFinite(value) && value > 0))];

    grouped.push({
      ...canonical,
      sms_customer_group_key: reminderGroupId ? `group:${reminderGroupId}` : customerKey,
      reminder_group_id: reminderGroupId || canonical?.reminder_group_id || null,
      grouped_logs: clusterLogs,
      grouped_log_ids: clusterLogs.map((log) => log?.id).filter(Boolean),
      grouped_log_count: clusterLogs.length,
      grouped_reminder_due_dates: dueDates,
      reminder_due_date: dueDates[0] || canonical.reminder_due_date || null,
      reminder_cycle: cycles.length === 1 ? cycles[0] : null,
    });
  };

  for (const log of logs || []) {
    const reminderGroupId = getSmsReminderGroupId(log);
    if (reminderGroupId) {
      const rows = durableGroups.get(reminderGroupId) || [];
      rows.push(log);
      durableGroups.set(reminderGroupId, rows);
      continue;
    }

    const customerKey = getSmsCustomerBaseKey(log);
    const dueTs = getSmsDueTime(log?.reminder_due_date);
    if (!customerKey || !dueTs) {
      ungrouped.push({
        ...log,
        grouped_logs: [log],
        grouped_log_ids: log?.id ? [log.id] : [],
        grouped_log_count: 1,
        grouped_reminder_due_dates: log?.reminder_due_date ? [log.reminder_due_date] : [],
      });
      continue;
    }

    const rows = legacyByCustomer.get(customerKey) || [];
    rows.push(log);
    legacyByCustomer.set(customerKey, rows);
  }

  const grouped = [...ungrouped];

  for (const [reminderGroupId, groupLogs] of durableGroups.entries()) {
    pushGroupedCluster(grouped, groupLogs, getSmsCustomerBaseKey(groupLogs[0] || {}), reminderGroupId);
  }

  for (const [customerKey, customerLogs] of legacyByCustomer.entries()) {
    const sorted = [...customerLogs].sort((a, b) => (
      getSmsDueTime(a.reminder_due_date) - getSmsDueTime(b.reminder_due_date)
      || getSmsLogEventTime(a) - getSmsLogEventTime(b)
    ));
    const clusters = [];

    for (const log of sorted) {
      const dueTs = getSmsDueTime(log.reminder_due_date);
      const current = clusters[clusters.length - 1];
      if (!current || dueTs - current.anchorDueTs > ACTIVE_WINDOW_DAYS) {
        clusters.push({ anchorDueTs: dueTs, logs: [log] });
      } else {
        current.logs.push(log);
      }
    }

    for (const cluster of clusters) {
      pushGroupedCluster(grouped, cluster.logs, customerKey);
    }
  }

  return grouped.sort((a, b) => getSmsLogEventTime(b) - getSmsLogEventTime(a));
}

export function expandSmsHistoryRows(logs = []) {
  const seen = new Set();
  const rows = [];

  for (const grouped of logs || []) {
    const attempts = Array.isArray(grouped?.grouped_logs) && grouped.grouped_logs.length
      ? grouped.grouped_logs
      : [grouped];

    for (const attempt of attempts) {
      const id = String(attempt?.id || '').trim();
      const fallbackKey = [attempt?.provider_message_id, attempt?.created_at, attempt?.phone, attempt?.status]
        .map((value) => String(value || ''))
        .join('|');
      const key = id || fallbackKey;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(attempt);
    }
  }

  return rows.sort((left, right) => getSmsLogEventTime(right) - getSmsLogEventTime(left));
}

function mergeUniqueById(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const id = String(item?.id || '').trim();
    const fallback = `${item?.model || ''}|${item?.serial_number || ''}|${item?.indoor_serial_number || ''}|${Array.isArray(item?.indoor_serial_numbers) ? item.indoor_serial_numbers.join(',') : ''}|${item?.outdoor_serial_number || ''}|${item?.legacy_serial_number || ''}`;
    const key = id || fallback;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function mergeSmsCustomerRows(rows = []) {
  if (rows.length <= 1) return rows[0] || null;

  const sortedRows = [...rows].sort((a, b) => {
    const aHasLog = a.queueLog ? 0 : 1;
    const bHasLog = b.queueLog ? 0 : 1;
    if (aHasLog !== bHasLog) return aHasLog - bHasLog;
    return String(a.client || '').localeCompare(String(b.client || ''), 'pl-PL') || String(a.id || '').localeCompare(String(b.id || ''));
  });
  const primary = sortedRows[0];
  const groupedDevices = mergeUniqueById(sortedRows.flatMap((row) => Array.isArray(row.grouped_devices) ? row.grouped_devices : []));
  const queueLogs = mergeUniqueById(sortedRows.map((row) => row.queueLog).filter(Boolean));
  const latestLogs = mergeUniqueById(sortedRows.map((row) => row.latestLog).filter(Boolean));
  const groupedJobIds = mergeUniqueById(sortedRows.map((row) => ({ id: row.source_job_id || row.job_id || (row.target_type === 'job' ? row.id : '') }))).map((item) => item.id).filter(Boolean);
  const groupedDeviceIds = mergeUniqueById(sortedRows.flatMap((row) => {
    const ids = [];
    if (row.device_id || row.target_type === 'device') ids.push({ id: row.device_id || row.id });
    for (const device of row.grouped_devices || []) ids.push({ id: device?.id });
    return ids;
  })).map((item) => item.id).filter(Boolean);
  const groupedDeviceCount = groupedDevices.length || sortedRows.reduce((sum, row) => sum + (Number(row.grouped_device_count) || 0), 0) || sortedRows.length;
  const latestLog = latestLogs.sort((a, b) => new Date(b.delivered_at || b.sent_at || b.approved_at || b.created_at || 0).getTime() - new Date(a.delivered_at || a.sent_at || a.approved_at || a.created_at || 0).getTime())[0] || primary.latestLog || null;
  const dueDates = [...new Set(sortedRows.map((row) => String(row.reminder_due_date || row.service_due_date || '')).filter(Boolean))].sort();
  const cycles = [...new Set(sortedRows.map((row) => Number.parseInt(String(row.reminder_cycle ?? ''), 10)).filter((value) => Number.isFinite(value) && value > 0))];

  return {
    ...primary,
    key: `sms:${primary.sms_customer_group_key}`,
    selectionKey: `sms:${primary.sms_customer_group_key}`,
    sms_group_key: primary.sms_customer_group_key,
    customer_grouped: true,
    queueLog: queueLogs[0] || primary.queueLog || null,
    queueLogs,
    grouped_queue_log_ids: queueLogs.map((log) => log.id).filter(Boolean),
    latestLog,
    rowTimestamp: latestLog?.delivered_at || latestLog?.sent_at || latestLog?.approved_at || latestLog?.created_at || primary.rowTimestamp || null,
    grouped_sms_rows: sortedRows,
    grouped_job_ids: groupedJobIds,
    grouped_device_ids: groupedDeviceIds,
    grouped_devices: groupedDevices,
    grouped_device_count: groupedDeviceCount,
    service_due_date: dueDates[0] || primary.service_due_date || primary.reminder_due_date || '',
    reminder_due_date: dueDates[0] || primary.reminder_due_date || primary.service_due_date || '',
    reminder_cycle: cycles.length === 1 ? cycles[0] : primary.reminder_cycle,
    grouped_reminder_due_dates: dueDates,
    model: groupedDeviceCount > 1 ? `${groupedDeviceCount} urządzenia` : primary.model,
    serial_number: groupedDeviceCount > 1 ? 'Wiele numerów' : primary.serial_number,
    source_kind: 'customer_sms_group',
    canSelect: sortedRows.some((row) => row.canSelect),
  };
}

export function buildSmsTargets({ jobs = [], devices = [] } = {}) {
  const jobsById = new Map((jobs || []).map((job) => [String(job.id), job]));
  const jobsWithDevices = new Set();
  const targets = [];
  const seenDevices = new Set();

  for (const device of devices || []) {
    const deviceId = String(device.id || '').trim();
    if (!deviceId || seenDevices.has(deviceId)) continue;
    seenDevices.add(deviceId);

    const sourceJobId = normalizeSourceJobId(device.source_job_id);
    const linkedJob = sourceJobId ? jobsById.get(sourceJobId) || null : null;
    if (sourceJobId && linkedJob) jobsWithDevices.add(sourceJobId);

    const phone = linkedJob?.sms_recipient_phone || linkedJob?.phone || device.contractor_phone || '';
    const hasAuthoritativeConsent = Boolean(linkedJob);
    const isLegacyDevice = !sourceJobId && Boolean(device.contractor_id);
    const deviceSmsConsent = isLegacyDevice && device.sms_consent === true;
    const deviceSmsReminderEnabled = isLegacyDevice && device.sms_reminder_enabled === true;

    targets.push({
      id: deviceId,
      target_type: 'device',
      client: device.contractor_name || linkedJob?.client || linkedJob?.title || 'Klient',
      contractor_name: device.contractor_name || linkedJob?.client || '',
      email: device.contractor_email || linkedJob?.email || '',
      contractor_email: device.contractor_email || linkedJob?.email || '',
      city: device.contractor_city || linkedJob?.city || '',
      contractor_city: device.contractor_city || linkedJob?.city || '',
      contractor_street: device.contractor_street || linkedJob?.street || '',
      street: device.contractor_street || linkedJob?.street || '',
      phone,
      sms_recipient_phone: phone,
      installation_date: device.installation_date || linkedJob?.installation_date || '',
      service_reminder_years: normalizePositiveInteger(device.service_reminder_years || linkedJob?.service_reminder_years || DEFAULT_REMINDER_YEARS),
      sms_consent: hasAuthoritativeConsent ? linkedJob?.sms_consent === true : deviceSmsConsent,
      sms_reminder_enabled: hasAuthoritativeConsent ? linkedJob?.sms_reminder_enabled === true : deviceSmsReminderEnabled,
      sms_eligibility: hasAuthoritativeConsent ? 'linked_job' : (isLegacyDevice ? 'legacy_device' : 'missing_linked_job_consent'),
      source_job_id: sourceJobId,
      contractor_id: device.contractor_id || linkedJob?.contractor_id || '',
      job_id: sourceJobId,
      device_id: deviceId,
      model: device.model || linkedJob?.device_model || '',
      serial_number: device.serial_number || linkedJob?.device_serial_number || '',
      source_kind: device.source_kind || 'device',
      grouped_devices: [getDeviceSnapshot(device)],
      grouped_device_count: 1,
    });
  }

  for (const job of jobs || []) {
    const targetId = String(job.id || '').trim();
    if (!targetId || jobsWithDevices.has(targetId)) continue;

    const jobDevices = getJobDeviceRows(job);
    const groupedDevices = jobDevices.map((device, index) => getDeviceSnapshot({
      id: `${job.id || targetId}::device-${index + 1}`,
      model: device.model,
      serial_number: device.serial_number,
      indoor_serial_number: device.indoor_serial_number,
      indoor_serial_numbers: getDeviceIndoorSerials(device),
      outdoor_serial_number: device.outdoor_serial_number,
      installation_date: job.installation_date,
      source_kind: 'job',
    }));
    const groupedDeviceCount = groupedDevices.length;

    targets.push({
      id: targetId,
      target_type: 'job',
      client: job.client || job.title || 'Klient',
      email: job.email || '',
      city: job.city || '',
      street: job.street || '',
      phone: job.sms_recipient_phone || job.phone || '',
      sms_recipient_phone: job.sms_recipient_phone || job.phone || '',
      installation_date: job.installation_date || '',
      service_reminder_years: normalizePositiveInteger(job.service_reminder_years || DEFAULT_REMINDER_YEARS),
      sms_consent: job.sms_consent === true,
      sms_reminder_enabled: job.sms_reminder_enabled === true,
      sms_eligibility: 'linked_job',
      source_job_id: job.id,
      contractor_id: job.contractor_id || '',
      job_id: job.id,
      model: groupedDeviceCount > 1 ? `${groupedDeviceCount} urządzenia` : (jobDevices[0]?.model || ''),
      serial_number: groupedDeviceCount > 1 ? 'Wiele numerów' : (jobDevices[0]?.serial_number || ''),
      source_kind: 'job',
      grouped_devices: groupedDevices,
      grouped_device_count: groupedDeviceCount,
    });
  }

  return targets;
}

export function countSmsDueToday(records = []) {
  const todayTs = new Date().getTime();
  return records.filter((record) => {
    if (!record.sms_consent || !record.sms_reminder_enabled) return false;
    if (!normalizeSmsPhone(record.sms_recipient_phone || record.phone)) return false;
    const current = getCurrentReminderCycle(record.installation_date, record.service_reminder_years, new Date(todayTs));
    return Boolean(current?.activeCycle && current.activeCycle.dueTs <= todayTs);
  }).length;
}

export function deriveSmsQueue(records = [], logs = []) {
  const pendingByKey = new Map();
  const finalizedByKey = new Map();
  const latestLogByIdentity = new Map();
  const pendingByCustomer = new Map();
  const finalizedByCustomer = new Map();
  const latestByCustomer = new Map();
  const now = new Date();

  for (const log of logs || []) {
    const keyBase = getLogIdentity(log);
    const cycle = Number.parseInt(String(log.reminder_cycle ?? ''), 10) || 1;
    const cycleKey = keyBase ? `${keyBase}:${cycle}` : '';
    const status = normalizeLogStatus(log.status);
    const customerKey = getSmsCustomerBaseKey(log);

    if (customerKey) {
      addCustomerLogToMap(latestByCustomer, log);
      if (status === 'pending_approval') addCustomerLogToMap(pendingByCustomer, log);
      if (isQueueFinalizedSmsLog(log)) addCustomerLogToMap(finalizedByCustomer, log);
    }

    if (keyBase) {
      const previous = latestLogByIdentity.get(keyBase);
      const previousTime = previous ? new Date(previous.delivered_at || previous.sent_at || previous.approved_at || previous.created_at || 0).getTime() : 0;
      const currentTime = new Date(log.delivered_at || log.sent_at || log.approved_at || log.created_at || 0).getTime();
      if (!previous || currentTime >= previousTime) {
        latestLogByIdentity.set(keyBase, log);
      }
    }

    if (!cycleKey) continue;
    if (status === 'pending_approval') {
      const currentPending = pendingByKey.get(cycleKey);
      if (isPreferredSmsLog(log, currentPending)) pendingByKey.set(cycleKey, log);
    }
    if (isQueueFinalizedSmsLog(log)) {
      const currentFinalized = finalizedByKey.get(cycleKey);
      if (isPreferredSmsLog(log, currentFinalized)) finalizedByKey.set(cycleKey, log);
    }
  }

  const candidateRows = [...records]
    .map((record) => {
      const identities = getRecordLogIdentities(record);
      const reminder = getCurrentReminderCycle(record.installation_date, record.service_reminder_years, now);
      const activeCycle = reminder?.activeCycle || null;
      if (!activeCycle) return null;
      if (!record.sms_consent || !record.sms_reminder_enabled) return null;
      if (!normalizeSmsPhone(record.sms_recipient_phone || record.phone)) return null;

      const customerKey = getSmsCustomerBaseKey(record);
      const queueLog = pickLogForIdentities(pendingByKey, identities, activeCycle.cycle)
        || pickCustomerWindowLog(pendingByCustomer, customerKey, activeCycle.dueDate);
      const finalizedLog = pickLogForIdentities(finalizedByKey, identities, activeCycle.cycle)
        || pickCustomerWindowLog(finalizedByCustomer, customerKey, activeCycle.dueDate);
      const latestLog = pickLatestLogForIdentities(latestLogByIdentity, identities)
        || pickCustomerWindowLog(latestByCustomer, customerKey, activeCycle.dueDate)
        || queueLog
        || finalizedLog
        || null;
      const rowStatus = normalizeLogStatus(queueLog?.status || latestLog?.status || 'ready') || 'ready';
      const rowTimestamp = latestLog?.delivered_at || latestLog?.sent_at || latestLog?.approved_at || latestLog?.created_at || null;
      const groupKey = record.source_job_id || record.job_id || (record.target_type === 'job' ? record.id : '') || record.id;
      const reminderGroupId = getSmsReminderGroupId(queueLog) || getSmsReminderGroupId(finalizedLog) || getSmsReminderGroupId(latestLog);
      const smsCustomerGroupKey = reminderGroupId
        ? `group:${reminderGroupId}`
        : (customerKey || getSmsCustomerCycleKey(record, activeCycle.cycle, activeCycle.dueDate) || `${record.target_type}:${groupKey}:${activeCycle.cycle}`);

      return {
        ...record,
        queueLog,
        latestLog,
        finalizedLog,
        rowStatus,
        rowTimestamp,
        canSelect: rowStatus !== 'delivered',
        selectionKey: queueLog?.id ? `log:${queueLog.id}` : `${record.target_type}:${groupKey}:${activeCycle.cycle}`,
        service_due_date: activeCycle.dueDate,
        reminder_due_date: activeCycle.dueDate,
        reminder_cycle: activeCycle.cycle,
        sms_group_key: `${record.target_type}:${groupKey}:${activeCycle.cycle}`,
        sms_customer_group_key: smsCustomerGroupKey,
        log_identities: identities,
      };
    })
    .filter(Boolean);

  const groupedRowSets = [];
  const durableGroups = new Map();
  const fallbackByCustomer = new Map();

  for (const row of candidateRows) {
    const reminderGroupId = getSmsReminderGroupId(row.queueLog)
      || getSmsReminderGroupId(row.finalizedLog)
      || getSmsReminderGroupId(row.latestLog);

    if (reminderGroupId) {
      const key = `group:${reminderGroupId}`;
      const group = durableGroups.get(key) || [];
      group.push(row);
      durableGroups.set(key, group);
      continue;
    }

    const customerKey = getSmsCustomerBaseKey(row);
    if (!customerKey) {
      groupedRowSets.push([row]);
      continue;
    }

    const group = fallbackByCustomer.get(customerKey) || [];
    group.push(row);
    fallbackByCustomer.set(customerKey, group);
  }

  groupedRowSets.push(...durableGroups.values());

  for (const customerRows of fallbackByCustomer.values()) {
    const sorted = [...customerRows].sort((a, b) => (
      getSmsDueTime(a.reminder_due_date || a.service_due_date) - getSmsDueTime(b.reminder_due_date || b.service_due_date)
      || String(a.id || '').localeCompare(String(b.id || ''))
    ));

    const clusters = [];
    for (const row of sorted) {
      const dueTs = getSmsDueTime(row.reminder_due_date || row.service_due_date);
      const current = clusters[clusters.length - 1];
      if (!current || !dueTs || dueTs - current.anchorDueTs > ACTIVE_WINDOW_DAYS) {
        clusters.push({ anchorDueTs: dueTs, rows: [row] });
      } else {
        current.rows.push(row);
      }
    }

    groupedRowSets.push(...clusters.map((cluster) => cluster.rows));
  }

  const rows = [];
  for (const groupRows of groupedRowSets) {
    if (groupRows.some((row) => row.finalizedLog)) continue;
    const merged = mergeSmsCustomerRows(groupRows);
    if (!merged) continue;
    if (['provider_sent', 'sent', 'delivered', 'deleted', 'dismissed', 'not_sent'].includes(merged.rowStatus)) continue;
    rows.push(merged);
  }

  return rows
    .sort((a, b) => String(a.service_due_date || '').localeCompare(String(b.service_due_date || '')) || String(a.client || '').localeCompare(String(b.client || ''), 'pl-PL'));
}
export function getSentThisMonthLogs(logs = []) {
  const currentMonthKey = getWarsawIsoDate(new Date()).slice(0, 7);
  const sentLogs = (logs || []).filter((item) => ['provider_sent', 'sent', 'delivered'].includes(normalizeLogStatus(item.status)));

  return groupSmsLogsByCustomerWindow(sentLogs)
    .map((grouped) => {
      const attempts = Array.isArray(grouped?.grouped_logs) && grouped.grouped_logs.length
        ? grouped.grouped_logs
        : [grouped];
      const monthAttempts = attempts
        .filter((attempt) => (
          ['provider_sent', 'sent', 'delivered'].includes(normalizeLogStatus(attempt.status))
          && getSmsSendMonthKey(attempt) === currentMonthKey
        ))
        .sort((left, right) => getSmsSendEventTime(right) - getSmsSendEventTime(left));
      const latestMonthAttempt = monthAttempts[0];
      if (!latestMonthAttempt) return null;

      return {
        ...grouped,
        ...latestMonthAttempt,
        grouped_logs: attempts,
        grouped_log_ids: attempts.map((attempt) => attempt?.id).filter(Boolean),
        grouped_log_count: attempts.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => getSmsSendEventTime(b) - getSmsSendEventTime(a));
}

export function getSmsSummary(records = [], queue = [], logs = []) {
  const sentThisMonthLogs = getSentThisMonthLogs(logs);
  const missingConsent = records.filter((record) => !record.sms_consent || !(record.sms_recipient_phone || record.phone)).length;
  const errors = logs.filter((item) => normalizeLogStatus(item.status) === 'error').length;

  return {
    tracked: queue.length,
    sentThisMonth: sentThisMonthLogs.length,
    missingConsent,
    errors,
    dueToday: countSmsDueToday(records),
  };
}

export function getSmsStatusLabel(status) {
  const normalized = normalizeLogStatus(status);
  switch (normalized) {
    case 'pending_approval':
      return 'Oczekuje na zatwierdzenie';
    case 'provider_sent':
    case 'sent':
      return 'wysłano';
    case 'delivered':
      return 'doręczono';
    case 'error':
      return 'błąd';
    case 'deleted':
      return 'usunięto';
    case 'dismissed':
      return 'usunięto z listy';
    case 'not_sent':
      return 'niewysłano';
    case 'ready':
      return 'gotowe';
    default:
      return normalized || 'nieznany';
  }
}
