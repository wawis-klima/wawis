export const PAYMENT_METHODS = Object.freeze([
  { value: "cash", label: "Gotówka" },
  { value: "transfer", label: "Przelew" },
  { value: "card", label: "Karta" },
  { value: "blik", label: "BLIK" },
]);

export const PAYMENT_KINDS = Object.freeze([
  { value: "full", label: "Zapłacono całość" },
  { value: "deposit", label: "Wpłacono zaliczkę" },
]);

const PAYMENT_METHOD_VALUES = new Set(PAYMENT_METHODS.map((item) => item.value));
const PAYMENT_KIND_VALUES = new Set(PAYMENT_KINDS.map((item) => item.value));

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getLocalDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function parseAmount(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

export function getPaymentMethodLabel(value) {
  return PAYMENT_METHODS.find((item) => item.value === value)?.label || "-";
}

export function getPaymentKindLabel(value) {
  return PAYMENT_KINDS.find((item) => item.value === value)?.label || "-";
}

export function formatPaymentAmount(value) {
  const amount = parseAmount(value);
  if (amount === null) return "-";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function getPaymentDraftFromJob(job = {}) {
  const enabled = Boolean(job?.payment_confirmation_enabled);
  return {
    enabled,
    amount: enabled && job?.payment_amount != null ? String(job.payment_amount).replace(".", ",") : "",
    kind: PAYMENT_KIND_VALUES.has(job?.payment_kind) ? job.payment_kind : "full",
    method: PAYMENT_METHOD_VALUES.has(job?.payment_method) ? job.payment_method : "cash",
    paidDate: getLocalDateInputValue(job?.payment_paid_at || new Date()),
  };
}

export function normalizePaymentConfirmation(payment = {}) {
  if (!payment?.enabled) {
    return {
      enabled: false,
      amount: null,
      amountLabel: "-",
      kind: "",
      kindLabel: "-",
      method: "",
      methodLabel: "-",
      paidDate: "",
      paidAt: null,
    };
  }

  const amount = parseAmount(payment.amount);
  if (amount === null || amount <= 0) throw new Error("Wpisz prawidłową kwotę zapłaty większą od zera.");
  if (!PAYMENT_KIND_VALUES.has(payment.kind)) throw new Error("Wybierz, czy zapłacono całość, czy zaliczkę.");
  if (!PAYMENT_METHOD_VALUES.has(payment.method)) throw new Error("Wybierz sposób płatności.");
  const paidDate = normalizeText(payment.paidDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error("Wybierz datę zapłaty.");
  const paidAtDate = new Date(`${paidDate}T12:00:00`);
  if (Number.isNaN(paidAtDate.getTime())) throw new Error("Data zapłaty jest nieprawidłowa.");

  return {
    enabled: true,
    amount,
    amountLabel: formatPaymentAmount(amount),
    kind: payment.kind,
    kindLabel: getPaymentKindLabel(payment.kind),
    method: payment.method,
    methodLabel: getPaymentMethodLabel(payment.method),
    paidDate,
    paidAt: paidAtDate.toISOString(),
  };
}

export function getPaymentJobPatch(payment, recordedBy = null, updatedAt = new Date()) {
  const normalized = normalizePaymentConfirmation(payment);
  if (!normalized.enabled) {
    return {
      payment_confirmation_enabled: false,
      payment_amount: null,
      payment_kind: null,
      payment_method: null,
      payment_paid_at: null,
      payment_recorded_by: null,
      payment_updated_at: updatedAt.toISOString(),
    };
  }
  return {
    payment_confirmation_enabled: true,
    payment_amount: normalized.amount,
    payment_kind: normalized.kind,
    payment_method: normalized.method,
    payment_paid_at: normalized.paidAt,
    payment_recorded_by: recordedBy || null,
    payment_updated_at: updatedAt.toISOString(),
  };
}

function isMissingPaymentColumnsError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message).toLowerCase();
  return code === "PGRST204"
    || code === "42703"
    || message.includes("payment_confirmation_enabled")
    || message.includes("payment_amount")
    || message.includes("payment_method");
}

export async function saveJobPaymentConfirmation({ supabase, job, payment }) {
  if (!supabase || !job?.id) throw new Error("Nie można zapisać płatności bez połączenia ze zleceniem.");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = normalizeText(sessionData?.session?.user?.id);
  if (!userId) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  const patch = getPaymentJobPatch(payment, userId);
  const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
  if (error) {
    if (isMissingPaymentColumnsError(error)) {
      throw new Error("Obsługa płatności wymaga uruchomienia skryptu bazy dołączonego do wersji 9.86.");
    }
    throw error;
  }
  return patch;
}

