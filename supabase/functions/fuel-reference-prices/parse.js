// WAWIS 13.89 — odczyt maksymalnej ceny oleju napędowego z obwieszczeń Ministra Energii (Monitor Polski).
// Czysty JavaScript (bez zależności): używany przez funkcję Edge i przez test node (smoke-fuel-savings-v1389).

export const FUEL_PRICE_TITLE = 'w sprawie maksymalnej ceny paliw ciekłych na stacji paliw';

const MONTHS = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, 'września': 9, wrzesnia: 9, 'października': 10, pazdziernika: 10,
  listopada: 11, grudnia: 12,
};

function toNumber(value) {
  const number = Number(String(value || '').replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cena maksymalna oleju napędowego z tekstu obwieszczenia.
 * Wzór (MP 2026 poz. 974): „dla oleju napędowego (CN …): wynosi 7,22 zł za 1 dm3, powiększona o podatek
 * od towarów i usług wynosi 7,80 zł za 1 l;”
 * @returns {{ net: number, gross: number, vatRate: number } | null}
 */
export function parseDieselPrice(text) {
  const normalized = normalizePdfText(text);
  const start = normalized.search(/olej(?:u)?\s+napędow/i);
  if (start < 0) return null;
  const tail = normalized.slice(start, start + 500);
  const net = tail.match(/wynosi\s+(\d{1,2}\s*[,.]\s*\d{2})\s*zł\s*za\s*1\s*dm\s*3/i);
  const gross = tail.match(/wynosi\s+(\d{1,2}\s*[,.]\s*\d{2})\s*zł\s*za\s*1\s*l(?![a-ząćęłńóśźż])/i);
  const netValue = net ? toNumber(net[1]) : null;
  const grossValue = gross ? toNumber(gross[1]) : null;
  if (!netValue || !grossValue || netValue < 2 || netValue > 20 || grossValue < netValue) return null;
  const ratio = grossValue / netValue;
  // Stawka VAT wynika z różnicy cen (8% w programie „Ceny Paliwa Niżej”, 23% standardowo).
  const vatRate = Math.abs(ratio - 1.08) <= 0.01 ? 8 : Math.abs(ratio - 1.23) <= 0.01 ? 23 : Math.round((ratio - 1) * 1000) / 10;
  return { net: netValue, gross: grossValue, vatRate };
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Daty obowiązywania podane w treści (np. „obowiązującą w dniach 10–12 października 2026 r.”).
 * Zwraca pierwszy dzień obowiązywania albo '' gdy treść nie podaje dat.
 */
export function parseValidFromInText(text) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/obowiązując\w*\s+(?:od\s+dnia|w\s+dni(?:u|ach)|w\s+okresie(?:\s+od)?|od)\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i);
  if (!match) return '';
  const month = MONTHS[match[2].toLowerCase()];
  return month ? isoDate(Number(match[3]), month, Number(match[1])) : '';
}

/**
 * Data ogłoszenia z nagłówka dokumentu („Warszawa, dnia 26 października 2026 r.”), a gdy jej brak —
 * z tytułu („z dnia …”). Metadane API Sejmu potrafią podać inną datę (MP 2026 poz. 1036: API 23.10,
 * dokument 26.10), dlatego pierwszeństwo ma treść dokumentu.
 */
export function parsePublishedOnFromText(text) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/Warszawa,\s*dnia\s+(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i)
    || normalized.match(/z\s+dnia\s+(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i);
  if (!match) return '';
  const month = MONTHS[match[2].toLowerCase()];
  return month ? isoDate(Number(match[3]), month, Number(match[1])) : '';
}

/**
 * Pierwszy dzień obowiązywania ceny: data z treści, a gdy jej brak — dzień po ogłoszeniu
 * (obwieszczenia publikowane w dni robocze na dzień następny; piątkowe obejmują też weekend —
 * cena obowiązuje do dnia, od którego obowiązuje następne obwieszczenie).
 */
export function resolveValidFrom({ text = '', promulgation = '' } = {}) {
  const fromText = parseValidFromInText(text);
  if (fromText) return fromText;
  const published = parsePublishedOnFromText(text) || (/^\d{4}-\d{2}-\d{2}$/.test(String(promulgation)) ? String(promulgation) : '');
  return published ? addDays(published, 1) : '';
}

export function isFuelPriceAct(item = {}) {
  return String(item?.publisher || '') === 'MP'
    && String(item?.title || '').toLowerCase().includes(FUEL_PRICE_TITLE)
    && /minist\w*\s+energii/i.test(String(item?.title || ''));
}

export function pdfUrlForAct(item = {}) {
  const year = Number(item?.year);
  const pos = Number(item?.pos);
  if (!year || !pos) return '';
  return `https://api.sejm.gov.pl/eli/acts/MP/${year}/${pos}/text/O/M${year}${String(pos).padStart(4, '0')}.pdf`;
}

// ── Średnie ceny rynkowe dla Śląska (decyzja właściciela 30.10.2026) ──────────────────────────────────────
// Kolejność źródeł ceny „na stacji”: 1) AutoCentrum — średnia tygodniowa dla województwa śląskiego (archiwum
// 3 miesięcy na stronie), 2) zapaliwo.pl — średnia dzienna dla śląskiego (bez archiwum, zapisywana codziennie),
// 3) urzędowa cena maksymalna (Monitor Polski). Obie strony pozwalają robotom czytać te adresy (robots.txt).

export const AUTOCENTRUM_SLASKIE_ON_URL = 'https://www.autocentrum.pl/paliwa/ceny-paliw/slaskie/on/';
export const ZAPALIWO_URL = 'https://zapaliwo.pl/';

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"').replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function dayMonth(text) {
  const match = String(text || '').trim().match(/^(\d{1,2})\.(\d{1,2})$/);
  return match ? { day: Number(match[1]), month: Number(match[2]) } : null;
}

