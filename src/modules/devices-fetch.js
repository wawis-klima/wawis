import { formatDeviceSerialNumber, getDeviceIndoorSerials, getJobDeviceRows, parseDeviceSerialLine, serializeJobDevicesToFields } from './job-devices.js';

const DEVICE_STATUSES = ['aktywne', 'do_serwisu', 'zdemontowane'];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeDeviceStatus(value) {
  const normalized = normalizeText(value).toLocaleLowerCase('pl-PL');
  if (DEVICE_STATUSES.includes(normalized)) return normalized;
  return 'aktywne';
}

export function createEmptyDeviceForm(contractorId = '') {
  return {
    id: '',
    contractor_id: contractorId || '',
    contractor_name: '',
    contractor_city: '',
    contractor_phone: '',
    contractor_email: '',
    contractor_street: '',
    model: '',
    serial_number: '',
    indoor_serial_number: '',
    indoor_serial_numbers: [],
    outdoor_serial_number: '',
    legacy_serial_number: '',
    installation_date: '',
    status: 'aktywne',
    notes: '',
    source_job_id: '',
    source_kind: 'manual',
    created_at: '',
    updated_at: '',
    service_reminder_years: 5,
  };
}

export function normalizeDeviceRecord(device = {}) {
  const parsedSerial = parseDeviceSerialLine(device.serial_number || device.device_serial_number || '');
  const indoorSerials = getDeviceIndoorSerials({
    ...device,
    indoor_serial_numbers: Array.isArray(device.indoor_serial_numbers) ? device.indoor_serial_numbers : parsedSerial.indoor_serial_numbers,
  });
  const outdoorSerial = normalizeText(device.outdoor_serial_number || parsedSerial.outdoor_serial_number);
  const legacySerial = normalizeText(device.legacy_serial_number || ((indoorSerials.length || outdoorSerial) ? '' : parsedSerial.legacy_serial_number));
  const formattedSerial = formatDeviceSerialNumber({ indoor_serial_numbers: indoorSerials, outdoor_serial_number: outdoorSerial });

  return {
    ...createEmptyDeviceForm(device.contractor_id || ''),
    service_reminder_years: Number.parseInt(String(device.service_reminder_years || ''), 10) || 5,
    id: device.id || '',
    contractor_id: device.contractor_id || '',
    contractor_name: normalizeText(device.contractor_name),
    contractor_city: normalizeText(device.contractor_city),
    contractor_phone: normalizeText(device.contractor_phone),
    contractor_email: normalizeText(device.contractor_email),
    contractor_street: normalizeText(device.contractor_street),
    model: normalizeText(device.model),
    serial_number: formattedSerial || legacySerial || parsedSerial.serial_number || '',
    indoor_serial_number: indoorSerials[0] || '',
    indoor_serial_numbers: indoorSerials,
    outdoor_serial_number: outdoorSerial,
    legacy_serial_number: formattedSerial ? '' : legacySerial,
    installation_date: normalizeText(device.installation_date),
    status: normalizeDeviceStatus(device.status),
    notes: normalizeText(device.notes),
    source_job_id: normalizeText(device.source_job_id),
    source_kind: normalizeText(device.source_kind) || 'manual',
    created_at: device.created_at || '',
    updated_at: device.updated_at || '',
  };
}

function buildJobsDeviceLookup(jobs = []) {
  const lookup = new Map();

  for (const job of jobs || []) {
    const jobId = normalizeText(job?.id);
    if (!jobId) continue;

    lookup.set(jobId, {
      contractor_id: normalizeText(job?.contractor_id),
      contractor_name: normalizeText(job?.client || job?.contractor_name || job?.title),
      contractor_city: normalizeText(job?.city),
      contractor_phone: normalizeText(job?.phone || job?.sms_recipient_phone),
      contractor_email: normalizeText(job?.email),
      contractor_street: normalizeText(job?.street),
    });
  }

  return lookup;
}

export function mergeDeviceWithJobFallback(device = {}, jobsOrLookup = []) {
  const normalized = normalizeDeviceRecord(device);
  const lookup = jobsOrLookup instanceof Map ? jobsOrLookup : buildJobsDeviceLookup(jobsOrLookup);
  const sourceJobId = normalizeText(normalized.source_job_id || normalized.id);
  const baseSourceJobId = sourceJobId.replace(/::device-\d+$/, '');
  const linkedJob = baseSourceJobId ? lookup.get(baseSourceJobId) : null;

  if (!linkedJob) return normalized;

  return normalizeDeviceRecord({
    ...normalized,
    contractor_id: normalized.contractor_id || linkedJob.contractor_id,
    contractor_name: normalized.contractor_name || linkedJob.contractor_name,
    contractor_city: normalized.contractor_city || linkedJob.contractor_city,
    contractor_phone: normalized.contractor_phone || linkedJob.contractor_phone,
    contractor_email: normalized.contractor_email || linkedJob.contractor_email,
    contractor_street: normalized.contractor_street || linkedJob.contractor_street,
  });
}

