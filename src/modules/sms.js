import { getDeviceIndoorSerials, getJobDeviceRows } from './job-devices.js';

const DEFAULT_TEMPLATE = 'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_YEARS = 5;
const ACTIVE_WINDOW_DAYS = 62;

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const result = new Date(date.getTime());
  const dayOfMonth = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(dayOfMonth, lastDay));
  return result;
}

function normalizePositiveInteger(value, fallback = DEFAULT_REMINDER_YEARS) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatSmsDate(dateStr = '') {
  if (!dateStr) return '-';
  const date = parseLocalDate(String(dateStr)) || new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('pl-PL').format(date);
}

export function calculateServiceDueDate(installationDate) {
  const baseDate = parseLocalDate(installationDate);
  if (!baseDate) return null;
  return formatIsoDate(addMonths(baseDate, 11));
}

export function getReminderSchedule(installationDate, reminderYears = DEFAULT_REMINDER_YEARS) {
  const baseDate = parseLocalDate(installationDate);
  if (!baseDate) return [];
  const maxYears = normalizePositiveInteger(reminderYears);
  const schedule = [];

  for (let cycle = 1; cycle <= maxYears; cycle += 1) {
    const dueDate = addMonths(baseDate, cycle === 1 ? 11 : 11 + ((cycle - 1) * 12));
    if (!dueDate) continue;
    schedule.push({
      cycle,
      dueDate: formatIsoDate(dueDate),
      dueTs: dueDate.getTime(),
      expiresAt: dueDate.getTime() + (ACTIVE_WINDOW_DAYS * DAY_MS),
    });
  }

  return schedule;
}

export function getCurrentReminderCycle(installationDate, reminderYears = DEFAULT_REMINDER_YEARS, today = new Date()) {
  const schedule = getReminderSchedule(installationDate, reminderYears);
  const todayTs = today instanceof Date ? today.getTime() : new Date(today).getTime();
  if (!Number.isFinite(todayTs)) return null;

  let activeCycle = null;
  let expiredCycle = null;

  for (const item of schedule) {
    if (item.dueTs > todayTs) break;
    if (todayTs <= item.expiresAt) {
      activeCycle = item;
    } else {
      expiredCycle = item;
    }
  }

  return {
    activeCycle,
    expiredCycle,
    schedule,
  };
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

  const jobId = record.source_job_id || record.job_id || (record.target_type === 'job' ? record.id : '');
  pushIdentity('job', jobId);

  const deviceId = record.device_id || (record.target_type === 'device' ? record.id : '');
  pushIdentity('device', deviceId);

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
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `48${digits}`;
  return digits;
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
    model: groupedDeviceCount > 1 ? `${groupedDeviceCount} urządzenia` : primary.model,
    serial_number: groupedDeviceCount > 1 ? 'Wiele numerów' : primary.serial_number,
    source_kind: 'customer_sms_group',
    canSelect: sortedRows.some((row) => row.canSelect),
  };
}

