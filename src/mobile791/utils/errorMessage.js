export function getErrorMessage(error, fallbackMessage = 'Wystąpił nieoczekiwany błąd.') {
  if (!error) return fallbackMessage;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;

  const parts = [
    error.message,
    error.error_description,
    error.details,
    error.hint,
    error.code ? `Kod: ${error.code}` : '',
    error.status ? `Status: ${error.status}` : '',
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' • ');
  }

  try {
    return JSON.stringify(error);
  } catch {
    return fallbackMessage;
  }
}