function enrichDevicesWithJobFallback(devices = [], jobs = []) {
  const lookup = buildJobsDeviceLookup(jobs);
  return (devices || []).map((device) => mergeDeviceWithJobFallback(device, lookup));
}

export function buildFallbackDevicesFromJobs(jobs = []) {
  return enrichDevicesWithJobFallback(
    (jobs || [])
      .flatMap((job) => {
        const devices = getJobDeviceRows(job);
        return devices.map((device, index) => normalizeDeviceRecord({
          id: index === 0 ? job.id : `${job.id}::device-${index + 1}`,
          contractor_id: job.contractor_id || '',
          contractor_name: job.client || 'Bez przypisanego klienta',
          contractor_city: job.city || '',
          contractor_phone: job.phone || job.sms_recipient_phone || '',
          contractor_email: job.email || '',
          contractor_street: job.street || '',
          model: device.model || '',
          serial_number: device.serial_number || '',
          indoor_serial_number: device.indoor_serial_number || '',
          indoor_serial_numbers: getDeviceIndoorSerials(device),
          outdoor_serial_number: device.outdoor_serial_number || '',
          legacy_serial_number: device.legacy_serial_number || '',
          installation_date: job.installation_date || '',
          status: 'aktywne',
          source_job_id: index === 0 ? job.id : `${job.id}::device-${index + 1}`,
          source_kind: 'job_fallback',
          created_at: job.created_at || '',
          updated_at: job.created_at || '',
        }));
      }),
    jobs,
  ).sort((left, right) => {
    const leftDate = new Date(left.installation_date || left.created_at || 0).getTime();
    const rightDate = new Date(right.installation_date || right.created_at || 0).getTime();
    return rightDate - leftDate;
  });
}

function shouldFallback(error) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    message.includes('admin_list_devices_with_contractor')
    || message.includes('admin_get_contractor_devices')
    || message.includes('admin_upsert_device')
    || message.includes('schema cache')
    || message.includes('function public')
    || message.includes('relation "public.devices" does not exist')
    || message.includes('column')
  );
}

export async function syncDevicesFromJobs({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) return { synced: false, reason: 'no-access' };
  const { data, error } = await supabase.rpc('admin_sync_devices_from_jobs');
  if (error) {
    if (shouldFallback(error)) {
      return { synced: false, reason: 'missing-rpc', error };
    }
    throw error;
  }
  return { synced: true, data: data || null };
}

export async function fetchAdminDevices({ supabase, isAdmin, jobs = [], trySync = true }) {
  const fallbackDevices = buildFallbackDevicesFromJobs(jobs);
  if (!supabase || !isAdmin) {
    return { devices: fallbackDevices, source: 'fallback', staleReason: 'Brak dostępu administratora.' };
  }

  if (trySync) {
    try {
      await syncDevicesFromJobs({ supabase, isAdmin });
    } catch (error) {
      console.warn('Synchronizacja urządzeń z montaży nie powiodła się przed odczytem listy.', error?.message || error);
    }
  }

  const { data, error } = await supabase.rpc('admin_list_devices_with_contractor');
  if (error) {
    if (shouldFallback(error)) {
      return {
        devices: fallbackDevices,
        source: 'fallback',
        staleReason: 'Baza urządzeń nie została jeszcze wdrożona w Supabase. Panel pokazuje dane z montaży jako bezpieczny fallback.',
        error,
      };
    }
    throw error;
  }

  return {
    devices: enrichDevicesWithJobFallback((Array.isArray(data) ? data : []).map((item) => normalizeDeviceRecord(item)), jobs),
    source: 'devices-rpc',
    staleReason: '',
  };
}

export async function fetchContractorDevices({ supabase, contractorId, isAdmin, jobs = [] }) {
  const fallbackDevices = buildFallbackDevicesFromJobs(jobs)
    .filter((device) => String(device.contractor_id || '') === String(contractorId || ''));

  if (!supabase || !isAdmin || !contractorId) return fallbackDevices;

  const { data, error } = await supabase.rpc('admin_get_contractor_devices', { p_contractor_id: contractorId });
  if (error) {
    if (shouldFallback(error)) return fallbackDevices;
    throw error;
  }

  return enrichDevicesWithJobFallback((Array.isArray(data) ? data : []).map((item) => normalizeDeviceRecord(item)), jobs);
}

