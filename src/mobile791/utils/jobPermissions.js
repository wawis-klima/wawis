export const STATUSES = ["Nowe", "W trakcie", "Niezrealizowane", "Zakończone"];

export function normalizeStatus(status) {
  if (status === "Nowe zlecenie") return "Nowe";
  if (status === "Nowe") return "Nowe";
  return status || "Nowe";
}

export function isCompletedJob(job) {
  return normalizeStatus(job?.status) === "Zakończone";
}

export function isWorkerLockedCompletedJob(job, isAdmin) {
  return !isAdmin && isCompletedJob(job);
}

export function isWorkerReadOnlyJob(_job, _isAdmin) {
  // 10.60: przypisanie montera jest informacją organizacyjną, nie blokadą dostępu.
  return false;
}

export function canWorkerFinishJob(job, isAdmin) {
  if (isWorkerReadOnlyJob(job, isAdmin)) return false;
  // 10.90: administrator może zakończyć zlecenie z widoku mobile/desktop.
  // Backend nadal egzekwuje komplet zdjęć dla pracownika i pozwala adminowi
  // użyć wyłącznie jawnych ręcznych potwierdzeń tabliczek.
  return normalizeStatus(job?.status) === "W trakcie";
}

export function canWorkerRestartJob(job, isAdmin) {
  if (isAdmin || isWorkerReadOnlyJob(job, isAdmin)) return false;
  return ["Nowe", "Niezrealizowane"].includes(normalizeStatus(job?.status));
}

export function canEditJob(job, isAdmin) {
  return !isWorkerLockedCompletedJob(job, isAdmin) && !isWorkerReadOnlyJob(job, isAdmin);
}

export function canModifyJobPhotos(job, isAdmin) {
  return !isWorkerLockedCompletedJob(job, isAdmin) && !isWorkerReadOnlyJob(job, isAdmin);
}

export function canAddJobComment(job, isAdmin) {
  // WAWIS 10.60: pracownik może dopisać komentarz także do cudzego montażu,
  // który ma prawo wyświetlić. Zakończone zlecenia pozostają zablokowane.
  return !isWorkerLockedCompletedJob(job, isAdmin);
}

export function canManageJobViewers(job, isAdmin) {
  if (!job?.id) return false;
  if (isAdmin) return true;
  return !isCompletedJob(job);
}

export function canManageAdminNote(job, isAdmin) {
  if (!isAdmin) return false;
  return Boolean(job?.id);
}

export function canDeleteJobComment(_comment, isAdmin) {
  return Boolean(isAdmin);
}

export function canDeleteJob(job, isAdmin) {
  if (!isAdmin) return false;
  return Boolean(job?.id);
}

export function canChangeJobStatus(job, nextStatus, isAdmin) {
  if (isAdmin) return Boolean(job?.id);
  if (isWorkerReadOnlyJob(job, isAdmin)) return false;
  if (nextStatus === "Zakończone") return canWorkerFinishJob(job, isAdmin);
  if (nextStatus === "W trakcie") return canWorkerRestartJob(job, isAdmin);
  return false;
}
