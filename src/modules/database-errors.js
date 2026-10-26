import { getSupabaseUserMessage, isTransientSupabaseError } from './supabase-errors.js';

export const SOURCE_JOB_ID_TEXT_HOTFIX_MESSAGE = [
  'Nie udało się zapisać, bo baza Supabase ma nieaktualny typ kolumny devices.source_job_id.',
  'Uruchom w Supabase SQL Editor najnowszy plik supabase/migrations/archive/devices-module-stage-7-source-job-id-text-production-hotfix.sql z wersji 7.87 lub nowszej, potem odśwież aplikację i zapisz montaż ponownie.',
].join(' ');




function collectErrorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return [error.message, error.stack].filter(Boolean).join(' ');
  if (typeof error === 'object') {
    return [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .map((part) => String(part))
      .join(' ');
  }
  return String(error);
}


// WAWIS 13.71: indeks devices_serial_number_key na produkcji pomija puste numery (hotfix v8.60 wdrożony),
// więc ten błąd oznacza RZECZYWISTY powtórzony numer seryjny — nie „starą regułę w bazie”.
// Dawny komunikat kazał uruchamiać plik SQL i wprowadzał pracowników w błąd (test iPhone 26.10.2026).
export const DUPLICATE_DEVICE_SERIAL_MESSAGE = [
  'Ten numer seryjny jest już zapisany — w tym montażu (urządzenie dodane dwa razy) albo w innym montażu.',
  'Sprawdź listę urządzeń, usuń powtórzone urządzenie lub popraw numer i zapisz ponownie.',
].join(' ');

export function getDuplicateDeviceSerialValue(error) {
  const details = collectErrorText(error);
  const match = details.match(/\(lower\(btrim\(serial_number\)\)\)=\((.+?)\) already exists/i);
  return match ? match[1].toUpperCase() : '';
}

export function getDuplicateDeviceSerialMessage(error) {
  const value = getDuplicateDeviceSerialValue(error);
  return value ? `${DUPLICATE_DEVICE_SERIAL_MESSAGE} Numer: ${value}.` : DUPLICATE_DEVICE_SERIAL_MESSAGE;
}

export function isEmptyDeviceSerialUniqueError(error) {
  const message = collectErrorText(error).toLowerCase();
  return Boolean(message)
    && message.includes('devices_serial_number_key')
    && (message.includes('duplicate key') || message.includes('unique constraint'));
}

export function isJobEditConflictError(error) {
  const message = collectErrorText(error);
  return /JOB_EDIT_CONFLICT:/i.test(message);
}

export function isJobDevicesMissingError(error) {
  const message = collectErrorText(error);
  return /job_devices_missing/i.test(message);
}

export function isJobProtocolRequiredError(error) {
  const message = collectErrorText(error);
  return /job_protocol_required/i.test(message);
}

export function isSourceJobIdTypeMismatchError(error) {
  const message = collectErrorText(error).toLowerCase();
  return Boolean(message) && (
    (message.includes('source_job_id') && message.includes('type uuid') && message.includes('type text'))
    || (message.includes('source_job_id') && message.includes('uuid') && message.includes('text'))
    || message.includes('operator does not exist: uuid = text')
    || message.includes('operator does not exist: text = uuid')
    || (message.includes('invalid input syntax for type uuid') && message.includes('::device-'))
  );
}

export function normalizeDatabaseErrorMessage(error, fallbackMessage = 'Wystąpił nieznany błąd.') {
  if (isJobEditConflictError(error)) {
    return 'Ten montaż został w międzyczasie zmieniony na innym urządzeniu. Twoje zmiany nie zostały nadpisane. Zamknij formularz, odśwież montaż i wprowadź zmianę ponownie.';
  }

  if (/job_device_models_(?:incomplete|unstructured)/i.test(collectErrorText(error))) {
    return 'Nie można zakończyć montażu. Każde urządzenie musi mieć wpisany model jednostki wewnętrznej (JW) oraz zewnętrznej (JZ). Uzupełnij dane urządzenia i spróbuj ponownie.';
  }

  if (isJobDevicesMissingError(error)) {
    return 'Nie można zakończyć zlecenia. Najpierw dodaj urządzenie (JW/JZ).';
  }

  if (isJobProtocolRequiredError(error)) {
    return 'Nie można zakończyć zlecenia. Najpierw wypełnij, podpisz i zapisz protokół klienta.';
  }

  if (isTransientSupabaseError(error)) {
    return getSupabaseUserMessage(error, fallbackMessage);
  }

  if (isEmptyDeviceSerialUniqueError(error)) {
    return getDuplicateDeviceSerialMessage(error);
  }

  if (isSourceJobIdTypeMismatchError(error)) {
    return SOURCE_JOB_ID_TEXT_HOTFIX_MESSAGE;
  }

  return getSupabaseUserMessage(error, fallbackMessage);
}
