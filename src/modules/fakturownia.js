async function getFreshAccessToken(supabase) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw new Error(error.message || 'Nie udało się pobrać sesji użytkownika.');
  if (!session?.access_token) throw new Error('Brak aktywnej sesji użytkownika. Wyloguj się i zaloguj ponownie.');
  return session.access_token;
}

async function getFunctionErrorMessage(error) {
  try {
    const response = error?.context;
    if (response && typeof response.clone === 'function') {
      const payload = await response.clone().json();
      if (payload?.error) return String(payload.error);
    }
  } catch {
    // Zostawiamy komunikat biblioteki jako awaryjny.
  }
  return String(error?.message || error || 'Nie udało się połączyć z Fakturownią.');
}

async function invokeFakturowniaClient({ supabase, body }) {
  const accessToken = await getFreshAccessToken(supabase);
  const { data, error } = await supabase.functions.invoke('fakturownia-client', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  return data || {};
}

export async function prepareFakturowniaInvoice({ supabase, jobId }) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) throw new Error('Brak identyfikatora montażu.');

  const data = await invokeFakturowniaClient({
    supabase,
    body: { action: 'prepare', jobId: normalizedJobId },
  });
  if (!data?.invoiceUrl) throw new Error('Fakturownia nie zwróciła adresu formularza faktury.');
  return data;
}

export async function verifyFakturowniaInvoice({ supabase, jobId, clientId }) {
  const normalizedJobId = String(jobId || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedJobId) throw new Error('Brak identyfikatora montażu.');
  // When opened from an existing job after reload, the trusted client is resolved on the server.
  return invokeFakturowniaClient({
    supabase,
    body: {
      action: 'verify',
      jobId: normalizedJobId,
      clientId: normalizedClientId,
    },
  });
}

export async function lookupFakturowniaInvoiceByNumber({ supabase, jobId, invoiceNumber }) {
  const normalizedJobId = String(jobId || '').trim();
  const normalizedNumber = String(invoiceNumber || '').trim();
  if (!normalizedJobId) throw new Error('Brak identyfikatora montażu.');
  if (!normalizedNumber || normalizedNumber.length > 100) throw new Error('Podaj poprawny numer faktury.');
  return invokeFakturowniaClient({
    supabase,
    body: { action: 'link_by_number', jobId: normalizedJobId, invoiceNumber: normalizedNumber },
  });
}

/** Cheap server-owned check; never exposes historical invoice identifiers. */
export async function hasPendingFakturowniaInvoice({ supabase, jobId }) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) return false;
  const data = await invokeFakturowniaClient({
    supabase,
    body: { action: 'pending', jobId: normalizedJobId },
  });
  return Boolean(data?.pending);
}

/**
 * 14.45: PDF potwierdzonej faktury pobierany na żądanie z Fakturowni (tylko administrator).
 * Zwraca Blob — WAWIS niczego nie zapisuje w bazie ani w Storage.
 */
export function decodeInvoicePdfBase64(pdfBase64) {
  const text = String(pdfBase64 || '');
  if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('Fakturownia nie zwróciła pliku PDF.');
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (binary.slice(0, 5) !== '%PDF-') throw new Error('Fakturownia nie zwróciła pliku PDF.');
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function getFakturowniaInvoicePdf({ supabase, jobId }) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) throw new Error('Brak identyfikatora montażu.');
  const data = await invokeFakturowniaClient({
    supabase,
    body: { action: 'invoice_pdf', jobId: normalizedJobId },
  });
  return {
    blob: decodeInvoicePdfBase64(data?.pdfBase64),
    fileName: String(data?.fileName || 'faktura.pdf'),
    invoiceNumber: String(data?.invoiceNumber || ''),
  };
}
