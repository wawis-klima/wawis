const POLISH_DIGITS = new Map([
  ['zero', '0'], ['jeden', '1'], ['jedna', '1'], ['jedno', '1'],
  ['dwa', '2'], ['dwie', '2'], ['trzy', '3'], ['cztery', '4'],
  ['pięć', '5'], ['piec', '5'], ['sześć', '6'], ['szesc', '6'],
  ['siedem', '7'], ['osiem', '8'], ['dziewięć', '9'], ['dziewiec', '9'],
]);

const POLISH_LETTER_NAMES = new Map([
  ['a', 'a'], ['be', 'b'], ['ce', 'c'], ['de', 'd'], ['e', 'e'], ['ef', 'f'], ['gie', 'g'], ['ha', 'h'],
  ['i', 'i'], ['jot', 'j'], ['ka', 'k'], ['el', 'l'], ['em', 'm'], ['en', 'n'], ['o', 'o'], ['pe', 'p'],
  ['er', 'r'], ['es', 's'], ['te', 't'], ['u', 'u'], ['wu', 'w'], ['iks', 'x'], ['igrek', 'y'], ['zet', 'z'],
]);

const POLISH_LETTERS = 'A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż';
const PHONE_LABEL_RE = /\b(?:telefon|tel\.?|komórka|komorka|numer telefonu)\b/i;
const EMAIL_LABEL_RE = /\b(?:e-?mail|email|mail|adres e-?mail|adres email)\b/i;
const STREET_LABEL_RE = /\b(?:ulica|ul\.?|aleja|al\.?|plac|osiedle)\b/i;
const CITY_LABEL_RE = /\b(?:miasto|miejscowość|miejscowosc)\b/i;
const POSTAL_LABEL_RE = /\b(?:kod pocztowy|kod)\b/i;

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripPunctuation(value = '') {
  return cleanText(value).replace(/^[,;:.\-\s]+|[,;:.\-\s]+$/g, '').trim();
}

