const POSTAL_CODE_RE = /^\d{2}-\d{3}$/;
const POSTAL_CITY_RE = /^\s*(\d{2}-\d{3})\s+(.+?)\s*$/;

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizePostalCode(value = '') {
  const digits = String(value || '').replace(/\D+/g, '').slice(0, 5);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function splitPostalCity(value = '') {
  const text = cleanText(value);
  const match = text.match(POSTAL_CITY_RE);
  if (!match) return { postalCode: '', city: text };
  return {
    postalCode: match[1],
    city: cleanText(match[2]),
  };
}

export function composePostalCity(city = '', postalCode = '') {
  const parsedCity = splitPostalCity(city);
  const cleanCity = parsedCity.city;
  const cleanPostal = normalizePostalCode(postalCode || parsedCity.postalCode);
  if (!cleanCity) return cleanPostal;
  if (!POSTAL_CODE_RE.test(cleanPostal)) return cleanCity;
  return `${cleanPostal} ${cleanCity}`;
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
  return String(error?.message || error || 'Nie udało się wyszukać kodu pocztowego.');
}

export async function lookupPostalCode({ supabase, city, street = '' }) {
  const parsed = splitPostalCity(city);
  const cleanCity = parsed.city;
  if (!cleanCity) return { postalCode: '', city: '', street: cleanText(street) };

  const accessToken = await getFreshAccessToken(supabase);
  const { data, error } = await supabase.functions.invoke('postal-code-lookup', {
    body: {
      city: cleanCity,
      street: cleanText(street),
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));

  return {
    postalCode: normalizePostalCode(data?.postalCode || ''),
    city: cleanText(data?.city || cleanCity),
    street: cleanText(data?.street || street),
    fallback: Boolean(data?.fallback),
  };
}
