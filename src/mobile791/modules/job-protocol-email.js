export const JOB_PROTOCOL_EMAIL_FUNCTION = "send-job-protocol-email";
export const JOB_PROTOCOL_EMAIL_SENDER = "biuro@wawis.pl";
export const PROTOCOL_EMAIL_ATTEMPT_STORAGE_KEY = "protocol-email-attempt-v1088";

let memoryProtocolEmailAttempt = null;

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeProtocolEmail(value) {
  return normalizeText(value).toLowerCase();
}

export function isValidProtocolEmail(value) {
  const email = normalizeProtocolEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function getJobProtocolRecipientEmail(job) {
  return normalizeProtocolEmail(job?.email);
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getAttemptIdentity({ job, record, recipientEmail }) {
  return [
    normalizeText(job?.id),
    normalizeText(record?.id),
    normalizeText(record?.storage_path),
    normalizeText(record?.signed_at),
    normalizeProtocolEmail(recipientEmail),
    "send-protocol",
  ].join("|");
}

function loadStoredProtocolEmailAttempt() {
  if (typeof localStorage === "undefined") return memoryProtocolEmailAttempt;
  try {
    const parsed = JSON.parse(localStorage.getItem(PROTOCOL_EMAIL_ATTEMPT_STORAGE_KEY) || "null");
    return parsed && parsed.identity && parsed.requestKey ? parsed : null;
  } catch {
    return null;
  }
}

function persistProtocolEmailAttempt(attempt) {
  memoryProtocolEmailAttempt = attempt || null;
  if (typeof localStorage === "undefined") return;
  try {
    if (attempt) localStorage.setItem(PROTOCOL_EMAIL_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
    else localStorage.removeItem(PROTOCOL_EMAIL_ATTEMPT_STORAGE_KEY);
  } catch {
    // Brak localStorage nie może tworzyć nowej próby w trakcie tego samego wywołania.
  }
}

export function getOrCreateProtocolEmailAttempt({ job, record, recipientEmail, forceNew = false }) {
  const identity = getAttemptIdentity({ job, record, recipientEmail });
  const stored = forceNew ? null : loadStoredProtocolEmailAttempt();
  if (stored?.identity === identity && normalizeText(stored.requestKey)) return stored;
  const attempt = {
    identity,
    requestKey: createRequestKey(),
    jobId: normalizeText(job?.id),
    protocolId: normalizeText(record?.id),
    protocolStoragePath: normalizeText(record?.storage_path),
    recipientEmail: normalizeProtocolEmail(recipientEmail),
    createdAt: new Date().toISOString(),
  };
  persistProtocolEmailAttempt(attempt);
  return attempt;
}

export function clearProtocolEmailAttempt(requestKey = "") {
  const stored = loadStoredProtocolEmailAttempt();
  if (requestKey && stored?.requestKey && stored.requestKey !== requestKey) return;
  persistProtocolEmailAttempt(null);
}

async function getInvokeErrorPayload(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

async function getInvokeErrorMessage(error, payload = null) {
  const fallback = normalizeText(error?.message) || "Nie udało się wysłać protokołu e-mailem.";
  if (payload) return normalizeText(payload?.error || payload?.message) || fallback;
  const parsed = await getInvokeErrorPayload(error);
  return normalizeText(parsed?.error || parsed?.message) || fallback;
}

function createProtocolEmailPendingError(message, requestKey) {
  const error = new Error(message || "Wynik wysyłki nie jest jeszcze potwierdzony. Ponów — aplikacja użyje tej samej próby.");
  error.code = "PROTOCOL_EMAIL_PENDING";
  error.requestKey = requestKey;
  error.retryable = true;
  return error;
}

export async function sendJobProtocolEmail({ supabase, job, record, forceNewAttempt = false }) {
  if (!supabase?.functions?.invoke) throw new Error("Brak połączenia z serwerem wysyłki e-mail.");
  if (normalizeText(job?.status) !== "Zakończone") {
    throw new Error("Protokół można wysłać dopiero po zakończeniu zlecenia.");
  }
  if (!normalizeText(job?.id) || !normalizeText(record?.id)) {
    throw new Error("Nie znaleziono zapisanego protokołu do wysłania.");
  }
  const recipientEmail = getJobProtocolRecipientEmail(job);
  if (!recipientEmail) throw new Error("W zleceniu nie ma adresu e-mail klienta.");
  if (!isValidProtocolEmail(recipientEmail)) throw new Error("Adres e-mail klienta zapisany w zleceniu jest nieprawidłowy.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Do wysłania protokołu potrzebne jest połączenie z internetem.");
  }

  const attempt = getOrCreateProtocolEmailAttempt({ job, record, recipientEmail, forceNew: forceNewAttempt });
  const requestKey = attempt.requestKey;
  const { data, error } = await supabase.functions.invoke(JOB_PROTOCOL_EMAIL_FUNCTION, {
    body: {
      jobId: job.id,
      protocolId: record.id,
      recipientEmail,
      requestKey,
    },
  });

  if (error) {
    const payload = await getInvokeErrorPayload(error);
    if (payload?.definitive) clearProtocolEmailAttempt(requestKey);
    const message = await getInvokeErrorMessage(error, payload);
    if (payload?.pending || payload?.providerResultUnknown) {
      throw createProtocolEmailPendingError(message, requestKey);
    }
    throw new Error(message);
  }
  if (data?.pending || data?.providerResultUnknown) {
    throw createProtocolEmailPendingError(normalizeText(data?.error || data?.message), requestKey);
  }
  if (!data?.ok) {
    if (data?.definitive) clearProtocolEmailAttempt(requestKey);
    throw new Error(normalizeText(data?.error) || "Serwer nie potwierdził wysłania protokołu.");
  }

  clearProtocolEmailAttempt(requestKey);
  return {
    ...data,
    recipientEmail: normalizeProtocolEmail(data.recipientEmail || recipientEmail),
    senderEmail: normalizeProtocolEmail(data.senderEmail || JOB_PROTOCOL_EMAIL_SENDER),
  };
}