function titleCaseLoose(value = '') {
  return cleanText(value)
    .split(' ')
    .map((part) => part ? `${part.charAt(0).toLocaleUpperCase('pl-PL')}${part.slice(1)}` : '')
    .join(' ');
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeRange(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return text;
  return cleanText(`${text.slice(0, start)} , ${text.slice(end)}`);
}

export function isClientSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function looksLikeValidEmail(value = '') {
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(cleanText(value));
}

function formatPhoneDigits(digits = '', hasPlus = false) {
  const compact = String(digits || '').replace(/\D+/g, '');
  if (!compact) return '';
  if ((hasPlus || compact.length === 11) && compact.length === 11 && compact.startsWith('48')) {
    return `+48 ${compact.slice(2, 5)} ${compact.slice(5, 8)} ${compact.slice(8)}`;
  }
  if (compact.length === 9) return compact.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  return compact;
}

function spokenSingleDigitsToDigits(value = '') {
  const tokens = cleanText(value).toLocaleLowerCase('pl-PL').split(/[\s,;.-]+/).filter(Boolean);
  if (!tokens.length) return '';
  return tokens.map((token) => POLISH_DIGITS.get(token) ?? token).join(' ');
}

function findPhoneCandidate(value = '') {
  const text = cleanText(value);
  if (!text) return null;
  const candidates = [];

  // Cyfry zapisane przez Safari jako 606 606 909, 606-606-909, +48 606 606 909 lub 606606909.
  const groupedRe = /(?:^|[^\d])((?:\+\s*)?(?:48[\s.-]*)?(?:\d{1,3}[\s.-]+){2,8}\d{1,3})(?=$|[^\d])/g;
  let match;
  while ((match = groupedRe.exec(text)) !== null) {
    const raw = match[1];
    const digits = raw.replace(/\D+/g, '');
    if (!(digits.length === 9 || (digits.length === 11 && digits.startsWith('48')))) continue;
    const rawOffset = match[0].indexOf(raw);
    const start = match.index + Math.max(0, rawOffset);
    const end = start + raw.length;
    const context = text.slice(Math.max(0, start - 24), start);
    candidates.push({
      raw,
      start,
      end,
      digits,
      score: 100 + (PHONE_LABEL_RE.test(context) ? 30 : 0) + (start / Math.max(1, text.length)),
    });
  }

  const compactRe = /(?:^|[^\d])(\+?48\d{9}|\d{9})(?=$|[^\d])/g;
  while ((match = compactRe.exec(text)) !== null) {
    const raw = match[1];
    const digits = raw.replace(/\D+/g, '');
    const rawOffset = match[0].indexOf(raw);
    const start = match.index + Math.max(0, rawOffset);
    const end = start + raw.length;
    const context = text.slice(Math.max(0, start - 24), start);
    candidates.push({
      raw,
      start,
      end,
      digits,
      score: 105 + (PHONE_LABEL_RE.test(context) ? 30 : 0) + (start / Math.max(1, text.length)),
    });
  }

  // Pojedynczo dyktowane cyfry: „sześć zero sześć ...”. Nie wolno przeskakiwać przez zwykłe słowa,
  // dzięki czemu numery domu/lokalu nie zostaną doklejone do telefonu.
  const digitWords = [...new Set(POLISH_DIGITS.keys())].map(escapeRegExp).join('|');
  const spokenRe = new RegExp(`\\b(?:${digitWords})(?:[\\s,;.-]+(?:${digitWords})){8,10}\\b`, 'gi');
  while ((match = spokenRe.exec(text)) !== null) {
    const raw = match[0];
    const digits = spokenSingleDigitsToDigits(raw).replace(/\D+/g, '');
    if (!(digits.length === 9 || (digits.length === 11 && digits.startsWith('48')))) continue;
    const start = match.index;
    const end = start + raw.length;
    const context = text.slice(Math.max(0, start - 24), start);
    candidates.push({
      raw,
      start,
      end,
      digits,
      score: 95 + (PHONE_LABEL_RE.test(context) ? 30 : 0) + (start / Math.max(1, text.length)),
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.start - a.start);
  const best = candidates[0];
  return {
    ...best,
    normalized: formatPhoneDigits(best.digits, /^\s*\+/.test(best.raw)),
  };
}

export function normalizeVoicePhone(value = '') {
  const text = cleanText(value);
  const candidate = findPhoneCandidate(text);
  if (candidate) return candidate.normalized;

  const converted = spokenSingleDigitsToDigits(text);
  const hasPlus = /^\s*plus\b|^\s*\+/i.test(text);
  const digits = converted.replace(/\D+/g, '');
  if (!digits) return text;
  return formatPhoneDigits(digits, hasPlus);
}

export function normalizeVoiceEmail(value = '') {
  let text = cleanText(value).toLocaleLowerCase('pl-PL');
  text = text
    .replace(/^\s*(?:adres\s+)?(?:e-?mail|email|mail)\s*[:,-]?\s*/i, '')
    .replace(/\b(?:małpa|malpa)\b/gi, ' @ ')
    .replace(/\b(?:kropka|dot)\b/gi, ' . ')
    .replace(/\b(?:myślnik|myslnik)\b/gi, ' - ')
    .replace(/\b(?:podkreślenie|podkreslenie)\b/gi, ' _ ')
    .replace(/\bplus\b/gi, ' + ')
    .replace(/\s*@\s*/g, ' @ ')
    .replace(/\s*\.\s*/g, ' . ');

  const tokens = text.split(/\s+/).filter(Boolean).map((token) => {
    if (['@', '.', '-', '_', '+'].includes(token)) return token;
    return POLISH_LETTER_NAMES.get(token) ?? token;
  });
  return tokens.join('').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
}

function normalizePostalCode(value = '') {
  const match = cleanText(value).match(/\b(\d{2})[-\s]?(\d{3})\b/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function removeKnownLabel(value = '', labels = []) {
  const labelPattern = labels.map(escapeRegExp).join('|');
  if (!labelPattern) return stripPunctuation(value);
  return stripPunctuation(value.replace(new RegExp(`^\\s*(?:${labelPattern})\\s*[:,-]?\\s*`, 'i'), ''));
}

function emailLocalTokenValue(token = '') {
  const clean = stripPunctuation(token).toLocaleLowerCase('pl-PL');
  if (!clean) return '';
  return POLISH_LETTER_NAMES.get(clean) ?? clean;
}

function findEmailCandidate(value = '') {
  const text = cleanText(value);
  if (!text) return null;

  const rawMatch = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\b/);
  if (rawMatch) {
    return {
      email: normalizeVoiceEmail(rawMatch[0]),
      raw: rawMatch[0],
      start: rawMatch.index,
      end: rawMatch.index + rawMatch[0].length,
      valid: true,
    };
  }

  const markerMatch = /@|\b(?:małpa|malpa)\b/i.exec(text);
  if (!markerMatch) return null;

  const markerStart = markerMatch.index;
  const markerEnd = markerStart + markerMatch[0].length;
  const left = text.slice(0, markerStart);
  const right = text.slice(markerEnd);

  const leftChunkStart = Math.max(left.lastIndexOf(','), left.lastIndexOf(';')) + 1;
  const leftChunk = left.slice(leftChunkStart);
  const tokenRe = new RegExp(`[${POLISH_LETTERS}0-9._+-]+`, 'g');
  const leftTokens = [];
  let tokenMatch;
  while ((tokenMatch = tokenRe.exec(leftChunk)) !== null) {
    leftTokens.push({ value: tokenMatch[0], index: leftChunkStart + tokenMatch.index });
  }
  if (!leftTokens.length) return null;

  // Safari często rozdziela ostatnią literę adresu e-mail: „Wasik P @ ...”.
  // Bierzemy więc ostatni wyraz, a gdy końcówka wygląda jak pojedyncza litera/nazwa litery — dokładamy poprzedni wyraz.
  let localStartIndex = leftTokens.length - 1;
  const lastToken = leftTokens[leftTokens.length - 1].value.toLocaleLowerCase('pl-PL');
  const lastLooksSpelled = lastToken.length === 1 || POLISH_LETTER_NAMES.has(lastToken);
  if (lastLooksSpelled && leftTokens.length >= 2) localStartIndex -= 1;

  // Gdy cały lokalny człon jest literowany („wu a es i ka pe”), zbieramy kolejne nazwy liter od końca.
  while (localStartIndex > 0) {
    const token = leftTokens[localStartIndex].value.toLocaleLowerCase('pl-PL');
    const prev = leftTokens[localStartIndex - 1].value.toLocaleLowerCase('pl-PL');
    if ((token.length === 1 || POLISH_LETTER_NAMES.has(token)) && (prev.length === 1 || POLISH_LETTER_NAMES.has(prev))) {
      localStartIndex -= 1;
      continue;
    }
    break;
  }

  const localTokens = leftTokens.slice(localStartIndex).map((item) => emailLocalTokenValue(item.value));
  let local = localTokens.join('').replace(/[^a-z0-9._%+-]/gi, '');
  local = local.replace(/^\.+|\.+$/g, '');

  // Prawa część może być „e kropka pe el”, „e . pl”, „gmail.com” itd.
  const rightBoundaryMatch = right.match(/[,;\n]|\b(?:telefon|tel\.?|komórka|komorka|kod pocztowy|miasto|miejscowość|miejscowosc|ulica|ul\.?)\b/i);
  const rightChunkRaw = right.slice(0, rightBoundaryMatch ? rightBoundaryMatch.index : right.length).trim();
  const domainNormalized = normalizeVoiceEmail(rightChunkRaw).replace(/^@+/, '');
  const email = normalizeVoiceEmail(`${local}@${domainNormalized}`);
  const start = leftTokens[localStartIndex].index;
  const end = markerEnd + (rightBoundaryMatch ? rightBoundaryMatch.index : right.length);
  const raw = text.slice(start, end).trim();

  return {
    email: looksLikeValidEmail(email) ? email : '',
    raw,
    start,
    end,
    valid: looksLikeValidEmail(email),
  };
}

function parseStreetSegment(segment = '') {
  let text = removeKnownLabel(segment, ['ulica', 'ul', 'aleja', 'al', 'plac', 'osiedle']);
  let apartmentNumber = '';
  let houseNumber = '';
  let remainder = '';

  const spokenSlashMatch = text.match(/\b([0-9]+[a-zA-Z]?)\s*(?:\/|(?:łamane\s+)?przez|lamane\s+przez|ukośnik|ukosnik|slash)\s*([0-9]+[a-zA-Z]?)\b/i);
  if (spokenSlashMatch) {
    houseNumber = spokenSlashMatch[1];
    apartmentNumber = spokenSlashMatch[2];
    const before = text.slice(0, spokenSlashMatch.index).trim();
    const after = text.slice((spokenSlashMatch.index || 0) + spokenSlashMatch[0].length).trim();
    text = before;
    remainder = stripPunctuation(after);
  }

  if (!apartmentNumber) {
    const apartmentMatch = text.match(/\b(?:mieszkanie|mieszkania|lokal|lokalu|m\.?|lok\.?)\s*(?:numer|nr)?\s*([0-9]+[a-zA-Z]?)\b/i);
    if (apartmentMatch) {
      apartmentNumber = apartmentMatch[1];
      text = text.replace(apartmentMatch[0], ' ');
    }
  }

  if (!houseNumber) {
    const houseLabelMatch = text.match(/\b(?:numer domu|nr domu|dom)\s*([0-9]+[a-zA-Z]?)\b/i);
    if (houseLabelMatch) {
      houseNumber = houseLabelMatch[1];
      text = text.replace(houseLabelMatch[0], ' ');
    }
  }

  if (!houseNumber) {
    const trailingHouseMatch = text.match(/(?:^|\s)([0-9]+[a-zA-Z]?)\s*$/);
    if (trailingHouseMatch) {
      houseNumber = trailingHouseMatch[1];
      text = text.slice(0, trailingHouseMatch.index).trim();
    }
  }

  return {
    streetName: titleCaseLoose(stripPunctuation(text)),
    houseNumber: cleanText(houseNumber),
    apartmentNumber: cleanText(apartmentNumber),
    remainder,
  };
}

function looksLikePhoneSegment(segment = '') {
  const text = cleanText(segment);
  if (PHONE_LABEL_RE.test(text)) return true;
  // Ważne: kandydat musi być spójnym fragmentem numeru. Nie zbieramy wszystkich cyfr z całego zdania.
  return Boolean(findPhoneCandidate(text));
}

function looksLikeStreetSegment(segment = '') {
  return STREET_LABEL_RE.test(segment);
}

function looksLikeCitySegment(segment = '') {
  return /^\s*(?:miasto|miejscowość|miejscowosc)\b/i.test(segment);
}

function looksLikeNameSegment(segment = '') {
  return /^\s*(?:klient|firma|nazwa firmy|imię i nazwisko|imie i nazwisko|nazwisko)\b/i.test(segment);
}

function looksLikeEmailSegment(segment = '') {
  return /@|\b(?:e-?mail|email|mail|małpa|malpa)\b/i.test(segment);
}

function applyParsedStreet(result, segment) {
  const parsed = parseStreetSegment(segment);
  result.streetName = parsed.streetName || result.streetName;
  result.houseNumber = parsed.houseNumber || result.houseNumber;
  result.apartmentNumber = parsed.apartmentNumber || result.apartmentNumber;
  if (!result.city && parsed.remainder && !/\d{3,}/.test(parsed.remainder)) {
    result.city = titleCaseLoose(parsed.remainder);
  }
}

function parseUnlabelledAddress(result, working = '') {
  if (result.streetName) return { working, consumed: false };
  const slashRe = /\b([0-9]+[a-zA-Z]?)\s*(?:\/|(?:łamane\s+)?przez|lamane\s+przez|ukośnik|ukosnik|slash)\s*([0-9]+[a-zA-Z]?)\b/i;
  const slashMatch = slashRe.exec(working);
  if (!slashMatch) return { working, consumed: false };

  const before = stripPunctuation(working.slice(0, slashMatch.index));
  const after = stripPunctuation(working.slice(slashMatch.index + slashMatch[0].length));
  const words = before.split(/\s+/).filter(Boolean);
  if (!words.length) return { working, consumed: false };

  // Bez komend przyjmujemy naturalny układ: imię+nazwisko, ulica, numer, miejscowość.
  // Jeżeli klient nie został jeszcze rozpoznany, pierwsze dwa słowa traktujemy jako osobę,
  // a pozostałą część przed numerem jako nazwę ulicy. Przy firmach nadal działa wariant z „ulica”.
  if (!result.clientName && words.length >= 3) {
    result.clientName = titleCaseLoose(words.slice(0, 2).join(' '));
    result.streetName = titleCaseLoose(words.slice(2).join(' '));
  } else {
    result.streetName = titleCaseLoose(words.join(' '));
  }
  result.houseNumber = slashMatch[1];
  result.apartmentNumber = slashMatch[2];
  if (!result.city && after && !/\d{3,}/.test(after)) result.city = titleCaseLoose(after);
  return { working: '', consumed: true };
}

export function formatVoiceStreet({ streetName = '', houseNumber = '', apartmentNumber = '' } = {}) {
  const base = cleanText(streetName);
  const number = [cleanText(houseNumber), cleanText(apartmentNumber)].filter(Boolean).join('/');
  return [base, number].filter(Boolean).join(' ').trim();
}

export function formatVoiceCity({ postalCode = '', city = '' } = {}) {
  return [cleanText(postalCode), cleanText(city)].filter(Boolean).join(' ').trim();
}

export function parseClientVoiceTranscript(transcript = '') {
  const original = cleanText(transcript);
  const result = {
    transcript: original,
    clientName: '',
    phone: '',
    email: '',
    postalCode: normalizePostalCode(original),
    city: '',
    streetName: '',
    houseNumber: '',
    apartmentNumber: '',
    warnings: [],
  };
  if (!original) return result;

  let working = original;

  // 1. Telefon: tylko spójny 9-cyfrowy fragment (lub +48), nigdy wszystkie cyfry ze zdania.
  const phoneCandidate = findPhoneCandidate(working);
  if (phoneCandidate) {
    result.phone = phoneCandidate.normalized;
    working = removeRange(working, phoneCandidate.start, phoneCandidate.end);
  }

  // 2. E-mail: działa bez słowa „email”; wystarczy naturalnie podyktowany adres z „małpa/@” i „kropka”.
  const emailCandidate = findEmailCandidate(working);
  if (emailCandidate) {
    result.email = emailCandidate.email;
    working = removeRange(working, emailCandidate.start, emailCandidate.end);
    if (!emailCandidate.valid) {
      result.warnings.push('Nie udało się pewnie rozpoznać adresu e-mail. Pole pozostawiono puste zamiast wpisywać zgadywaną wartość.');
    }
  }

  // Kod pocztowy usuwamy z tekstu roboczego, żeby nie pomylił się z numerem domu/telefonem.
  if (result.postalCode) {
    const postalRe = new RegExp(`\\b${escapeRegExp(result.postalCode).replace('\\-', '[-\\s]?')}\\b`);
    working = cleanText(working.replace(postalRe, ' , '));
  }

  // Najpierw naturalny, nieopisany układ „Piotr Wasik Widna 19 przez 19 Zawiercie”.
  if (!STREET_LABEL_RE.test(working)) {
    const fallback = parseUnlabelledAddress(result, working);
    if (fallback.consumed) working = fallback.working;
  }

  const markerSplit = /\s+(?=(?:telefon|tel\.?|komórka|komorka|numer telefonu|e-?mail|email|mail|adres e-?mail|miasto|miejscowość|miejscowosc|ulica|ul\.?|aleja|kod pocztowy|kod)\b)/i;
  const segments = working
    .split(/[,;\n]+/)
    .flatMap((segment) => segment.split(markerSplit))
    .map(stripPunctuation)
    .filter(Boolean);

  const unused = [];
  for (const segment of segments) {
    if (!result.phone && looksLikePhoneSegment(segment)) {
      const candidate = findPhoneCandidate(segment);
      result.phone = candidate?.normalized || normalizeVoicePhone(removeKnownLabel(segment, ['telefon', 'tel', 'komórka', 'komorka', 'numer telefonu']));
      continue;
    }
    if (!result.email && looksLikeEmailSegment(segment)) {
      const candidate = findEmailCandidate(segment);
      if (candidate?.valid) result.email = candidate.email;
      continue;
    }
    if (looksLikeNameSegment(segment) && !result.clientName) {
      result.clientName = titleCaseLoose(removeKnownLabel(segment, ['klient', 'firma', 'nazwa firmy', 'imię i nazwisko', 'imie i nazwisko', 'nazwisko']));
      continue;
    }
    if (looksLikeCitySegment(segment) && !result.city) {
      result.city = titleCaseLoose(removeKnownLabel(segment, ['miasto', 'miejscowość', 'miejscowosc']).replace(/\b\d{2}[-\s]?\d{3}\b/g, ''));
      continue;
    }
    if (looksLikeStreetSegment(segment) && !result.streetName) {
      applyParsedStreet(result, segment);
      continue;
    }
    if (/^\s*(?:kod pocztowy|kod)\b/i.test(segment)) {
      result.postalCode = normalizePostalCode(segment) || result.postalCode;
      const possibleCity = removeKnownLabel(segment, ['kod pocztowy', 'kod']).replace(/\b\d{2}[-\s]?\d{3}\b/g, '').trim();
      if (possibleCity && !result.city) result.city = titleCaseLoose(possibleCity);
      continue;
    }
    unused.push(segment);
  }

  if (!result.clientName && unused.length) {
    result.clientName = titleCaseLoose(unused.shift().replace(/\b\d{2}[-\s]?\d{3}\b/g, '').trim());
  }

  if (!result.city && unused.length) {
    const candidateIndex = unused.findIndex((item) => !looksLikePhoneSegment(item) && !/\d{3,}/.test(item));
    if (candidateIndex >= 0) {
      const candidate = unused.splice(candidateIndex, 1)[0];
      result.city = titleCaseLoose(candidate.replace(/\b\d{2}[-\s]?\d{3}\b/g, '').trim());
    }
  }

  if (!result.streetName && unused.length) {
    const streetCandidateIndex = unused.findIndex((item) => /\d/.test(item));
    if (streetCandidateIndex >= 0) applyParsedStreet(result, unused.splice(streetCandidateIndex, 1)[0]);
  }

  if (!result.streetName) {
    const streetMatch = working.match(/\b(?:ulica|ul\.?|aleja|al\.?|plac|osiedle)\s+([^,;]+)/i);
    if (streetMatch) applyParsedStreet(result, streetMatch[0]);
  }

  if (!result.city && result.postalCode) {
    const escaped = result.postalCode.replace('-', '[-\\s]?');
    const postalCityMatch = original.match(new RegExp(`${escaped}\\s+([${POLISH_LETTERS} -]{2,})`, 'i'));
    if (postalCityMatch) result.city = titleCaseLoose(postalCityMatch[1].split(/\b(?:ulica|ul\.?|telefon|tel\.?|e-?mail|email|mail)\b/i)[0]);
  }

  return result;
}

export function scoreClientVoiceTranscript(transcript = '') {
  const parsed = parseClientVoiceTranscript(transcript);
  let score = Math.min(cleanText(transcript).length / 100, 2);
  if (parsed.clientName) score += 2;
  if (parsed.streetName && parsed.houseNumber) score += 4;
  if (parsed.apartmentNumber) score += 1;
  if (parsed.city) score += 2;
  if (parsed.phone && /(?:\+48\s+)?\d{3}\s\d{3}\s\d{3}/.test(parsed.phone)) score += 5;
  if (parsed.email && looksLikeValidEmail(parsed.email)) score += 6;
  if (parsed.postalCode) score += 2;
  score -= (parsed.warnings?.length || 0) * 2;
  return score;
}

export function createClientSpeechRecognition({ onResult, onError, onEnd, continuous = false, interimResults = false } = {}) {
  if (typeof window === 'undefined') return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = 'pl-PL';
  recognition.continuous = Boolean(continuous);
  recognition.interimResults = Boolean(interimResults);
  recognition.maxAlternatives = 5;

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    const selectedAlternatives = [];
    const startIndex = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
    for (let index = startIndex; index < (event?.results?.length || 0); index += 1) {
      const result = event.results[index];
      const alternatives = [];
      for (let altIndex = 0; altIndex < (result?.length || 0); altIndex += 1) {
        const text = cleanText(result?.[altIndex]?.transcript || '');
        if (text) alternatives.push(text);
      }
      if (!alternatives.length) continue;
      alternatives.sort((a, b) => scoreClientVoiceTranscript(b) - scoreClientVoiceTranscript(a));
      const text = alternatives[0];
      selectedAlternatives.push({ selected: text, alternatives });
      if (result.isFinal) finalTranscript = cleanText(`${finalTranscript} ${text}`);
      else interimTranscript = cleanText(`${interimTranscript} ${text}`);
    }
    const transcript = cleanText(`${finalTranscript} ${interimTranscript}`);
    if (transcript) onResult?.(transcript, { finalTranscript, interimTranscript, selectedAlternatives });
  };
  recognition.onerror = (event) => onError?.(event?.error || 'unknown');
  recognition.onend = () => onEnd?.();
  return recognition;
}

export function getClientSpeechErrorMessage(errorCode = '') {
  switch (String(errorCode || '')) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Brak dostępu do mikrofonu. Zezwól tej stronie na używanie mikrofonu i spróbuj ponownie.';
    case 'audio-capture':
      return 'Przeglądarka przerwała dostęp do mikrofonu. Zachowaliśmy to, co już usłyszano — możesz poprawić dane albo spróbować ponownie.';
    case 'no-speech':
      return 'Nie usłyszałem wypowiedzi. Mów dalej albo zakończ dyktowanie.';
    case 'network':
      return 'Rozpoznawanie mowy wymaga teraz połączenia z internetem. Sprawdź sieć i spróbuj ponownie.';
    case 'aborted':
      return 'Dyktowanie zostało przerwane.';
    default:
      return 'Nie udało się rozpoznać mowy. Możesz wznowić dyktowanie albo wpisać dane ręcznie.';
  }
}
