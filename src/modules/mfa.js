// WAWIS 14.72 — kod z telefonu przy logowaniu administratora (MFA TOTP, Supabase Auth; decyzja właściciela 21.11.2026).
// Etap 1 (ta wersja): włączanie kodu w Diagnostyce i krok kodu po haśle. Wymuszenie w bazie (aal2 dla funkcji
// administratora) to osobny etap, po teście na iPhonie i zgodzie właściciela.
// Zasada: przy błędzie odczytu poziomu zabezpieczeń aplikacja NIE blokuje pracy (np. bez internetu) — pełną ochronę
// daje dopiero etap 2 w bazie.

export const MFA_FRIENDLY_NAME = 'WAWIS — telefon';
export const MFA_ISSUER = 'WAWIS Klimatyzacja';

export function normalizeMfaCode(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, 6);
}

export function isCompleteMfaCode(value) {
  return /^\d{6}$/.test(normalizeMfaCode(value));
}

function mfaApi(supabase) {
  const api = supabase?.auth?.mfa;
  return api && typeof api.getAuthenticatorAssuranceLevel === 'function' ? api : null;
}

// required — konto ma włączony kod, a bieżąca sesja jeszcze go nie podała.
export async function getMfaGateState(supabase) {
  const api = mfaApi(supabase);
  if (!api) return { status: 'ok', reason: 'unsupported' };
  try {
    const { data, error } = await api.getAuthenticatorAssuranceLevel();
    if (error || !data) return { status: 'ok', reason: 'error' };
    if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') return { status: 'required', currentLevel: data.currentLevel };
    return { status: 'ok', currentLevel: data.currentLevel, nextLevel: data.nextLevel };
  } catch {
    return { status: 'ok', reason: 'error' };
  }
}

export async function listTotpFactors(supabase) {
  const api = mfaApi(supabase);
  if (!api) return { verified: [], unverified: [] };
  const { data, error } = await api.listFactors();
  if (error) throw error;
  const all = Array.isArray(data?.all) ? data.all : [...(data?.totp || [])];
  const totp = all.filter((factor) => factor.factor_type === 'totp');
  return {
    verified: totp.filter((factor) => factor.status === 'verified'),
    unverified: totp.filter((factor) => factor.status !== 'verified'),
  };
}

// Nowe włączenie: najpierw usuwamy niedokończone próby (Supabase nie pozwala na dwa składniki o tej samej nazwie).
export async function startTotpEnrollment(supabase) {
  const api = mfaApi(supabase);
  if (!api) throw new Error('Ta wersja przeglądarki nie obsługuje kodu z telefonu.');
  const { unverified } = await listTotpFactors(supabase);
  for (const factor of unverified) {
    const { error } = await api.unenroll({ factorId: factor.id });
    if (error) throw error;
  }
  const { data, error } = await api.enroll({ factorType: 'totp', friendlyName: MFA_FRIENDLY_NAME, issuer: MFA_ISSUER });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp?.qr_code || '', secret: data.totp?.secret || '', uri: data.totp?.uri || '' };
}

async function verifyFactor(supabase, factorId, code) {
  const api = mfaApi(supabase);
  if (!api) throw new Error('Ta wersja przeglądarki nie obsługuje kodu z telefonu.');
  const normalized = normalizeMfaCode(code);
  if (!isCompleteMfaCode(normalized)) throw new Error('Wpisz 6 cyfr z aplikacji na telefonie.');
  const { data, error } = await api.challengeAndVerify({ factorId, code: normalized });
  if (error) throw error;
  return data;
}

export function confirmTotpEnrollment(supabase, factorId, code) {
  return verifyFactor(supabase, factorId, code);
}

export async function verifyTotpLogin(supabase, code) {
  const { verified } = await listTotpFactors(supabase);
  if (!verified.length) throw new Error('Na tym koncie nie ma włączonego kodu z telefonu.');
  return verifyFactor(supabase, verified[0].id, code);
}

export async function disableTotp(supabase, factorId) {
  const api = mfaApi(supabase);
  if (!api) throw new Error('Ta wersja przeglądarki nie obsługuje kodu z telefonu.');
  const { error } = await api.unenroll({ factorId });
  if (error) throw error;
}

export function getMfaErrorMessage(error) {
  const text = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (/invalid totp|invalid code|mfa_verification_failed|kod jest nieprawid/.test(`${text} ${code}`)) return 'Kod jest nieprawidłowy albo wygasł. Wpisz aktualny kod z aplikacji.';
  if (/aal2|insufficient_aal|mfa_.*required/.test(`${text} ${code}`)) return 'Najpierw zaloguj się z kodem z telefonu.';
  if (/rate|too many/.test(text)) return 'Za dużo prób. Odczekaj chwilę i spróbuj ponownie.';
  if (/failed to fetch|network|load failed/.test(text)) return 'Brak połączenia z internetem. Kod można sprawdzić tylko online.';
  if (/disabled|not enabled|mfa_totp_enroll_not_enabled/.test(`${text} ${code}`)) return 'Kod z telefonu jest wyłączony w ustawieniach logowania.';
  return error?.message && /[ąćęłńóśźż]|wpisz|nie /i.test(error.message) ? error.message : 'Nie udało się sprawdzić kodu. Spróbuj ponownie.';
}
