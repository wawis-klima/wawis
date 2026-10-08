import { getSafeDiagnosticDetails, getKnownDiagnosticCodeDetails } from './diagnostic-error-codes.js';
import { getDiagnosticSeverity, inferDiagnosticModule } from './diagnostics-core.js';

// Persist only closed-schema technical metadata. Never persist Error.message,
// stack, arbitrary strings, customer fields, URLs, identifiers or raw console args.
const EVENT_PATTERN = /^(?:app|auth|calendar|comment|comments|console|contractor|contractors|data|device|devices|diagnostic|fuel|invoice|job|jobs|nameplate|network|ocr|offline|photo|photos|protocol|push|session|sms|storage|sync|window)[.][a-z0-9._-]{1,105}$/;
const MODULES = new Set(['app','auth','calendar','comments','contractors','data.refresh','devices','diagnostics','fuel','jobs','nameplate','network','offline','photos','protocol','push','sms','storage']);
const NUMBER_FIELDS = Object.freeze(['retry_count','retryCount','attempt','attempts','entryCount','queueTotal','queuePending','queueErrors','failedCount','successCount','processed','count','total','pending','errors','local','uploading','failed','completed','skipped','delivered','durationMs','elapsedMs']);
const BOOL_FIELDS = Object.freeze(['online','offline','partial','immediate','retryable','queueActive','success']);
const SUMMARY_NUMBER_FIELDS = Object.freeze(['total','pending','local','uploading','error','errors','completed','failed','retryCount','count','attempts']);

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9 ? value : null;
}

function safePayload(original = {}, { type = '', module = '' } = {}) {
  const raw = original && typeof original === 'object' ? original : {};
  const existing = getKnownDiagnosticCodeDetails(raw?.error?.code || raw?.code);
  const safeError = existing || getSafeDiagnosticDetails({ type, module, payload: original });
  const out = { code: safeError.code, error: { code: safeError.code, message: safeError.message } };
  for (const field of NUMBER_FIELDS) {
    const num = safeNumber(raw[field]);
    if (num !== null) out[field] = num;
  }
  for (const field of BOOL_FIELDS) {
    if (typeof raw[field] === 'boolean') out[field] = raw[field];
  }
  return out;
}

export function sanitizeDiagnosticEntry(raw = {}) {
  try {
    const type = typeof raw.type === 'string' && EVENT_PATTERN.test(raw.type) ? raw.type : 'diagnostic.unknown';
    const candidate = String(raw.module || '');
    const module = MODULES.has(candidate) ? candidate : inferDiagnosticModule(type, raw.payload || {});
    const moduleName = MODULES.has(module) ? module : 'app';
    const id = typeof raw.id === 'string' && /^[a-zA-Z0-9-]{4,100}$/.test(raw.id) ? raw.id : '';
    const time = typeof raw.time === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(raw.time)
      && Number.isFinite(Date.parse(raw.time)) ? new Date(raw.time).toISOString() : new Date().toISOString();
    const appVersion = /^\d{1,3}\.\d{2}$/.test(String(raw.app_version || '')) ? raw.app_version : '';
    const platform = raw.platform === 'mobile' ? 'mobile' : 'desktop';
    const payload = safePayload(raw.payload, { type, module: moduleName });
    const entry = { id, time, type, payload, path: '/', module: moduleName, app_version: appVersion, platform };
    entry.severity = getDiagnosticSeverity(entry);
    if (typeof raw.remote_synced_at === 'string' && Number.isFinite(Date.parse(raw.remote_synced_at))) {
      entry.remote_synced_at = new Date(raw.remote_synced_at).toISOString();
    }
    return entry;
  } catch {
    return { id: '', time: new Date().toISOString(), type: 'diagnostic.unknown',
      payload: { code: 'DIAGNOSTIC_UNCLASSIFIED', error: { code: 'DIAGNOSTIC_UNCLASSIFIED', message: 'Zdarzenie bez bezpiecznego kodu.' } },
      path: '/', module: 'diagnostics', app_version: '', platform: 'desktop', severity: '' };
  }
}

export function sanitizeDiagnosticSummary(summary = null) {
  if (!summary || typeof summary !== 'object') return null;
  const out = {};
  for (const field of SUMMARY_NUMBER_FIELDS) {
    const num = safeNumber(summary[field]);
    if (num !== null) out[field] = num;
  }
  return out;
}

// Session-specific envelope. Older unowned logs are intentionally destroyed:
// their original account cannot be proven, so attaching them to a new login is unsafe.
const KEY = 'klima_app_diagnostic_log_v1273';
const LEGACY_KEY = 'klima_app_diagnostic_log';
const STORE_VERSION = 3;
const MAX_ENTRIES = 300;

let activeUserId = '';
let generation = 0;

function local() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function removeLegacy() {
  try { local()?.removeItem(LEGACY_KEY); } catch { /* privacy cleanup is best-effort */ }
}
function clearPersisted() {
  try { local()?.removeItem(KEY); } catch { /* safe fail closed */ }
}

export function setDiagnosticUser(userId = '') {
  removeLegacy();
  const normalized = String(userId || '').trim();
  const next = /^[0-9a-z-]{4,128}$/i.test(normalized) ? normalized : '';
  if (activeUserId !== next) {
    const previous = activeUserId;
    activeUserId = next;
    generation += 1;
    // First restore may reuse a same-owner safe envelope. Every logout
    // and authenticated account handoff destroys the previous envelope.
    if (previous || !next) clearPersisted();
  }
  return generation;
}

export function getDiagnosticSession() {
  return { userId: activeUserId, generation };
}

export function readDiagnosticEntries() {
  removeLegacy();
  const storage = local();
  if (!activeUserId || !storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const envelope = JSON.parse(raw);
    if (envelope?.version !== STORE_VERSION || envelope?.owner !== activeUserId || !Array.isArray(envelope.entries)) {
      storage.removeItem(KEY);
      return [];
    }
    return envelope.entries.slice(-MAX_ENTRIES).map(sanitizeDiagnosticEntry);
  } catch {
    clearPersisted();
    return [];
  }
}

export function writeDiagnosticEntries(entries, expected = getDiagnosticSession()) {
  removeLegacy();
  if (!activeUserId || expected.userId !== activeUserId || expected.generation !== generation) return false;
  try {
    const storage = local();
    if (!storage) return false;
    // Do not overwrite another account's storage from a different tab.
    const raw = storage.getItem(KEY);
    if (raw) {
      const envelope = JSON.parse(raw);
      if (envelope?.owner !== activeUserId || envelope?.version !== STORE_VERSION) return false;
    }
    const safe = (Array.isArray(entries) ? entries : []).slice(-MAX_ENTRIES).map(sanitizeDiagnosticEntry);
    storage.setItem(KEY, JSON.stringify({ version: STORE_VERSION, owner: activeUserId, entries: safe }));
    return true;
  } catch { return false; }
}

export function clearDiagnosticEntries() {
  removeLegacy();
  clearPersisted();
}

// Clear the legacy raw buffer on first load, including the signed-out state.
removeLegacy();
