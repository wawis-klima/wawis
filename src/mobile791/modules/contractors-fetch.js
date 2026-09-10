import { buildContractorPayload, isJobDerivedContractor, normalizeContractorRecord } from './contractors.js';

export async function loadContractors({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) return [];

  const pageSize = 1000;
  const collected = [];

  const { data, error } = await supabase.rpc('admin_list_contractors');
  if (error) throw error;

  const firstBatch = Array.isArray(data) ? data : [];
  collected.push(...firstBatch);

  if (firstBatch.length === pageSize && typeof supabase.from === 'function') {
    let from = pageSize;
    while (true) {
      const { data: extraData, error: extraError } = await supabase
        .from('contractors')
        .select('*')
        .order('company_name', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (extraError) throw extraError;

      const batch = Array.isArray(extraData) ? extraData : [];
      collected.push(...batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }
  }

  return collected.map((item) => normalizeContractorRecord(item));
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


function collectJobPhotoStoragePaths(jobs = [], jobIds = []) {
  const idSet = new Set(jobIds.map((id) => String(id)));
  return (jobs || [])
    .filter((job) => idSet.has(String(job?.id || '')))
    .flatMap((job) => Array.isArray(job?.photos) ? job.photos : [])
    .map((photo) => photo?.storage_path)
    .filter(Boolean);
}

export async function removeJobFallbackContractor({ supabase, contractor, jobs = [], isAdmin }) {
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

  const photoPaths = collectJobPhotoStoragePaths(jobs, sourceJobIds);
  if (photoPaths.length && supabase.storage?.from) {
    const { error: storageError } = await supabase.storage.from('job-photos').remove(photoPaths);
    if (storageError) throw storageError;
  }

  const { data, error } = await supabase
    .from('jobs')
    .delete()
    .in('id', sourceJobIds)
    .is('contractor_id', null)
    .select('id');
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
