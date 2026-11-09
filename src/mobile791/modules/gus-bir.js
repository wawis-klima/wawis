function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeGusNip(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

export function isValidPolishNip(value = '') {
  const nip = normalizeGusNip(value);
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(nip[index]), 0) % 11;
  return checksum !== 10 && checksum === Number(nip[9]);
}

// 14.40: „Szukaj w GUS” przy edycji montażu. Adres montażu bywa inny niż siedziba firmy, dlatego pola
// wypełnione zostają nietknięte, a montaż powiązany z kartą klienta nie jest zmieniany wcale.
function formatGusSummary(result = {}) {
  const postalCity = [cleanText(result.postalCode), cleanText(result.city)].filter(Boolean).join(' ');
  return [cleanText(result.name), cleanText(result.street), postalCity].filter(Boolean).join(', ');
}

export function applyGusResultToEditedJob(form = {}, result = {}, nip = '') {
  if (normalizeGusNip(form.nip) !== normalizeGusNip(nip)) return { form, message: '' };

  const summary = formatGusSummary(result);
  if (cleanText(form.contractor_id)) {
    return { form, message: `GUS: ${summary}. Montaż jest powiązany z kartą klienta — dane nie zostały zmienione.` };
  }

  const next = { ...form };
  if (!cleanText(next.client) && result.name) next.client = result.name;
  if (!cleanText(next.street) && !cleanText(next.city)) {
    if (result.street) next.street = result.street;
    if (result.city) next.city = [cleanText(result.postalCode), cleanText(result.city)].filter(Boolean).join(' ');
  }
  const changed = next.client !== form.client || next.street !== form.street || next.city !== form.city;
  return {
    form: changed ? next : form,
    message: changed
      ? `GUS: ${summary}. Uzupełniono puste pola.`
      : `GUS: ${summary}. Wypełnione pola nie zostały zmienione.`,
  };
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
