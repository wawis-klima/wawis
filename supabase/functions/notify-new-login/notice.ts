// WAWIS 14.76 — treść powiadomienia o nowym logowaniu (bez importów: test node uruchamia ten plik wprost).

export const LOGIN_NOTICE_EVENT_TYPE = "login_notice_v1476";

export type LoginNotice = {
  sessionId: string;
  userId: string;
  fullName: string;
  role?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

export function describeDevice(userAgent: unknown): string {
  const ua = String(userAgent || "");
  if (!ua) return "nieznane urządzenie";
  let device = "komputer";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = /Mobile/i.test(ua) ? "telefon z Androidem" : "tablet z Androidem";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "komputer z Windows";
  else if (/Linux/i.test(ua)) device = "komputer z Linuksem";
  let browser = "";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  else if (/node|deno|curl|python|okhttp|postman|insomnia|axios|go-http/i.test(ua)) browser = "program (nie przeglądarka)";
  return browser ? `${device}, ${browser}` : device;
}

export function formatWarsawTime(iso: unknown): string {
  const date = new Date(String(iso || ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export function buildLoginNoticePush(notice: LoginNotice) {
  const who = String(notice.fullName || "Nieznany użytkownik").trim() || "Nieznany użytkownik";
  const when = formatWarsawTime(notice.createdAt);
  return {
    title: "Nowe logowanie",
    body: `${who} — ${describeDevice(notice.userAgent)}${when ? `, ${when}` : ""}. Jeśli to nie on, zablokuj konto w Diagnostyce.`,
    tag: `login-notice-${notice.sessionId}`,
  };
}

export function parseLoginNoticeRun(body: unknown): { runId: string; token: string } | null {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (record.eventType !== LOGIN_NOTICE_EVENT_TYPE) return null;
  const runId = String(record.runId || "").trim();
  const token = String(record.token || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) return null;
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  return { runId, token };
}
