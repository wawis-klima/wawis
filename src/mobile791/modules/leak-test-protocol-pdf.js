// WAWIS 14.28 — protokół z próby szczelności (PN-EN 378-2+A2:2012) jako PDF z danych montażu.
// Decyzja właściciela 06.11.2026: elektroniczna wersja protokołów, które dotąd były tylko papierowe,
// na razie BEZ podpisów i bez dopisków. Wypełniamy to, co system wie (urządzenie, adres, osoba kończąca montaż),
// stałe dane z firmowego wzoru oraz datę, temperaturę i wynik przepisane przez administratora z podpisanego
// protokołu papierowego (zakładka „Próby szczelności”, tabela leak_test_records). Bez wpisu te pola zostają puste.
// PDF tworzony na bieżąco, nic nie zapisuje w bazie.
import { loadLeakTest } from '../../modules/leak-tests.js';
import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import { getDeviceIndoorUnits, getDeviceOutdoorModel, getJobDeviceRows } from './job-devices.js';
import { getJobAddress } from '../utils/jobHelpers.jsx';

const FONT = 'DejaVuSans';
const W = 595.28;
const H = 841.89;
const LEFT = 62;
const RIGHT = W - 56;
const INK = [24, 45, 120];
let fontPromise = null;

// Stałe dane z firmowego wzoru protokołu (wydrukowane na formularzu papierowym).
export const LEAK_TEST_TEMPLATE = Object.freeze({
  norm: 'Próba szczelności zgodna z normą PN-EN 378-2+A2:2012',
  maxPressureBar: '46',
  testPressureBar: '46',
  method: 'za pomocą gazu obojętnego',
  manometer: 'Manometr, numer fabr/inw. 53020  zakres 0 – 50 Bar',
  thermometer: 'Termometr, typ CPS zakres -50 + 300',
});

function clean(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return /^(model nieuzupełniony|-)$/i.test(text) ? '' : text;
}

export function formatLeakTestDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function deviceObjectName(device = {}) {
  const indoor = getDeviceIndoorUnits(device, { keepEmpty: true });
  const outdoorModel = clean(getDeviceOutdoorModel(device));
  const indoorModels = indoor.map((unit) => clean(unit?.model)).filter(Boolean);
  if (indoor.length > 1) {
    const base = outdoorModel ? `Klimatyzator multi split ${outdoorModel}` : 'Klimatyzator multi split';
    return `${base} + ${indoor.length} jedn. wewn.`;
  }
  const model = outdoorModel || indoorModels[0] || clean(device?.model);
  return model ? `Klimatyzator ${model}` : '';
}

/** Dane protokołu: jedna strona na urządzenie montażu (jak papierowy protokół „na klimatyzator”). */
export function buildLeakTestProtocolData({ job = {}, profiles = [], record = null } = {}) {
  const person = (profiles || []).find((profile) => String(profile?.id || '') === String(job?.completed_by || ''));
  const performedBy = clean(person?.full_name);
  const devices = getJobDeviceRows(job);
  const names = devices.map(deviceObjectName);
  const pages = (names.length ? names : ['']).map((objectName, index) => ({
    deviceIndex: index + 1,
    deviceCount: Math.max(1, names.length),
    objectName,
  }));
  return {
    jobId: String(job?.id || ''),
    shortJobId: String(job?.id || '').slice(0, 8).toUpperCase(),
    client: clean(job?.client || job?.title),
    place: clean(getJobAddress(job)),
    performedBy,
    completedDate: formatLeakTestDate(job?.completed_at || job?.installation_date),
    testDate: record?.test_date ? formatLeakTestDate(record.test_date) : '',
    temperature: record?.temperature_c != null && record?.test_date ? String(Number(record.temperature_c)).replace('.', ',') : '',
    result: record?.test_date && ['pozytywny', 'negatywny'].includes(record?.result) ? record.result : '',
    // 14.29: podpis złożony przez samego instalatora (jego wzór, data złożenia podpisu).
    signaturePng: record?.test_date && /^data:image\/png;base64,/.test(String(record?.signature_png || '')) ? record.signature_png : '',
    signedDate: record?.signed_at ? formatLeakTestDate(record.signed_at) : '',
    pages,
  };
}

export function leakTestProtocolFileName(data) {
  const slug = String(data?.client || 'montaz')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'montaz';
  return `protokol-szczelnosci-${slug}-${data?.shortJobId || 'wawis'}.pdf`.toLowerCase();
}

