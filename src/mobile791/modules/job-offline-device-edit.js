import { buildEditJobForm } from './jobs-form.js';

const NON_DEVICE_FIELDS = [
  'title', 'client', 'email', 'phone', 'nip', 'city', 'street', 'location',
  'contractor_id', 'contractor_address_id', 'contractor_address_label',
  'status', 'installation_date', 'admin_note', 'worker_comment',
  'main_technician_id', 'sms_consent', 'sms_reminder_enabled',
  'sms_recipient_phone', 'viewers', 'installers_confirmed',
];

function normalizeField(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).sort();
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : value;
}

export function isDeviceOnlyOfflineEdit({ form = {}, baseJob = {}, profiles = [], normalizeStatus = (status) => status || '', linkedContractor = null } = {}) {
  const baseline = {
    ...buildEditJobForm({ job: baseJob, profiles, normalizeStatus }),
    nip: linkedContractor?.nip || '',
  };
  return NON_DEVICE_FIELDS.every((field) => (
    JSON.stringify(normalizeField(form?.[field])) === JSON.stringify(normalizeField(baseline[field]))
  ));
}
