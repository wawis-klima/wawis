// WAWIS 13.77 — ochrona podpisu klienta, poziom 1 (plan po audycie, zgoda właściciela 26.10.2026).
//
// Niezapisany podpis klienta (np. bez zasięgu u klienta) jest trzymany w PAMIĘCI OTWARTEJ APLIKACJI do udanego
// zapisu protokołu. Ponowne otwarcie protokołu w tym samym montażu przywraca podpis — ale tylko wtedy, gdy
// podpisane dane (klient, adres, urządzenia, płatność, uwagi) są identyczne; inaczej potrzebny jest nowy podpis.
// Podpisu nie zapisujemy w pamięci telefonu (IndexedDB/localStorage) — to dane osobowe, a zapis protokołu
// bez internetu (poziom 2) wymaga osobnej decyzji właściciela. Zamknięcie aplikacji = podpis przepada.

// 13.79: pasek „Zapisz teraz” na liście montaży słucha tego zdarzenia.
export const PROTOCOL_DRAFTS_CHANGED_EVENT = 'wawis-protocol-drafts-changed';

const drafts = new Map();

function notifyChanged() {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
      window.dispatchEvent(new Event(PROTOCOL_DRAFTS_CHANGED_EVENT));
    }
  } catch {
    // Brak zdarzeń nie może blokować zachowania podpisu.
  }
}
let owner = '';

export function setProtocolSignatureDraftOwner(userId) {
  const next = String(userId || '').trim();
  if (next === owner) return;
  owner = next;
  drafts.clear(); // podpis klienta nie może trafić do protokołu innej osoby zalogowanej na tym telefonie
  notifyChanged();
}

export function saveProtocolSignatureDraft(jobId, draft) {
  const key = String(jobId || '').trim();
  if (!key || !draft?.signatureDataUrl || !draft?.snapshotKey) return false;
  drafts.set(key, {
    signatureDataUrl: String(draft.signatureDataUrl),
    signatureRotation: String(draft.signatureRotation || 'auto'),
    paymentDraft: draft.paymentDraft ? { ...draft.paymentDraft } : null,
    protocolNote: String(draft.protocolNote || ''),
    // 13.85: dane klienta z kroku „Dane klienta” — są częścią podpisanych danych.
    clientDraft: draft.clientDraft && typeof draft.clientDraft === 'object'
      ? {
          client: String(draft.clientDraft.client || ''),
          email: String(draft.clientDraft.email || ''),
          emailDeclined: Boolean(draft.clientDraft.emailDeclined),
          isCompany: Boolean(draft.clientDraft.isCompany),
        }
      : null,
    snapshotKey: String(draft.snapshotKey),
    // 13.79: protokół, na którym podpisano (pusty = nowy protokół). Inny protokół na serwerze → bez przywracania.
    baseStoragePath: String(draft.baseStoragePath || ''),
    savedAt: draft.savedAt || new Date().toISOString(),
  });
  notifyChanged();
  return true;
}

export function getProtocolSignatureDraft(jobId) {
  const key = String(jobId || '').trim();
  return key ? drafts.get(key) || null : null;
}

export function clearProtocolSignatureDraft(jobId) {
  if (drafts.delete(String(jobId || '').trim())) notifyChanged();
}

// 13.79: montaże z niezapisanym podpisem (do paska „Zapisz teraz”), najnowsze pierwsze.
export function listProtocolSignatureDrafts() {
  return [...drafts.entries()]
    .map(([jobId, draft]) => ({ jobId, savedAt: draft.savedAt || '' }))
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

// Podpis wolno przywrócić wyłącznie do tych samych podpisanych danych.
export function canRestoreProtocolSignatureDraft(draft, currentSnapshotKey, currentBaseStoragePath = '') {
  return Boolean(draft?.signatureDataUrl && draft?.snapshotKey
    && draft.snapshotKey === String(currentSnapshotKey || '')
    && String(draft.baseStoragePath || '') === String(currentBaseStoragePath || ''));
}