async function base64Font(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nie udało się załadować czcionki protokołu.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const parts = [];
  for (let i = 0; i < bytes.length; i += 0x8000) parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  return btoa(parts.join(''));
}

async function loadFonts(doc) {
  fontPromise ||= Promise.all([base64Font(regularFontUrl), base64Font(boldFontUrl)]);
  const [regular, bold] = await fontPromise;
  doc.addFileToVFS('DejaVuSans.ttf', regular); doc.addFont('DejaVuSans.ttf', FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold); doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');
}

function dots(doc, x1, x2, y) {
  doc.setFillColor(60, 60, 60);
  for (let x = x1; x <= x2; x += 3.2) doc.circle(x, y, 0.45, 'F');
}

// Etykieta + wartość (atrament) albo kropki do wypełnienia; zwraca y następnej linii.
function field(doc, label, value, y, { suffix = '' } = {}) {
  doc.setFont(FONT, 'normal'); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
  doc.text(label, LEFT, y);
  const start = LEFT + doc.getTextWidth(label) + 4;
  const end = RIGHT - (suffix ? doc.getTextWidth(suffix) + 4 : 0);
  if (suffix) doc.text(suffix, end + 4, y);
  if (!value) { dots(doc, start, end, y + 1); return y + 26; }
  doc.setTextColor(...INK); doc.setFontSize(11);
  const lines = doc.splitTextToSize(value, end - start);
  doc.text(lines[0], start, y - 1);
  let next = y;
  lines.slice(1).forEach((line) => { next += 15; doc.text(line, LEFT + 12, next - 1); });
  doc.setTextColor(0, 0, 0);
  return next + 26;
}

