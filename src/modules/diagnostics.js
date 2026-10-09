import { readSafeBootTrace } from './diagnostics-package4.js';
import { APP_VERSION } from '../version.js';
import {
  DIAGNOSTIC_RECENT_HOURS,
  getDiagnosticSeverity,
  inferDiagnosticModule,
  partitionDiagnosticEntries,
} from './diagnostics-core.js';

import {
  sanitizeDiagnosticEntry, sanitizeDiagnosticSummary, setDiagnosticUser,
  getDiagnosticSession, readDiagnosticEntries, appendDiagnosticEntry, acknowledgeDiagnosticEntries,
  getDiagnosticDroppedCount, clearDiagnosticEntries,
} from './diagnostic-privacy.js';
export { setDiagnosticUser } from './diagnostic-privacy.js';

import { getSafeDiagnosticDetails } from './diagnostic-error-codes.js';

const DIAGNOSTIC_EXPORT_MAX_ENTRIES = 180;
const REMOTE_DIAGNOSTIC_INTERVAL_MS = 2 * 60 * 1000;
const DIAGNOSTIC_PLATFORM = 'desktop';
let consolePatched = false;
let globalHandlersInstalled = false;

function nowIso() { return new Date().toISOString(); }
function createDiagnosticEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function readEntries() { return readDiagnosticEntries(); }

function getSafePath() {
  if (typeof window === 'undefined') return '';
  return window.location.pathname || '/';
}

export function logDiagnostic(type, payload = {}) {
  if (typeof window === 'undefined' || !getDiagnosticSession().userId) return;
  const session = getDiagnosticSession();
  const entry = sanitizeDiagnosticEntry({
    id: createDiagnosticEventId(), time: nowIso(), type, payload,
    module: inferDiagnosticModule(type, payload),
    app_version: APP_VERSION, platform: DIAGNOSTIC_PLATFORM,
  });
  appendDiagnosticEntry(entry, session);
}

function isRemoteDiagnosticsUnavailable(error) {
  const code = String(error?.code || '');
  return ['42P01', 'PGRST205', 'PGRST116'].includes(code)
    || /(?:relation.*does not exist|table.*not found|could not find the table)/i.test(String(error?.message || ''));
}

function isRemoteDiagnosticsModuleUnavailable(error) {
  return /(diagnostic_module.*(?:does not exist|schema cache)|column.*diagnostic_module)/i.test(String(error?.message || error || ''));
}

const diagnosticFlushes = new Map();
let lastDiagnosticSync = { status: 'unknown', sent: 0, lastSuccessAt: '', failedAt: '', dropped: 0 };
export function getDiagnosticSyncStatus() { return { ...lastDiagnosticSync, dropped: getDiagnosticDroppedCount() }; }
function updateDiagnosticSync(status, sent = 0) {
  lastDiagnosticSync = {
    status, sent,
    lastSuccessAt: status === 'ok' ? nowIso() : lastDiagnosticSync.lastSuccessAt,
    failedAt: status === 'error' || status === 'unavailable' ? nowIso() : lastDiagnosticSync.failedAt,
    dropped: getDiagnosticDroppedCount(),
  };
}
export async function flushDiagnosticsToServer(options = {}) {
  const { supabase, userId } = options;
  if (!supabase || !userId || typeof window === 'undefined' || navigator.onLine === false) return { sent: 0, offline: navigator?.onLine === false };
  const session = getDiagnosticSession();
  if (!session.userId || session.userId !== String(userId)) return { sent: 0, sessionMismatch: true };
  const key = `${session.userId}:${session.generation}`;
  if (diagnosticFlushes.has(key)) return diagnosticFlushes.get(key);
  const request = flushDiagnosticBatch(options, session).finally(() => diagnosticFlushes.delete(key));
  diagnosticFlushes.set(key, request);
  return request;
}