export function buildSmsTargets({ jobs = [], devices = [] } = {}) {
  const jobsById = new Map((jobs || []).map((job) => [String(job.id), job]));
  const groupedJobTargets = new Map();
  const targets = [];
  const seen = new Set();

  for (const device of devices || []) {
    const sourceJobId = String(device.source_job_id || '').trim();
    const linkedJob = jobsById.get(sourceJobId) || null;

    if (sourceJobId) {
      let target = groupedJobTargets.get(sourceJobId);
      if (!target) {
        const targetId = sourceJobId;
        target = {
          id: targetId,
          target_type: 'job',
          client: device.contractor_name || linkedJob?.client || linkedJob?.title || 'Klient',
          contractor_name: device.contractor_name || linkedJob?.client || '',
          email: device.contractor_email || linkedJob?.email || '',
          contractor_email: device.contractor_email || linkedJob?.email || '',
          city: device.contractor_city || linkedJob?.city || '',
          contractor_city: device.contractor_city || linkedJob?.city || '',
          contractor_street: device.contractor_street || linkedJob?.street || '',
          street: device.contractor_street || linkedJob?.street || '',
          phone: linkedJob?.sms_recipient_phone || linkedJob?.phone || device.contractor_phone || '',
          sms_recipient_phone: linkedJob?.sms_recipient_phone || linkedJob?.phone || device.contractor_phone || '',
          installation_date: device.installation_date || linkedJob?.installation_date || '',
          service_reminder_years: normalizePositiveInteger(device.service_reminder_years || linkedJob?.service_reminder_years || DEFAULT_REMINDER_YEARS),
          sms_consent: typeof linkedJob?.sms_consent === 'boolean' ? linkedJob.sms_consent : true,
          sms_reminder_enabled: typeof linkedJob?.sms_reminder_enabled === 'boolean' ? linkedJob.sms_reminder_enabled : true,
          source_job_id: targetId,
          contractor_id: device.contractor_id || linkedJob?.contractor_id || '',
          job_id: targetId,
          device_id: device.id || '',
          primary_device_id: device.id || '',
          model: device.model || linkedJob?.device_model || '',
          serial_number: device.serial_number || linkedJob?.device_serial_number || '',
          source_kind: device.source_kind || 'device_group',
          grouped_devices: [],
          grouped_device_count: 0,
        };
        groupedJobTargets.set(sourceJobId, target);
      } else {
        target.phone = target.phone || linkedJob?.sms_recipient_phone || linkedJob?.phone || device.contractor_phone || '';
        target.sms_recipient_phone = target.sms_recipient_phone || linkedJob?.sms_recipient_phone || linkedJob?.phone || device.contractor_phone || '';
        target.email = target.email || device.contractor_email || linkedJob?.email || '';
        target.contractor_email = target.contractor_email || device.contractor_email || linkedJob?.email || '';
        target.city = target.city || device.contractor_city || linkedJob?.city || '';
        target.contractor_city = target.contractor_city || device.contractor_city || linkedJob?.city || '';
        target.street = target.street || device.contractor_street || linkedJob?.street || '';
        target.contractor_street = target.contractor_street || device.contractor_street || linkedJob?.street || '';
      }

      appendGroupedDevice(target, device);
      continue;
    }

    const targetId = String(device.id || '');
    if (!targetId || seen.has(`device:${targetId}`)) continue;
    seen.add(`device:${targetId}`);

    targets.push({
      id: targetId,
      target_type: 'device',
      client: device.contractor_name || linkedJob?.client || linkedJob?.title || 'Klient',
      contractor_name: device.contractor_name || linkedJob?.client || '',
      email: device.contractor_email || linkedJob?.email || '',
      contractor_email: device.contractor_email || linkedJob?.email || '',
      city: device.contractor_city || linkedJob?.city || '',
      contractor_city: device.contractor_city || linkedJob?.city || '',
      contractor_street: device.contractor_street || linkedJob?.street || '',
      street: device.contractor_street || linkedJob?.street || '',
      phone: device.contractor_phone || linkedJob?.sms_recipient_phone || linkedJob?.phone || '',
      sms_recipient_phone: device.contractor_phone || linkedJob?.sms_recipient_phone || linkedJob?.phone || '',
      installation_date: device.installation_date || linkedJob?.installation_date || '',
      service_reminder_years: normalizePositiveInteger(device.service_reminder_years || linkedJob?.service_reminder_years || DEFAULT_REMINDER_YEARS),
      sms_consent: typeof linkedJob?.sms_consent === 'boolean' ? linkedJob.sms_consent : true,
      sms_reminder_enabled: typeof linkedJob?.sms_reminder_enabled === 'boolean' ? linkedJob.sms_reminder_enabled : true,
      source_job_id: device.source_job_id || linkedJob?.id || '',
      contractor_id: device.contractor_id || linkedJob?.contractor_id || '',
      device_id: targetId,
      model: device.model || linkedJob?.device_model || '',
      serial_number: device.serial_number || linkedJob?.device_serial_number || '',
      source_kind: device.source_kind || 'device',
      grouped_devices: [getDeviceSnapshot(device)],
      grouped_device_count: 1,
    });
  }

  for (const target of groupedJobTargets.values()) {
    const deviceCount = Array.isArray(target.grouped_devices) ? target.grouped_devices.length : 0;
    target.grouped_device_count = deviceCount;
    if (deviceCount > 1) {
      target.model = `${deviceCount} urządzenia`;
      target.serial_number = 'Wiele numerów';
    }
    targets.push(target);
    seen.add(`job:${target.id}`);
  }

  for (const job of jobs || []) {
    const targetId = String(job.id || '');
    if (!targetId || seen.has(`job:${targetId}`)) continue;
    seen.add(`job:${targetId}`);

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
      sms_consent: !!job.sms_consent,
      sms_reminder_enabled: typeof job.sms_reminder_enabled === 'boolean' ? job.sms_reminder_enabled : true,
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
    if (!(record.sms_recipient_phone || record.phone)) return false;
    const current = getCurrentReminderCycle(record.installation_date, record.service_reminder_years, new Date(todayTs));
    return Boolean(current?.activeCycle && current.activeCycle.dueTs <= todayTs);
  }).length;
}

