import { countPhotoQueueRecords, resetPhotoQueueDatabase } from './photo-offline-queue.js';

// WAWIS 13.62: „Napraw kolejkę zdjęć” — wyłącznie na wyraźne polecenie użytkownika.
// Usuwa tylko lokalną kolejkę niewysłanych zdjęć tego telefonu (IndexedDB wawis-mobile-photo-queue).
// Montaże, klienci, urządzenia, protokoły, podpisy, sesja logowania, inne kolejki offline
// i wszystkie dane na serwerze pozostają bez zmian.
export function buildPhotoQueueRepairPrompt(count) {
  const scope = count === null
    ? 'Nie da się odczytać lokalnej kolejki zdjęć, więc nie wiadomo, ile niewysłanych zdjęć zawiera.'
    : count === 0
      ? 'Lokalna kolejka zdjęć jest pusta.'
      : `W lokalnej kolejce jest ${count} ${count === 1 ? 'niewysłane zdjęcie' : 'niewysłanych zdjęć'}.`;
  return `${scope}\n\nNaprawa USUNIE wszystkie niewysłane zdjęcia zapisane tylko na tym telefonie i założy kolejkę od nowa. Tej operacji nie można cofnąć.\n\nMontaże, urządzenia, protokoły, podpisy, dane klientów i wszystko, co jest już na serwerze, pozostaje bez zmian.\n\nCzy na pewno naprawić kolejkę zdjęć?`;
}

export async function confirmAndRepairPhotoQueue({
  confirmFn = (message) => window.confirm(message),
  alertFn = (message) => window.alert(message),
  onRepaired = null,
  logFn = null,
} = {}) {
  const count = await countPhotoQueueRecords();
  if (!confirmFn(buildPhotoQueueRepairPrompt(count))) {
    logFn?.('photos.queue.repair.cancelled', { count });
    return { ok: false, cancelled: true, count };
  }
  if (count !== 0 && !confirmFn('Ostatnie potwierdzenie: usunąć niewysłane zdjęcia z tego telefonu?')) {
    logFn?.('photos.queue.repair.cancelled', { count, step: 2 });
    return { ok: false, cancelled: true, count };
  }
  const result = await resetPhotoQueueDatabase();
  // Ostrzeżenie (a nie zdarzenie informacyjne), żeby administrator widział w diagnostyce, że kolejkę wyczyszczono.
  logFn?.(result.ok ? 'photos.queue.repair.warning' : 'photos.queue.repair.failed', { count: count ?? -1, code: result.ok ? 'PHOTO_QUEUE_RESET_DONE' : (result.code || 'PHOTO_QUEUE_RESET_FAILED') });
  alertFn(result.ok
    ? `${result.message} Aplikacja zostanie odświeżona.`
    : `Naprawa kolejki NIE powiodła się. ${result.message}`);
  if (result.ok) onRepaired?.();
  return { ...result, count };
}
