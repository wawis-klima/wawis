import regularFontUrl from "dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url";
import boldFontUrl from "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url";
import { getDeviceIndoorUnits, getDeviceOutdoorModel, getJobDeviceRows } from "./job-devices.js";
import { getJobNameplateCompletion, isNameplatePhotoReady } from "./nameplate-requirements.js";
import { getNameplatePhotoMetadata } from "./photos.js";
import { getJobAddress } from "../utils/jobHelpers.jsx";
import { getPaymentDraftFromJob, normalizePaymentConfirmation } from "./job-payment-confirmation.js";

const FONT_FAMILY = "DejaVuSans";
const PDF_MIME_TYPE = "application/pdf";
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const OUTER_MARGIN = 12;
const CARD_WIDTH = PAGE_WIDTH - (OUTER_MARGIN * 2);
const CONTENT_LEFT = 20;
const CONTENT_RIGHT = PAGE_WIDTH - CONTENT_LEFT;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const RIGHT_COLUMN_X = 310;
let embeddedFontsPromise = null;

export const PROTOCOL_COMPANY = Object.freeze({
  name: "WAWIS CHŁODNICTWO I KLIMATYZACJA",
  owner: "Piotr Wasik",
  address: "ul. Rolnicza 40, 42-400 Zawiercie",
  phone: "606 553 984",
  email: "biuro@wawis.pl",
  nip: "6492040094",
});

export const PROTOCOL_PRIVACY_NOTICE =
  "Administratorem Pani/Pana danych osobowych jest Piotr Wasik, prowadzący działalność pod firmą WAWIS Chłodnictwo i Klimatyzacja, ul. Rolnicza 40, 42-400 Zawiercie; kontakt: biuro@wawis.pl. Dane są przetwarzane w celu zawarcia i wykonania umowy, obsługi zlecenia, rozliczeń, wypełnienia obowiązków prawnych oraz ustalenia, dochodzenia lub obrony roszczeń, na podstawie art. 6 ust. 1 lit. b, c i f RODO. Odbiorcami danych mogą być podmioty świadczące usługi IT, hostingu, poczty elektronicznej, księgowości, płatności i obsługi prawnej oraz uprawnione organy. Dane będą przechowywane przez okres wykonania umowy, wymagany przepisami podatkowymi i rachunkowymi oraz do upływu terminów przedawnienia roszczeń. Przysługuje Pani/Panu prawo dostępu do danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania - w przypadkach określonych prawem - przenoszenia danych, sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie oraz wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych. Podanie danych jest wymagane do zawarcia i wykonania umowy; ich niepodanie uniemożliwia obsługę zlecenia. Dane nie są wykorzystywane do zautomatyzowanego podejmowania decyzji ani profilowania. Jeżeli dostawca usług przetwarza dane poza Europejskim Obszarem Gospodarczym, przekazanie następuje z zastosowaniem zabezpieczeń przewidzianych w RODO; informacje o nich można uzyskać pod adresem e-mail administratora.";

export const PROTOCOL_WASTE_NOTICE =
  "Strony uzgadniają, że - w zakresie dopuszczalnym przez obowiązujące przepisy - wytwórcą odpadów powstałych podczas wykonania zlecenia jest Zleceniodawca, stosownie do art. 3 ust. 1 pkt 32 ustawy z dnia 14 grudnia 2012 r. o odpadach. Odpady powstałe w związku z montażem pozostają u Zleceniodawcy, który odpowiada za ich zgodne z prawem zagospodarowanie, chyba że strony odrębnie uzgodnią ich odbiór przez Zleceniobiorcę.";

function normalizeText(value, fallback = "-") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatInstallationDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return normalizeText(value);
}