export async function updateDeviceStatus({ supabase, deviceId, status, isAdmin }) {
  if (!supabase || !isAdmin) throw new Error('Tylko administrator może zmieniać status urządzenia.');
  if (!deviceId) throw new Error('Brak identyfikatora urządzenia.');
  const nextStatus = normalizeDeviceStatus(status);

  const { data, error } = await supabase.rpc('admin_update_device_status', {
    p_id: deviceId,
    p_status: nextStatus,
  });
  if (error) throw error;
  return normalizeDeviceRecord(data || { id: deviceId, status: nextStatus });
}

export async function upsertDevice({ supabase, device, isAdmin }) {
  if (!supabase || !isAdmin) throw new Error('Tylko administrator może zapisywać urządzenia.');
  const normalized = normalizeDeviceRecord(device);

  const payload = {
    p_id: normalized.id || null,
    p_contractor_id: normalized.contractor_id || null,
    p_model: normalized.model || '',
    p_serial_number: formatDeviceSerialNumber(normalized) || normalized.legacy_serial_number || normalized.serial_number || '',
    p_installation_date: normalized.installation_date || null,
    p_status: normalizeDeviceStatus(normalized.status),
    p_notes: normalized.notes || '',
    p_source_job_id: normalized.source_job_id || null,
    p_source_kind: normalized.source_kind || 'manual',
  };

  const { data, error } = await supabase.rpc('admin_upsert_device', payload);
  if (error) throw error;
  return normalizeDeviceRecord(data || normalized);
}