/**
 * Etykieta tygodnia z wykresu AutoCentrum („5.10 - 11.10”, „29.12 - 4.01”) → daty ISO.
 * Rok: koniec okresu nie może być późniejszy niż dzień pobrania (+1 dzień zapasu).
 */
export function resolveWeekLabel(label, fetchedOnIso) {
  const parts = String(label || '').split(/\s*[-–]\s*/);
  if (parts.length !== 2) return null;
  const start = dayMonth(parts[0]);
  const end = dayMonth(parts[1]);
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(String(fetchedOnIso))) return null;
  let endYear = Number(fetchedOnIso.slice(0, 4));
  let endIso = isoDate(endYear, end.month, end.day);
  if (endIso && endIso > addDays(fetchedOnIso, 1)) {
    endYear -= 1;
    endIso = isoDate(endYear, end.month, end.day);
  }
  const startYear = start.month > end.month ? endYear - 1 : endYear;
  const startIso = isoDate(startYear, start.month, start.day);
  if (!startIso || !endIso || startIso > endIso) return null;
  return { periodStart: startIso, periodEnd: endIso };
}

/**
 * Wykres „Średnie ceny” na stronie AutoCentrum (atrybut data-chart): tygodniowe średnie ON dla śląskiego.
 * @returns {Array<{ periodStart: string, periodEnd: string, label: string, gross: number }>}
 */
export function parseAutocentrumWeekly(html, fetchedOnIso) {
  const rows = [];
  const pattern = /data-chart='([^']*)'/g;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    let chart;
    try { chart = JSON.parse(decodeHtmlAttribute(match[1])); } catch { continue; }
    const labels = Array.isArray(chart?.labels) ? chart.labels : [];
    const dataset = (Array.isArray(chart?.datasets) ? chart.datasets : [])
      .find((item) => /śląskie/i.test(String(item?.label || '')) && /\bON\b/.test(String(item?.label || '')) && !/dolno/i.test(String(item?.label || '')));
    if (!dataset || !Array.isArray(dataset.data)) continue;
    labels.forEach((label, index) => {
      const gross = Number(dataset.data[index]);
      const period = resolveWeekLabel(label, fetchedOnIso);
      if (!period || !Number.isFinite(gross) || gross < 2 || gross > 20) return;
      rows.push({ ...period, label: String(label), gross: Math.round(gross * 100) / 100 });
    });
    if (rows.length) break;
  }
  return rows;
}

/**
 * Tabela województw na zapaliwo.pl: „Śląskie 6,44 zł 6,91 zł 7,98 zł …” przy kolumnach Pb95, Pb98, Diesel (ON).
 * Zwraca cenę ON dla śląskiego albo null, gdy układ tabeli jest inny niż oczekiwany (wtedy nie zgadujemy).
 */
export function parseZapaliwoSlaskieDiesel(html) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ');
  const header = text.match(/Województwo\s*\S*\s*Pb\s?95\s*\S*\s*Pb\s?98\s*\S*\s*Diesel\s*\(ON\)/i);
  if (!header) return null;
  const row = text.match(/(?:^|[^A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ])Śląskie\s+(\d{1,2},\d{2})\s*zł\D{0,6}?(\d{1,2},\d{2})\s*zł\D{0,6}?(\d{1,2},\d{2})\s*zł/);
  if (!row) return null;
  const gross = toNumber(row[3]);
  return gross && gross > 2 && gross < 20 ? gross : null;
}