export function formatProtocolDateTime(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getAssignedTechnicians(job = {}, profiles = []) {
  const namesById = new Map((profiles || []).map((person) => [String(person?.id || ""), person?.full_name || person?.email || ""]));
  const ids = [
    job?.main_technician_id,
    ...(Array.isArray(job?.viewers) ? job.viewers.map((viewer) => viewer?.user_id) : []),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const names = [];
  const seen = new Set();
  ids.forEach((id) => {
    const name = normalizeText(namesById.get(id), "");
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  return names.length ? names : ["Brak przypisanych monterów"];
}

function getNameplateStatus(photo = null) {
  if (!photo) return "Brak tabliczki";
  const uploadStatus = String(photo?.upload_status || "").trim().toLowerCase();
  if (uploadStatus === "local") return "Zapisana na telefonie";
  if (uploadStatus === "uploading") return "Wysyłanie";
  if (uploadStatus === "error") return "Błąd wysyłania";
  if (isNameplatePhotoReady(photo)) return "Zapisana w systemie";
  return "Brak tabliczki";
}

function getProtocolDeviceRows(job = {}) {
  const devices = getJobDeviceRows(job);
  const completion = getJobNameplateCompletion(job, { allowLocal: true });
  const nameplateByUnit = new Map(completion.units.map((unit) => [`${unit.deviceIndex}:${unit.unitRef}`, unit.photo || null]));
  const rows = [];

  devices.forEach((device, deviceOffset) => {
    const deviceIndex = deviceOffset + 1;
    const indoorUnits = getDeviceIndoorUnits(device, { keepEmpty: true });
    const isMultiSplit = indoorUnits.length > 1;
    const outdoorModel = getDeviceOutdoorModel(device)
      || (!isMultiSplit ? indoorUnits[0]?.model : "")
      || String(device?.model || "").trim();
    const deviceSuffix = devices.length > 1 ? ` (urządzenie ${deviceIndex})` : "";

    rows.push({
      unit: `JZ${deviceSuffix}`,
      model: normalizeText(outdoorModel, "Model nieuzupełniony"),
      nameplate: getNameplateStatus(nameplateByUnit.get(`${deviceIndex}:jz`)),
    });

    const safeIndoorUnits = indoorUnits.length ? indoorUnits : [{ unitNumber: 1, model: "" }];
    safeIndoorUnits.forEach((unit) => {
      const unitRef = `jw-${unit.unitNumber}`;
      rows.push({
        unit: `JW${unit.unitNumber}${deviceSuffix}`,
        model: normalizeText(unit.model || (!isMultiSplit ? outdoorModel : ""), "Model nieuzupełniony"),
        nameplate: getNameplateStatus(nameplateByUnit.get(`${deviceIndex}:${unitRef}`)),
      });
    });
  });

  return rows;
}

function getCompletedBy(job = {}, profiles = []) {
  const person = (profiles || []).find((profile) => String(profile?.id || "") === String(job?.completed_by || ""));
  return normalizeText(person?.full_name || person?.email);
}

function formatPaymentDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : normalizeText(value);
}

export function buildJobProtocolData({ job = {}, profiles = [], signedAt = new Date(), payment = null } = {}) {
  const photos = Array.isArray(job?.photos) ? job.photos : [];
  const deviceRows = getProtocolDeviceRows(job);
  const nameplateCompletion = getJobNameplateCompletion(job, { allowLocal: true });
  const regularPhotoCount = photos.filter((photo) => getNameplatePhotoMetadata(photo).photo_kind !== "nameplate").length;

  const normalizedPayment = normalizePaymentConfirmation(payment || getPaymentDraftFromJob(job));
  return {
    jobId: normalizeText(job?.id),
    shortJobId: normalizeText(job?.id, "BRAK").slice(0, 8).toUpperCase(),
    client: normalizeText(job?.client || job?.title),
    phone: normalizeText(job?.phone),
    email: normalizeText(job?.email),
    address: normalizeText(getJobAddress(job)),
    installationDate: formatInstallationDate(job?.installation_date),
    status: normalizeText(job?.status, "Nowe"),
    technicians: getAssignedTechnicians(job, profiles),
    completedAt: formatProtocolDateTime(job?.completed_at),
    completedBy: getCompletedBy(job, profiles),
    signedAt: formatProtocolDateTime(signedAt),
    deviceRows,
    readyNameplateCount: nameplateCompletion.readyCount,
    requiredNameplateCount: nameplateCompletion.requiredCount,
    regularPhotoCount,
    payment: {
      ...normalizedPayment,
      paidDateLabel: normalizedPayment.enabled ? formatPaymentDate(normalizedPayment.paidDate) : "-",
    },
  };
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return window.btoa(binary);
}

async function fetchFontAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Nie udało się załadować czcionki do protokołu.");
  return arrayBufferToBase64(await response.arrayBuffer());
}

async function embedFonts(doc) {
  if (!embeddedFontsPromise) {
    embeddedFontsPromise = Promise.all([
      fetchFontAsBase64(regularFontUrl),
      fetchFontAsBase64(boldFontUrl),
    ]);
  }
  const [regularFont, boldFont] = await embeddedFontsPromise;
  doc.addFileToVFS("DejaVuSans.ttf", regularFont);
  doc.addFont("DejaVuSans.ttf", FONT_FAMILY, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", boldFont);
  doc.addFont("DejaVuSans-Bold.ttf", FONT_FAMILY, "bold");
  doc.setFont(FONT_FAMILY, "normal");
}

function sanitizeFilePart(value) {
  return String(value || "klient")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "klient";
}

export function getProtocolFileName(data) {
  const datePart = data.signedAt.slice(0, 10).replace(/\./g, "-") || "data";
  return `wawis-protokol-test-${sanitizeFilePart(data.client)}-${datePart}.pdf`;
}

export function getContainedSignatureSize(sourceWidth, sourceHeight, maxWidth, maxHeight) {
  const safeWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeHeight = Math.max(1, Number(sourceHeight) || 1);
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight);
  return {
    width: safeWidth * scale,
    height: safeHeight * scale,
  };
}

function drawHeader(doc, data) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_WIDTH, 76, "F");
  doc.setDrawColor(38, 55, 68);
  doc.setLineWidth(0.8);
  doc.line(OUTER_MARGIN, 75, PAGE_WIDTH - OUTER_MARGIN, 75);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(20, 42, 58);
  doc.setLineWidth(1.5);
  doc.circle(34, 36, 21, "FD");
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text("W", 34, 44, { align: "center" });

  doc.setFontSize(10.7);
  doc.text(`${PROTOCOL_COMPANY.name}  |  ${PROTOCOL_COMPANY.owner}`, 64, 22);
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8.3);
  doc.text(`${PROTOCOL_COMPANY.address}  |  NIP ${PROTOCOL_COMPANY.nip}`, 64, 42);
  doc.text(`tel. ${PROTOCOL_COMPANY.phone}  |  ${PROTOCOL_COMPANY.email}  |  www.wawis.pl`, 64, 59);

  doc.setDrawColor(160, 170, 177);
  doc.setLineWidth(0.6);
  doc.line(440, 12, 440, 65);
  doc.setFont(FONT_FAMILY, "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text(`ID ${data.shortJobId}`, PAGE_WIDTH - OUTER_MARGIN, 21, { align: "right" });
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8);
  doc.text(`Podpisano: ${data.signedAt}`, PAGE_WIDTH - OUTER_MARGIN, 37, { align: "right" });
}