function drawPage(doc, data, page) {
  doc.setTextColor(0, 0, 0);
  doc.setFont(FONT, 'bold'); doc.setFontSize(17); doc.text('PROTOKÓŁ', W / 2, 92, { align: 'center' });
  doc.setFont(FONT, 'normal'); doc.setFontSize(10.5); doc.text('z próby szczelności', W / 2, 108, { align: 'center' });
  doc.setFont(FONT, 'bold'); doc.setFontSize(12); doc.text(LEAK_TEST_TEMPLATE.norm, W / 2, 140, { align: 'center' });

  let y = 186;
  y = field(doc, 'Nazwa badanego obiektu:', page.objectName, y);
  y = field(doc, 'Miejsce badania:', data.place, y);
  doc.setFont(FONT, 'normal'); doc.setFontSize(10.5);
  doc.text(`Maksymalne dopuszczalne ciśnienie PS (zgodne z EN 378-2:2000)  ${LEAK_TEST_TEMPLATE.maxPressureBar}  [bar]`, LEFT, y); y += 26;
  doc.text('Metoda przeprowadzania próby: ', LEFT, y);
  doc.setFont(FONT, 'bold'); doc.text(LEAK_TEST_TEMPLATE.method, LEFT + doc.getTextWidth('Metoda przeprowadzania próby: ') + 0, y);
  doc.setFont(FONT, 'normal'); y += 26;
  doc.text(`Ciśnienie próby szczelności (zgodnie EN 378-2:2000 wynosi ≤ 1,0 * PS):  ${LEAK_TEST_TEMPLATE.testPressureBar} [bar]`, LEFT, y); y += 26;
  y = field(doc, 'Temperatura przeprowadzania próby:', data.temperature, y, { suffix: '[°C]' });
  y += 10;
  doc.text('Zastosowane wyposażenie pomiarowe:', LEFT, y); y += 22;
  [LEAK_TEST_TEMPLATE.manometer, LEAK_TEST_TEMPLATE.thermometer].forEach((item) => {
    doc.circle(LEFT + 22, y - 3.5, 1.6, 'F'); doc.text(item, LEFT + 34, y); y += 17;
  });
  doc.circle(LEFT + 22, y - 3.5, 1.6, 'F'); doc.text('Inne:', LEFT + 34, y); dots(doc, LEFT + 64, RIGHT - 20, y + 1); y += 30;
  y = field(doc, 'Data badania:', data.testDate ? `${data.testDate} r.` : '', y);
  y = field(doc, 'Osoba przeprowadzająca badanie:', data.performedBy, y);
  y = field(doc, 'Osoba odpowiedzialna za badania:', '', y);
  doc.setFont(FONT, 'normal'); doc.setFontSize(10.5);
  const resultLabel = 'Wynik badania: ';
  doc.text(`${resultLabel}Pozytywny – Negatywny`, LEFT, y);
  // Wynik zaznaczony podkreśleniem jak na formularzu papierowym.
  if (data.result) {
    const before = data.result === 'pozytywny' ? resultLabel : `${resultLabel}Pozytywny – `;
    const word = data.result === 'pozytywny' ? 'Pozytywny' : 'Negatywny';
    const x = LEFT + doc.getTextWidth(before);
    doc.setDrawColor(...INK); doc.setLineWidth(1.1); doc.line(x - 1, y + 3, x + doc.getTextWidth(word) + 1, y + 3);
  }
  y += 26;
  doc.text('Uwagi:', LEFT, y); dots(doc, LEFT + 38, RIGHT - 20, y + 1); y += 26;
  dots(doc, LEFT - 6, RIGHT - 20, y + 1); y += 26;
  dots(doc, LEFT - 6, RIGHT - 20, y + 1);

  const sigY = 700;
  if (data.signaturePng) {
    // Podpis instalatora nad kropkami (jak na papierze: data i podpis), proporcje obrazu zachowane.
    try {
      const props = doc.getImageProperties(data.signaturePng);
      const maxW = 150; const maxH = 46;
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale; const h = props.height * scale;
      doc.addImage(data.signaturePng, 'PNG', LEFT + 78 - w / 2, sigY - h - 2, w, h);
    } catch { /* uszkodzony obraz — protokół bez podpisu zamiast błędu */ }
    if (data.signedDate) {
      doc.setFont(FONT, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
      doc.text(data.signedDate, LEFT - 8, sigY - 30);
      doc.setTextColor(0, 0, 0);
    }
  }
  dots(doc, LEFT - 10, LEFT + 165, sigY);
  dots(doc, RIGHT - 190, RIGHT - 10, sigY);
  doc.setFontSize(8.5);
  doc.text(['Data i podpis osoby', 'przeprowadzającej badanie'], LEFT + 78, sigY + 13, { align: 'center' });
  doc.text(['Data i podpis osoby', 'odpowiedzialnej za badanie'], RIGHT - 100, sigY + 13, { align: 'center' });

  if (page.deviceCount > 1) {
    doc.setFontSize(7.4); doc.setTextColor(95, 105, 120);
    doc.text(`Urządzenie ${page.deviceIndex} z ${page.deviceCount}`, RIGHT, 812, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}

export async function createLeakTestProtocolPdfBlob({ job, profiles, record = null }) {
  const data = buildLeakTestProtocolData({ job, profiles, record });
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  await loadFonts(doc);
  data.pages.forEach((page, index) => {
    if (index > 0) doc.addPage();
    drawPage(doc, data, page);
  });
  doc.setProperties({ title: `Protokół z próby szczelności — ${data.client || data.shortJobId}`, author: 'WAWIS', creator: 'WAWIS' });
  return { blob: doc.output('blob'), fileName: leakTestProtocolFileName(data), data };
}

/**
 * Otwiera PDF w nowej karcie (okno otwierane synchronicznie w kliknięciu — iPhone nie blokuje),
 * a gdy przeglądarka nie pozwala — pobiera plik.
 */
export async function openLeakTestProtocolPdf({ job, profiles, supabase = null, record = undefined }) {
  const previewWindow = typeof window !== 'undefined' && typeof window.open === 'function' ? window.open('', '_blank') : null;
  try {
    if (previewWindow) {
      // Bez „opener = null”: WebKit (iPhone) nie otwiera wtedy pliku blob: z aplikacji (pusta karta — test CI 06.11).
      // Plik jest z tej samej aplikacji, więc połączenie z kartą nie stanowi ryzyka.
      previewWindow.document.title = 'Protokół szczelności';
      previewWindow.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">Przygotowuję protokół PDF…</p>';
    }
    // Dane próby: przekazane z listy albo odczytane z bazy (administrator). Błąd odczytu ≠ „brak danych”.
    const leakRecord = record !== undefined ? record : await loadLeakTest({ supabase, jobId: job?.id });
    const { blob, fileName } = await createLeakTestProtocolPdfBlob({ job, profiles, record: leakRecord });
    const url = URL.createObjectURL(blob);
    if (previewWindow) {
      previewWindow.location.replace(url);
    } else {
      const link = document.createElement('a');
      link.href = url; link.download = fileName; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
    return { fileName };
  } catch (error) {
    try { previewWindow?.close(); } catch {}
    throw error;
  }
}
