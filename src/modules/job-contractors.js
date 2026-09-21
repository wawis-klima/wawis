function normalizeText(value) {
  return String(value || '').trim();
}

function getContractorAddresses(contractor = {}) {
  const addresses = Array.isArray(contractor?.addresses) ? contractor.addresses : [];
  const normalized = addresses
    .map((address, index) => ({
      id: normalizeText(address?.id) || `address-${index + 1}`,
      label: normalizeText(address?.label),
      city: normalizeText(address?.city),
      street: normalizeText(address?.street),
      notes: normalizeText(address?.notes),
      is_primary: address?.is_primary === true,
    }))
    .filter((address) => address.city || address.street);
  if (!normalized.length && (normalizeText(contractor?.city) || normalizeText(contractor?.street))) {
    normalized.push({ id: 'address-primary', label: 'Adres główny', city: normalizeText(contractor.city), street: normalizeText(contractor.street), notes: '', is_primary: true });
  }
  if (normalized.length && !normalized.some((address) => address.is_primary)) normalized[0].is_primary = true;
  return normalized;
}

function getPrimaryAddress(contractor = {}) {
  const addresses = getContractorAddresses(contractor);
  return addresses.find((address) => address.is_primary) || addresses[0] || null;
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeComparable(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl-PL');
}

function normalizeSearchToken(value) {
  return normalizeComparable(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildContractorSearchBlob(contractor = {}) {
  return [
    contractor.company_name,
    contractor.contact_person,
    contractor.phone,
    contractor.email,
    contractor.city,
    contractor.street,
    contractor.nip,
    ...getContractorAddresses(contractor).flatMap((address) => [address.label, address.city, address.street, address.notes]),
  ]
    .map((value) => normalizeSearchToken(value))
    .filter(Boolean)
    .join(' | ');
}

export function filterContractorsByQuery(contractors = [], query = '') {
  const normalizedQuery = normalizeSearchToken(query);
  if (!normalizedQuery) return [...contractors];

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return contractors.filter((contractor) => {
    const blob = buildContractorSearchBlob(contractor);
    const compactPhone = normalizePhone(contractor?.phone);
    return tokens.every((token) => {
      if (blob.includes(token)) return true;
      const compactToken = token.replace(/\D+/g, '');
      if (!compactToken) return false;
      return compactPhone.includes(compactToken);
    });
  });
}

export function getDuplicateContractorMatch({ contractors = [], contractorId = '', client = '' } = {}) {
  const normalizedClient = normalizeComparable(client);
  if (!normalizedClient) return null;

  return contractors.find((contractor) => {
    if (contractorId && String(contractor.id) === String(contractorId)) return false;
    return normalizeComparable(contractor.company_name) === normalizedClient;
  }) || null;
}

function isPersistedContractor(contractor = {}) {
  const id = normalizeText(contractor?.id);
  return Boolean(id && !id.startsWith('job-derived:') && !contractor?.is_job_fallback);
}

function buildContractorIdentityConflictReasons(candidate = {}, form = {}) {
  const reasons = [];
  const candidatePhone = normalizePhone(candidate?.phone);
  const formPhone = normalizePhone(form?.phone || form?.sms_recipient_phone);
  const candidateEmail = normalizeComparable(candidate?.email);
  const formEmail = normalizeComparable(form?.email);
  const candidateName = normalizeComparable(candidate?.company_name);
  const formName = normalizeComparable(form?.client || form?.company_name);

  if (candidatePhone && formPhone && candidatePhone === formPhone) reasons.push('telefon');
  if (candidateEmail && formEmail && candidateEmail === formEmail) reasons.push('email');
  if (candidateName && formName && candidateName === formName) reasons.push('nazwa');

  return reasons;
}

function scoreContractorIdentityConflict(reasons = []) {
  return reasons.reduce((score, reason) => {
    if (reason === 'telefon') return score + 8;
    if (reason === 'email') return score + 6;
    if (reason === 'nazwa') return score + 3;
    return score;
  }, 0);
}

export function findJobContractorIdentityConflict({
  contractors = [],
  contractorId = '',
  client = '',
  email = '',
  phone = '',
} = {}) {
  const normalizedContractorId = normalizeText(contractorId);
  const form = { client, email, phone };

  const matches = contractors
    .filter((contractor) => {
      if (!isPersistedContractor(contractor)) return false;
      if (normalizedContractorId && String(contractor.id) === normalizedContractorId) return false;
      return true;
    })
    .map((contractor) => {
      const reasons = buildContractorIdentityConflictReasons(contractor, form);
      return { contractor, reasons, score: scoreContractorIdentityConflict(reasons) };
    })
    .filter((item) => item.reasons.length > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.reasons.length !== left.reasons.length) return right.reasons.length - left.reasons.length;
      return String(left.contractor?.company_name || '').localeCompare(String(right.contractor?.company_name || ''), 'pl', { sensitivity: 'base', numeric: true });
    });

  return matches[0] || null;
}

export function getContractorIdentityConflictLabel(conflict = {}) {
  const reasons = Array.isArray(conflict?.reasons) ? conflict.reasons : [];
  if (!reasons.length) return 'dane klienta';
  return reasons.join(', ');
}


export function findAutoLinkedContractor({
  contractors = [],
  contractorId = '',
  client = '',
  email = '',
  phone = '',
  city = '',
  street = '',
} = {}) {
  const normalizedContractorId = normalizeText(contractorId);
  if (normalizedContractorId) {
    return contractors.find((contractor) => String(contractor?.id || '') === normalizedContractorId) || null;
  }

  const normalizedClient = normalizeComparable(client);
  if (!normalizedClient) return null;

  const exactNameMatches = contractors.filter((contractor) => normalizeComparable(contractor?.company_name) === normalizedClient);
  if (!exactNameMatches.length) return null;
  if (exactNameMatches.length === 1) return exactNameMatches[0];

  const normalizedEmail = normalizeComparable(email);
  const normalizedPhone = normalizePhone(phone);
  const normalizedCity = normalizeComparable(city);
  const normalizedStreet = normalizeComparable(street);

  const scored = exactNameMatches
    .map((contractor) => {
      let score = 0;
      const normalizedContractorEmail = normalizeComparable(contractor?.email);
      const normalizedContractorPhone = normalizePhone(contractor?.phone);
      const contractorAddresses = getContractorAddresses(contractor);
      const addressMatches = contractorAddresses.some((address) => (
        (!normalizedCity || normalizeComparable(address.city) === normalizedCity)
        && (!normalizedStreet || normalizeComparable(address.street) === normalizedStreet)
      ));

      if (normalizedEmail && normalizedContractorEmail === normalizedEmail) score += 4;
      if (normalizedPhone && normalizedContractorPhone === normalizedPhone) score += 4;
      if ((normalizedCity || normalizedStreet) && addressMatches) score += 4;

      return { contractor, score };
    })
    .sort((left, right) => right.score - left.score || String(left?.contractor?.company_name || '').localeCompare(String(right?.contractor?.company_name || ''), 'pl', { sensitivity: 'base', numeric: true }));

  if (!scored.length || scored[0].score <= 0) return null;
  if (scored[1] && scored[1].score === scored[0].score) return null;
  return scored[0].contractor || null;
}

export function applyAutoLinkedContractorToJobForm(form = {}, contractors = []) {
  const match = findAutoLinkedContractor({
    contractors,
    contractorId: form.contractor_id,
    client: form.client,
    email: form.email,
    phone: form.phone,
    city: form.city,
    street: form.street,
  });

  if (!match?.id) {
    return {
      form: { ...form },
      contractor: null,
      autoLinked: false,
    };
  }

  const primaryAddress = getPrimaryAddress(match);
  const nextForm = { ...form, contractor_id: match.id };
  if (!normalizeText(nextForm.email) && normalizeText(match.email)) nextForm.email = normalizeText(match.email);
  if (!normalizeText(nextForm.phone) && normalizeText(match.phone)) nextForm.phone = normalizeText(match.phone);
  if (!normalizeText(nextForm.city) && normalizeText(primaryAddress?.city || match.city)) nextForm.city = normalizeText(primaryAddress?.city || match.city);
  if (!normalizeText(nextForm.street) && normalizeText(primaryAddress?.street || match.street)) nextForm.street = normalizeText(primaryAddress?.street || match.street);
  if (!normalizeText(nextForm.contractor_address_id) && primaryAddress?.id) nextForm.contractor_address_id = primaryAddress.id;

  return {
    form: nextForm,
    contractor: match,
    autoLinked: normalizeText(form.contractor_id) !== normalizeText(match.id),
  };
}

export function buildContractorOptionLabel(contractor = {}) {
  const addresses = getContractorAddresses(contractor);
  const primaryAddress = getPrimaryAddress(contractor);
  const parts = [normalizeText(contractor.company_name)];
  if (primaryAddress?.street || primaryAddress?.city) parts.push([primaryAddress.street, primaryAddress.city].filter(Boolean).join(', '));
  if (addresses.length > 1) parts.push(`${addresses.length} adresy`);
  if (contractor.phone) parts.push(normalizeText(contractor.phone));
  if (contractor.nip) parts.push(`NIP: ${normalizeText(contractor.nip)}`);
  return parts.filter(Boolean).join(' • ');
}
