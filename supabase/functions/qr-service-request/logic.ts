// WAWIS 14.20 — zgłoszenia od klientów z naklejki QR: czysta logika (bez importów, testowana w Node).

export const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;
export const LIMITS = { perCodePerDay: 3, perIpPerDay: 5, globalPerHour: 20, descriptionMax: 1000, descriptionMinForFault: 5 };
export const OVERDUE_GRACE_DAYS = 62;

export function normalizeCode(input: unknown): string {
  const raw = String(input ?? "").trim();
  const fromUrl = raw.match(/\/u\/([0-9A-Za-z-]{8,9})\/?(?:[?#].*)?$/);
  const candidate = (fromUrl ? fromUrl[1] : raw).replace(/[\s-]/g, "").toUpperCase();
  return CODE_PATTERN.test(candidate) ? candidate : "";
}

/** Polski numer komórkowy/stacjonarny → 48XXXXXXXXX albo "" (jak przy SMS-ach). */
export function normalizePhone(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (!raw || !/^[0-9+()\s.-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 13 && digits.startsWith("0048")) digits = digits.slice(2);
  else if (digits.length === 9) digits = `48${digits}`;
  return digits.length === 11 && digits.startsWith("48") ? digits : "";
}

export function formatPhone(phone48: string): string {
  const d = String(phone48 || "").replace(/^48/, "");
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : String(phone48 || "");
}

function cleanText(input: unknown): string {
  // Bez znaków sterujących (poza nową linią), bez nadmiarowych spacji.
  return String(input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SubmitInput = { kind: "awaria" | "przeglad"; description: string; phone: string };
export type Validation = { ok: true; value: SubmitInput } | { ok: false; field: string; error: string };

export function validateSubmission(body: Record<string, unknown> | null): Validation {
  if (!body) return { ok: false, field: "form", error: "Nieprawidłowe zgłoszenie." };
  // Pole-pułapka dla robotów: człowiek go nie widzi i nie wypełnia.
  if (String(body.website ?? "").trim()) return { ok: false, field: "form", error: "Nie udało się wysłać zgłoszenia." };
  const kind = String(body.kind ?? "");
  if (kind !== "awaria" && kind !== "przeglad") return { ok: false, field: "kind", error: "Wybierz: awaria albo przegląd." };
  const description = cleanText(body.description);
  if (description.length > LIMITS.descriptionMax) {
    return { ok: false, field: "description", error: `Opis może mieć najwyżej ${LIMITS.descriptionMax} znaków.` };
  }
  if (kind === "awaria" && description.length < LIMITS.descriptionMinForFault) {
    return { ok: false, field: "description", error: "Opisz krótko, co się dzieje z klimatyzatorem." };
  }
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, field: "phone", error: "Podaj numer telefonu (9 cyfr), żebyśmy mogli oddzwonić." };
  return { ok: true, value: { kind, description, phone } };
}

function parseIsoDate(value: unknown): { y: number; m: number; d: number } | null {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (m < 1 || m > 12 || d < 1 || d > dim) return null;
  return { y, m, d };
}

function addMonths(p: { y: number; m: number; d: number }, months: number) {
  const zero = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(zero / 12), m = (zero % 12) + 1;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(p.d, dim) };
}

const iso = (p: { y: number; m: number; d: number }) =>
  `${String(p.y).padStart(4, "0")}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
const dayNo = (s: string) => Math.trunc(Date.parse(`${s}T00:00:00Z`) / 86400000);

/**
 * Termin przeglądu jak przy SMS-ach: 11 miesięcy po montażu, potem co 12 miesięcy. Pokazujemy termin,
 * który jeszcze trwa (do 62 dni po dacie, jak okno SMS) albo najbliższy przyszły.
 */
export function nextInspectionDate(installationDate: unknown, todayIso: string): string {
  const start = parseIsoDate(installationDate);
  if (!start || !parseIsoDate(todayIso)) return "";
  const today = dayNo(todayIso);
  for (let cycle = 0; cycle < 60; cycle += 1) {
    const due = iso(addMonths(start, 11 + cycle * 12));
    if (dayNo(due) + OVERDUE_GRACE_DAYS >= today) return due;
  }
  return "";
}

export function formatDatePl(isoDate: string): string {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

export function warsawToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const read = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** Publiczne dane po zeskanowaniu: tylko firma, model, data montażu i termin przeglądu. */
export function buildPublicInfo({ code, device, settings, todayIso }: {
  code: string;
  device: { model?: string | null; installation_date?: string | null } | null;
  settings: { company_name?: string | null; service_phone?: string | null } | null;
  todayIso: string;
}) {
  const servicePhone = normalizePhone(settings?.service_phone);
  const installation = String(device?.installation_date || "").slice(0, 10);
  const nextDue = device ? nextInspectionDate(installation, todayIso) : "";
  return {
    ok: true,
    code,
    company: String(settings?.company_name || "").trim() || "WAWIS Klimatyzacja",
    phone: servicePhone ? formatPhone(servicePhone) : "",
    phoneHref: servicePhone ? `+${servicePhone}` : "",
    assigned: Boolean(device),
    model: device ? String(device.model || "").trim() : "",
    installationDate: device && parseIsoDate(installation) ? formatDatePl(installation) : "",
    nextInspection: nextDue ? formatDatePl(nextDue) : "",
    inspectionDueNow: nextDue ? dayNo(nextDue) <= dayNo(todayIso) : false,
  };
}

export function rateLimitError(counts: { perCode: number; perIp: number; global: number }): string {
  if (counts.perCode >= LIMITS.perCodePerDay || counts.perIp >= LIMITS.perIpPerDay) {
    return "Zgłoszenie z tego urządzenia już do nas dotarło. Jeśli sprawa jest pilna, zadzwoń.";
  }
  if (counts.global >= LIMITS.globalPerHour) {
    return "Chwilowo nie możemy przyjąć zgłoszenia. Zadzwoń do nas.";
  }
  return "";
}

export function buildAdminPush({ kind, model, contractorName, city, phone, description }: {
  kind: string; model?: string | null; contractorName?: string | null; city?: string | null; phone: string; description: string;
}) {
  const label = kind === "awaria" ? "Awaria" : "Przegląd";
  const who = [String(contractorName || "").trim(), String(city || "").replace(/^\d{2}-\d{3}\s*/, "").trim()].filter(Boolean).join(", ");
  const short = description.length > 90 ? `${description.slice(0, 87)}…` : description;
  const parts = [
    [String(model || "").trim(), who].filter(Boolean).join(" — ") || "Naklejka bez przypisanego urządzenia",
    `Tel. ${formatPhone(phone)}`,
    short,
  ].filter(Boolean);
  return { title: `Nowe zgłoszenie: ${label}`, body: parts.join(". ") };
}
