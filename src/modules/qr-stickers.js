// WAWIS 14.08 — naklejki QR urządzeń (decyzja właściciela 02.11.2026).
// Naklejka = urządzenie (instalacja multi to jedno urządzenie, więc jedna naklejka).
// Kod: 8 znaków z alfabetu bez znaków mylących (0/O, 1/I/L). Na naklejce: XXXX-XXXX,
// w QR adres https://wawis-klima.vercel.app/u/<KOD>.

export const QR_STICKER_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;
const QR_URL_PATH_PATTERN = /\/u\/([0-9A-Za-z-]{8,9})\/?(?:[?#].*)?$/;
export const QR_PENDING_STORAGE_KEY = 'wawis-qr-pending-code';

/** Zwraca 8-znakowy kod albo '' (adres z QR, kod z myślnikiem, małe litery, spacje). */
export function normalizeQrStickerCode(input = '') {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const fromUrl = raw.match(QR_URL_PATH_PATTERN);
  const candidate = (fromUrl ? fromUrl[1] : raw).replace(/[\s-]/g, '').toUpperCase();
  return QR_STICKER_CODE_PATTERN.test(candidate) ? candidate : '';
}

export function formatQrStickerCode(code = '') {
  const normalized = normalizeQrStickerCode(code);
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : '';
}

/** Kod z adresu strony: /u/KOD (naklejka zeskanowana aparatem) albo ?qr=KOD (przekierowanie z 404.html). */
export function readQrCodeFromLocation(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return '';
  const path = String(location.pathname || '');
  const fromPath = path.match(/^\/u\/([0-9A-Za-z-]{8,9})\/?$/);
  if (fromPath) return normalizeQrStickerCode(fromPath[1]);
  try {
    const params = new URLSearchParams(String(location.search || ''));
    return normalizeQrStickerCode(params.get('qr') || '');
  } catch {
    return '';
  }
}

/** Usuwa kod z paska adresu (bez przeładowania), żeby odświeżenie nie otwierało go ponownie. */
export function clearQrCodeFromLocation(win = typeof window !== 'undefined' ? window : null) {
  try {
    if (!win?.history?.replaceState || !win.location) return;
    const url = new URL(win.location.href);
    if (/^\/u\//.test(url.pathname)) url.pathname = '/';
    url.searchParams.delete('qr');
    win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // brak historii — bez znaczenia dla działania
  }
}

function rpcResult({ data, error }) {
  if (error) {
    const message = String(error?.message || '');
    if (/qr_sticker|PGRST202|schema cache|does not exist/i.test(message)) {
      throw new Error('Naklejki QR nie są jeszcze włączone w bazie. Nic nie zostało zapisane.');
    }
    throw error;
  }
  return data;
}

export async function lookupQrSticker({ supabase, code }) {
  return rpcResult(await supabase.rpc('qr_sticker_lookup', { p_code: normalizeQrStickerCode(code) || String(code || '') }));
}

export async function assignQrStickerToJobDevice({ supabase, code, jobId, deviceIndex }) {
  return rpcResult(await supabase.rpc('qr_sticker_assign_job_device', {
    p_code: normalizeQrStickerCode(code), p_job_id: jobId, p_device_index: Number(deviceIndex),
  }));
}

export async function assignQrStickerToDevice({ supabase, code, deviceId, replace = false }) {
  return rpcResult(await supabase.rpc('qr_sticker_assign_device', {
    p_code: normalizeQrStickerCode(code), p_device_id: deviceId, p_replace: Boolean(replace),
  }));
}

export async function unassignQrSticker({ supabase, code }) {
  return rpcResult(await supabase.rpc('qr_sticker_unassign', { p_code: normalizeQrStickerCode(code) }));
}

/** Mapa numer urządzenia → kod dla montażu. */
export async function loadJobQrStickers({ supabase, jobId }) {
  if (!supabase || !jobId) return {};
  const rows = rpcResult(await supabase.rpc('qr_stickers_for_job', { p_job_id: jobId })) || [];
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [Number(row.device_index), String(row.code)]));
}

/** Mapa id urządzenia → kod (tylko administrator). */
export async function loadDeviceQrStickers({ supabase, deviceIds = [] }) {
  const ids = [...new Set(deviceIds.filter(Boolean))];
  if (!supabase || !ids.length) return {};
  const rows = rpcResult(await supabase.rpc('qr_stickers_for_devices', { p_device_ids: ids })) || [];
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [String(row.device_id), String(row.code)]));
}

export function describeQrDevice(device = {}) {
  const place = [device.street, device.city].filter(Boolean).join(', ');
  const unit = device.device_index ? `Urządzenie ${device.device_index}` : 'Urządzenie';
  return [device.client || device.contractor_name || 'Klient', place, unit, device.model].filter(Boolean).join(' · ');
}

/** Komunikat dla wyniku przypisania (ok:false). */
export function describeQrAssignFailure(result = {}) {
  const code = formatQrStickerCode(result.code) || 'Ta naklejka';
  switch (result.reason) {
    case 'invalid_code': return 'To nie jest kod naklejki WAWIS. Sprawdź numer pod kodem QR (8 znaków, np. K7M2-P9XA).';
    case 'unknown_code': return `${code} nie pochodzi z naklejek WAWIS. Użyj naklejki z wydrukowanej partii.`;
    case 'device_not_saved': return 'To urządzenie nie jest jeszcze zapisane na serwerze. Zapisz urządzenie (z internetem) i spróbuj ponownie.';
    case 'device_not_found': return 'Nie znaleziono urządzenia. Odśwież dane i spróbuj ponownie.';
    case 'sticker_taken': return `${code} jest już przypisana: ${describeQrDevice(result.device || {})}. ${result.can_replace ? '' : 'Przepisać ją może tylko administrator.'}`.trim();
    case 'device_has_sticker': return `To urządzenie ma już naklejkę ${formatQrStickerCode(result.existing_code)}. ${result.can_replace ? '' : 'Wymianę naklejki zgłoś administratorowi.'}`.trim();
    default: return 'Nie udało się przypisać naklejki. Spróbuj ponownie.';
  }
}

