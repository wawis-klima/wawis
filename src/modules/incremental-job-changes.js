// WAWIS 13.87 — odświeżanie przyrostowe nie może cofać otwartego montażu do starej kopii.
//
// Zgłoszenie właściciela 27.10.2026 (montaż Biała 4a): miniatury zdjęć pokazały się na chwilę i zniknęły.
// Przyczyna: odświeżanie przyrostowe brało listę montaży na początku pracy, potem czekało na serwer
// (kilka zapytań), a na końcu zapisywało TĘ STARĄ listę. Jeżeli w tym czasie otwarto montaż i aplikacja
// zdążyła pobrać jego zdjęcia i miniatury, końcowy zapis przywracał kopię sprzed otwarcia — bez miniatur.
//
// Rozwiązanie: zmiany z serwera (dane montażu z podsumowania) nakładamy na NAJNOWSZĄ listę
// w chwili zapisu. Zdjęcia, komentarze i miniatury załadowane w międzyczasie zostają.

/** Nakłada jedną zmianę z serwera na listę montaży (pola montażu z serwera, reszta z listy). */
export function applyIncrementalJobChange(jobs = [], jobId = '', summary = null) {
  const list = Array.isArray(jobs) ? jobs : [];
  const targetId = String(jobId || '');
  if (!targetId) return list;
  if (summary?.missing || !summary?.job) {
    return list.filter((job) => String(job?.id) !== targetId);
  }
  const existing = list.find((job) => String(job?.id) === targetId);
  const nextJob = {
    ...(existing || {}),
    ...summary.job,
    viewers: summary.viewers || [],
  };
  return existing
    ? list.map((job) => (String(job?.id) === targetId ? nextJob : job))
    : [nextJob, ...list];
}

/**
 * Nakłada wszystkie zastosowane zmiany (w kolejności) na najnowszą listę montaży.
 * @param {Array} latestJobs lista z chwili zapisu (jobsRef.current), nie z początku odświeżania
 * @param {Array<{ jobId: string, summary: object }>} appliedChanges
 */
export function rebaseIncrementalJobChanges(latestJobs = [], appliedChanges = []) {
  let jobs = Array.isArray(latestJobs) ? latestJobs : [];
  for (const change of appliedChanges || []) {
    jobs = applyIncrementalJobChange(jobs, change?.jobId, change?.summary);
  }
  return jobs;
}