export function deriveSmsQueue(records = [], logs = []) {
  const pendingByKey = new Map();
  const finalizedByKey = new Map();
  const latestLogByIdentity = new Map();
  const now = new Date();

  for (const log of logs || []) {
    const keyBase = getLogIdentity(log);
    const cycle = Number.parseInt(String(log.reminder_cycle ?? ''), 10) || 1;
    const cycleKey = keyBase ? `${keyBase}:${cycle}` : '';
    const status = normalizeLogStatus(log.status);

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
      pendingByKey.set(cycleKey, log);
    }
    if (['provider_sent', 'sent', 'delivered', 'deleted', 'not_sent'].includes(status)) {
      finalizedByKey.set(cycleKey, log);
    }
  }

  const candidateRows = [...records]
    .map((record) => {
      const identities = getRecordLogIdentities(record);
      const reminder = getCurrentReminderCycle(record.installation_date, record.service_reminder_years, now);
      const activeCycle = reminder?.activeCycle || null;
      if (!activeCycle) return null;
      if (!record.sms_consent || !record.sms_reminder_enabled) return null;
      if (!(record.sms_recipient_phone || record.phone)) return null;

      const queueLog = pickLogForIdentities(pendingByKey, identities, activeCycle.cycle);
      const finalizedLog = pickLogForIdentities(finalizedByKey, identities, activeCycle.cycle);
      const latestLog = pickLatestLogForIdentities(latestLogByIdentity, identities) || queueLog || finalizedLog || null;
      const rowStatus = normalizeLogStatus(queueLog?.status || latestLog?.status || 'ready') || 'ready';
      const rowTimestamp = latestLog?.delivered_at || latestLog?.sent_at || latestLog?.approved_at || latestLog?.created_at || null;
      const groupKey = record.source_job_id || record.job_id || (record.target_type === 'job' ? record.id : '') || record.id;
      const smsCustomerGroupKey = getSmsCustomerCycleKey(record, activeCycle.cycle, activeCycle.dueDate) || `${record.target_type}:${groupKey}:${activeCycle.cycle}`;

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

  const groupedByCustomer = new Map();
  for (const row of candidateRows) {
    const key = row.sms_customer_group_key || row.sms_group_key;
    const group = groupedByCustomer.get(key) || [];
    group.push(row);
    groupedByCustomer.set(key, group);
  }

  const rows = [];
  for (const groupRows of groupedByCustomer.values()) {
    if (groupRows.some((row) => row.finalizedLog)) continue;
    const merged = mergeSmsCustomerRows(groupRows);
    if (!merged) continue;
    if (['provider_sent', 'sent', 'delivered', 'deleted', 'not_sent'].includes(merged.rowStatus)) continue;
    rows.push(merged);
  }

  return rows
    .sort((a, b) => String(a.service_due_date || '').localeCompare(String(b.service_due_date || '')) || String(a.client || '').localeCompare(String(b.client || ''), 'pl-PL'));
}
export function getSentThisMonthLogs(logs = []) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return [...logs]
    .filter((item) => {
      const when = item.delivered_at || item.sent_at || item.approved_at || item.created_at;
      if (!when) return false;
      const date = new Date(when);
      if (Number.isNaN(date.getTime())) return false;
      const status = normalizeLogStatus(item.status);
      if (!['provider_sent', 'sent', 'delivered'].includes(status)) return false;
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    })
    .sort((a, b) => new Date(b.delivered_at || b.sent_at || b.approved_at || b.created_at || 0).getTime() - new Date(a.delivered_at || a.sent_at || a.approved_at || a.created_at || 0).getTime());
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
      return 'oczekuje';
    case 'provider_sent':
    case 'sent':
      return 'wysłano';
    case 'delivered':
      return 'doręczono';
    case 'error':
      return 'błąd';
    case 'deleted':
      return 'usunięto';
    case 'not_sent':
      return 'niewysłano';
    case 'ready':
      return 'gotowe';
    default:
      return normalized || 'nieznany';
  }
}
