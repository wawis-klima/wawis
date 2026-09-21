import { APP_VERSION } from '../version.js';
import {
  DIAGNOSTIC_RECENT_HOURS,
  getDiagnosticSeverity,
  inferDiagnosticModule,
  partitionDiagnosticEntries,
} from '../../modules/diagnostics-core.js';

const DIAGNOSTIC_STORAGE_KEY = 'klima_app_diagnostic_log';
const DIAGNOSTIC_MAX_ENTRIES = 300;
const DIAGNOSTIC_EXPORT_MAX_ENTRIES = 180;
const DIAGNOSTIC_MAX_STRING_LENGTH = 500;
const REMOTE_DIAGNOSTIC_INTERVAL_MS = 2 * 60 * 1000;
const DIAGNOSTIC_PLATFORM = 'mobile';
let consolePatched = false;
let globalHandlersInstalled = false;

const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|apikey|access_token|refresh_token|email|phone|client|customer|contractor|comment|note|address|street|city|photo|image|file_name|filename|serial_number|full_name)/i;
const TECHNICAL_TEXT_PATTERN = /(error|warning|failed|failure|timeout|timed out|network|fetch|supabase|auth|session|storage|indexeddb|upload|download|ocr|ean|barcode|code 128|http|rpc|query|database|worker|service worker|vite|react|playwright|permission|offline|online|retry|abort|cancel|exception|stack|syntax|render)/i;

function nowIso() {
  return new Date().toISOString();
}

function createDiagnosticEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function trimString(value) {
  const text = String(value ?? '');
  return text.length > DIAGNOSTIC_MAX_STRING_LENGTH ? `${text.slice(0, DIAGNOSTIC_MAX_STRING_LENGTH)}…` : text;
}

function redactText(value, { technicalOnly = false } = {}) {
  let text = trimString(value);
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  text = text.replace(/(?:\+?48[ -]?)?(?:\d[ -]?){9}/g, '[REDACTED_PHONE]');
  text = text.replace(/https?:\/\/[^\s"']+/gi, '[REDACTED_URL]');
  text = text.replace(/blob:[^\s"']+/gi, '[REDACTED_BLOB_URL]');
  text = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '[REDACTED_IMAGE_DATA]');
  if (technicalOnly && text && !TECHNICAL_TEXT_PATTERN.test(text)) return '[REDACTED_TEXT]';
  return text;
}

function sanitizeValue(value, seen = new WeakSet(), contextKey = '') {
  if (value == null) return value;

  if (SENSITIVE_KEY_PATTERN.test(contextKey)) return '[REDACTED]';

  if (value instanceof Error) {
    return {
      name: redactText(value.name || 'Error'),
      message: redactText(value.message || '', { technicalOnly: false }),
      stack: redactText(value.stack || '', { technicalOnly: false }),
    };
  }

  const valueType = typeof value;
  if (valueType === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('bearer ') || lower.includes('apikey') || lower.includes('token')) return '[REDACTED]';
    return redactText(value, { technicalOnly: contextKey === 'args' });
  }

  if (valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'function') return `[Function ${value.name || 'anonymous'}]`;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, seen, contextKey));
  }

  if (valueType === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const output = {};
    Object.entries(value).slice(0, 40).forEach(([key, entryValue]) => {
      output[key] = sanitizeValue(entryValue, seen, key);
    });
    return output;
  }

  return redactText(value);
}

function readEntries() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(entries.slice(-DIAGNOSTIC_MAX_ENTRIES)));
  } catch {
    // Diagnostyka nie może blokować aplikacji.
  }
}

function getSafePath() {
  if (typeof window === 'undefined') return '';
  return window.location.pathname || '/';
}

export function logDiagnostic(type, payload = {}) {
  if (typeof window === 'undefined') return;
  const entries = readEntries();
  const entry = {
    id: createDiagnosticEventId(),
    time: nowIso(),
    type: trimString(type || 'unknown'),
    payload: sanitizeValue(payload),
    path: getSafePath(),
    module: inferDiagnosticModule(type, payload),
    app_version: APP_VERSION,
    platform: DIAGNOSTIC_PLATFORM,
  };
  entry.severity = getDiagnosticSeverity(entry);
  entries.push(entry);
  writeEntries(entries);
}

