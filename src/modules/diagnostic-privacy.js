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
const LEGACY_SAFE_KEY = 'klima_app_diagnostic_log_v1273';
const LEGACY_UNSAFE_KEY = 'klima_app_diagnostic_log';
const EVENT_PREFIX = 'klima_app_diagnostic_event_v1274:';
const COUNTER_PREFIX = 'klima_app_diagnostic_dropped_v1274:';
const MAX_ENTRIES = 300;

let activeUserId = '';
let generation = 0;

function local() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function safeRemove(storage, key) {
  try { storage?.removeItem(key); } catch { /* logger must never throw */ }
}
function allEventKeys(storage) {
  if (!storage) return [];
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(EVENT_PREFIX)) keys.push(key);
    }
  } catch { return []; }
  return keys;
}
function removeOldUnsafe() { safeRemove(local(), LEGACY_UNSAFE_KEY); }
function entryKey(entryId) { return EVENT_PREFIX + entryId; }
function readEnvelope(storage, key) {
  try {
    const item = JSON.parse(storage.getItem(key) || 'null');
    return item && typeof item === 'object' ? item : null;
  } catch { return null; }
}
function removeForeignEvents(storage, owner) {
  for (const key of allEventKeys(storage)) {
    const item = readEnvelope(storage, key);
    if (!item || item.owner !== owner || item.version !== 4) safeRemove(storage, key);
  }
}
function currentEntries(storage) {
  if (!activeUserId || !storage) return [];
  const result = [];
  for (const key of allEventKeys(storage)) {
    const item = readEnvelope(storage, key);
    if (!item || item.owner !== activeUserId || item.version !== 4) continue;
    const entry = sanitizeDiagnosticEntry(item.entry);
    if (!entry.id || entryKey(entry.id) !== key) {
      safeRemove(storage, key);
      continue;
    }
    result.push(entry);
  }
  return result.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}
function migrateSafeBuffer(storage) {
  // Existing v12.73 envelope is already privacy-sanitized and carries an owner.
  // Migrate only for the exact authenticated owner; never adopt an unowned buffer.
  if (!storage || !activeUserId) return;
  const previous = readEnvelope(storage, LEGACY_SAFE_KEY);
  if (!previous || previous.version !== 3 || previous.owner !== activeUserId || !Array.isArray(previous.entries)) {
    safeRemove(storage, LEGACY_SAFE_KEY);
    return;
  }
  for (const old of previous.entries.slice(-MAX_ENTRIES)) {
    const entry = sanitizeDiagnosticEntry(old);
    if (!entry.id) continue;
    try {
      const key = entryKey(entry.id);
      if (!storage.getItem(key)) storage.setItem(key, JSON.stringify({ version: 4, owner: activeUserId, entry }));
    } catch { break; }
  }
  safeRemove(storage, LEGACY_SAFE_KEY);
}
function increaseDropped(storage, owner) {
  try {
    const key = COUNTER_PREFIX + owner;
    const oldCount = Number(storage.getItem(key)) || 0;
    storage.setItem(key, String(Math.min(1000000, oldCount + 1)));
  } catch { /* safe fallback */ }
}
function trimStorage(storage, owner, incoming = null) {
  // New informational traffic must not evict pending errors or warnings.
  const entries = currentEntries(storage);
  if (entries.length < MAX_ENTRIES) return true;
  // Evict acknowledged entries first, then informational entries only.
  const victim = entries.find((e) => Boolean(e.remote_synced_at))
    || entries.find((e) => !getDiagnosticSeverity(e));
  if (!victim) {
    increaseDropped(storage, owner);
    return false;
  }
  safeRemove(storage, entryKey(victim.id));
  increaseDropped(storage, owner);
  return true;
}

export function setDiagnosticUser(userId = '') {
  removeOldUnsafe();
  const normalized = String(userId || '').trim();
  const next = /^[0-9a-z-]{4,128}$/i.test(normalized) ? normalized : '';
  if (activeUserId !== next) {
    const previous = activeUserId;
    activeUserId = next;
    generation += 1;
    // Once a session is removed, delete its diagnostic buffer from this device.
    if (previous && previous !== next) {
      const storage = local();
      for (const key of allEventKeys(storage)) {
        const item = readEnvelope(storage, key);
        if (item?.owner === previous) safeRemove(storage, key);
      }
      safeRemove(storage, COUNTER_PREFIX + previous);
    }
  }
  const storage = local();
  if (next) {
    removeForeignEvents(storage, next);
    migrateSafeBuffer(storage);
  } else {
    // Never expose old diagnostics on a login screen; old owner unknown.
    safeRemove(storage, LEGACY_SAFE_KEY);
  }
  return generation;
}

export function getDiagnosticSession() {
  return { userId: activeUserId, generation };
}
function isCurrent(session) {
  return Boolean(session?.userId) && session.userId === activeUserId && session.generation === generation;
}
export function readDiagnosticEntries() {
  removeOldUnsafe();
  if (!activeUserId) return [];
  return currentEntries(local());
}
export function appendDiagnosticEntry(raw, session = getDiagnosticSession()) {
  removeOldUnsafe();
  if (!isCurrent(session)) return false;
  const storage = local();
  if (!storage) return false;
  const entry = sanitizeDiagnosticEntry(raw);
  if (!entry.id) return false;
  const key = entryKey(entry.id);
  try {
    if (storage.getItem(key)) return true; // idempotent
    if (!trimStorage(storage, session.userId, entry)) return false;
    if (!isCurrent(session)) return false;
    storage.setItem(key, JSON.stringify({ version: 4, owner: session.userId, entry }));
    return true;
  } catch {
    increaseDropped(storage, session.userId);
    return false;
  }
}
export function acknowledgeDiagnosticEntries(ids, session = getDiagnosticSession(), syncedAt = new Date().toISOString()) {
  if (!isCurrent(session)) return false;
  const storage = local();
  if (!storage) return false;
  for (const id of ids) {
    if (!isCurrent(session)) return false;
    const key = entryKey(id);
    const raw = readEnvelope(storage, key);
    if (raw?.owner !== session.userId || raw.version !== 4) continue;
    const entry = sanitizeDiagnosticEntry(raw.entry);
    if (entry.id !== id || entry.remote_synced_at) continue;
    try {
      storage.setItem(key, JSON.stringify({
        version: 4, owner: session.userId, entry: { ...entry, remote_synced_at: syncedAt },
      }));
    } catch { return false; }
  }
  return true;
}
export function getDiagnosticDroppedCount() {
  if (!activeUserId) return 0;
  try { return Math.max(0, Math.min(1000000, Number(local()?.getItem(COUNTER_PREFIX + activeUserId)) || 0)); }
  catch { return 0; }
}
export function clearDiagnosticEntries() {
  removeOldUnsafe();
  const storage = local();
  if (!storage || !activeUserId) return;
  for (const key of allEventKeys(storage)) {
    const item = readEnvelope(storage, key);
    if (item?.owner === activeUserId) safeRemove(storage, key);
  }
  safeRemove(storage, COUNTER_PREFIX + activeUserId);
}
// Initial load must not retain unowned raw messages even before auth restore.
removeOldUnsafe();
