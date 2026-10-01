function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeGusNip(value = '') {
  return String(value || '').replace(/\D+/g, '').slice(0, 10);
}

export function isValidPolishNip(value = '') {
  const nip = normalizeGusNip(value);
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(nip[index]), 0) % 11;
  return checksum !== 10 && checksum === Number(nip[9]);
}

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
  return String(error?.message || error || 'Nie udało się pobrać danych firmy z GUS.');
}

export async function lookupCompanyByNip({ supabase, nip }) {
  const normalizedNip = normalizeGusNip(nip);
  if (normalizedNip.length !== 10) return { found: false, nip: normalizedNip, skipped: true };
  if (!isValidPolishNip(normalizedNip)) throw new Error('Podany NIP ma nieprawidłową sumę kontrolną.');

  const accessToken = await getFreshAccessToken(supabase);
  const { data, error } = await supabase.functions.invoke('gus-bir-lookup', {
    body: { nip: normalizedNip },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));

  return {
    found: Boolean(data?.found),
    nip: normalizeGusNip(data?.nip || normalizedNip),
    regon: cleanText(data?.regon),
    name: cleanText(data?.name),
    postalCode: cleanText(data?.postalCode),
    city: cleanText(data?.city),
    street: cleanText(data?.street),
    streetName: cleanText(data?.streetName),
    propertyNumber: cleanText(data?.propertyNumber),
    apartmentNumber: cleanText(data?.apartmentNumber),
    source: cleanText(data?.source || 'GUS REGON BIR'),
  };
}