async function flushDiagnosticBatch({
  supabase,
  userId,
  appVersion = '',
  platform = '',
  queueSummary = null,
} = {}, diagnosticSession) {
  const entries = readEntries();
  const candidates = entries
    .filter((entry) => !entry.remote_synced_at && getDiagnosticSeverity(entry))
    .slice(0, 30);
  if (!candidates.length) return { sent: 0, pending: 0 };

  const rows = candidates.map((entry) => ({
    client_event_id: String(entry.id || `${entry.time}-${entry.type}`).slice(0, 180),
    user_id: String(userId),
    event_type: String(entry.type || 'unknown').slice(0, 120),
    severity: getDiagnosticSeverity(entry),
    app_version: String(entry.app_version || appVersion || '').slice(0, 24),
    platform: String(entry.platform || platform || '').slice(0, 24),
    diagnostic_module: String(entry.module || inferDiagnosticModule(entry) || 'app').slice(0, 80),
    online: navigator.onLine,
    queue_pending: Math.max(0, Number(queueSummary?.local || queueSummary?.pending || 0)),
    queue_errors: Math.max(0, Number(queueSummary?.error || queueSummary?.errors || 0)),
    retry_count: Math.max(0, Number(entry.payload?.retry_count || 0)),
    error_code: getSafeDiagnosticDetails(entry).code,
    error_message: getSafeDiagnosticDetails(entry).message,
    occurred_at: entry.time || nowIso(),
  }));

  let { error } = await supabase
    .from('app_diagnostic_events')
    .upsert(rows, { onConflict: 'user_id,client_event_id', ignoreDuplicates: true });
  if (error && isRemoteDiagnosticsModuleUnavailable(error)) {
    const legacyRows = rows.map(({ diagnostic_module, ...row }) => row);
    ({ error } = await supabase
      .from('app_diagnostic_events')
      .upsert(legacyRows, { onConflict: 'user_id,client_event_id', ignoreDuplicates: true }));
  }
  if (error) {
    const unavailable = isRemoteDiagnosticsUnavailable(error);
    updateDiagnosticSync(unavailable ? 'unavailable' : 'error');
    if (unavailable) return { sent: 0, unavailable: true };
    return { sent: 0, errorCode: String(error?.code || 'DIAGNOSTIC_INGEST_FAILED').slice(0, 64) };
  }

  if (getDiagnosticSession().generation !== diagnosticSession.generation
    || getDiagnosticSession().userId !== diagnosticSession.userId) return { sent: 0, ignoredStaleSession: true };
  // ACK individual event IDs in the current store after the network await.
  // Never write the pre-request snapshot: new entries from this or another tab survive.
  const ids = candidates.map((entry) => entry.id).filter(Boolean);
  const acknowledged = acknowledgeDiagnosticEntries(ids, diagnosticSession, nowIso());
  if (!acknowledged) {
    updateDiagnosticSync('error');
    return { sent: 0, ackFailed: true, pending: readEntries().filter((entry) => !entry.remote_synced_at && getDiagnosticSeverity(entry)).length };
  }
  updateDiagnosticSync('ok', ids.length);
  return { sent: ids.length, pending: Math.max(0, readEntries().filter((entry) => !entry.remote_synced_at && getDiagnosticSeverity(entry)).length) };
}

export function startSilentDiagnosticSync(options = {}) {
  if (typeof window === 'undefined' || !options.supabase || !options.userId) return () => {};
  let stopped = false;
  let timerId = null;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    const hasPending = readEntries().some((entry) => !entry.remote_synced_at && getDiagnosticSeverity(entry));
    if (!hasPending) return;
    running = true;
    let queueSummary = null;
    try {
      queueSummary = await options.getQueueSummary?.();
    } catch {
      queueSummary = null;
    }
    try { await flushDiagnosticsToServer({ ...options, queueSummary }); }
    catch { updateDiagnosticSync('error'); }
    finally { running = false; }
  };
  timerId = window.setInterval(() => { void run(); }, REMOTE_DIAGNOSTIC_INTERVAL_MS);
  const onlineHandler = () => { void run(); };
  window.addEventListener('online', onlineHandler);
  window.setTimeout(() => { void run(); }, 4000);
  return () => {
    stopped = true;
    if (timerId !== null) window.clearInterval(timerId);
    window.removeEventListener('online', onlineHandler);
  };
}

export async function loadRemoteDiagnosticEvents({
  supabase,
  limit = 30,
  sinceHours = null,
  olderThanHours = null,
  now = Date.now(),
} = {}) {
  if (!supabase) return [];
  const maxRows = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const buildQuery = (withModule = true) => {
    let query = supabase
      .from('app_diagnostic_events')
      .select(`id, event_type, severity, app_version, platform, ${withModule ? 'diagnostic_module, ' : ''}online, queue_pending, queue_errors, retry_count, error_code, error_message, occurred_at, received_at`);
    if (Number(sinceHours) > 0) {
      query = query.gte('occurred_at', new Date(Number(now) - Number(sinceHours) * 60 * 60 * 1000).toISOString());
    }
    if (Number(olderThanHours) > 0) {
      query = query.lt('occurred_at', new Date(Number(now) - Number(olderThanHours) * 60 * 60 * 1000).toISOString());
    }
    return query.order('occurred_at', { ascending: false }).limit(maxRows);
  };

  let { data, error } = await buildQuery(true);
  if (error && isRemoteDiagnosticsModuleUnavailable(error)) {
    ({ data, error } = await buildQuery(false));
  }
  if (error) {
    if (isRemoteDiagnosticsUnavailable(error)) return [];
    throw error;
  }
  return (data || []).map((entry) => ({
    ...entry,
    diagnostic_module: entry.diagnostic_module || inferDiagnosticModule(entry),
  }));
}

