const EMPTY_ADDRESS_ID = 'address-primary';
export const NEW_CONTRACTOR_ADDRESS_ID = '__new__';
export const CUSTOM_CONTRACTOR_ADDRESS_ID = '__custom__';

function createAddressId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `address-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

export function createEmptyContractorAddress(overrides = {}) {
  return {
    id: overrides.id || createAddressId(),
    label: overrides.label || 'Adres główny',
    city: overrides.city || '',
    street: overrides.street || '',
    notes: overrides.notes || '',
    is_primary: overrides.is_primary !== false,
  };
}

export function normalizeContractorAddresses(record = {}) {
  const source = Array.isArray(record?.addresses) ? record.addresses : [];
  const prepared = source
    .map((address, index) => ({
      id: normalizeText(address?.id) || `address-${index + 1}`,
      label: normalizeText(address?.label) || `Adres ${index + 1}`,
      city: normalizeText(address?.city),
      street: normalizeText(address?.street),
      notes: normalizeText(address?.notes),
      is_primary: address?.is_primary === true,
    }))
    .filter((address) => address.city || address.street);

  if (!prepared.length && (normalizeText(record?.city) || normalizeText(record?.street))) {
    prepared.push({
      id: EMPTY_ADDRESS_ID,
      label: 'Adres główny',
      city: normalizeText(record.city),
      street: normalizeText(record.street),
      notes: '',
      is_primary: true,
    });
  }

  if (!prepared.length) return [];

  const primaryIndex = Math.max(0, prepared.findIndex((address) => address.is_primary));
  return prepared.map((address, index) => ({
    ...address,
    label: address.label || (index === primaryIndex ? 'Adres główny' : `Adres ${index + 1}`),
    is_primary: index === primaryIndex,
  }));
}

export function getPrimaryContractorAddress(contractor = {}) {
  const addresses = normalizeContractorAddresses(contractor);
  return addresses.find((address) => address.is_primary) || addresses[0] || null;
}

export function findContractorAddressById(contractor = {}, addressId = '') {
  const normalizedId = normalizeText(addressId);
  if (!normalizedId) return null;
  return normalizeContractorAddresses(contractor).find((address) => String(address.id) === normalizedId) || null;
}

export function findContractorAddressBySnapshot(contractor = {}, city = '', street = '') {
  const normalizedCity = normalizeComparable(city);
  const normalizedStreet = normalizeComparable(street);
  if (!normalizedCity && !normalizedStreet) return null;
  return normalizeContractorAddresses(contractor).find((address) => (
    normalizeComparable(address.city) === normalizedCity
    && normalizeComparable(address.street) === normalizedStreet
  )) || null;
}

export function appendContractorAddress(contractor = {}, address = {}) {
  const addresses = normalizeContractorAddresses(contractor);
  const prepared = {
    id: normalizeText(address.id) || createAddressId(),
    label: normalizeText(address.label) || `Adres ${addresses.length + 1}`,
    city: normalizeText(address.city),
    street: normalizeText(address.street),
    notes: normalizeText(address.notes),
    is_primary: address.is_primary === true || addresses.length === 0,
  };
  if (!prepared.city || !prepared.street) return { contractor: normalizeContractorRecord(contractor), address: null };

  const existing = findContractorAddressBySnapshot({ addresses }, prepared.city, prepared.street);
  if (existing) return { contractor: normalizeContractorRecord(contractor), address: existing };

  const nextAddresses = prepared.is_primary
    ? addresses.map((item) => ({ ...item, is_primary: false }))
    : addresses;
  const normalizedContractor = normalizeContractorRecord({ ...contractor, addresses: [...nextAddresses, prepared] });
  return {
    contractor: normalizedContractor,
    address: normalizedContractor.addresses.find((item) => item.id === prepared.id) || prepared,
  };
}

export function getEmptyContractorForm() {
  const primaryAddress = createEmptyContractorAddress();
  return {
    id: null,
    company_name: '',
    contact_person: '',
    phone: '',
    email: '',
    city: '',
    street: '',
    addresses: [primaryAddress],
    notes: '',
    nip: '',
    is_active: true,
  };
}

export function normalizeContractorRecord(record = {}) {
  const addresses = normalizeContractorAddresses(record);
  const primaryAddress = addresses.find((address) => address.is_primary) || addresses[0] || null;
  return {
    id: record.id || null,
    company_name: normalizeText(record.company_name),
    contact_person: normalizeText(record.contact_person),
    phone: normalizeText(record.phone),
    email: normalizeText(record.email),
    city: primaryAddress?.city || normalizeText(record.city),
    street: primaryAddress?.street || normalizeText(record.street),
    addresses,
    notes: normalizeText(record.notes),
    nip: normalizeText(record.nip || record.tax_id),
    is_active: record.is_active !== false,
    is_job_fallback: Boolean(record.is_job_fallback),
    source_job_ids: Array.isArray(record.source_job_ids) ? record.source_job_ids : [],
    created_at: record.created_at || null,
    updated_at: record.updated_at || null,
  };
}

export function buildContractorPayload(contractor = {}) {
  const normalized = normalizeContractorRecord(contractor);
  const primaryAddress = getPrimaryContractorAddress(normalized);
  return {
    p_id: normalized.id || null,
    p_company_name: normalized.company_name,
    p_contact_person: normalized.contact_person || null,
    p_phone: normalized.phone || null,
    p_email: normalized.email || null,
    p_city: primaryAddress?.city || normalized.city || null,
    p_street: primaryAddress?.street || normalized.street || null,
    p_notes: normalized.notes || null,
    p_nip: normalized.nip || null,
    p_is_active: normalized.is_active,
    p_addresses: normalized.addresses,
  };
}

export function getContractorAddress(contractor = {}) {
  const primary = getPrimaryContractorAddress(contractor);
  if (!primary) return '';
  return [primary.street, primary.city].map((value) => normalizeText(value)).filter(Boolean).join(', ');
}

export function formatContractorAddress(address = {}) {
  return [normalizeText(address.street), normalizeText(address.city)].filter(Boolean).join(', ');
}

export function normalizeComparable(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pl-PL');
}

export function normalizeDigits(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

export const JOB_DERIVED_CONTRACTOR_ID_PREFIX = 'job-derived:';

export function isJobDerivedContractor(contractor = {}) {
  return Boolean(contractor?.is_job_fallback) || String(contractor?.id || '').startsWith(JOB_DERIVED_CONTRACTOR_ID_PREFIX);
}

function getContractorIdentityKey(value) {
  return normalizeComparable(value);
}

function getBestJobDate(job = {}) {
  return job.updated_at || job.created_at || job.installation_date || null;
}

function mergeJobFallbackContractor(target, job = {}) {
  const client = normalizeText(job.client || job.title);
  if (!client) return target;

  if (!target.company_name) target.company_name = client;
  if (!target.phone && normalizeText(job.phone || job.sms_recipient_phone)) target.phone = normalizeText(job.phone || job.sms_recipient_phone);
  if (!target.email && normalizeText(job.email)) target.email = normalizeText(job.email);
  if (!target.city && normalizeText(job.city)) target.city = normalizeText(job.city);
  if (!target.street && normalizeText(job.street)) target.street = normalizeText(job.street);
  if ((!target.addresses || !target.addresses.length) && (normalizeText(job.city) || normalizeText(job.street))) {
    target.addresses = [{
      id: `job-address-${job.id || target.source_job_ids.length + 1}`,
      label: 'Adres z montażu',
      city: normalizeText(job.city),
      street: normalizeText(job.street),
      notes: '',
      is_primary: true,
    }];
  }

  if (job.id && !target.source_job_ids.includes(job.id)) target.source_job_ids.push(job.id);

  const jobDate = getBestJobDate(job);
  if (jobDate && (!target.updated_at || new Date(jobDate).getTime() > new Date(target.updated_at || 0).getTime())) {
    target.updated_at = jobDate;
  }
  if (!target.created_at && job.created_at) target.created_at = job.created_at;

  return target;
}

export function buildContractorsWithJobFallback(contractors = [], jobs = []) {
  const normalizedContractors = (contractors || []).map((item) => normalizeContractorRecord(item));
  const existingIds = new Set(normalizedContractors.map((item) => String(item.id || '')).filter(Boolean));
  const existingNames = new Set(normalizedContractors.map((item) => getContractorIdentityKey(item.company_name)).filter(Boolean));
  const fallbackByName = new Map();

  for (const job of jobs || []) {
    const client = normalizeText(job?.client || job?.title);
    if (!client) continue;

    const jobContractorId = String(job?.contractor_id || '').trim();
    if (jobContractorId && existingIds.has(jobContractorId)) continue;

    const nameKey = getContractorIdentityKey(client);
    if (!nameKey || existingNames.has(nameKey)) continue;

    if (!fallbackByName.has(nameKey)) {
      fallbackByName.set(nameKey, {
        id: `${JOB_DERIVED_CONTRACTOR_ID_PREFIX}${nameKey}`,
        company_name: client,
        contact_person: '',
        phone: '',
        email: '',
        city: '',
        street: '',
        addresses: [],
        notes: 'Wpis widoczny z montaży. Utwórz kontrahenta, aby zapisać go na stałe w bazie.',
        nip: '',
        is_active: true,
        is_job_fallback: true,
        source_job_ids: [],
        created_at: job?.created_at || null,
        updated_at: getBestJobDate(job),
      });
    }

    mergeJobFallbackContractor(fallbackByName.get(nameKey), job);
  }

  return [
    ...normalizedContractors,
    ...Array.from(fallbackByName.values()).map((item) => normalizeContractorRecord(item)),
  ];
}

function buildContractorDuplicateReasons(candidate = {}, form = {}) {
  const reasons = [];
  if (normalizeComparable(candidate.company_name) && normalizeComparable(candidate.company_name) === normalizeComparable(form.company_name)) reasons.push('nazwa');
  if (normalizeDigits(candidate.phone) && normalizeDigits(candidate.phone) === normalizeDigits(form.phone)) reasons.push('telefon');
  if (normalizeComparable(candidate.email) && normalizeComparable(candidate.email) === normalizeComparable(form.email)) reasons.push('email');
  if (normalizeDigits(candidate.nip) && normalizeDigits(candidate.nip) === normalizeDigits(form.nip)) reasons.push('NIP');
  return reasons;
}

export function findContractorDuplicates(contractors = [], contractor = {}) {
  const normalizedForm = normalizeContractorRecord(contractor);
  return contractors
    .filter((item) => {
      if (!item) return false;
      if (normalizedForm.id && String(item.id) === String(normalizedForm.id)) return false;
      return buildContractorDuplicateReasons(item, normalizedForm).length > 0;
    })
    .map((item) => ({ contractor: normalizeContractorRecord(item), reasons: buildContractorDuplicateReasons(item, normalizedForm) }))
    .sort((left, right) => right.reasons.length - left.reasons.length || String(left.contractor.company_name || '').localeCompare(String(right.contractor.company_name || ''), 'pl', { sensitivity: 'base', numeric: true }))
    .slice(0, 3);
}

function buildImportDuplicateReasons(candidate = {}, form = {}) {
  const hardReasons = buildContractorDuplicateReasons(candidate, form);
  return { hardReasons };
}

export function analyzeContractorImportRows(existingContractors = [], importedRows = []) {
  const normalizedExisting = existingContractors.map((item) => normalizeContractorRecord(item));
  const preparedRows = importedRows.map((row, index) => ({ rowNumber: index + 2, record: normalizeContractorRecord(row) }));

  const accepted = [];
  const duplicateGroups = [];
  const invalidRows = [];
  const seenAccepted = [];

  for (const entry of preparedRows) {
    const record = entry.record;
    if (!record.company_name) {
      invalidRows.push({ ...entry, reason: 'Brak nazwy kontrahenta' });
      continue;
    }

    const fileConflict = seenAccepted.find((candidate) => buildImportDuplicateReasons(candidate.record, record).hardReasons.length > 0);
    const existingConflict = normalizedExisting.find((candidate) => buildImportDuplicateReasons(candidate, record).hardReasons.length > 0);
    const matchedExisting = normalizedExisting.filter((candidate) => buildImportDuplicateReasons(candidate, record).hardReasons.length > 0).slice(0, 3);
    const matchReasons = fileConflict
      ? buildImportDuplicateReasons(fileConflict.record, record)
      : existingConflict
        ? buildImportDuplicateReasons(existingConflict, record)
        : null;

    if (fileConflict || existingConflict) {
      duplicateGroups.push({
        ...entry,
        duplicateType: 'hard',
        reasons: [...(matchReasons?.hardReasons || [])],
        matchedExisting: matchedExisting.map((candidate) => normalizeContractorRecord(candidate)),
        matchedImportRow: fileConflict ? fileConflict.rowNumber : null,
      });
      continue;
    }

    accepted.push(entry);
    seenAccepted.push(entry);
  }

  return {
    accepted,
    duplicates: duplicateGroups,
    invalidRows,
    summary: { total: preparedRows.length, accepted: accepted.length, duplicates: duplicateGroups.length, invalid: invalidRows.length },
  };
}
