// WAWIS 14.18 — samoczynne ponowne sprawdzanie faktury po powrocie z Fakturowni.
// Po powrocie do WAWIS faktura mogła jeszcze nie być zapisana w Fakturowni (np. zajrzenie do zakładki
// przed kliknięciem „Zapisz”). Zamiast od razu pokazywać „nie wykryto faktury” i czekać na kolejny
// powrót do zakładki, przez kilka minut sprawdzamy ponownie w tle.

export const FAKTUROWNIA_AUTO_RECHECK_INTERVAL_MS = 15_000;
export const FAKTUROWNIA_AUTO_RECHECK_WINDOW_MS = 10 * 60_000;
export const FAKTUROWNIA_WAITING_MESSAGE = 'Czekam na fakturę z Fakturowni… Po zapisaniu faktury pojawi się tutaj sama (sprawdzam co 15 sekund).';
export const FAKTUROWNIA_WAITING_TIMEOUT_MESSAGE = 'Nie wykryto jeszcze wystawionej faktury. Kliknij „Sprawdź wystawioną fakturę” albo powiąż fakturę po numerze.';

/**
 * Komunikat po nieudanym sprawdzeniu. „Czekam…” tylko dla automatycznego sprawdzenia, gdy Fakturownia
 * po prostu nie ma jeszcze nowej faktury (pełna lista, brak kandydatów). Inne powody (kilka faktur,
 * zmienione dane, kolizje, niepełna lista) zostają pokazane od razu — tam ponawianie nie pomoże.
 */
export function fakturowniaVerifyFailureMessage(result, { waiting = false } = {}) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  if (waiting && !candidates.length && result?.reasonCode === 'NO_MATCHING_BUYER') return FAKTUROWNIA_WAITING_MESSAGE;
  return result?.reason || 'Nie znaleziono wystawionej faktury. Możesz spróbować ponownie lub powiązać dokument po numerze.';
}

/**
 * Harmonogram ponowień: start() otwiera okno (np. 10 min) po wykryciu rozpoczętego wystawiania,
 * tick() wywoływany co interval — sprawdza tylko przy widocznej karcie, po oknie wywołuje onTimeout raz.
 */
export function createFakturowniaRecheck({
  verify,
  onTimeout,
  isVisible = () => true,
  now = () => Date.now(),
  windowMs = FAKTUROWNIA_AUTO_RECHECK_WINDOW_MS,
}) {
  let until = 0;
  return {
    start() { until = now() + windowMs; },
    stop() { until = 0; },
    get active() { return until > 0; },
    tick() {
      if (!until || !isVisible()) return false;
      if (now() > until) {
        until = 0;
        onTimeout?.();
        return false;
      }
      verify();
      return true;
    },
  };
}