function drawSectionTitle(doc, title, y) {
  doc.setFillColor(22, 163, 165);
  doc.roundedRect(OUTER_MARGIN, y - 9, 4, 13, 2, 2, "F");
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(title.toUpperCase(), OUTER_MARGIN + 11, y);
}

function drawCard(doc, y, height, fill = [255, 255, 255]) {
  doc.setFillColor(...fill);
  doc.setDrawColor(212, 224, 230);
  doc.setLineWidth(0.8);
  doc.roundedRect(OUTER_MARGIN, y, CARD_WIDTH, height, 7, 7, "FD");
}

function drawField(doc, label, value, x, y, valueOffset = 104) {
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  doc.text(label, x, y);
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(9.3);
  doc.setTextColor(0, 0, 0);
  const availableWidth = Math.max(70, Math.min(240, CONTENT_RIGHT - x - valueOffset));
  const lines = doc.splitTextToSize(normalizeText(value), availableWidth);
  doc.text(lines, x + valueOffset, y);
}

function getLegalNoticeLayout(doc) {
  const bodyFontSize = 9.4;
  const lineHeight = 10.5;
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(bodyFontSize);
  const privacyLines = doc.splitTextToSize(PROTOCOL_PRIVACY_NOTICE, CONTENT_WIDTH);
  const wasteLines = doc.splitTextToSize(PROTOCOL_WASTE_NOTICE, CONTENT_WIDTH);
  const privacyHeight = Math.max(1, privacyLines.length) * lineHeight;
  const wasteHeight = Math.max(1, wasteLines.length) * lineHeight;
  return {
    bodyFontSize,
    lineHeight,
    privacyLines,
    wasteLines,
    privacyHeight,
    wasteHeight,
    cardHeight: 54 + privacyHeight + wasteHeight,
  };
}

