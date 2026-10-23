// Potwierdzenie tabliczek może się opóźnić mimo dostępnego internetu.
// Retry dotyczy wyłącznie odczytu/statusu i tej samej tożsamości uploadu.
// Brak potwierdzenia NIGDY nie może zostać uznany za zapis.
export const NAMEPLATE_RECOVERY_DELAYS_MS = Object.freeze([1250, 2500, 4000]);

export async function verifyNameplatesWithRecovery({
  verify,
  retryUpload = null,
  delaysMs = NAMEPLATE_RECOVERY_DELAYS_MS,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  online = () => true,
} = {}) {
  if (typeof verify !== 'function') throw new TypeError('Weryfikacja serwera jest wymagana.');

  let attempts = 0;
  const safeVerify = async () => {
    attempts += 1;
    try {
      return Boolean(await verify(attempts));
    } catch {
      // Przerwane/tymczasowo niedostępne żądanie nie może zamknąć formularza.
      return false;
    }
  };

  if (await safeVerify()) return { confirmed: true, attempts, reason: 'confirmed' };

  if (!online()) return { confirmed: false, attempts, reason: 'offline' };

  // Wysyłkę ponawiamy najwyżej raz i jedynie po tym samym identyfikatorze.
  // Jeżeli plik już dotarł, istniejąca obsługa kolejki uzgadnia go z serwerem.
  if (typeof retryUpload === 'function') {
    try { await retryUpload(); } catch {
      // Weryfikacja nadal trwa; oryginalne pliki i kolejka nie są kasowane.
    }
  }

  for (const rawDelay of delaysMs) {
    await wait(Math.max(0, Number(rawDelay) || 0));
    if (!online()) return { confirmed: false, attempts, reason: 'offline' };
    if (await safeVerify()) return { confirmed: true, attempts, reason: 'confirmed-after-retry' };
  }

  return { confirmed: false, attempts, reason: 'not-confirmed' };
}
