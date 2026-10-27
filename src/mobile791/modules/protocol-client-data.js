// WAWIS 13.85 — dane klienta w protokole (prośba właściciela 27.10.2026).
//
// Imię i nazwisko (albo nazwa firmy) są obowiązkowe przed podpisem klienta; e-mail jest zalecany —
// można zaznaczyć „Klient nie podał e-maila”. Sprawdzenia to proste reguły działające w telefonie
// (bez AI, bez internetu, bez kosztów). Najmocniejsze zabezpieczenie: klient widzi i potwierdza dane przed podpisem.

// Najpopularniejsze imiona w Polsce (rejestr PESEL — czołówka listy). Brak imienia na liście NIE blokuje
// podpisu — pokazuje tylko podpowiedź „sprawdź z klientem” (rzadkie i zagraniczne imiona są poprawne).
const FIRST_NAMES = `
adam adrian agata agnieszka albert aleksander aleksandra alicja amelia aneta angelika anita anna antoni antonina arkadiusz
artur barbara bartłomiej bartosz beata bernadeta błażej bogdan bogumiła bogusław bogusława bożena bronisław cezary czesław
czesława damian daniel daniela danuta dariusz dawid dominik dominika dorota edward edyta elżbieta emil emilia eugeniusz ewa
ewelina filip franciszek gabriel gabriela genowefa grażyna grzegorz halina hanna helena henryk henryka hubert igor ilona irena
ireneusz iwona izabela jacek jadwiga jakub jan janina janusz jarosław jerzy joanna jolanta józef józefa julia julian julianna
justyna kacper kamil kamila karina karol karolina katarzyna kazimiera kazimierz kinga klaudia konrad krystian krystyna krzysztof
lena leon leszek lidia lucyna ludwik łucja łukasz maciej magdalena maja malwina małgorzata marek maria marian marianna mariola
mariusz marta marzena mateusz maciek michał michalina mieczysław mieczysława mikołaj milena mirosław mirosława monika natalia
nikola nikodem norbert oliwer oliwia oskar patrycja patryk paula paulina paweł piotr przemysław rafał regina renata robert
roman romuald ryszard sabina sebastian stanisław stanisława stefan stefania sylwester sylwia szymon tadeusz tamara teresa
tomasz tymon urszula wacław waldemar wanda weronika wiesław wiesława wiktor wiktoria wincenty witold władysław władysława
włodzimierz wojciech zbigniew zdzisław zdzisława zenon zenona zofia zuzanna zygmunt żaneta
andrzej marcin radosław sławomir jędrzej ignacy aleksy lech marcel maksymilian olaf fabian alan cyprian dobromir eryk ernest
feliks gustaw hieronim ignacy jeremi jerzy kajetan kornel ksawery leopold lucjan maurycy miłosz oktawian olgierd remigiusz
seweryn sławomira tobiasz tymoteusz walenty wiesław zenobiusz bolesław borys jarek jurek kuba tomek bartek wojtek staszek
zbyszek krzysiek grzesiek michał mietek heniek rysiek olek józek
agnieszka alina anastazja apolonia blanka bianka celina diana elwira eliza estera felicja grażyna iga ilona inga jagoda janina
julita kornelia lilianna liliana luiza magda marlena marzanna nadia nina olga oliwia otylia róża sara sandra sonia stella
teodora wanesa wioletta wioleta zyta żaklina ula ola kasia basia gosia asia ania madzia zosia hania jola ewka iza ela

`.trim().split(/\s+/);

const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
const FIRST_NAME_SET = new Set(FIRST_NAMES.map(strip));

// Słowa, które nie są imieniem ani nazwiskiem — usuwane przed liczeniem słów („Pan Kowalski” = 1 słowo).
const FILLER_WORDS = new Set(['pan', 'pani', 'p', 'klient', 'klientka', 'panstwo', 'sz', 'szanowny', 'szanowna']);
const ADDRESS_START = /^(?:ul|ulica|al|aleja|aleje|os|osiedle|pl|plac|rondo|skwer|droga)\b\.?/i;
const COMPANY_HINT = /\b(?:sp\.?\s*z\s*o\.?\s*o|s\.?\s*a\.?|sp\.?\s*j\.?|sp\.?\s*k\.?|s\.?\s*c\.?|p\.?\s*h\.?\s*u|f\.?\s*h\.?\s*u|firma|spółka|spolka|zakład|zaklad|przedsiębiorstwo|przedsiebiorstwo|ltd|gmbh|wspólnota|wspolnota|spółdzielnia|spoldzielnia|urząd|urzad|gmina|szkoła|szkola|parafia|fundacja|stowarzyszenie)\b/i;

export function normalizeClientName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function looksLikeCompanyName(value) {
  return COMPANY_HINT.test(String(value || ''));
}

/**
 * @returns {{ ok: boolean, error: string, hint: string }}
 *   error — blokuje podpis; hint — podpowiedź bez blokady (np. nierozpoznane imię).
 */