export async function loadStorageBackupOverview({ supabase } = {}) {
  if (!supabase) return { total: 0, pending: 0, errors: 0, completed: 0, lastCompletedAt: '' };
  const { data, error } = await supabase.rpc('get_storage_backup_overview');
  if (error) {
    if (/(storage_backup_queue|does not exist|schema cache|permission denied)/i.test(String(error.message || ''))) {
      return { total: 0, pending: 0, errors: 0, completed: 0, lastCompletedAt: '', unavailable: true };
    }
    throw error;
  }
  return {
    total: Number(data?.total || 0),
    pending: Number(data?.pending || 0),
    errors: Number(data?.errors || 0),
    completed: Number(data?.completed || 0),
    lastCompletedAt: data?.last_completed_at || '',
  };
}

export async function loadPushSubscriptionOverview({ supabase } = {}) {
  if (!supabase) return [];

  const [profilesResult, subscriptionsResult] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role').order('full_name', { ascending: true }),
    supabase.from('push_subscriptions').select('user_id, is_active, device_label, last_seen_at, updated_at'),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;

  const rowsByUser = new Map((profilesResult.data || []).map((profile) => [String(profile.id || ''), {
    userId: String(profile.id || ''),
    fullName: String(profile.full_name || '').trim() || 'Użytkownik',
    role: String(profile.role || '').trim() || '—',
    activeSubscriptions: 0,
    inactiveSubscriptions: 0,
    activeDevices: [],
    lastSeenAt: '',
  }]));

  for (const subscription of subscriptionsResult.data || []) {
    const userId = String(subscription.user_id || '');
    const row = rowsByUser.get(userId);
    if (!row) continue;

    if (subscription.is_active) {
      row.activeSubscriptions += 1;
      const label = String(subscription.device_label || '').trim();
      if (label && !row.activeDevices.includes(label)) row.activeDevices.push(label);
    } else {
      row.inactiveSubscriptions += 1;
    }

    const lastSeenAt = subscription.last_seen_at || subscription.updated_at || '';
    if (lastSeenAt && (!row.lastSeenAt || new Date(lastSeenAt) > new Date(row.lastSeenAt))) {
      row.lastSeenAt = lastSeenAt;
    }
  }

  return Array.from(rowsByUser.values()).sort((left, right) => {
    const leftAdmin = left.role === 'Administrator' ? 0 : 1;
    const rightAdmin = right.role === 'Administrator' ? 0 : 1;
    if (leftAdmin !== rightAdmin) return leftAdmin - rightAdmin;
    return left.fullName.localeCompare(right.fullName, 'pl');
  });
}

export function clearDiagnosticLog() {
  if (typeof window === 'undefined') return;
  clearDiagnosticEntries();
}

export function getDiagnosticEntries() {
  return readEntries();
}

export function getDiagnosticOverview({ hours = DIAGNOSTIC_RECENT_HOURS, now = Date.now() } = {}) {
  const entries = readEntries();
  const { recent, history } = partitionDiagnosticEntries(entries, { hours, now });
  const errorCount = recent.filter((entry) => getDiagnosticSeverity(entry) === 'error').length;
  const warningCount = recent.filter((entry) => getDiagnosticSeverity(entry) === 'warning').length;
  return {
    entryCount: recent.length,
    recentEntryCount: recent.length,
    historyEntryCount: history.length,
    totalEntryCount: entries.length,
    errorCount,
    warningCount,
    lastEntryAt: entries.at(-1)?.time || '',
    droppedCount: getDiagnosticDroppedCount(),
    hours,
  };
}

async function getStorageSnapshot() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usageBytes: Number(estimate?.usage || 0),
      quotaBytes: Number(estimate?.quota || 0),
      usagePercent: estimate?.quota ? Math.round((Number(estimate.usage || 0) / Number(estimate.quota)) * 1000) / 10 : null,
    };
  } catch (error) {
    return { error: 'STORAGE_ESTIMATE_UNAVAILABLE' };
  }
}

function sanitizeEntryForExport(entry = {}) {
  const safe = sanitizeDiagnosticEntry(entry);
  return {
    time: safe.time, type: safe.type, severity: safe.severity,
    module: safe.module, appVersion: safe.app_version,
    platform: safe.platform, payload: safe.payload, path: '/',
  };
}

