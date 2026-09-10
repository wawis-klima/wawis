import { getJobDeviceRows } from '../../modules/job-devices.js';
import { countSmsDueToday } from '../../modules/sms.js';

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeekMonday(date = new Date()) {
  const base = startOfDay(date);
  const day = base.getDay() || 7;
  base.setDate(base.getDate() - day + 1);
  return base;
}

function endOfWeekSunday(date = new Date()) {
  const base = startOfWeekMonday(date);
  base.setDate(base.getDate() + 6);
  base.setHours(23, 59, 59, 999);
  return base;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getPhone(record = {}) {
  return String(record.sms_recipient_phone || record.phone || record.contact_phone || '').trim();
}

export function getServiceDueDate(installationDate, cycle = 1) {
  const installDate = toDate(installationDate);
  if (!installDate) return null;
  return addMonths(installDate, cycle === 1 ? 11 : 11 + ((cycle - 1) * 12));
}

export function buildDashboardDeviceRows(jobs = []) {
  return (jobs || []).flatMap((job) => {
    const devices = getJobDeviceRows(job);
    const rows = devices.length ? devices : [{ model: job.device_model || '', serial_number: job.device_serial_number || '' }];
    return rows.map((device, index) => ({
      id: `${job.id || 'job'}::${index}`,
      job_id: job.id,
      client: job.client || job.title || 'Klient',
      phone: getPhone(job),
      city: job.city || '',
      street: job.street || '',
      installation_date: job.installation_date || '',
      model: device.model || job.device_model || '',
      serial_number: device.serial_number || job.device_serial_number || '',
      status: device.status || job.device_status || 'aktywne',
      service_due_date: job.service_due_date || dateKey(getServiceDueDate(job.installation_date, 1)),
      source_job: job,
    }));
  });
}

export function buildAdminDashboardStats({ jobs = [], contractors = [] } = {}) {
  const now = new Date();
  const today = dateKey(now);
  const weekStart = startOfWeekMonday(now);
  const weekEnd = endOfWeekSunday(now);
  const nowStart = startOfDay(now);
  const nowEnd = endOfDay(now);
  const deviceRows = buildDashboardDeviceRows(jobs);

  const jobsToday = (jobs || []).filter((job) => dateKey(toDate(job.installation_date)) === today);
  const jobsThisWeek = (jobs || []).filter((job) => {
    const date = toDate(job.installation_date);
    return date && date >= weekStart && date <= weekEnd;
  });
  const jobsWithoutInstaller = (jobs || []).filter((job) => {
    const viewers = Array.isArray(job.viewers) ? job.viewers : [];
    return !job.main_technician_id && viewers.length === 0;
  });
  const devicesMissingInstallDate = deviceRows.filter((device) => !device.installation_date);
  const devicesDueService = deviceRows.filter((device) => {
    const explicitDue = toDate(device.service_due_date);
    const calculatedDue = explicitDue || getServiceDueDate(device.installation_date, 1);
    if (!calculatedDue) return false;
    return calculatedDue <= nowEnd;
  });

  const contractorRows = contractors.length ? contractors : jobs.map((job) => ({
    id: job.contractor_id || job.id,
    company_name: job.client || job.title || '',
    phone: getPhone(job),
    city: job.city || '',
    street: job.street || '',
  }));
  const clientsWithoutPhone = contractorRows.filter((item) => !getPhone(item));
  const smsErrors = (jobs || []).filter((job) => {
    const status = String(job.last_sms_status || '').toLowerCase();
    return status.includes('error') || status.includes('błąd') || status.includes('blad') || Boolean(job.last_sms_error);
  });

  return {
    today,
    periodLabel: `${dateKey(weekStart)} – ${dateKey(weekEnd)}`,
    jobsToday,
    jobsThisWeek,
    smsDueToday: countSmsDueToday(jobs),
    devicesDueService,
    devicesMissingInstallDate,
    clientsWithoutPhone,
    jobsWithoutInstaller,
    smsErrors,
    totals: {
      jobs: jobs.length,
      devices: deviceRows.length,
      contractors: contractorRows.length,
    },
  };
}
