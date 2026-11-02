// WAWIS 14.06 — wysyłka zaznaczonych SMS-ów (zgłoszenie 02.11.2026).
// Wcześniej pierwszy odrzucony klient przerywał całą wysyłkę, więc pozostali zaznaczeni klienci
// nie dostawali SMS-a, a na ekranie był tylko komunikat o tym jednym kliencie.
// Teraz każdy klient jest wysyłany osobno; odrzucenie jednego nie zatrzymuje pozostałych.
// Kroki wykonujemy kolejno (bez równoległości), tak jak dotąd — serwer i tak blokuje duplikaty grup.

/**
 * @param {Array<{label: string, run: () => Promise<number>}>} steps
 * @returns {Promise<{sentCount: number, failures: Array<{label: string, message: string}>}>}
 */
export async function runSmsBatch(steps = [], { describeError = (error) => (error instanceof Error ? error.message : String(error)) } = {}) {
  let sentCount = 0;
  const failures = [];
  for (const step of steps) {
    try {
      const sent = await step.run();
      sentCount += Number.isFinite(Number(sent)) ? Number(sent) : 0;
    } catch (error) {
      failures.push({ label: String(step.label || 'Klient').trim() || 'Klient', message: String(describeError(error) || 'Operacja SMS nie została wykonana.').trim() });
    }
  }
  return { sentCount, failures };
}

export function formatSmsBatchResult({ sentCount = 0, failures = [] } = {}) {
  const info = sentCount > 0 ? `Wysłano ${sentCount} ${smsWord(sentCount)}.` : '';
  const error = failures.length
    ? `Nie wysłano (${failures.length}): ${failures.map((item) => `${item.label} — ${item.message}`).join(' | ')}`
    : '';
  return { info: info || (failures.length ? '' : 'Wysłano 0 wiadomości SMS.'), error };
}

function smsWord(count) {
  return count === 1 ? 'wiadomość SMS' : 'wiadomości SMS';
}