function drawLegalNotices(doc, y, layout) {
  drawCard(doc, y + 8, layout.cardHeight, [250, 252, 253]);
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(9.4);
  doc.setTextColor(0, 0, 0);
  doc.text("INFORMACJA O PRZETWARZANIU DANYCH OSOBOWYCH", PAGE_WIDTH / 2, y + 25, { align: "center" });

  const privacyY = y + 38;
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(layout.bodyFontSize);
  doc.setTextColor(0, 0, 0);
  doc.text(layout.privacyLines, CONTENT_LEFT, privacyY, { lineHeightFactor: layout.lineHeight / layout.bodyFontSize });

  const wasteTitleY = privacyY + layout.privacyHeight + 6;
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(9.4);
  doc.setTextColor(0, 0, 0);
  doc.text("ZAGOSPODAROWANIE ODPADÓW", PAGE_WIDTH / 2, wasteTitleY, { align: "center" });

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(layout.bodyFontSize);
  doc.setTextColor(0, 0, 0);
  doc.text(layout.wasteLines, CONTENT_LEFT, wasteTitleY + 12, { lineHeightFactor: layout.lineHeight / layout.bodyFontSize });
}

function addPageIfNeeded(doc, y, requiredHeight) {
  if (y + requiredHeight <= PAGE_HEIGHT - 25) return y;
  doc.addPage();
  doc.setFont(FONT_FAMILY, "normal");
  doc.setTextColor(0, 0, 0);
  return 34;
}

function drawFooter(doc, data) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("Dokument utworzony w aplikacji Wawis z danych karty zakończonego zlecenia.", OUTER_MARGIN, PAGE_HEIGHT - 12);
    doc.text(`ID zlecenia: ${data.jobId}  •  Strona ${page}/${pageCount}`, PAGE_WIDTH - OUTER_MARGIN, PAGE_HEIGHT - 12, { align: "right" });
  }
}

