export const JOB_PROTOCOL_EMAIL_FUNCTION = "send-job-protocol-email";
export const JOB_PROTOCOL_EMAIL_SENDER = "biuro@wawis.pl";

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

async function getInvokeErrorMessage(error) {
  const fallback = normalizeText(error?.message) || "Nie udało się wysłać protokołu e-mailem.";
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return fallback;
  try {
    const payload = await response.clone().json();
    return normalizeText(payload?.error || payload?.message) || fallback;
  } catch {
    return fallback;
  }
}

export async function sendJobProtocolEmail({ supabase, job, record }) {
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

  const { data, error } = await supabase.functions.invoke(JOB_PROTOCOL_EMAIL_FUNCTION, {
    body: {
      jobId: job.id,
      protocolId: record.id,
      recipientEmail,
      requestKey: createRequestKey(),
    },
  });

  if (error) throw new Error(await getInvokeErrorMessage(error));
  if (!data?.ok) throw new Error(normalizeText(data?.error) || "Serwer nie potwierdził wysłania protokołu.");
  return {
    ...data,
    recipientEmail: normalizeProtocolEmail(data.recipientEmail || recipientEmail),
    senderEmail: normalizeProtocolEmail(data.senderEmail || JOB_PROTOCOL_EMAIL_SENDER),
  };
}
