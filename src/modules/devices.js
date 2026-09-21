export const DEVICE_STATUS_OPTIONS = [
  { value: "aktywne", label: "Aktywne" },
  { value: "do_serwisu", label: "Do serwisu" },
  { value: "zdemontowane", label: "Zdemontowane" },
];

export const DEVICE_STATUS_LABELS = Object.fromEntries(DEVICE_STATUS_OPTIONS.map((item) => [item.value, item.label]));

export function getEmptyDeviceForm(overrides = {}) {
  return {
    id: '',
    contractor_id: '',
    model: '',
    serial_number: '',
    installation_date: '',
    status: 'aktywne',
    notes: '',
    contractor_name: '',
    contractor_city: '',
    contractor_phone: '',
    ...overrides,
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizeDeviceRecord(device = {}) {
  return getEmptyDeviceForm({
    id: normalizeText(device.id),
    contractor_id: normalizeText(device.contractor_id),
    model: normalizeText(device.model),
    serial_number: normalizeText(device.serial_number),
    installation_date: normalizeText(device.installation_date),
    status: normalizeText(device.status) || 'aktywne',
    notes: normalizeText(device.notes),
    contractor_name: normalizeText(device.contractor_name),
    contractor_city: normalizeText(device.contractor_city),
    contractor_phone: normalizeText(device.contractor_phone),
    created_at: device.created_at || null,
    updated_at: device.updated_at || null,
  });
}

export function buildDevicePayload(device = {}) {
  const normalized = normalizeDeviceRecord(device);
  return {
    p_id: normalized.id || null,
    p_contractor_id: normalized.contractor_id || null,
    p_model: normalized.model || '',
    p_serial_number: normalized.serial_number || '',
    p_installation_date: normalized.installation_date || null,
    p_status: normalized.status || 'aktywne',
    p_notes: normalized.notes || '',
  };
}

export function normalizeComparable(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pl-PL');
}

export function normalizeSerialNumber(value) {
  return normalizeText(value).replace(/\s+/g, '').toLocaleLowerCase('pl-PL');
}

export function findDeviceDuplicates(devices = [], device = {}) {
  const normalized = normalizeDeviceRecord(device);
  const targetSerial = normalizeSerialNumber(normalized.serial_number);
  if (!targetSerial) return [];
  return devices
    .map((item) => normalizeDeviceRecord(item))
    .filter((item) => item.id !== normalized.id)
    .filter((item) => normalizeSerialNumber(item.serial_number) === targetSerial)
    .slice(0, 5);
}

export function filterDevicesByQuery(devices = [], query = '') {
  const normalizedQuery = normalizeComparable(query);
  if (!normalizedQuery) return devices;
  return devices.filter((device) => [
    device.contractor_name,
    device.contractor_city,
    device.contractor_phone,
    device.model,
    device.serial_number,
    DEVICE_STATUS_LABELS[device.status] || device.status,
    device.notes,
  ].some((value) => normalizeComparable(value).includes(normalizedQuery)));
}
