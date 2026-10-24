import { countPhotoQueueRecords, deleteHeldPhotoQueueItems, releaseHeldPhotoQueueItems, resetPhotoQueueDatabase } from './photo-offline-queue.js';

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

function photoCountLabel(count) {
  if (count === 1) return '1 stare zdjęcie';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const few = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
  return `${count} ${few ? 'stare zdjęcia' : 'starych zdjęć'}`;
}

// 13.62: zdjęcia pozostawione w kolejce przez wycofane 13.42–13.48 nie wysyłają się same.
// Użytkownik świadomie wybiera: wysłać je teraz albo usunąć z telefonu.
export async function confirmAndSendHeldPhotos({
  count = 0,
  confirmFn = (message) => window.confirm(message),
  alertFn = (message) => window.alert(message),
  onReleased = null,
  logFn = null,
} = {}) {
  if (!confirmFn(`Wysłać ${photoCountLabel(count)} z 22.10 na serwer?\n\nJeśli te zdjęcia zostały już dodane do montażu w inny sposób (np. przez administratora), mogą pojawić się duplikaty.`)) {
    logFn?.('photos.queue.legacy.cancelled', { count, action: 'send' });
    return { ok: false, cancelled: true };
  }
  const result = await releaseHeldPhotoQueueItems();
  logFn?.(result.ok ? 'photos.queue.legacy.released' : 'photos.queue.legacy.failed', { count: result.count, code: result.ok ? 'PHOTO_QUEUE_LEGACY_RELEASED' : (result.code || 'PHOTO_QUEUE_WRITE_FAILED') });
  if (!result.ok) {
    alertFn(`Nie udało się zwolnić starych zdjęć do wysyłki. ${result.message || ''}`.trim());
    return result;
  }
  await onReleased?.();
  return result;
}

export async function confirmAndDeleteHeldPhotos({
  count = 0,
  confirmFn = (message) => window.confirm(message),
  alertFn = (message) => window.alert(message),
  logFn = null,
} = {}) {
  if (!confirmFn(`Usunąć ${photoCountLabel(count)} z 22.10 z tego telefonu?\n\nTe zdjęcia NIE zostały wysłane na serwer. Tej operacji nie można cofnąć. Nowe zdjęcia, montaże, urządzenia, protokoły i podpisy pozostają bez zmian.`)) {
    logFn?.('photos.queue.legacy.cancelled', { count, action: 'delete' });
    return { ok: false, cancelled: true };
  }
  const result = await deleteHeldPhotoQueueItems();
  logFn?.(result.ok ? 'photos.queue.legacy.warning' : 'photos.queue.legacy.failed', { count: result.count, code: result.ok ? 'PHOTO_QUEUE_LEGACY_DELETED' : (result.code || 'PHOTO_QUEUE_WRITE_FAILED') });
  alertFn(result.ok
    ? `Usunięto ${photoCountLabel(result.count)} z tego telefonu.`
    : `Usuwanie NIE zostało potwierdzone. ${result.message || ''}`.trim());
  return result;
}
