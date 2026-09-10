function padDatePart(value) {
  return String(value).padStart(2, '0');
}

export function formatLocalDateForInput(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

export function buildNewJobFormDefaults(emptyJobForm = {}, now = new Date()) {
  return {
    ...emptyJobForm,
    pending_nameplate_photos: [],
    existing_nameplate_photos: [],
    viewers: [],
    devices: (emptyJobForm.devices || []).map((device) => ({
      ...device,
      indoor_models: [...(device.indoor_models || [])],
      indoor_serial_numbers: [...(device.indoor_serial_numbers || [])],
    })),
    installation_date: formatLocalDateForInput(now),
  };
}
