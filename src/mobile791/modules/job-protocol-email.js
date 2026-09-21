export const JOB_PROTOCOL_EMAIL_FUNCTION = "send-job-protocol-email";
export const JOB_PROTOCOL_EMAIL_SENDER = "biuro@wawis.pl";
export const PROTOCOL_EMAIL_ATTEMPT_STORAGE_KEY = "protocol-email-attempt-v1088";

const memoryProtocolEmailAttempts = new Map();

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

function getAttemptIdentity({ userId, job, record, recipientEmail }) {
  return [
    normalizeText(userId),
    normalizeText(job?.id),
    normalizeText(record?.id),
    normalizeText(record?.storage_path),
    normalizeText(record?.signed_at),
    normalizeProtocolEmail(recipientEmail),
    "send-protocol",
  ].join("|");
}

function attemptStorageKey(identity) {
  return `${PROTOCOL_EMAIL_ATTEMPT_STORAGE_KEY}:${encodeURIComponent(identity)}`;
}
function loadStoredProtocolEmailAttempt(identity) {
  try {
    const parsed = JSON.parse(localStorage.getItem(attemptStorageKey(identity)) || 'null');
    return parsed?.identity === identity && parsed?.requestKey ? parsed : memoryProtocolEmailAttempts.get(identity) || null;
  } catch { return memoryProtocolEmailAttempts.get(identity) || null; }
}
function persistProtocolEmailAttempt(attempt) {
  memoryProtocolEmailAttempts.set(attempt.identity, attempt);
  try { localStorage.setItem(attemptStorageKey(attempt.identity), JSON.stringify(attempt)); } catch {}
}
export function getOrCreateProtocolEmailAttempt({ userId = '', job, record, recipientEmail, forceNew = false }) {
  const identity = getAttemptIdentity({ userId, job, record, recipientEmail });
  const stored = loadStoredProtocolEmailAttempt(identity);
  // A pending operation cannot be discarded by a second click or forceNew.
  if (stored?.requestKey && (!forceNew || !stored.completed)) return stored;
  const attempt = { identity, ownerUserId: userId, requestKey: createRequestKey(),
    jobId: normalizeText(job?.id), protocolId: normalizeText(record?.id),
    protocolStoragePath: normalizeText(record?.storage_path), recipientEmail: normalizeProtocolEmail(recipientEmail),
    createdAt: new Date().toISOString() };
  persistProtocolEmailAttempt(attempt);
  return attempt;
}
export function clearProtocolEmailAttempt(requestKey = '') {
  // Retain successful identity for reconciliation after a reload; a deliberate
  // new send must request forceNew. Each operation has its own storage key.
  for (const attempt of memoryProtocolEmailAttempts.values()) {
    if (attempt.requestKey === requestKey) persistProtocolEmailAttempt({ ...attempt, completed: true });
  }
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

  const session = await supabase.auth.getSession();
  const userId = normalizeText(session?.data?.session?.user?.id);
  if (!userId) throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  const attempt = getOrCreateProtocolEmailAttempt({ userId, job, record, recipientEmail, forceNew: forceNewAttempt });
  const requestKey = attempt.requestKey;
  const { data, error } = await supabase.functions.invoke(JOB_PROTOCOL_EMAIL_FUNCTION, {
    body: {
      jobId: job.id,
      protocolId: record.id,
      recipientEmail,
      requestKey,
      protocolStoragePath: attempt.protocolStoragePath,
    },
  });

  if (error) {
    const payload = await getInvokeErrorPayload(error);
    if (payload?.requestKey && payload.requestKey !== requestKey) persistProtocolEmailAttempt({...attempt,requestKey:payload.requestKey});
    if (payload?.definitive) clearProtocolEmailAttempt(requestKey);
    const message = await getInvokeErrorMessage(error, payload);
    if (payload?.pending || payload?.providerResultUnknown) {
      throw createProtocolEmailPendingError(message, requestKey);
    }
    throw new Error(message);
  }
  if (data?.requestKey && data.requestKey !== requestKey) persistProtocolEmailAttempt({...attempt,requestKey:data.requestKey});
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