export function validateClientName(value, { isCompany = false, street = '', city = '' } = {}) {
  const name = normalizeClientName(value);
  if (!name) return { ok: false, error: isCompany ? 'Podaj nazwę firmy.' : 'Podaj imię i nazwisko klienta.', hint: '' };

  const plain = strip(name);
  const streetPlain = strip(street).replace(/^(?:ul|ulica|al|os|pl)\.?\s+/, '').replace(/\s+\d.*$/, '').trim();
  const cityPlain = strip(city).trim();
  const looksLikeAddress = ADDRESS_START.test(name)
    || (streetPlain.length >= 4 && (plain === streetPlain || plain.startsWith(`${streetPlain} `) || plain.includes(` ${streetPlain} `) || plain.endsWith(` ${streetPlain}`)))
    || (cityPlain.length >= 3 && plain === cityPlain);
  if (looksLikeAddress) {
    return { ok: false, error: 'To wygląda na adres, a nie na dane klienta. Wpisz imię i nazwisko (albo nazwę firmy).', hint: '' };
  }

  if (isCompany) {
    if (name.replace(/[^\p{L}]/gu, '').length < 2) return { ok: false, error: 'Podaj pełną nazwę firmy.', hint: '' };
    return { ok: true, error: '', hint: '' };
  }

  if (/\d/.test(name)) {
    return { ok: false, error: 'Imię i nazwisko nie może zawierać cyfr — to wygląda na adres lub numer. Jeśli to firma, zaznacz „Firma”.', hint: '' };
  }
  if (/[^\p{L}\s.'’-]/u.test(name)) {
    return { ok: false, error: 'Imię i nazwisko może zawierać tylko litery (także myślnik w nazwisku dwuczłonowym).', hint: '' };
  }
  const words = name.split(' ').map((word) => word.replace(/^[.'’-]+|[.'’-]+$/g, '')).filter(Boolean);
  const meaningful = words.filter((word) => !FILLER_WORDS.has(strip(word).replace(/\./g, '')));
  if (meaningful.length < 2 || meaningful.some((word) => word.replace(/[^\p{L}]/gu, '').length < 1)) {
    return { ok: false, error: 'Podaj imię i nazwisko klienta (np. „Jan Kowalski”), nie samo nazwisko ani „Pan/Pani”.', hint: '' };
  }

  const knownFirstName = FIRST_NAME_SET.has(strip(meaningful[0])) || FIRST_NAME_SET.has(strip(meaningful[meaningful.length - 1]));
  return {
    ok: true,
    error: '',
    hint: knownFirstName ? '' : `Nie rozpoznano imienia „${meaningful[0]}” — upewnij się z klientem, że to jego imię i nazwisko.`,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PLACEHOLDER_LOCAL = /^(?:brak|nie|nie-?ma|none|no|test|xx+|aa+|abc|klient|mail|email|e-?mail|x|a|asd|qwe|qwerty)$/i;
const DOMAIN_TYPOS = Object.freeze({
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.pl': 'gmail.com', 'gmali.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'g-mail.com': 'gmail.com',
  'wp.pl.pl': 'wp.pl', 'wppl': 'wp.pl', 'wp.p': 'wp.pl', 'wp.com': 'wp.pl',
  'onet.p': 'onet.pl', 'onet.com': 'onet.pl', 'onet.pl.pl': 'onet.pl', 'onte.pl': 'onet.pl',
  'interia.p': 'interia.pl', 'intreia.pl': 'interia.pl', 'interia.com': 'interia.pl', 'interia.pl.pl': 'interia.pl',
  'o2.p': 'o2.pl', 'o2.com': 'o2.pl', 'op.p': 'op.pl', 'poczta.onet.p': 'poczta.onet.pl',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'yahoo.co': 'yahoo.com',
});

export function normalizeClientEmail(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * @returns {{ ok: boolean, error: string, suggestion: string }}
 */
export function validateClientEmail(value, { declined = false } = {}) {
  const email = normalizeClientEmail(value);
  if (!email) {
    return declined
      ? { ok: true, error: '', suggestion: '' }
      : { ok: false, error: 'Wpisz e-mail klienta (do wysyłki protokołu i faktury) albo zaznacz „Klient nie podał e-maila”.', suggestion: '' };
  }
  if (!EMAIL_PATTERN.test(email) || email.includes('..')) {
    return { ok: false, error: 'Nieprawidłowy adres e-mail — sprawdź z klientem.', suggestion: '' };
  }
  const [local, domain] = email.split('@');
  if (PLACEHOLDER_LOCAL.test(local)) {
    return { ok: false, error: 'To nie jest prawdziwy adres klienta. Wpisz jego e-mail albo zaznacz „Klient nie podał e-maila”.', suggestion: '' };
  }
  if (/\.con$|\.cmo$|\.ocm$|\.comm$/.test(domain)) {
    const fixed = `${local}@${domain.replace(/\.(?:con|cmo|ocm|comm)$/, '.com')}`;
    return { ok: false, error: `Literówka w adresie — czy chodziło o ${fixed}?`, suggestion: fixed };
  }
  if (DOMAIN_TYPOS[domain]) {
    const fixed = `${local}@${DOMAIN_TYPOS[domain]}`;
    return { ok: false, error: `Literówka w adresie — czy chodziło o ${fixed}?`, suggestion: fixed };
  }
  return { ok: true, error: '', suggestion: '' };
}

/** Pełna ocena kroku „Dane klienta”. */
export function checkProtocolClientData(draft = {}, { street = '', city = '' } = {}) {
  const name = validateClientName(draft.client, { isCompany: Boolean(draft.isCompany), street, city });
  const email = validateClientEmail(draft.email, { declined: Boolean(draft.emailDeclined) });
  return { ok: name.ok && email.ok, name, email };
}

export function createProtocolClientDraft(job = {}) {
  const client = normalizeClientName(job?.client || job?.title || '');
  return {
    client,
    email: normalizeClientEmail(job?.email || ''),
    emailDeclined: false,
    isCompany: looksLikeCompanyName(client),
  };
}
