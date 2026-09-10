import { addJobComment } from './jobs-comments.js';
import { loadJobNameplatePhotosData } from './jobs-fetch.js';
import { getJobNameplateCompletion } from './nameplate-requirements.js';
import { isTransientSupabaseError } from './supabase-errors.js';
import {
  deleteOfflineJobOperation,
  claimOfflineJobOperation,
  listOfflineJobOperations,
  recoverStaleOfflineJobOperations,
  updateOfflineJobOperation,
} from './job-offline-store.js';

let activeSyncPromise = null;
const OPERATION_LEASE_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

export class OfflineConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OfflineConflictError';
    this.code = 'OFFLINE_CONFLICT';
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

async function syncDeviceOperation({ supabase, operation }) {
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
  if (error) throw error;
  if (!data) throw new OfflineConflictError('Dane urządzenia zmieniły się podczas synchronizacji. Niczego nie nadpisano.');
}

async function syncStatusOperation({ supabase, operation, jobs, sendCompletionPush }) {
  const current = await readJobForConflictCheck(supabase, operation.job_id);
  const desiredStatus = normalizeText(operation.payload?.status);
  const expectedStatus = normalizeText(operation.base?.status);
  const currentStatus = normalizeText(current.status);
  if (currentStatus === desiredStatus) return;
  if (currentStatus !== expectedStatus) {
    throw new OfflineConflictError(`Status w systemie to „${currentStatus || 'brak'}”, a na telefonie zmieniano „${expectedStatus || 'brak'}”. Niczego nie nadpisano.`);
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
  if (!statusUpdate.data) throw new OfflineConflictError('Status zmienił się podczas synchronizacji. Niczego nie nadpisano.');
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
  if (!userId || !options.supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return { processed: 0, synced: 0, conflicts: 0, errors: 0 };
  }

  await recoverStaleOfflineJobOperations(userId);
  const operations = (await listOfflineJobOperations(userId))
    .filter((item) => item.status !== 'conflict')
    .filter((item) => operationIsDue(item))
    .sort((left, right) => operationPriority(left) - operationPriority(right)
      || String(left.created_at || '').localeCompare(String(right.created_at || '')));
  const result = { processed: 0, synced: 0, conflicts: 0, errors: 0, changedJobIds: [] };

  for (const queuedOperation of operations) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
    const operation = await claimOfflineJobOperation(queuedOperation.id, OPERATION_LEASE_MS);
    if (!operation) continue;
    result.processed += 1;
    const attemptCount = Number(operation.retry_count || 1);
    try {
      const acknowledged = await operationAlreadyAcknowledged({ supabase: options.supabase, operation });
      if (!acknowledged) {
        await syncSingleOperation({ ...options, operation });
        await acknowledgeOperation({ supabase: options.supabase, operation });
      }
      await deleteOfflineJobOperation(operation.id);
      result.synced += 1;
      if (!result.changedJobIds.includes(operation.job_id)) result.changedJobIds.push(operation.job_id);
    } catch (error) {
      if (error instanceof OfflineConflictError || error?.code === 'OFFLINE_CONFLICT') {
        await updateOfflineJobOperation(operation.id, { status: 'conflict', error: error.message, lease_until: '' });
        result.conflicts += 1;
        continue;
      }
      const waiting = isTransientSupabaseError(error) || error?.code === 'OFFLINE_DEPENDENCY_WAITING';
      await updateOfflineJobOperation(operation.id, {
        status: waiting ? 'pending' : 'error',
        error: error?.message || 'Nie udało się wysłać lokalnej zmiany.',
        lease_until: '',
        next_attempt_at: waiting
          ? new Date(Date.now() + retryDelayMs(attemptCount)).toISOString()
          : '',
      });
      result.errors += 1;
      // Przy awarii połączenia następne operacje również zaczekają. Błąd jednej
      // konkretnej operacji nie blokuje pozostałych zleceń.
      if (isTransientSupabaseError(error)) break;
    }
  }

  return result;
}

export function syncOfflineJobOperations(options = {}) {
  if (activeSyncPromise) return activeSyncPromise;
  activeSyncPromise = runSync(options).finally(() => {
    activeSyncPromise = null;
  });
  return activeSyncPromise;
}
