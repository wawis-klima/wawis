import React, { useEffect, useState } from 'react';
import './MobileDiagnosticsPanel.css';
import { APP_VERSION } from '../../version.js';
import { downloadDiagnosticReportImmediate, logDiagnostic } from '../../modules/diagnostics.js';
import { sendTestPush } from '../../modules/push-subscriptions.js';
import { supabase } from '../../lib/supabase.js';
import { getPhotoQueueSummary, PHOTO_QUEUE_CHANGED_EVENT } from '../../modules/photo-offline-queue.js';
import { confirmAndRepairPhotoQueue } from '../../modules/photo-queue-repair.js';
import { listOfflineJobOperations, JOB_OFFLINE_CHANGED_EVENT } from '../../modules/job-offline-store.js';
import { inspectNameplateReaderCache, prepareNameplateReadersNow } from '../../modules/nameplate-reader-warmup.js';
import { getNameplateAiUsageSummary } from '../../modules/nameplate-ai-usage.js';
import { getRefreshFeedback, getPushAcceptanceMessage, summarizeOfflineDiagnosticQueue } from '../../../modules/diagnostics-package4.js';

const EMPTY_QUEUE = { total: 0, local: 0, uploading: 0, error: 0 };

export default function MobileDiagnosticsPanel({ profile = null, sessionUser = null, selectedJobId = '', refreshAll = null, onSyncNow = null, onBack = () => {} }) {
  const [queueSummary, setQueueSummary] = useState(EMPTY_QUEUE);
  const [offlineSummary, setOfflineSummary] = useState({ total: 0, pending: 0, syncing: 0, conflict: 0, error: 0 });
  const [pushBusy, setPushBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [repairBusy, setRepairBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [readerStatus, setReaderStatus] = useState(null);
  const [readerBusy, setReaderBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    inspectNameplateReaderCache().then((status) => { if (mounted) setReaderStatus(status); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function handlePrepareReaders() {
    setReaderBusy(true);
    try {
      const result = await prepareNameplateReadersNow();
      setReaderStatus(await inspectNameplateReaderCache());
      setMessage(result?.ready
        ? 'Czytniki tabliczek są zapisane w telefonie — numer SN odczyta się także bez internetu.'
        : (result?.error || 'Nie udało się zapisać wszystkich czytników. Spróbuj ponownie z lepszym internetem.'));
    } finally {
      setReaderBusy(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const refreshQueue = async () => {
      try {
        const owner = String(sessionUser?.id || '').trim();
        if (!owner) { if (mounted) { setQueueSummary(EMPTY_QUEUE); setOfflineSummary({ total: 0, pending: 0, syncing: 0, conflict: 0, error: 0 }); } return; }
        const [summary, operations] = await Promise.all([getPhotoQueueSummary(owner), listOfflineJobOperations(owner)]);
        if (mounted) { setQueueSummary(summary || EMPTY_QUEUE); setOfflineSummary(summarizeOfflineDiagnosticQueue(operations)); }
      } catch (error) {
        if (mounted) setQueueSummary(EMPTY_QUEUE);
      }
    };
    void refreshQueue();
    window.addEventListener(PHOTO_QUEUE_CHANGED_EVENT, refreshQueue);
    window.addEventListener(JOB_OFFLINE_CHANGED_EVENT, refreshQueue);
    window.addEventListener('online', refreshQueue);
    window.addEventListener('offline', refreshQueue);
    return () => {
      mounted = false;
      window.removeEventListener(PHOTO_QUEUE_CHANGED_EVENT, refreshQueue);
      window.removeEventListener(JOB_OFFLINE_CHANGED_EVENT, refreshQueue);
      window.removeEventListener('online', refreshQueue);
      window.removeEventListener('offline', refreshQueue);
    };
  }, [sessionUser?.id]);

  async function handleRepairQueue() {
    if (repairBusy) return;
    setRepairBusy(true);
    setMessage('');
    try {
      const result = await confirmAndRepairPhotoQueue({
        logFn: (event, payload) => logDiagnostic(event, payload),
        onRepaired: () => window.location.reload(),
      });
      if (!result.cancelled) setMessage(result.ok ? result.message : `Naprawa kolejki NIE powiodła się. ${result.message}`);
    } finally {
      setRepairBusy(false);
    }
  }

  async function handleTestPush() {
    if (!sessionUser || profile?.role !== 'Administrator') return;
    setPushBusy(true);
    setMessage('');
    try {
      const result = await sendTestPush({ supabase, sessionUser, targetCurrentDevice: true });
      setMessage(getPushAcceptanceMessage(result, { currentDevice: true }));
    } catch (error) {
      logDiagnostic('diagnostic.mobile.panel.push-test.failed', { error });
      setMessage(`Nie udało się wysłać testowego push: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setPushBusy(false);
    }
  }

  function handleDownload() {
    setDownloadBusy(true);
    setMessage('');
    try {
      downloadDiagnosticReportImmediate({
        appVersion: APP_VERSION,
        role: profile?.role || 'Administrator',
        currentJobId: selectedJobId || '',
        queueSummary,
        offlineOperations: offlineSummary,
        extra: { module: 'mobile-diagnostics-panel' },
      });
      setMessage('Raport diagnostyczny został pobrany.');
    } catch (error) {
      logDiagnostic('diagnostic.mobile.panel.download.failed', { error });
      setMessage(`Nie udało się pobrać raportu: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setDownloadBusy(false);
    }
  }

  async function handleRefresh() {
    setRefreshBusy(true);
    setMessage('');
    try {
      const result = typeof refreshAll === 'function' ? await refreshAll(sessionUser, { preserveJobDetails: true }) : null;
      const feedback = getRefreshFeedback(result);
      if (feedback.status !== 'ok') logDiagnostic('diagnostic.mobile.panel.refresh.warning', { partial: feedback.status === 'partial' });
      setMessage(feedback.message);
    } catch (error) {
      logDiagnostic('diagnostic.mobile.panel.refresh.failed', { error });
      setMessage(`Nie udało się odświeżyć danych: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setRefreshBusy(false);
    }
  }

  // 13.65: ręczna synchronizacja zdjęć i zmian offline (także zdjęć zawieszonych jako „Wysyłane”).
  async function handleSyncNow() {
    if (syncBusy || !onSyncNow) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setMessage('Brak internetu — synchronizacja ruszy automatycznie po połączeniu.');
      return;
    }
    setSyncBusy(true);
    setMessage('');
    try {
      const result = await onSyncNow();
      const owner = String(sessionUser?.id || '').trim();
      const summary = owner ? await getPhotoQueueSummary(owner) : null;
      if (summary) setQueueSummary(summary);
      const left = Number(summary?.total || 0);
      setMessage(result?.error
        ? `Synchronizacja nie powiodła się: ${result.error?.message || result.error}`
        : left
          ? `Wysłano: ${Number(result?.uploaded || 0)}. W kolejce pozostało: ${left} — sprawdź szczegóły w Centrum synchronizacji.`
          : 'Wszystko wysłane.');
    } catch (error) {
      setMessage(`Synchronizacja nie powiodła się: ${error?.message || error}`);
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div className="mobileDiagnosticsPage">
      <button type="button" className="mobileDiagnosticsBack" onClick={onBack}>← Wróć do montaży</button>
      <section className="mobileDiagnosticsCard mobileDiagnosticsHero">
        <div>
          <div className="sectionPill">Diagnostyka</div>
          <h1>Diagnostyka mobilna</h1>
          <p>Tu masz szybki dostęp do raportu technicznego, testu push i stanu lokalnej kolejki zdjęć.</p>
        </div>
        <div className="mobileDiagnosticsVersion">v{APP_VERSION}</div>
      </section>

      <section className="mobileDiagnosticsGrid">
        <article className="mobileDiagnosticsMetric">
          <span>Połączenie</span>
          <strong className={typeof navigator !== 'undefined' && navigator.onLine ? 'isOk' : 'isWarn'}>
            {typeof navigator !== 'undefined' && navigator.onLine ? 'Online' : 'Offline'}
          </strong>
          <small>{selectedJobId ? `Wybrane zlecenie: ${selectedJobId}` : 'Bez wybranego zlecenia'}</small>
        </article>
        <article className="mobileDiagnosticsMetric">
          <span>Kolejka zdjęć</span>
          {queueSummary.readError ? (
            <>
              <strong className="isWarn" data-testid="diagnostics-photo-queue-error">Niedostępna</strong>
              <small>{queueSummary.readErrorMessage} (kod: {queueSummary.readError})</small>
            </>
          ) : (
            <>
              <strong>{queueSummary.total}</strong>
              <small>Lokalne {queueSummary.local} · Wysyłane {queueSummary.uploading} · Błędy {queueSummary.error} · Ponawiane {queueSummary.retrying || 0}</small>
            </>
          )}
        </article>
      </section>

      <section className="mobileDiagnosticsCard">
        <h2>Zmiany offline — to konto</h2>
        <p>Oczekuje: {offlineSummary.pending} · Wysyłane: {offlineSummary.syncing} · Konflikty: {offlineSummary.conflict} · Błędy: {offlineSummary.error}</p>
        <p>Etapy zdjęć: przygotowane {queueSummary.prepared || 0} · wysłane do Storage {queueSummary.storageUploaded || 0}. Szczegóły pozostają w Centrum synchronizacji.</p>
      </section>

      <section className="mobileDiagnosticsCard" data-testid="diagnostics-nameplate-readers">
        <h2>Odczyt tabliczek bez internetu</h2>
        <p>
          Czytnik kodu SN: <strong>{readerStatus?.barcode ? 'zapisany w telefonie' : 'nie pobrany'}</strong>
          {' · '}Czytnik tekstu: <strong>{readerStatus?.ocr ? 'zapisany w telefonie' : 'nie pobrany'}</strong>
        </p>
        {!(readerStatus?.barcode && readerStatus?.ocr) ? (
          <button type="button" className="btn" onClick={handlePrepareReaders} disabled={readerBusy} data-testid="diagnostics-prepare-readers">
            {readerBusy ? 'Pobieranie czytników…' : 'Pobierz czytniki teraz'}
          </button>
        ) : null}
      </section>

      <NameplateAiUsageCard />

      <section className="mobileDiagnosticsCard">
        <h2>Akcje</h2>
        <div className="mobileDiagnosticsActions">
          {onSyncNow ? (
            <button type="button" className="btn primary" onClick={handleSyncNow} disabled={syncBusy} data-testid="diagnostics-sync-now">
              {syncBusy ? 'Synchronizowanie…' : 'Synchronizuj teraz'}
            </button>
          ) : null}
          <button type="button" className="btn primary" onClick={handleDownload} disabled={downloadBusy}>
            {downloadBusy ? 'Przygotowywanie…' : 'Pobierz raport diagnostyczny'}
          </button>
          {profile?.role === "Administrator" ? (
            <button type="button" className="btn" onClick={handleTestPush} disabled={pushBusy}>
              {pushBusy ? 'Wysyłanie…' : 'Wyślij test push'}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={handleRefresh} disabled={refreshBusy}>
            {refreshBusy ? 'Odświeżanie…' : 'Odśwież dane'}
          </button>
          <button type="button" className="btn" onClick={handleRepairQueue} disabled={repairBusy} data-testid="diagnostics-photo-queue-repair">
            {repairBusy ? 'Naprawianie…' : 'Napraw kolejkę zdjęć'}
          </button>
        </div>
        {message ? <div className="mobileDiagnosticsMessage" role="status">{message}</div> : null}
      </section>

      <section className="mobileDiagnosticsCard mobileDiagnosticsPrivacy">
        <strong>Raport bez danych klientów</strong>
        <p>Plik diagnostyczny nie zawiera zdjęć, komentarzy, nazw klientów, adresów, telefonów ani e-maili.</p>
      </section>
    </div>
  );
}

// WAWIS 13.73: ile razy na tym telefonie użyto płatnego AI tabliczek, a ile razy czytnik wystarczył.
function NameplateAiUsageCard() {
  let usage = null;
  try {
    usage = getNameplateAiUsageSummary();
  } catch {
    usage = null;
  }
  if (!usage) return null;
  const row = (label, value) => (
    <p>
      {label}: AI użyte <strong>{value.ai}</strong>
      {' · '}AI niepotrzebne (czytnik) <strong>{value.skipped}</strong>
      {' · '}ponowny odczyt bez opłaty <strong>{value.cached}</strong>
    </p>
  );
  return (
    <section className="mobileDiagnosticsCard" data-testid="diagnostics-nameplate-ai-usage">
      <h2>AI tabliczek — ten telefon</h2>
      {row('Dziś', usage.today)}
      {row('Ostatnie 7 dni', usage.week)}
    </section>
  );
}