export async function buildPdfDocument({ data, signatureDataUrl }) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  await embedFonts(doc);
  drawHeader(doc, data);

  let y = 87;
  drawSectionTitle(doc, "Dane z karty zlecenia", y);
  drawCard(doc, y + 8, 50);
  drawField(doc, "Klient", data.client, CONTENT_LEFT, y + 26, 72);
  drawField(doc, "Telefon", data.phone, RIGHT_COLUMN_X, y + 26, 62);
  drawField(doc, "E-mail", data.email, CONTENT_LEFT, y + 45, 72);
  drawField(doc, "Adres", data.address, RIGHT_COLUMN_X, y + 45, 62);

  y += 70;
  drawSectionTitle(doc, "Realizacja zlecenia", y);
  drawCard(doc, y + 8, 64);
  drawField(doc, "Data montażu", data.installationDate, CONTENT_LEFT, y + 25, 82);
  drawField(doc, "Status", data.status, RIGHT_COLUMN_X, y + 25, 62);
  drawField(doc, "Monterzy", data.technicians.join(", "), CONTENT_LEFT, y + 43, 82);
  if (data.completedBy !== "-") drawField(doc, "Zakończył", data.completedBy, RIGHT_COLUMN_X, y + 43, 62);
  if (data.completedAt !== "-") drawField(doc, "Zakończono", data.completedAt, CONTENT_LEFT, y + 61, 82);

  y += 84;
  y = addPageIfNeeded(doc, y, 85 + data.deviceRows.length * 25);
  drawSectionTitle(doc, "Urządzenia i tabliczki", y);
  const tableHeight = 32 + Math.max(1, data.deviceRows.length) * 21;
  drawCard(doc, y + 8, tableHeight);
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(0, 0, 0);
  doc.text("URZĄDZENIE", CONTENT_LEFT, y + 27);
  doc.text("MODEL / MOC", 146, y + 27);
  doc.text("TABLICZKA", 412, y + 27);
  doc.setDrawColor(212, 224, 230);
  doc.line(CONTENT_LEFT, y + 35, CONTENT_RIGHT, y + 35);
  const rows = data.deviceRows.length ? data.deviceRows : [{ unit: "-", model: "Brak urządzeń", nameplate: "Brak tabliczki" }];
  rows.forEach((row, index) => {
    const rowY = y + 53 + index * 21;
    doc.setFont(FONT_FAMILY, "bold");
    doc.setFontSize(9.2);
    doc.setTextColor(0, 0, 0);
    doc.text(row.unit, CONTENT_LEFT, rowY);
    doc.text(doc.splitTextToSize(row.model, 250), 146, rowY);
    const ready = row.nameplate === "Zapisana w systemie" || row.nameplate === "Zapisana na telefonie";
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(8.6);
    doc.setTextColor(0, 0, 0);
    doc.text(row.nameplate, 412, rowY);
  });

  y += tableHeight + 20;
  if (data.payment?.enabled) {
    y = addPageIfNeeded(doc, y, 72);
    drawSectionTitle(doc, "Potwierdzenie zapłaty", y);
    drawCard(doc, y + 8, 44);
    drawField(doc, "Kwota", data.payment.amountLabel, CONTENT_LEFT, y + 25, 54);
    drawField(doc, "Rodzaj", data.payment.kindLabel, RIGHT_COLUMN_X, y + 25, 58);
    drawField(doc, "Metoda", data.payment.methodLabel, CONTENT_LEFT, y + 42, 54);
    drawField(doc, "Data", data.payment.paidDateLabel, RIGHT_COLUMN_X, y + 42, 58);
    y += 62;
  }

  const legalLayout = getLegalNoticeLayout(doc);
  y = addPageIfNeeded(doc, y, legalLayout.cardHeight + 24);
  drawSectionTitle(doc, "Informacje i ustalenia", y);
  drawLegalNotices(doc, y, legalLayout);
  y += legalLayout.cardHeight + 22;

  y = addPageIfNeeded(doc, y, 150);
  drawSectionTitle(doc, "Potwierdzenie klienta", y);
  drawCard(doc, y + 8, 132);
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  const paymentConfirmation = data.payment?.enabled
    ? ` oraz płatność ${data.payment.amountLabel} (${data.payment.kindLabel.toLowerCase()}, ${data.payment.methodLabel.toLowerCase()})`
    : "";
  const confirmation = `Potwierdzam zakończenie montażu${paymentConfirmation}. Zapoznałem(-am) się z informacją o przetwarzaniu danych osobowych i akceptuję ustalenia dotyczące odpadów.`;
  doc.text(doc.splitTextToSize(confirmation, CONTENT_WIDTH), CONTENT_LEFT, y + 31, { lineHeightFactor: 1.18 });
  const clientSignatureLeft = CONTENT_LEFT;
  const clientSignatureWidth = 240;
  const clientSignatureMaxWidth = 236;
  const clientSignatureMaxHeight = 64;
  const clientSignatureLineY = y + 112;
  const installerSignatureLeft = CONTENT_RIGHT - clientSignatureWidth;
  if (signatureDataUrl) {
    const image = doc.getImageProperties(signatureDataUrl);
    const signatureSize = getContainedSignatureSize(image.width, image.height, clientSignatureMaxWidth, clientSignatureMaxHeight);
    const signatureX = clientSignatureLeft + (clientSignatureWidth - signatureSize.width) / 2;
    const signatureY = clientSignatureLineY - signatureSize.height - 4;
    doc.addImage(signatureDataUrl, "PNG", signatureX, signatureY, signatureSize.width, signatureSize.height, undefined, "FAST");
  }
  doc.setDrawColor(212, 224, 230);
  doc.line(clientSignatureLeft, clientSignatureLineY, clientSignatureLeft + clientSignatureWidth, clientSignatureLineY);
  doc.line(installerSignatureLeft, clientSignatureLineY, installerSignatureLeft + clientSignatureWidth, clientSignatureLineY);
  doc.setFontSize(7.3);
  doc.setTextColor(0, 0, 0);
  doc.text("Podpis klienta złożony palcem na ekranie telefonu", clientSignatureLeft, y + 129);
  doc.text("Pieczątka i podpis instalatora", installerSignatureLeft + (clientSignatureWidth / 2), y + 129, { align: "center" });

  drawFooter(doc, data);
  return doc;
}

export async function generateJobProtocolPdf({ job, profiles, signatureDataUrl, signedAt = new Date(), payment = null }) {
  const { data, doc, fileName, pdfBlob } = await createJobProtocolPdfFile({
    job,
    profiles,
    signatureDataUrl,
    signedAt,
    payment,
  });
  const file = typeof File === "function" ? new File([pdfBlob], fileName, { type: PDF_MIME_TYPE }) : null;

  if (file && typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Protokół Wawis - wersja testowa",
      text: `Protokół dla: ${data.client}`,
    });
    return { fileName, shared: true };
  }

  doc.save(fileName);
  return { fileName, shared: false };
}

export async function createJobProtocolPdfFile({ job, profiles, signatureDataUrl, signedAt = new Date(), payment = null }) {
  if (!signatureDataUrl) throw new Error("Złóż podpis klienta przed utworzeniem PDF.");
  const data = buildJobProtocolData({ job, profiles, signedAt, payment });
  const doc = await buildPdfDocument({ data, signatureDataUrl });
  const fileName = getProtocolFileName(data);
  const pdfBlob = doc.output("blob");
  return { data, doc, fileName, pdfBlob };
}
