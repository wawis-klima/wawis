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