function buildDiagnosticReportSnapshot({
  appVersion = '',
  role = '',
  queueSummary = null,
  offlineOperations = null,
  currentJobId = '',
  extra = {},
} = {}, storage = null) {
  const entries = readEntries().slice(-DIAGNOSTIC_EXPORT_MAX_ENTRIES).map(sanitizeEntryForExport);
  const runtime = typeof window === 'undefined' ? {} : {
    online: navigator.onLine,
    language: /^[a-z]{2}(?:-[A-Z]{2})?$/.test(navigator.language || '') ? navigator.language : '',
    userAgent: /iphone|ipad|ipod/i.test(navigator.userAgent || '') ? 'iOS' : /android/i.test(navigator.userAgent || '') ? 'Android' : 'Desktop',
    platform: DIAGNOSTIC_PLATFORM,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    screen: {
      width: window.screen?.width || 0,
      height: window.screen?.height || 0,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    path: '/',
    visibilityState: document.visibilityState || '',
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
  };

  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    app: 'Wawis Klimatyzacja',
    appVersion: /^\d{1,3}\.\d{2}$/.test(String(appVersion || '')) ? String(appVersion) : APP_VERSION,
    role: role === 'Administrator' ? 'Administrator' : 'Pracownik',
    currentJobId: '', // Bez identyfikatora montażu/klienta w raporcie.
    privacy: {
      customerDataIncluded: false,
      commentsIncluded: false,
      photosIncluded: false,
      note: 'Raport maskuje dane osobowe, adresy, komentarze, zdjęcia, nazwy plików i tokeny.',
    },
    runtime,
    storage,
    photoQueue: sanitizeDiagnosticSummary(queueSummary),
    offlineOperations: sanitizeDiagnosticSummary(offlineOperations),
    boot: readSafeBootTrace(),
    overview: getDiagnosticOverview(),
    extra: sanitizeDiagnosticSummary(extra),
    entries,
  };
}

export async function buildDiagnosticReport(options = {}) {
  const storage = await getStorageSnapshot();
  return buildDiagnosticReportSnapshot(options, storage);
}

export function buildDiagnosticReportImmediate(options = {}) {
  return buildDiagnosticReportSnapshot(options, null);
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

export function downloadDiagnosticReportImmediate(options = {}) {
  if (typeof window === 'undefined') return null;
  const report = buildDiagnosticReportImmediate(options);
  const timestamp = nowIso().replace(/[:.]/g, '-');
  const versionPart = options.appVersion ? `-v${String(options.appVersion)}` : '';
  downloadJsonFile(`wawis-diagnostyka${versionPart}-${timestamp}.json`, report);
  logDiagnostic('diagnostic.report.downloaded', {
    entryCount: report.entries.length,
    online: report.runtime?.online,
    queueTotal: report.photoQueue?.total ?? null,
    immediate: true,
  });
  return report;
}

export async function downloadDiagnosticReport(options = {}) {
  if (typeof window === 'undefined') return null;
  const report = await buildDiagnosticReport(options);
  const timestamp = nowIso().replace(/[:.]/g, '-');
  const versionPart = options.appVersion ? `-v${String(options.appVersion)}` : '';
  downloadJsonFile(`wawis-diagnostyka${versionPart}-${timestamp}.json`, report);
  logDiagnostic('diagnostic.report.downloaded', {
    entryCount: report.entries.length,
    online: report.runtime?.online,
    queueTotal: report.photoQueue?.total ?? null,
  });
  return report;
}

// Zachowanie zgodności ze starszą nazwą funkcji.
export async function downloadDiagnosticLog(options = {}) {
  return downloadDiagnosticReport(options);
}

export function installDiagnosticConsoleCapture() {
  if (typeof window === 'undefined' || consolePatched) return;
  consolePatched = true;

  ['warn', 'error'].forEach((methodName) => {
    const originalMethod = console[methodName];
    if (typeof originalMethod !== 'function') return;

    console[methodName] = (...args) => {
      try {
        logDiagnostic(`console.${methodName}`, { args });
      } catch {
        // ignore diagnostic write errors
      }
      originalMethod.apply(console, args);
    };
  });
}

export function installGlobalDiagnosticHandlers() {
  if (typeof window === 'undefined' || globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    logDiagnostic('window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logDiagnostic('window.unhandledrejection', {
      reason: event.reason,
    });
  });

  window.addEventListener('online', () => logDiagnostic('network.online'));
  window.addEventListener('offline', () => logDiagnostic('network.offline'));
}
