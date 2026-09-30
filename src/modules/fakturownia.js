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

export async function prepareFakturowniaInvoice({ supabase, jobId }) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) throw new Error('Brak identyfikatora montażu.');

  const accessToken = await getFreshAccessToken(supabase);
  const { data, error } = await supabase.functions.invoke('fakturownia-client', {
    body: { jobId: normalizedJobId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  if (!data?.invoiceUrl) throw new Error('Fakturownia nie zwróciła adresu formularza faktury.');
  return data;
}
