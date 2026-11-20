// WAWIS 14.49 — obserwacja polityki CSP w trybie Report-Only (decyzja właściciela 20.11.2026).
// Przeglądarka NIE blokuje niczego (nagłówek Content-Security-Policy-Report-Only), tylko zgłasza
// zdarzenie `securitypolicyviolation`. Zapisujemy je w diagnostyce jako stały typ zdarzenia:
//   app.csp.<dyrektywa>.<źródło>.warning
// Zgodnie z zasadami diagnostyki nie zapisujemy adresów URL ani ścieżek — tylko dyrektywę z zamkniętej
// listy i rodzaj źródła z zamkniętej listy (np. supabase, jsdelivr, inline, eval). Po tygodniu bez zgłoszeń
// politykę można przełączyć na wymuszaną.

export const CSP_SUPABASE_HOST = 'uohziyaudbpwmupvljyd.supabase.co';

const DIRECTIVES = new Set([
  'default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem',
  'style-src-attr', 'img-src', 'font-src', 'connect-src', 'media-src', 'object-src', 'frame-src',
  'child-src', 'worker-src', 'manifest-src', 'base-uri', 'form-action', 'frame-ancestors',
]);

const KNOWN_HOSTS = Object.freeze([
  [CSP_SUPABASE_HOST, 'supabase'],
  ['fastly.jsdelivr.net', 'jsdelivr'],
  ['cdn.jsdelivr.net', 'jsdelivr'],
  ['geocoding-api.open-meteo.com', 'open-meteo'],
  ['archive-api.open-meteo.com', 'open-meteo'],
  ['api.open-meteo.com', 'open-meteo'],
]);

// Dyrektywa naruszona → stała nazwa z listy (np. "script-src-elem"), inaczej "other".
export function normalizeCspDirective(value) {
  const directive = String(value || '').trim().toLowerCase().split(/\s+/)[0] || '';
  return DIRECTIVES.has(directive) ? directive : 'other';
}

// Zablokowane źródło → rodzaj z zamkniętej listy. Nigdy nie zwraca adresu ani ścieżki.
export function classifyCspBlockedSource(blockedURI, pageOrigin = '') {
  const raw = String(blockedURI || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (raw === 'inline') return 'inline';
  if (raw === 'eval') return 'eval';
  if (raw === 'wasm-eval') return 'wasm-eval';
  if (raw === 'self') return 'self';
  if (raw.startsWith('blob')) return 'blob';
  if (raw.startsWith('data')) return 'data';
  if (raw.startsWith('about')) return 'about';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'other';
  }
  if (pageOrigin && url.origin === String(pageOrigin).toLowerCase()) return 'self';
  if (url.protocol === 'wss:' && url.host === CSP_SUPABASE_HOST) return 'supabase-realtime';
  const known = KNOWN_HOSTS.find(([host]) => url.host === host);
  if (known) return known[1];
  return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'wss:' ? 'external' : 'other';
}

export function buildCspViolationEventType(event = {}, pageOrigin = '') {
  const directive = normalizeCspDirective(event.effectiveDirective || event.violatedDirective);
  const source = classifyCspBlockedSource(event.blockedURI, pageOrigin);
  return `app.csp.${directive}.${source}.warning`;
}

// Jedno zgłoszenie danego rodzaju na sesję strony — bez zalewania diagnostyki
// (np. ten sam blokowany adres przy każdym odświeżeniu danych).
export function installCspViolationDiagnostics(log, target = typeof document !== 'undefined' ? document : null) {
  if (!target || typeof target.addEventListener !== 'function' || typeof log !== 'function') return () => {};
  const seen = new Set();
  const pageOrigin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const handler = (event) => {
    try {
      const type = buildCspViolationEventType(event, pageOrigin);
      if (seen.has(type) || seen.size >= 40) return;
      seen.add(type);
      log(type, { count: 1, code: 'CSP_REPORT_ONLY_VIOLATION' });
    } catch {
      // Diagnostyka nigdy nie może zatrzymać aplikacji.
    }
  };
  target.addEventListener('securitypolicyviolation', handler);
  return () => target.removeEventListener('securitypolicyviolation', handler);
}
