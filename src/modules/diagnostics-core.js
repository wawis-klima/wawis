export const DIAGNOSTIC_RECENT_HOURS = 24;

const INFORMATIONAL_EVENT_PATTERN = /(?:^|\.)(?:boot|started|completed|succeeded|downloaded|online|closed|sent)$/i;
const ERROR_EVENT_PATTERN = /(?:^|\.)(?:error|failed|failure|unhandledrejection|exception)$/i;
const WARNING_EVENT_PATTERN = /(?:^|\.)(?:warn|warning|timeout|offline|retry|conflict|abort|aborted)$/i;

const MODULE_LABELS = Object.freeze({
  app: 'Aplikacja',
  auth: 'Logowanie',
  calendar: 'Kalendarz',
  comments: 'Komentarze',
  contractors: 'Kontrahenci',
  'data.refresh': 'Odświeżanie danych',
  devices: 'Urządzenia',
  diagnostics: 'Diagnostyka',
  jobs: 'Montaże',
  nameplate: 'Tabliczki znamionowe',
  network: 'Połączenie z serwerem',
  offline: 'Tryb offline',
  photos: 'Zdjęcia',
  protocol: 'Protokół',
  push: 'Powiadomienia PUSH',
  sms: 'SMS',
  storage: 'Pamięć i kopie',
});

function valueToText(value, depth = 0) {
  if (value == null || depth > 2) return '';
  if (value instanceof Error) return `${value.name || ''} ${value.message || ''}`.trim();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.slice(0, 8).map((entry) => valueToText(entry, depth + 1)).join(' ');
  if (typeof value === 'object') {
    return [value.message, value.reason, value.error, value.code, value.module, value.args]
      .map((entry) => valueToText(entry, depth + 1))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function normalizeModule(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 80);
}

export function inferDiagnosticModule(typeOrEntry = '', payload = {}) {
  const entry = typeof typeOrEntry === 'object' && typeOrEntry !== null ? typeOrEntry : null;
  const type = String(entry?.type || entry?.event_type || typeOrEntry || '').toLowerCase();
  const entryPayload = entry?.payload || payload || {};
  const explicitModule = normalizeModule(entry?.module || entry?.diagnostic_module || entryPayload?.module);
  if (explicitModule) return explicitModule;

  const source = `${type} ${valueToText(entryPayload)} ${entry?.error_message || ''}`.toLowerCase();
  if (/protocol|protok[oó][łl]/i.test(source)) return 'protocol';
  if (/thumbnail|miniatur|photo|image|zdj|zdj[eę]ci/i.test(source)) return 'photos';
  if (/nameplate|tabliczk|barcode|code 128|ean|ocr/i.test(source)) return 'nameplate';
  if (/push|powiadom|subskrypc/i.test(source)) return 'push';
  if (/refreshall|refreshchanged|od[śs]wie[żz]|pobra[ćc] danych|synchronizacj.*danych/i.test(source)) return 'data.refresh';
  if (/auth|session|jwt|logow|wylog/i.test(source)) return 'auth';
  if (/comment|komentar/i.test(source)) return 'comments';
  if (/contractor|kontrahent/i.test(source)) return 'contractors';
  if (/device|urz[aą]dze/i.test(source)) return 'devices';
  if (/calendar|kalendar/i.test(source)) return 'calendar';
  if (/\bsms\b/i.test(source)) return 'sms';
  if (/job|monta[żz]|zlecen/i.test(source)) return 'jobs';
  if (/indexeddb|backup|storage|pami[eę][ćc]|kopia/i.test(source)) return 'storage';
  if (/offline|kolejk/i.test(source)) return 'offline';
  if (/network|fetch|supabase|database|schema cache|po[łl][aą]czen/i.test(source)) return 'network';
  if (/diagnostic|diagnostyk/i.test(source)) return 'diagnostics';
  return 'app';
}

export function getDiagnosticModuleLabel(moduleName = '') {
  const normalized = normalizeModule(moduleName) || 'app';
  return MODULE_LABELS[normalized] || normalized;
}

export function getDiagnosticSeverity(entry = {}) {
  const type = String(entry.type || entry.event_type || '').trim().toLowerCase();

  // Typ zdarzenia jest źródłem prawdy. Treść payloadu może zawierać np.
  // `failedCount: 0`, co nie może zmieniać udanego zapisu w fałszywy błąd.
  if (type === 'console.error' || type === 'window.error' || type === 'window.unhandledrejection') return 'error';
  if (type === 'console.warn') return 'warning';
  if (INFORMATIONAL_EVENT_PATTERN.test(type)) return '';
  if (ERROR_EVENT_PATTERN.test(type)) return 'error';
  if (WARNING_EVENT_PATTERN.test(type)) return 'warning';

  const explicitSeverity = String(entry.severity || entry.payload?.severity || '').toLowerCase();
  return explicitSeverity === 'error' || explicitSeverity === 'warning' ? explicitSeverity : '';
}

export function getDiagnosticEntryTime(entry = {}) {
  return entry.time || entry.occurred_at || entry.received_at || '';
}

export function partitionDiagnosticEntries(entries = [], { hours = DIAGNOSTIC_RECENT_HOURS, now = Date.now() } = {}) {
  const windowMs = Math.max(1, Number(hours) || DIAGNOSTIC_RECENT_HOURS) * 60 * 60 * 1000;
  const cutoffMs = Number(now) - windowMs;
  const recent = [];
  const history = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const entryMs = new Date(getDiagnosticEntryTime(entry)).getTime();
    if (Number.isFinite(entryMs) && entryMs >= cutoffMs) recent.push(entry);
    else history.push(entry);
  }

  return { recent, history, cutoffIso: new Date(cutoffMs).toISOString(), hours: Math.max(1, Number(hours) || DIAGNOSTIC_RECENT_HOURS) };
}

function getComparableMessage(entry = {}) {
  const payload = entry.payload || {};
  return String(
    entry.error_message
    || payload?.error?.message
    || payload?.reason?.message
    || payload?.message
    || (Array.isArray(payload?.args) ? payload.args.map((arg) => valueToText(arg)).join(' ') : '')
    || ''
  ).trim();
}

export function groupDiagnosticEntries(entries = [], { onlyProblems = false } = {}) {
  const groups = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const type = String(entry.type || entry.event_type || 'unknown');
    const severity = getDiagnosticSeverity(entry);
    if (onlyProblems && !severity) continue;
    const moduleName = inferDiagnosticModule(entry);
    const message = getComparableMessage(entry);
    const platform = String(entry.platform || '');
    const appVersion = String(entry.app_version || entry.appVersion || '');
    const errorCode = String(entry.error_code || entry.payload?.error?.code || entry.payload?.code || '');
    const key = JSON.stringify([type, severity, moduleName, message, platform, appVersion, errorCode]);
    const eventTime = getDiagnosticEntryTime(entry);
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      if (!existing.firstAt || new Date(eventTime) < new Date(existing.firstAt)) existing.firstAt = eventTime;
      if (!existing.lastAt || new Date(eventTime) > new Date(existing.lastAt)) existing.lastAt = eventTime;
      continue;
    }


    groups.set(key, {
      ...entry,
      type,
      severity,
      module: moduleName,
      moduleLabel: getDiagnosticModuleLabel(moduleName),
      message,
      platform,
      appVersion,
      errorCode,
      count: 1,
      firstAt: eventTime,
      lastAt: eventTime,
    });
  }

  return Array.from(groups.values()).sort((left, right) => (
    new Date(right.lastAt || 0).getTime() - new Date(left.lastAt || 0).getTime()
  ));
}
