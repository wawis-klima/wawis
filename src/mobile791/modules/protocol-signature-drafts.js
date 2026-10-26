// WAWIS 13.77 — ochrona podpisu klienta, poziom 1 (plan po audycie, zgoda właściciela 26.10.2026).
//
// Niezapisany podpis klienta (np. bez zasięgu u klienta) jest trzymany w PAMIĘCI OTWARTEJ APLIKACJI do udanego
// zapisu protokołu. Ponowne otwarcie protokołu w tym samym montażu przywraca podpis — ale tylko wtedy, gdy
// podpisane dane (klient, adres, urządzenia, płatność, uwagi) są identyczne; inaczej potrzebny jest nowy podpis.
// Podpisu nie zapisujemy w pamięci telefonu (IndexedDB/localStorage) — to dane osobowe, a zapis protokołu
// bez internetu (poziom 2) wymaga osobnej decyzji właściciela. Zamknięcie aplikacji = podpis przepada.

const drafts = new Map();
let owner = '';

export function setProtocolSignatureDraftOwner(userId) {
  const next = String(userId || '').trim();
  if (next === owner) return;
  owner = next;
  drafts.clear(); // podpis klienta nie może trafić do protokołu innej osoby zalogowanej na tym telefonie
}

export function saveProtocolSignatureDraft(jobId, draft) {
  const key = String(jobId || '').trim();
  if (!key || !draft?.signatureDataUrl || !draft?.snapshotKey) return false;
  drafts.set(key, {
    signatureDataUrl: String(draft.signatureDataUrl),
    signatureRotation: String(draft.signatureRotation || 'auto'),
    paymentDraft: draft.paymentDraft ? { ...draft.paymentDraft } : null,
    protocolNote: String(draft.protocolNote || ''),
    snapshotKey: String(draft.snapshotKey),
    savedAt: draft.savedAt || new Date().toISOString(),
  });
  return true;
}

export function getProtocolSignatureDraft(jobId) {
  const key = String(jobId || '').trim();
  return key ? drafts.get(key) || null : null;
}

export function clearProtocolSignatureDraft(jobId) {
  drafts.delete(String(jobId || '').trim());
}

// Podpis wolno przywrócić wyłącznie do tych samych podpisanych danych.
export function canRestoreProtocolSignatureDraft(draft, currentSnapshotKey) {
  return Boolean(draft?.signatureDataUrl && draft?.snapshotKey && draft.snapshotKey === String(currentSnapshotKey || ''));
}
