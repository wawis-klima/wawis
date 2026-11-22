// WAWIS 14.76 — Diagnostyka administratora: logowania kont i blokada (komputer i telefon).
// Dane i zmiany wyłącznie przez RPC z kontrolą administratora w bazie (admin_list_user_logins_v1476,
// admin_set_user_blocked_v1476). Blokada kończy wszystkie sesje konta i nie usuwa konta ani historii.

export const USER_BLOCKED_MESSAGE = 'Konto zostało zablokowane przez administratora. Skontaktuj się z administratorem.';

export function isUserBannedError(error) {
  const text = `${error?.code || ''} ${error?.error_code || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('user_banned') || text.includes('user is banned');
}

export function describeUserAgent(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'nieznane urządzenie';
  let device = 'komputer';
  if (/iPhone/i.test(ua)) device = 'iPhone';
  else if (/iPad/i.test(ua)) device = 'iPad';
  else if (/Android/i.test(ua)) device = /Mobile/i.test(ua) ? 'telefon z Androidem' : 'tablet z Androidem';
  else if (/Macintosh|Mac OS X/i.test(ua)) device = 'Mac';
  else if (/Windows/i.test(ua)) device = 'komputer z Windows';
  else if (/Linux/i.test(ua)) device = 'komputer z Linuksem';
  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/CriOS|Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/FxiOS|Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  else if (/node|deno|curl|python|okhttp|postman|insomnia|axios|go-http/i.test(ua)) browser = 'program (nie przeglądarka)';
  return browser ? `${device}, ${browser}` : device;
}

export function formatLoginTime(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function accessErrorMessage(error, fallback) {
  const message = String(error?.message || '').trim();
  if (/Tylko administrator|Nie można zablokować|Nie znaleziono konta|Nieprawidłowe dane/.test(message)) return message;
  if (/Potwierdź logowanie kodem/i.test(message)) return message;
  return fallback;
}

export async function listUserLogins(supabase) {
  const { data, error } = await supabase.rpc('admin_list_user_logins_v1476');
  if (error) throw new Error(accessErrorMessage(error, 'Nie udało się odczytać logowań.'));
  return (Array.isArray(data) ? data : []).map((user) => ({
    userId: String(user?.userId || ''),
    fullName: String(user?.fullName || user?.email || 'Bez nazwy'),
    role: String(user?.role || ''),
    isSelf: user?.isSelf === true,
    blocked: user?.blocked === true,
    sessions: (Array.isArray(user?.sessions) ? user.sessions : []).map((session) => ({
      createdAt: session?.createdAt || null,
      lastActiveAt: session?.lastActiveAt || session?.createdAt || null,
      device: describeUserAgent(session?.userAgent),
      current: session?.current === true,
    })),
  })).filter((user) => user.userId);
}

export async function setUserBlocked(supabase, userId, blocked) {
  const { data, error } = await supabase.rpc('admin_set_user_blocked_v1476', { p_user_id: userId, p_blocked: blocked === true });
  if (error) throw new Error(accessErrorMessage(error, blocked ? 'Nie udało się zablokować konta.' : 'Nie udało się odblokować konta.'));
  if (!data || data.blocked !== (blocked === true)) {
    throw new Error('Baza nie potwierdziła zmiany. Odśwież listę i sprawdź stan konta.');
  }
  return { blocked: data.blocked === true, sessionsEnded: Number(data.sessionsEnded) || 0 };
}
