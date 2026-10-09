// Tylko etykieta na mobilnej karcie montażu; dane klienta pozostają bez zmian.
const LONG_NAME_THRESHOLD = 48;
const MAX_TRADE_NAME_LENGTH = 36;

function tradeNameCandidate(value) {
  const candidate = String(value || '').replace(/\s+/g, ' ').trim();
  if (candidate.length < 2 || candidate.length > MAX_TRADE_NAME_LENGTH) return '';
  if (!/\p{L}/u.test(candidate)) return '';
  if (/^(?:spółka|sp\.|nip|regon|pesel|oddział|filia|siedziba|adres|ulica|kod pocztowy|właściciel|wspólnicy)\b/iu.test(candidate)) return '';
  return candidate;
}

function oneUnambiguousName(source, pattern) {
  const matches = [...source.matchAll(pattern)].map((match) => tradeNameCandidate(match[1])).filter(Boolean);
  return matches.length === 1 ? matches[0] : '';
}

export function getCustomerCardDisplayName(name) {
  const fullName = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (fullName.length <= LONG_NAME_THRESHOLD) return fullName;

  // Rozpoznaj nazwę handlową tylko, gdy wskazano ją jednoznacznie.
  const quoted = oneUnambiguousName(fullName, /["„“]([^"„“”]{2,36})["”]/g);
  if (quoted) return quoted;

  // Nawias nie zawsze zawiera nazwę handlową, stąd dodatkowy warunek.
  if (/\b(?:przedsiębiorstwo|firma|zakład|hurtownia|handel|usługi|fhu|phu)\b/iu.test(fullName)) {
    const parenthesized = oneUnambiguousName(fullName, /\(([^()]{2,36})\)/g);
    if (parenthesized) return parenthesized;
  }

  // Nie odgadujemy nazwy marki z imion i nazwisk ani z niejednoznacznych zapisów.
  return fullName
    .replace(/spółka z ograniczoną odpowiedzialnością/giu, 'sp. z o.o.')
    .replace(/spółka komandytowa/giu, 'sp.k.')
    .replace(/spółka jawna/giu, 'sp.j.');
}
