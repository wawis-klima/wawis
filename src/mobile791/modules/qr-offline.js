import { listOfflineJobOperations, queueOfflineJobOperation } from './job-offline-store.js';
import { normalizeQrStickerCode } from '../../modules/qr-stickers.js';

// WAWIS 14.99 (decyzja właściciela 24.11.2026): naklejka QR bez internetu — do kolejki na telefonie.
// Zwraca zapisany wpis dopiero po potwierdzonym odczycie z pamięci telefonu; inaczej rzuca błąd.
export async function queueQrStickerOffline({ userId, jobId, deviceIndex, code }) {
  const normalized = normalizeQrStickerCode(code);
  const index = Number(deviceIndex);
  if (!userId || !jobId || !normalized || !Number.isInteger(index) || index < 1) {
    throw new Error('Nie udało się zapisać naklejki na telefonie.');
  }
  const queued = await queueOfflineJobOperation({
    user_id: userId,
    job_id: jobId,
    type: 'qr',
    payload: { code: normalized, device_index: index },
  });
  const stored = (await listOfflineJobOperations(String(userId))).some((item) => String(item.id) === String(queued?.id));
  if (!stored) throw new Error('Nie udało się zapisać naklejki na telefonie. Spróbuj ponownie, gdy złapiesz zasięg.');
  return queued;
}

// Naklejki czekające w kolejce dla montażu: { [deviceIndex 1-based]: code }.
export async function loadQueuedQrStickers({ userId, jobId }) {
  if (!userId || !jobId) return {};
  const operations = await listOfflineJobOperations(String(userId));
  return Object.fromEntries(operations
    .filter((item) => item.type === 'qr' && String(item.job_id) === String(jobId) && String(item.status || 'pending') !== 'conflict')
    .map((item) => [Number(item.payload?.device_index), String(item.payload?.code || '')])
    .filter(([index, code]) => Number.isInteger(index) && index >= 1 && code));
}