export function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * 14.09: usunięcie urządzenia z montażu przenumerowuje kolejne urządzenia (dane urządzenia N+1 trafiają
 * do wiersza urządzenia N). Naklejki są przypisane do wierszy, więc po usunięciu przenosimy je tak,
 * żeby zostały przy tych samych fizycznych urządzeniach; naklejka usuniętego urządzenia jest zwalniana.
 * Tylko administrator (jak samo usuwanie urządzenia). Brak modułu naklejek w bazie = samo usunięcie.
 */
export async function preserveQrStickersAroundDeviceRemoval({ supabase, jobId, removedIndex, run }) {
  const removed = Number(removedIndex);
  let before = null;
  try {
    if (isOnline()) before = await loadJobQrStickers({ supabase, jobId });
  } catch {
    before = null;
  }
  const result = await run();
  const qr = { moved: [], freed: '', failures: [] };
  if (!before) return { result, qr };
  const affected = Object.entries(before)
    .map(([index, code]) => [Number(index), code])
    .filter(([index]) => index >= removed)
    .sort((a, b) => a[0] - b[0]);
  if (!affected.length) return { result, qr };
  for (const [, code] of affected) {
    try { await unassignQrSticker({ supabase, code }); } catch (error) { qr.failures.push({ code, message: error?.message || 'błąd zwolnienia' }); }
  }
  for (const [index, code] of affected) {
    if (index === removed) { qr.freed = code; continue; }
    try {
      const assigned = await assignQrStickerToJobDevice({ supabase, code, jobId, deviceIndex: index - 1 });
      if (assigned?.ok) qr.moved.push({ code, from: index, to: index - 1 });
      else qr.failures.push({ code, message: describeQrAssignFailure(assigned) });
    } catch (error) {
      qr.failures.push({ code, message: error?.message || 'błąd przypisania' });
    }
  }
  return { result, qr };
}

export function describeQrRealignment(qr = {}) {
  const parts = [];
  if (qr.freed) parts.push(`Naklejka ${formatQrStickerCode(qr.freed)} usuniętego urządzenia została zwolniona.`);
  if (qr.moved?.length) parts.push(`Naklejki pozostałych urządzeń przeniesiono razem z nimi (${qr.moved.map((item) => `${formatQrStickerCode(item.code)} → Urządzenie ${item.to}`).join(', ')}).`);
  if (qr.failures?.length) parts.push(`Uwaga: nie udało się przenieść naklejek: ${qr.failures.map((item) => `${formatQrStickerCode(item.code)} (${item.message})`).join('; ')}. Sprawdź naklejki w karcie montażu.`);
  return parts.join(' ');
}

/** 14.09: przypisanie naklejek zeskanowanych w kreatorze urządzeń, po zapisaniu urządzeń montażu. */
export async function assignPendingJobQrStickers({ supabase, jobId, pending = {} }) {
  const outcome = { assigned: [], failures: [] };
  const entries = Object.entries(pending || {})
    .map(([index, code]) => [Number(index), normalizeQrStickerCode(code)])
    .filter(([index, code]) => Number.isInteger(index) && index >= 0 && code);
  for (const [index, code] of entries) {
    try {
      const result = await assignQrStickerToJobDevice({ supabase, code, jobId, deviceIndex: index + 1 });
      if (result?.ok) outcome.assigned.push({ index, code });
      else outcome.failures.push({ index, code, message: describeQrAssignFailure(result) });
    } catch (error) {
      outcome.failures.push({ index, code, message: error?.message || 'Nie udało się przypisać naklejki.' });
    }
  }
  return outcome;
}

/**
 * 14.09: sprawdzenie naklejki zeskanowanej w kreatorze (przed zapisem urządzeń).
 * Zwraca kod do zapamiętania albo rzuca błąd z czytelnym komunikatem.
 */
export async function validateWizardQrSticker({ supabase, code, deviceIndex, savedStickers = {}, pendingStickers = {} }) {
  const normalized = normalizeQrStickerCode(code);
  if (!normalized) throw new Error('To nie jest kod naklejki WAWIS.');
  const otherPending = Object.entries(pendingStickers || {}).find(([index, value]) => Number(index) !== Number(deviceIndex) && value === normalized);
  if (otherPending) throw new Error(`Naklejka ${formatQrStickerCode(normalized)} jest już wybrana dla Urządzenia ${Number(otherPending[0]) + 1}.`);
  const result = await lookupQrSticker({ supabase, code: normalized });
  if (result?.status === 'unknown' || result?.status === 'invalid') {
    throw new Error(describeQrAssignFailure({ reason: 'unknown_code', code: normalized }));
  }
  if (result?.status === 'assigned') {
    const savedIndex = Object.entries(savedStickers || {}).find(([, value]) => value === normalized)?.[0];
    if (savedIndex !== undefined && Number(savedIndex) === Number(deviceIndex)) return { code: normalized, already: true };
    throw new Error(describeQrAssignFailure({ reason: 'sticker_taken', code: normalized, device: result.device, can_replace: false }));
  }
  return { code: normalized, already: false };
}
