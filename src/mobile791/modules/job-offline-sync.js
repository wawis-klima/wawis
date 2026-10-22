import { addJobComment } from './jobs-comments.js';
import { loadJobNameplatePhotosData } from './jobs-fetch.js';
import { getJobNameplateCompletion } from './nameplate-requirements.js';
import { isTransientSupabaseError } from './supabase-errors.js';
import { syncIntentPhotos } from './nameplate-device-intent.js';
import { photoBytesDigest, readPhotoBytes } from './photo-bytes.js';
import { listPhotoQueueItems } from './photo-offline-queue.js';
import {
  deleteOfflineJobOperation,
  claimOfflineJobOperation,
  listOfflineJobOperations,
  recoverStaleOfflineJobOperations,
  updateOfflineJobOperation,
  offlineOperationGuard,
} from './job-offline-store.js';

const activeSyncPromises = new Map();
const OPERATION_LEASE_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

export class OfflineConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'OfflineConflictError';
    this.code = 'OFFLINE_CONFLICT';
    this.serverState = details?.serverState || null;
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function sameDeviceFields(left = {}, right = {}) {
  return normalizeText(left.device_model) === normalizeText(right.device_model)
    && normalizeText(left.device_serial_number) === normalizeText(right.device_serial_number);
}

async function readJobForConflictCheck(supabase, jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, device_model, device_serial_number')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OfflineConflictError('Montażu nie ma już w systemie. Lokalna zmiana nie została wysłana.');
  return data;
}

