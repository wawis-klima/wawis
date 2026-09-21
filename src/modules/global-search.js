function stripDiacritics(value) {
  return String(value || '')
    .replace(/[łŁ]/g, (character) => (character === 'Ł' ? 'L' : 'l'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeGlobalSearchValue(value) {
  return stripDiacritics(value)
    .toLocaleLowerCase('pl-PL')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchTokens(query) {
  return normalizeGlobalSearchValue(query).split(' ').filter(Boolean);
}

function matchesAllTokens(searchableValue, tokens) {
  if (!tokens.length) return false;
  const haystack = normalizeGlobalSearchValue(searchableValue);
  const compactHaystack = haystack.replace(/\s+/g, '');
  return tokens.every((token) => (
    haystack.includes(token)
    || (token.length >= 4 && compactHaystack.includes(token))
  ));
}

function compact(values = []) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function unique(values = []) {
  return [...new Set(compact(values))];
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pl-PL').format(date);
}

function getJobInstallerNames(job = {}, profileById = new Map()) {
  const ids = unique([
    job.main_technician_id,
    ...(Array.isArray(job.viewers) ? job.viewers.map((item) => item?.user_id) : []),
  ]);
  return ids.map((id) => profileById.get(String(id))).filter(Boolean);
}

function scoreResult({ title, searchable, query, type }) {
  const normalizedQuery = normalizeGlobalSearchValue(query);
  const normalizedTitle = normalizeGlobalSearchValue(title);
  const normalizedSearchable = normalizeGlobalSearchValue(searchable);
  let score = 0;

  if (normalizedTitle === normalizedQuery) score += 100;
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 65;
  else if (normalizedTitle.includes(normalizedQuery)) score += 40;

  if (normalizedSearchable.includes(normalizedQuery)) score += 25;
  if (type === 'job') score += 6;
  if (type === 'contractor') score += 4;
  return score;
}

function buildJobResult(job, profileById, query) {
  const installerNames = getJobInstallerNames(job, profileById);
  const address = compact([job.street, job.city]).join(', ') || job.location || '';
  const jobNumber = String(job.id || '').trim();
  const shortNumber = jobNumber ? jobNumber.slice(0, 8) : '';
  const title = job.client || job.title || 'Montaż bez nazwy klienta';
  const searchable = compact([
    title,
    job.title,
    job.client,
    job.email,
    job.phone,
    job.sms_recipient_phone,
    job.city,
    job.street,
    job.location,
    job.status,
    job.device_model,
    job.device_serial_number,
    jobNumber,
    shortNumber,
    ...installerNames,
  ]).join(' ');

  return {
    key: `job:${jobNumber}`,
    type: 'job',
    title,
    subtitle: compact([address, job.phone || job.sms_recipient_phone]).join(' • ') || 'Brak adresu i telefonu',
    meta: compact([
      shortNumber ? `Zlecenie #${shortNumber}` : '',
      formatDate(job.installation_date),
      installerNames.length ? installerNames.join(', ') : '',
    ]).join(' • '),
    badge: 'Montaż',
    searchable,
    score: scoreResult({ title, searchable, query, type: 'job' }),
    source: job,
  };
}

function getContractorAddresses(contractor = {}) {
  const source = Array.isArray(contractor.addresses) ? contractor.addresses : [];
  const addresses = source
    .map((address, index) => ({
      id: String(address?.id || '').trim() || `address-${index + 1}`,
      label: String(address?.label || '').trim(),
      city: String(address?.city || '').trim(),
      street: String(address?.street || '').trim(),
      notes: String(address?.notes || '').trim(),
      is_primary: Boolean(address?.is_primary),
    }))
    .filter((address) => address.city || address.street || address.label || address.notes);

  if (!addresses.length && (contractor.city || contractor.street)) {
    addresses.push({
      id: 'legacy-primary',
      label: 'Adres główny',
      city: String(contractor.city || '').trim(),
      street: String(contractor.street || '').trim(),
      notes: '',
      is_primary: true,
    });
  }

  if (addresses.length && !addresses.some((address) => address.is_primary)) {
    addresses[0] = { ...addresses[0], is_primary: true };
  }

  return addresses;
}

function buildContractorResult(contractor, query) {
  const title = contractor.company_name || contractor.contact_person || 'Kontrahent bez nazwy';
  const addresses = getContractorAddresses(contractor);
  const primaryAddress = addresses.find((address) => address.is_primary) || addresses[0] || {};
  const address = compact([primaryAddress.street, primaryAddress.city]).join(', ');
  const searchableAddresses = addresses.flatMap((item) => [
    item.label,
    item.city,
    item.street,
    item.notes,
  ]);
  const searchable = compact([
    contractor.id,
    contractor.company_name,
    contractor.contact_person,
    contractor.phone,
    contractor.email,
    contractor.city,
    contractor.street,
    contractor.nip,
    ...searchableAddresses,
  ]).join(' ');

  return {
    key: `contractor:${contractor.id || title}`,
    type: 'contractor',
    title,
    subtitle: compact([address, contractor.phone]).join(' • ') || contractor.email || 'Brak danych kontaktowych',
    meta: compact([
      contractor.contact_person,
      contractor.nip ? `NIP ${contractor.nip}` : '',
      addresses.length > 1 ? `${addresses.length} adresy` : '',
    ]).join(' • '),
    badge: 'Kontrahent',
    searchable,
    score: scoreResult({ title, searchable, query, type: 'contractor' }),
    source: contractor,
  };
}

function buildDeviceResult(device, query) {
  const title = device.model || 'Urządzenie bez modelu';
  const address = compact([device.contractor_street, device.contractor_city]).join(', ');
  const serialNumber = device.serial_number || device.outdoor_serial_number || device.indoor_serial_number || '';
  const searchable = compact([
    device.id,
    device.model,
    serialNumber,
    device.indoor_serial_numbers,
    device.outdoor_serial_number,
    device.contractor_name,
    device.contractor_phone,
    device.contractor_email,
    device.contractor_city,
    device.contractor_street,
    device.source_job_id,
  ]).flat().join(' ');

  return {
    key: `device:${device.id || `${title}:${serialNumber}`}`,
    type: 'device',
    title,
    subtitle: compact([serialNumber ? `SN: ${serialNumber}` : '', device.contractor_name]).join(' • ') || 'Brak numeru seryjnego i klienta',
    meta: compact([address, formatDate(device.installation_date)]).join(' • '),
    badge: 'Urządzenie',
    searchable,
    score: scoreResult({ title, searchable, query, type: 'device' }),
    source: device,
  };
}

export function buildGlobalSearchResults({
  jobs = [],
  contractors = [],
  devices = [],
  profiles = [],
  query = '',
  limit = 15,
} = {}) {
  const tokens = getSearchTokens(query);
  if (!tokens.length) return [];

  const profileById = new Map((profiles || []).map((profile) => [
    String(profile?.id || ''),
    profile?.full_name || profile?.name || profile?.email || '',
  ]));

  const candidates = [
    ...(jobs || []).map((job) => buildJobResult(job, profileById, query)),
    ...(contractors || []).map((contractor) => buildContractorResult(contractor, query)),
    ...(devices || []).map((device) => buildDeviceResult(device, query)),
  ];

  return candidates
    .filter((result) => matchesAllTokens(result.searchable, tokens))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.title.localeCompare(right.title, 'pl', { numeric: true, sensitivity: 'base' });
    })
    .slice(0, Math.max(1, Number(limit) || 15));
}