async function fetchContractorSnapshot({ supabase, contractorId }) {
  const normalizedContractorId = String(contractorId || '').trim();
  if (!normalizedContractorId) return null;

  const { data, error } = await supabase
    .from('contractors')
    .select('id, company_name, email, phone, city, street')
    .eq('id', normalizedContractorId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function buildJobPayloadFromDevice({ device, contractor }) {
  const city = String(contractor?.city || '').trim();
  const street = String(contractor?.street || '').trim();
  const location = [city, street].filter(Boolean).join(', ');

  return {
    contractor_id: contractor?.id || device.contractor_id || null,
    client: contractor?.company_name || null,
    title: contractor?.company_name || null,
    email: contractor?.email || null,
    phone: contractor?.phone || null,
    city: city || null,
    street: street || null,
    location: location || null,
    sms_recipient_phone: contractor?.phone || null,
    device_model: device.model || null,
    device_serial_number: formatDeviceSerialNumber(device) || device.legacy_serial_number || device.serial_number || null,
    installation_date: device.installation_date || null,
  };
}

function getSourceJobIdentity(device = {}) {
  return normalizeText(device.source_job_id || device.id);
}

function getSourceJobBaseId(device = {}) {
  return getSourceJobIdentity(device).replace(/::device-\d+$/, '');
}

function getFallbackJobDeviceIndex(device = {}) {
  const match = getSourceJobIdentity(device).match(/::device-(\d+)$/);
  if (!match) return 0;
  return Math.max(Number.parseInt(match[1], 10) - 1, 0);
}

async function fetchJobDeviceSnapshot({ supabase, sourceJobId }) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, device_model, device_serial_number')
    .eq('id', sourceJobId)
    .maybeSingle();
  if (error) throw error;
  return data || { id: sourceJobId, device_model: '', device_serial_number: '' };
}

function patchJobDeviceRows({ job, device, remove = false }) {
  const index = getFallbackJobDeviceIndex(device);
  const rows = getJobDeviceRows(job);

  while (rows.length <= index) {
    rows.push({ model: '', serial_number: '', indoor_serial_number: '', indoor_serial_numbers: [''], outdoor_serial_number: '', legacy_serial_number: '' });
  }

  if (remove) {
    rows.splice(index, 1);
  } else {
    rows[index] = {
      model: device.model || '',
      serial_number: formatDeviceSerialNumber(device) || device.legacy_serial_number || device.serial_number || '',
      indoor_serial_number: device.indoor_serial_number || '',
      indoor_serial_numbers: getDeviceIndoorSerials(device),
      outdoor_serial_number: device.outdoor_serial_number || '',
      legacy_serial_number: device.legacy_serial_number || '',
    };
  }

  return serializeJobDevicesToFields({ devices: rows });
}

export async function updateFallbackJobDevice({ supabase, device, isAdmin }) {
  if (!supabase || !isAdmin) throw new Error('Tylko administrator może edytować urządzenia z montaży.');
  const normalized = normalizeDeviceRecord(device);
  const sourceJobId = getSourceJobBaseId(normalized);
  if (!sourceJobId) throw new Error('Brak źródłowego montażu do aktualizacji urządzenia.');

  const contractor = normalized.contractor_id
    ? await fetchContractorSnapshot({ supabase, contractorId: normalized.contractor_id })
    : null;

  const existingJob = await fetchJobDeviceSnapshot({ supabase, sourceJobId });
  const deviceFields = patchJobDeviceRows({ job: existingJob, device: normalized });
  const payload = {
    ...buildJobPayloadFromDevice({
      device: normalized,
      contractor,
    }),
    device_model: deviceFields.device_model || null,
    device_serial_number: deviceFields.device_serial_number || null,
  };

  const { error } = await supabase.from('jobs').update(payload).eq('id', sourceJobId);
  if (error) throw error;
  return normalizeDeviceRecord({
    ...normalized,
    contractor_name: contractor?.company_name || normalized.contractor_name,
    contractor_city: contractor?.city || normalized.contractor_city,
    contractor_phone: contractor?.phone || normalized.contractor_phone,
    contractor_email: contractor?.email || normalized.contractor_email,
    contractor_street: contractor?.street || normalized.contractor_street,
  });
}

export async function clearFallbackJobDevice({ supabase, device, isAdmin }) {
  if (!supabase || !isAdmin) throw new Error('Tylko administrator może usuwać urządzenia z montaży.');
  const normalized = normalizeDeviceRecord(device);
  const sourceJobId = getSourceJobBaseId(normalized);
  if (!sourceJobId) throw new Error('Brak źródłowego montażu do usunięcia urządzenia.');

  const existingJob = await fetchJobDeviceSnapshot({ supabase, sourceJobId });
  const deviceFields = patchJobDeviceRows({ job: existingJob, device: normalized, remove: true });

  const { error } = await supabase
    .from('jobs')
    .update({
      device_model: deviceFields.device_model || null,
      device_serial_number: deviceFields.device_serial_number || null,
    })
    .eq('id', sourceJobId);

  if (error) throw error;
  return true;
}

export async function deleteDeviceRecord({ supabase, device, isAdmin }) {
  if (!supabase || !isAdmin) throw new Error('Tylko administrator może usuwać urządzenia.');
  const normalized = normalizeDeviceRecord(device);
  const sourceJobId = normalizeText(normalized.source_job_id);
  const isFallbackDevice = normalized.source_kind === 'job_fallback';
  const isLinkedJobDevice = Boolean(sourceJobId) && ['job', 'job_fallback'].includes(normalized.source_kind);

  if (isFallbackDevice) {
    return clearFallbackJobDevice({ supabase, device: normalized, isAdmin });
  }

  if (isLinkedJobDevice) {
    await clearFallbackJobDevice({ supabase, device: normalized, isAdmin });
  }

  if (!normalized.id) throw new Error('Brak identyfikatora urządzenia do usunięcia.');

  const { error } = await supabase.rpc('admin_delete_device', { p_id: normalized.id });
  if (error) {
    if (isLinkedJobDevice && shouldFallback(error)) {
      return true;
    }
    throw error;
  }

  return true;
}

export async function saveDeviceRecord({ supabase, device, isAdmin }) {
  const normalized = normalizeDeviceRecord(device);
  const looksLikeJobFallback = normalized.source_kind === 'job_fallback';
  const isSyncedJobDevice = normalized.source_kind === 'job' && String(normalized.source_job_id || '').trim();

  if (looksLikeJobFallback) {
    return updateFallbackJobDevice({ supabase, device: normalized, isAdmin });
  }

  if (isSyncedJobDevice) {
    await updateFallbackJobDevice({ supabase, device: normalized, isAdmin });
    try {
      return await upsertDevice({ supabase, device: normalized, isAdmin });
    } catch (error) {
      if (shouldFallback(error)) {
        return normalized;
      }
      throw error;
    }
  }

  try {
    return await upsertDevice({ supabase, device: normalized, isAdmin });
  } catch (error) {
    if ((looksLikeJobFallback || normalized.source_job_id) && shouldFallback(error)) {
      return updateFallbackJobDevice({ supabase, device: normalized, isAdmin });
    }
    throw error;
  }
}

export { DEVICE_STATUSES, normalizeDeviceStatus, shouldFallback };


export async function fetchDeviceSmsHistory({ supabase, device, isAdmin }) {
  if (!supabase || !isAdmin || !device?.id) return [];

  const payload = {
    p_device_id: String(device.id || '').trim() || null,
    p_source_job_id: /^[0-9a-f-]{36}$/i.test(String(device.source_job_id || '').trim())
      ? String(device.source_job_id || '').trim()
      : null,
  };

  const { data, error } = await supabase.rpc('admin_get_device_sms_history', payload);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
