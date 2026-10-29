// Protokół serwisowy 13.93: nazwiska wykonawców nie trafiają do widocznego PDF.
export function serviceTechnicianInitials(names = []) {
  return [...new Set((names || []).map(name =>
    String(name || '').trim().split(/\s+/u).filter(Boolean)
      .map(part => part.codePointAt(0) ? String.fromCodePoint(part.codePointAt(0)).toLocaleUpperCase('pl-PL') : '')
      .join('')
  ).filter(Boolean))].join(', ') || '—';
}
