// WAWIS 13.68: niezapisane urządzenia i tabliczki po „Zamknij okno” bez internetu.
// Trzymane wyłącznie w pamięci otwartej aplikacji (decyzja właściciela: nic nie zapisujemy w pamięci telefonu).
// Przetrwają przechodzenie między montażami, ale nie całkowite zamknięcie aplikacji.
const drafts = new Map();

export function saveDeviceFormDraft(jobId, form) {
  const key = String(jobId || '').trim();
  if (!key || !form) return false;
  drafts.set(key, { form, savedAt: new Date().toISOString() });
  return true;
}

// Pobiera i usuwa szkic — od tej chwili dane żyją w otwartym formularzu.
export function takeDeviceFormDraft(jobId) {
  const key = String(jobId || '').trim();
  const draft = drafts.get(key) || null;
  if (draft) drafts.delete(key);
  return draft;
}

export function clearDeviceFormDraft(jobId) {
  drafts.delete(String(jobId || '').trim());
}

export function hasDeviceFormDraft(jobId) {
  return drafts.has(String(jobId || '').trim());
}
