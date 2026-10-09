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
  if (!normalizedClientId) throw new Error('Brak identyfikatora klienta Fakturowni.');

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