async function syncDeviceOperation({ supabase, operation, profile, isSessionCurrent = () => true, ...options }) {
  const requireSession = () => {
    if (!isSessionCurrent()) { const error = new Error('Sesja synchronizacji zmieniła się.'); error.code = 'OFFLINE_SESSION_CHANGED'; throw error; }
  };
  requireSession();
  if (operation.payload?.documentation?.length) {
    await syncIntentPhotos({ ...options, supabase, operation, profile, isSessionCurrent });
    requireSession();
  }
  const requiredPaths = [...new Set((operation.payload?.required_nameplate_paths || [])
    .map((value) => String(value || '').trim()).filter(Boolean))];
  // Legacy intents may predate required_nameplate_paths. Pending photos belonging
  // to this owner/job still block the device, even without an explicit path list.
  const queue = await listPhotoQueueItems({ strict: true });
  if (queue.some(photo => String(photo.user_id || photo.uploaded_by) === String(operation.user_id)
    && String(photo.job_id) === String(operation.job_id) && photo.photo_kind === 'nameplate')) {
    const error = new Error('Zapis urządzeń czeka na potwierdzenie zdjęć.');
    error.code = 'OFFLINE_DEPENDENCY_WAITING'; throw error;
  }
  if (requiredPaths.length) {
    const outstanding = queue.some(photo =>
      String(photo.user_id || photo.uploaded_by) === String(operation.user_id)
      && requiredPaths.includes(photo.planned_storage_path));
    const verification = await loadJobNameplatePhotosData({ supabase, jobId: operation.job_id });
    const savedPaths = new Set((verification.photos || []).map((photo) => String(photo?.storage_path || '').trim()).filter(Boolean));
    if (outstanding || requiredPaths.some((path) => !savedPaths.has(path))) {
      const error = new Error('Zapis urządzeń czeka, aż zdjęcia tabliczek zostaną wysłane i potwierdzone.');
      error.code = 'OFFLINE_DEPENDENCY_WAITING';
      throw error;
    }
    for (const path of requiredPaths) {
      requireSession();
      const { data, error } = await supabase.storage.from('job-photos')
        .download(path, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
      if (error) throw error;
      const bytes = await readPhotoBytes(data);
      const document = operation.payload?.documentation?.find(doc => doc.uploadIdentity?.plannedStoragePath === path);
      if (document && await photoBytesDigest(bytes) !== document.sha256) {
        const error = new Error('Zdjęcie na serwerze ma inną zawartość. Zachowano zmianę lokalną.');
        error.code = 'PHOTO_REMOTE_INTEGRITY_FAILED'; throw error;
      }
    }
  }
  requireSession();
  const current = await readJobForConflictCheck(supabase, operation.job_id);
  const desired = operation.payload?.device_fields || {};
  if (sameDeviceFields(current, desired)) return;
  if (!sameDeviceFields(current, operation.base || {})) {
    throw new OfflineConflictError('Dane urządzenia zostały w międzyczasie zmienione w systemie. Niczego nie nadpisano.');
  }

  let updateQuery = supabase
    .from('jobs')
    .update({
      device_model: desired.device_model || null,
      device_serial_number: desired.device_serial_number || null,
    })
    .eq('id', operation.job_id);
  updateQuery = current.device_model == null
    ? updateQuery.is('device_model', null)
    : updateQuery.eq('device_model', current.device_model);
  updateQuery = current.device_serial_number == null
    ? updateQuery.is('device_serial_number', null)
    : updateQuery.eq('device_serial_number', current.device_serial_number);
  const { data, error } = await updateQuery.select('id').maybeSingle();
  if (error) {
    const constraint = String(error?.constraint || error?.details || error?.message || '');
    if (String(error?.code || '') === '23505' && /devices_serial_number_key/i.test(constraint)) {
      throw new OfflineConflictError('Numer seryjny jest już przypisany do innego urządzenia. Sprawdź tabliczkę i popraw numer przed ponownym zapisem.', { serverState: current });
    }
    throw error;
  }
  if (!data) throw new OfflineConflictError('Dane urządzenia zmieniły się podczas synchronizacji. Niczego nie nadpisano.');
  requireSession();
  const confirmed = await readJobForConflictCheck(supabase, operation.job_id);
  if (!sameDeviceFields(confirmed, desired)) throw new OfflineConflictError('Serwer nie potwierdził danych urządzenia.', { serverState: confirmed });
}

async function syncStatusOperation({ supabase, operation, jobs, sendCompletionPush }) {
  const current = await readJobForConflictCheck(supabase, operation.job_id);
  const desiredStatus = normalizeText(operation.payload?.status);
  const expectedStatus = normalizeText(operation.base?.status);
  const currentStatus = normalizeText(current.status);
  if (currentStatus === desiredStatus) return;
  if (currentStatus !== expectedStatus) {
    throw new OfflineConflictError(
      `Status w systemie to „${currentStatus || 'brak'}”, a na telefonie zmieniano „${expectedStatus || 'brak'}”. Niczego nie nadpisano.`,
      { serverState: current },
    );
  }

  if (desiredStatus === 'Zakończone') {
    const localJob = (jobs || []).find((job) => String(job.id) === String(operation.job_id)) || {};
    const verification = await loadJobNameplatePhotosData({ supabase, jobId: operation.job_id });
    const completion = getJobNameplateCompletion({ ...localJob, ...current, photos: verification.photos || [] });
    if (!completion.isComplete) {
      const error = new Error('Zakończenie czeka, aż wszystkie tabliczki zostaną zapisane w systemie.');
      error.code = 'OFFLINE_DEPENDENCY_WAITING';
      throw error;
    }
  }

  const statusUpdate = await supabase
    .from('jobs')
    .update({ status: desiredStatus })
    .eq('id', operation.job_id)
    .eq('status', current.status)
    .select('id')
    .maybeSingle();
  if (statusUpdate.error) throw statusUpdate.error;
  if (!statusUpdate.data) {
    let latestServerState = null;
    try {
      latestServerState = await readJobForConflictCheck(supabase, operation.job_id);
    } catch {
      // Sam brak ponownego odczytu nie może zamienić wykrytego konfliktu w pozorny sukces.
    }
    throw new OfflineConflictError(
      'Status zmienił się podczas synchronizacji. Niczego nie nadpisano.',
      { serverState: latestServerState },
    );
  }
  if (desiredStatus === 'Zakończone') {
    try {
      await sendCompletionPush?.({ jobId: operation.job_id });
    } catch (error) {
      console.warn('Status zsynchronizowano, ale push do administratora nie został wysłany.', error?.message || error);
    }
  }
}

async function syncCommentOperation({
  supabase,
  operation,
  profile,
  jobs,
  profiles,
  createNotification,
}) {
  await addJobComment({
    supabase,
    profile,
    jobs,
    profiles,
    jobId: operation.job_id,
    type: operation.payload?.type || 'Komentarz',
    text: operation.payload?.text || '',
    commentId: operation.payload?.comment_id || operation.id.replace(/^comment-/, ''),
    createNotification,
    sideEffectsBestEffort: true,
  });
}

async function syncSingleOperation(options) {
  const { operation } = options;
  if (operation.type === 'device') return syncDeviceOperation(options);
  if (operation.type === 'status') return syncStatusOperation(options);
  if (operation.type === 'comment') return syncCommentOperation(options);
  throw new Error(`Nieznany typ zmiany offline: ${operation.type}`);
}

function operationPriority(operation = {}) {
  if (operation.type === 'device') return 1;
  if (operation.type === 'comment') return 2;
  if (operation.type === 'status') return 3;
  return 9;
}

function isMissingReceiptsInfrastructure(error) {
  return /(mobile_sync_receipts|does not exist|schema cache|relation.*not found|permission denied)/i.test(String(error?.message || error || ''));
}

function retryDelayMs(retryCount) {
  const exponent = Math.max(0, Math.min(Number(retryCount || 1) - 1, 8));
  const base = Math.min(MAX_RETRY_DELAY_MS, 3000 * (2 ** exponent));
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

function operationIsDue(operation, nowMs = Date.now()) {
  const nextAttempt = Date.parse(operation?.next_attempt_at || '');
  return !Number.isFinite(nextAttempt) || nextAttempt <= nowMs;
}

async function operationAlreadyAcknowledged({ supabase, operation }) {
  const { data, error } = await supabase
    .from('mobile_sync_receipts')
    .select('operation_id')
    .eq('operation_id', operation.id)
    .eq('user_id', operation.user_id)
    .maybeSingle();
  if (error) {
    if (isMissingReceiptsInfrastructure(error)) return false;
    throw error;
  }
  return Boolean(data?.operation_id);
}

async function acknowledgeOperation({ supabase, operation }) {
  const { error } = await supabase.from('mobile_sync_receipts').insert({
    operation_id: operation.id,
    user_id: operation.user_id,
    job_id: operation.job_id,
    operation_type: operation.type,
  });
  if (!error || /duplicate|unique|23505/i.test(String(error?.message || error?.code || ''))) return true;
  if (isMissingReceiptsInfrastructure(error)) return false;
  throw error;
}

async function runSync(options = {}) {
  const { profile } = options;
  const userId = String(profile?.id || '').trim();
  const isSessionCurrent = options.isSessionCurrent || (() => true);
  if (!userId || !isSessionCurrent() || !options.supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return { processed: 0, synced: 0, conflicts: 0, errors: 0, changedJobIds: [], conflictJobIds: [] };
  }

  await recoverStaleOfflineJobOperations(userId);
  const requestedJobId = String(options.jobId || '').trim();
  const operations = (await listOfflineJobOperations(userId))
    .filter((item) => !requestedJobId || String(item.job_id || '') === requestedJobId)
    .filter((item) => !Array.isArray(options.allowedTypes) || options.allowedTypes.includes(item.type))
    .filter((item) => item.status !== 'conflict')
    .filter((item) => item.status !== 'error')
    .filter((item) => operationIsDue(item))
    .sort((left, right) => operationPriority(left) - operationPriority(right)
      || String(left.created_at || '').localeCompare(String(right.created_at || '')));
  const result = { processed: 0, synced: 0, conflicts: 0, errors: 0, changedJobIds: [], conflictJobIds: [] };

  for (const queuedOperation of operations) {
    if (!isSessionCurrent() || (typeof navigator !== 'undefined' && navigator.onLine === false)) break;
    const operation = await claimOfflineJobOperation(queuedOperation.id, OPERATION_LEASE_MS);
    if (!operation) continue;
    result.processed += 1;
    const attemptCount = Number(operation.retry_count || 1);
    try {
      // A receipt alone can never ACK a device whose dependent bytes are absent.
      const acknowledged = operation.type !== 'device' && await operationAlreadyAcknowledged({ supabase: options.supabase, operation });
      if (!acknowledged) {
        await syncSingleOperation({ ...options, operation });
        if (!isSessionCurrent()) break;
        if (operation.type !== 'device') await acknowledgeOperation({ supabase: options.supabase, operation });
      }
      if (!isSessionCurrent() || !(await deleteOfflineJobOperation(operation.id, offlineOperationGuard(operation)))) break;
      result.synced += 1;
      if (!result.changedJobIds.includes(operation.job_id)) result.changedJobIds.push(operation.job_id);
    } catch (error) {
      if (error instanceof OfflineConflictError || error?.code === 'OFFLINE_CONFLICT') {
        await updateOfflineJobOperation(operation.id, {
          status: 'conflict',
          error: error.message,
          lease_until: '',
          next_attempt_at: '',
          server_state: error?.serverState || null,
        }, offlineOperationGuard(operation));
        result.conflicts += 1;
        if (!result.conflictJobIds.includes(operation.job_id)) result.conflictJobIds.push(operation.job_id);
        if (!result.changedJobIds.includes(operation.job_id)) result.changedJobIds.push(operation.job_id);
        continue;
      }
      const status = Number(error?.statusCode || error?.status || 0);
      const waiting = isTransientSupabaseError(error) || status === 429 || status >= 500
        || ['OFFLINE_DEPENDENCY_WAITING', 'OFFLINE_SESSION_CHANGED'].includes(error?.code);
      await updateOfflineJobOperation(operation.id, {
        status: waiting ? 'pending' : 'error',
        error: error?.message || 'Nie udało się wysłać lokalnej zmiany.',
        lease_until: '',
        next_attempt_at: waiting
          ? new Date(Date.now() + retryDelayMs(attemptCount)).toISOString()
          : '',
      }, offlineOperationGuard(operation));
      result.errors += 1;
      // Przy awarii połączenia następne operacje również zaczekają. Błąd jednej
      // konkretnej operacji nie blokuje pozostałych zleceń.
      if (isTransientSupabaseError(error)) break;
    } finally {
      // A cancelled/expired session releases only its own generation.
      await updateOfflineJobOperation(operation.id, { status: 'pending', lease_until: '', lease_owner: '' },
        { ...offlineOperationGuard(operation), expectedLeaseUntil: operation.lease_until });
    }
  }

  return result;
}

export function syncOfflineJobOperations(options = {}) {
  // Ręczna synchronizacja konkretnego montażu nie może utknąć za długim
  // odczytem innego zlecenia. Claim transakcyjny zapobiega podwójnemu ACK.
  if (String(options.jobId || '').trim()) return runSync(options);
  const key = String(options.profile?.id || '');
  const existing = activeSyncPromises.get(key);
  if (existing && existing.isCurrent()) return existing.promise;
  const promise = runSync(options).finally(() => {
    if (activeSyncPromises.get(key)?.promise === promise) activeSyncPromises.delete(key);
  });
  activeSyncPromises.set(key, { promise, isCurrent: options.isSessionCurrent || (() => true) });
  return promise;
}
