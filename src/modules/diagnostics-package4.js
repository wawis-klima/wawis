// Shared privacy-safe diagnostic contracts for Codex C7-C10.
const BOOT_STAGES = new Set(['pre-module','imports','modules-ready','styles-ready','diagnostics-ready','render-requested','boot-failed','module-load-failed','no-boot-response']);
export function getRefreshFeedback(result) {
  if (!result || result.ok !== true) {
    if (result?.ignoredStaleSession) return { status: 'unknown', message: 'Sesja zmieniła się podczas odświeżania. Sprawdź zalogowane konto.' };
    if (result?.retryScheduled) return { status: 'error', message: 'Nie udało się pobrać danych. Zaplanowano automatyczną ponowną próbę.' };
    return { status: 'error', message: 'Nie udało się odświeżyć danych. Poprzednie dane mogą być nadal widoczne.' };
  }
  if (result.partial || result.transient || result.ignoredOlderResponse) return { status: 'partial', message: 'Odświeżono część danych. Nie potwierdzono pełnej aktualizacji.' };
  return { status: 'ok', message: 'Dane zostały odświeżone.' };
}
export function settleDiagnosticSection(previous, outcome, timestamp = new Date().toISOString()) {
  const good = outcome?.status === 'fulfilled' && outcome.value != null && outcome.value.unavailable !== true;
  if (!good) return { value: previous?.value ?? null, status: 'error', lastSuccessAt: previous?.lastSuccessAt || '', stale: true };
  const value = outcome.value;
  return { value, status: Array.isArray(value) && value.length === 0 ? 'empty' : 'ok', lastSuccessAt: timestamp, stale: false };
}
export function getPushAcceptanceMessage(result, { currentDevice = false } = {}) {
  const accepted = Math.max(0, Number(result?.delivered || 0));
  const failed = Math.max(0, Number(result?.failed || 0));
  const skipped = Math.max(0, Number(result?.skipped || 0));
  if (!accepted) return 'Nie potwierdzono przyjęcia PUSH przez usługę. Pominięto: ' + skipped + ', błędy: ' + failed + '.';
  return 'Usługa PUSH przyjęła ' + accepted + (currentDevice ? ' wysyłkę na ten telefon.' : ' wysyłek do urządzeń administratora.') + (failed ? ' Błędy: ' + failed + '.' : '') + ' Odbiór i wyświetlenie na telefonie nie są jeszcze potwierdzone.';
}
export function summarizePhotoDiagnosticQueue(items = [], userId = '') {
  const owner = String(userId || '').trim();
  return items.reduce((out, item) => {
    if (owner && String(item?.user_id || item?.uploaded_by || '').trim() !== owner) return out;
    out.total++;
    const state = String(item?.upload_status || 'local').toLowerCase();
    if (state === 'uploading') out.uploading++;
    else if (state === 'error') out.error++;
    else out.local++;
    if (Number(item?.retry_count || 0) > 0) out.retrying++;
    const stage = String(item?.upload_stage || '').toLowerCase();
    if (stage === 'prepared') out.prepared++;
    if (stage === 'storage_uploaded') out.storageUploaded++;
    return out;
  }, { total: 0, local: 0, uploading: 0, error: 0, retrying: 0, prepared: 0, storageUploaded: 0 });
}
export function summarizeOfflineDiagnosticQueue(items = []) {
  return items.reduce((out, item) => {
    out.total++;
    const status = String(item?.status || 'pending').toLowerCase();
    if (status === 'conflict') out.conflict++;
    else if (status === 'error') out.error++;
    else if (status === 'syncing') out.syncing++;
    else out.pending++;
    return out;
  }, { total: 0, pending: 0, syncing: 0, conflict: 0, error: 0 });
}
export function readSafeBootTrace() {
  try {
    const raw = typeof window === 'undefined' ? null : window.__wawisBootTrace?.snapshot?.();
    if (!raw || typeof raw !== 'object') return null;
    const stage = BOOT_STAGES.has(raw.stage) ? raw.stage : 'pre-module';
    const durationMs = Number(raw.durationMs);
    return {
      stage,
      failed: raw.failed === true,
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.min(300000, Math.round(durationMs))) : 0,
      steps: Array.isArray(raw.steps) ? raw.steps.slice(-10).filter(s => BOOT_STAGES.has(s?.stage)).map(s => ({
        stage: s.stage,
        durationMs: Number.isFinite(Number(s.durationMs)) ? Math.max(0, Math.min(300000, Math.round(Number(s.durationMs)))) : 0,
      })) : [],
    };
  } catch { return null; }
}
