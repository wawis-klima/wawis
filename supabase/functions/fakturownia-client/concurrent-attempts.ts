// WAWIS 14.43 — automatyczne potwierdzenie faktury: które inne rozpoczęte wystawienia naprawdę blokują.
//
// Od 13.60 nowa faktura jest szukana w całym koncie Fakturowni, więc każde inne otwarte wystawienie
// (2 godziny od kliknięcia „Wystaw fakturę”) mogłoby „zabrać” tę samą fakturę. Wystawienie, którego
// montaż ma już potwierdzoną i powiązaną fakturę, jest zakończone — jego faktura jest zajęta i i tak
// wykluczona z dopasowania — więc nie blokuje kolejnego montażu. Wcześniej blokowało przez pełne
// 2 godziny i drugą fakturę z rzędu trzeba było potwierdzać ręcznie.
//
// Bez importów: test node uruchamia ten plik wprost.

export type ConcurrentJob = {
  id?: unknown;
  vat_invoice_fakturownia_confirmed?: unknown;
  vat_invoice_fakturownia_invoice_id?: unknown;
};

export function unresolvedConcurrentJobIds(otherJobIds: unknown[], jobs: ConcurrentJob[]): string[] {
  const finished = new Set(
    (Array.isArray(jobs) ? jobs : [])
      .filter((job) => job?.vat_invoice_fakturownia_confirmed === true
        && String(job?.vat_invoice_fakturownia_invoice_id ?? "").trim() !== "")
      .map((job) => String(job?.id ?? "").trim()),
  );
  return [...new Set((Array.isArray(otherJobIds) ? otherJobIds : []).map((id) => String(id ?? "").trim()).filter(Boolean))]
    .filter((id) => !finished.has(id));
}
