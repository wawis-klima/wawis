import { buildContractorPayload, isJobDerivedContractor, normalizeContractorRecord } from './contractors.js';

function isMissingCatalogRpc(error) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    message.includes('admin_get_contractors_catalog')
    || message.includes('schema cache')
    || message.includes('function public')
  );
}

function parseContractorsCatalog(data) {
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
    return data.items;
  }
  return Array.isArray(data) ? data : [];
}

export async function loadContractors({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) return [];

  // K21 / 11.78: katalog przychodzi jako jeden JSON snapshot z serwera.
  // Nie łączymy już wyniku RPC ograniczonego przez PostgREST z offsetowym SELECT-em
  // o innym porządku, więc kompletność nie zależy od magicznego limitu 1000.
  const { data, error } = await supabase.rpc('admin_get_contractors_catalog');
  if (!error) {
    return parseContractorsCatalog(data).map((item) => normalizeContractorRecord(item));
  }

  // Bezpieczna kompatybilność podczas krótkiego okna wdrożenia/rollbacku.
  // Po wdrożeniu migracji produkcja zawsze korzysta z powyższego snapshotu.
  if (!isMissingCatalogRpc(error)) throw error;

  const { data: legacyData, error: legacyError } = await supabase.rpc('admin_list_contractors');
  if (legacyError) throw legacyError;
  return (Array.isArray(legacyData) ? legacyData : []).map((item) => normalizeContractorRecord(item));
}

export async function saveContractor({ supabase, contractor, isAdmin }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!isAdmin) throw new Error('Tylko administrator może zapisywać kontrahentów.');

  const payload = buildContractorPayload(contractor);
  if (!payload.p_company_name) {
    throw new Error('Nazwa kontrahenta jest wymagana.');
  }

  const { data, error } = await supabase.rpc('admin_upsert_contractor', payload);
  if (error) throw error;

  return normalizeContractorRecord(data || contractor);
}

export async function removeContractor({ supabase, contractorId, isAdmin }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!isAdmin) throw new Error('Tylko administrator może usuwać kontrahentów.');
  if (!contractorId) throw new Error('Brak identyfikatora kontrahenta.');

  const { error } = await supabase.rpc('admin_delete_contractor', { p_id: contractorId });
  if (error) throw error;
  return true;
}


export async function removeJobFallbackContractor({ supabase, contractor, isAdmin }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!isAdmin) throw new Error('Tylko administrator może usuwać wpisy z katalogu kontrahentów.');

  const normalized = normalizeContractorRecord(contractor);
  if (!isJobDerivedContractor(normalized)) {
    throw new Error('Ten wpis nie jest kontrahentem utworzonym z montażu.');
  }

  const sourceJobIds = [...new Set((normalized.source_job_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!sourceJobIds.length) {
    throw new Error('Brak powiązanego zlecenia do usunięcia. Odśwież dane i spróbuj ponownie.');
  }

  // K6 / 11.74: kasowanie z katalogu Kontrahentów musi korzystać z tej samej
  // odzyskiwalnej ścieżki co kosz montaży. RPC najpierw archiwizuje kartę i
  // zależne rekordy w job_recycle_bin, a pliki Storage pozostają zachowane,
  // żeby przywrócenie karty było kompletne. Nie usuwamy plików przed DELETE.
  const { data, error } = await supabase.rpc('admin_delete_jobs_recoverable', {
    p_ids: sourceJobIds,
    p_only_unlinked: true,
  });
  if (error) throw error;

  const deletedJobIds = (data || []).map((item) => item?.id).filter(Boolean);
  if (!deletedJobIds.length) {
    throw new Error('Nie usunięto żadnego powiązanego zlecenia. Możliwe, że zlecenie zostało już przypięte do kontrahenta albo nie masz uprawnień.');
  }

  return {
    deletedJobs: deletedJobIds.length,
    deletedJobIds,
  };
}


function buildJobPayloadFromContractor(contractor = {}) {
  const normalized = normalizeContractorRecord(contractor);
  return {
    title: normalized.company_name || '',
    client: normalized.company_name || '',
    email: normalized.email || '',
    phone: normalized.phone || '',
    sms_recipient_phone: normalized.phone || null,
  };
}

function getRenameMatchCandidates(contractor = {}) {
  const normalized = normalizeContractorRecord(contractor);
  return ['email', 'phone', 'city', 'street']
    .map((field) => ({ field, value: normalized[field] }))
    .filter(({ value }) => value);
}

async function findUnlinkedJobIdsForContractor({ supabase, contractor, matchName }) {
  const normalized = normalizeContractorRecord(contractor);
  const clientName = String(matchName || normalized.company_name || '').trim();
  if (!clientName) return [];

  const ids = new Set();
  const seenQueries = new Set();
  const candidates = getRenameMatchCandidates(normalized);

  for (const { field, value } of candidates) {
    const queryKey = `${field}:${value}`;
    if (seenQueries.has(queryKey)) continue;
    seenQueries.add(queryKey);

    const { data, error } = await supabase
      .from('jobs')
      .select('id')
      .is('contractor_id', null)
      .eq('client', clientName)
      .eq(field, value);
    if (error) throw error;
    for (const item of data || []) {
      if (item?.id) ids.add(item.id);
    }
  }

  if (!ids.size) {
    const { data: namedJobs, error: namedJobsError } = await supabase
      .from('jobs')
      .select('id')
      .is('contractor_id', null)
      .eq('client', clientName)
      .limit(200);
    if (namedJobsError) throw namedJobsError;
    for (const item of namedJobs || []) {
      if (item?.id) ids.add(item.id);
    }
  }

  return [...ids];
}

async function findLegacyJobIdsForContractorRename({ supabase, previousContractor, contractor }) {
  const previous = normalizeContractorRecord(previousContractor);
  if (!previous.company_name) return [];
  return findUnlinkedJobIdsForContractor({ supabase, contractor, matchName: previous.company_name });
}

export async function syncContractorJobs({ supabase, contractor, previousContractor, isAdmin }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!isAdmin) throw new Error('Tylko administrator może synchronizować montaże kontrahenta.');

  const normalized = normalizeContractorRecord(contractor);
  if (!normalized.id) return { linkedJobsUpdated: 0, legacyJobsUpdated: 0 };

  const payload = buildJobPayloadFromContractor(normalized);

  const { data: linkedJobs, error: linkedError } = await supabase
    .from('jobs')
    .update(payload)
    .eq('contractor_id', normalized.id)
    .select('id');
  if (linkedError) throw linkedError;

  let legacyJobsUpdated = 0;
  const previous = normalizeContractorRecord(previousContractor);
  const nameChanged = previous.company_name && previous.company_name !== normalized.company_name;
  const legacyJobIds = nameChanged
    ? await findLegacyJobIdsForContractorRename({ supabase, previousContractor: previous, contractor: normalized })
    : previous.id
      ? []
      : await findUnlinkedJobIdsForContractor({ supabase, contractor: normalized, matchName: normalized.company_name });
  if (legacyJobIds.length) {
    const { data: legacyJobs, error: legacyError } = await supabase
        .from('jobs')
        .update({ ...payload, contractor_id: normalized.id })
        .in('id', legacyJobIds)
        .select('id');
    if (legacyError) throw legacyError;
    legacyJobsUpdated = (legacyJobs || []).length;
  }

  return {
    linkedJobsUpdated: (linkedJobs || []).length,
    legacyJobsUpdated,
  };
}