function getRemoteErrorMessage(entry = {}) {
  const payload = entry.payload || {};
  const candidate = payload?.error?.message
    || payload?.reason?.message
    || payload?.message
    || (Array.isArray(payload?.args) ? payload.args.join(' ') : '')
    || '';
  return redactText(candidate, { technicalOnly: true });
}

function isRemoteDiagnosticsUnavailable(error) {
  return /(app_diagnostic_events|does not exist|schema cache|relation.*not found|permission denied)/i.test(String(error?.message || error || ''));
}

function isRemoteDiagnosticsModuleUnavailable(error) {
  return /(diagnostic_module.*(?:does not exist|schema cache)|column.*diagnostic_module)/i.test(String(error?.message || error || ''));
}

export async function flushDiagnosticsToServer({
  supabase,
  userId,
  appVersion = '',
  platform = '',
  queueSummary = null,
} = {}) {
  if (!supabase || !userId || typeof window === 'undefined' || navigator.onLine === false) return { sent: 0 };
  const entries = readEntries();
  const candidates = entries
    .filter((entry) => !entry.remote_synced_at && getDiagnosticSeverity(entry))
    .slice(-30);
  if (!candidates.length) return { sent: 0 };

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
    error_code: String(entry.payload?.error?.code || entry.payload?.code || '').slice(0, 80),
    error_message: getRemoteErrorMessage(entry),
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
    if (isRemoteDiagnosticsUnavailable(error)) return { sent: 0, unavailable: true };
    return { sent: 0, error };
  }

  const syncedIds = new Set(candidates.map((entry) => entry.id || `${entry.time}-${entry.type}`));
  const syncedAt = nowIso();
  writeEntries(entries.map((entry) => (
    syncedIds.has(entry.id || `${entry.time}-${entry.type}`)
      ? { ...entry, remote_synced_at: syncedAt }
      : entry
  )));
  return { sent: candidates.length };
}

export function startSilentDiagnosticSync(options = {}) {
  if (typeof window === 'undefined' || !options.supabase || !options.userId) return () => {};
  let stopped = false;
  let timerId = null;
  const run = async () => {
    if (stopped) return;
    let queueSummary = null;
    try {
      queueSummary = await options.getQueueSummary?.();
    } catch {
      queueSummary = null;
    }
    await flushDiagnosticsToServer({ ...options, queueSummary }).catch(() => null);
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

export function clearDiagnosticLog() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DIAGNOSTIC_STORAGE_KEY);
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
    return { error: redactText(error?.message || 'storage estimate unavailable') };
  }
}

function sanitizeEntryForExport(entry = {}) {
  return {
    time: entry.time || '',
    type: trimString(entry.type || 'unknown'),
    severity: getDiagnosticSeverity(entry),
    module: inferDiagnosticModule(entry),
    appVersion: String(entry.app_version || ''),
    platform: String(entry.platform || ''),
    payload: sanitizeValue(entry.payload || {}),
    path: String(entry.path || '/').split('?')[0].split('#')[0],
  };
}

function buildDiagnosticReportSnapshot({
  appVersion = '',
  role = '',
  queueSummary = null,
  currentJobId = '',
  extra = {},
} = {}, storage = null) {
  const entries = readEntries().slice(-DIAGNOSTIC_EXPORT_MAX_ENTRIES).map(sanitizeEntryForExport);
  const runtime = typeof window === 'undefined' ? {} : {
    online: navigator.onLine,
    language: navigator.language || '',
    userAgent: redactText(navigator.userAgent || ''),
    platform: redactText(navigator.platform || ''),
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
    path: getSafePath(),
    visibilityState: document.visibilityState || '',
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
  };

  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    app: 'Wawis Klimatyzacja',
    appVersion: String(appVersion || ''),
    role: String(role || ''),
    currentJobId: currentJobId ? String(currentJobId) : '',
    privacy: {
      customerDataIncluded: false,
      commentsIncluded: false,
      photosIncluded: false,
      note: 'Raport maskuje dane osobowe, adresy, komentarze, zdjęcia, nazwy plików i tokeny.',
    },
    runtime,
    storage,
    photoQueue: queueSummary ? sanitizeValue(queueSummary) : null,
    overview: getDiagnosticOverview(),
    extra: sanitizeValue(extra),
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
