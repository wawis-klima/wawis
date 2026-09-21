import { getSupabaseUserMessage, isTransientSupabaseError } from './supabase-errors.js';

export const SOURCE_JOB_ID_TEXT_HOTFIX_MESSAGE = [
  'Nie udało się zapisać, bo baza Supabase ma nieaktualny typ kolumny devices.source_job_id.',
  'Uruchom w Supabase SQL Editor najnowszy plik supabase/migrations/archive/devices-module-stage-7-source-job-id-text-production-hotfix.sql z wersji 7.87 lub nowszej, potem odśwież aplikację i zapisz montaż ponownie.',
].join(' ');


export const EMPTY_DEVICE_SERIAL_HOTFIX_MESSAGE = [
  'Baza Supabase ma starą regułę unikalności numerów seryjnych i blokuje zapis kolejnego urządzenia bez numeru.',
  'Uruchom w Supabase SQL Editor plik devices-empty-serial-hotfix-v8.60.sql, a następnie zapisz montaż ponownie.',
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


export function isEmptyDeviceSerialUniqueError(error) {
  const message = collectErrorText(error).toLowerCase();
  return Boolean(message)
    && message.includes('devices_serial_number_key')
    && (message.includes('duplicate key') || message.includes('unique constraint'));
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
  if (isTransientSupabaseError(error)) {
    return getSupabaseUserMessage(error, fallbackMessage);
  }

  if (isEmptyDeviceSerialUniqueError(error)) {
    return EMPTY_DEVICE_SERIAL_HOTFIX_MESSAGE;
  }

  if (isSourceJobIdTypeMismatchError(error)) {
    return SOURCE_JOB_ID_TEXT_HOTFIX_MESSAGE;
  }

  return getSupabaseUserMessage(error, fallbackMessage);
}
