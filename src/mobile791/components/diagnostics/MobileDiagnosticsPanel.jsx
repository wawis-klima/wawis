import React, { useEffect, useState } from 'react';
import './MobileDiagnosticsPanel.css';
import { APP_VERSION } from '../../version.js';
import { downloadDiagnosticReportImmediate, logDiagnostic } from '../../modules/diagnostics.js';
import { sendTestPush } from '../../modules/push-subscriptions.js';
import { supabase } from '../../lib/supabase.js';
import { getPhotoQueueSummary, PHOTO_QUEUE_CHANGED_EVENT } from '../../modules/photo-offline-queue.js';
import { listOfflineJobOperations, JOB_OFFLINE_CHANGED_EVENT } from '../../modules/job-offline-store.js';
import { getRefreshFeedback, getPushAcceptanceMessage, summarizeOfflineDiagnosticQueue } from '../../../modules/diagnostics-package4.js';

const EMPTY_QUEUE = { total: 0, local: 0, uploading: 0, error: 0 };

export default function MobileDiagnosticsPanel({ profile = null, sessionUser = null, selectedJobId = '', refreshAll = null, onBack = () => {} }) {
  const [queueSummary, setQueueSummary] = useState(EMPTY_QUEUE);
  const [offlineSummary, setOfflineSummary] = useState({ total: 0, pending: 0, syncing: 0, conflict: 0, error: 0 });
  const [pushBusy, setPushBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [message, setMessage] = useState('');

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
          <strong>{queueSummary.total}</strong>
          <small>Lokalne {queueSummary.local} · Wysyłane {queueSummary.uploading} · Błędy {queueSummary.error} · Ponawiane {queueSummary.retrying || 0}</small>
        </article>
      </section>

      <section className="mobileDiagnosticsCard">
        <h2>Zmiany offline — to konto</h2>
        <p>Oczekuje: {offlineSummary.pending} · Wysyłane: {offlineSummary.syncing} · Konflikty: {offlineSummary.conflict} · Błędy: {offlineSummary.error}</p>
        <p>Etapy zdjęć: przygotowane {queueSummary.prepared || 0} · wysłane do Storage {queueSummary.storageUploaded || 0}. Szczegóły pozostają w Centrum synchronizacji.</p>
      </section>

      <section className="mobileDiagnosticsCard">
        <h2>Akcje</h2>
        <div className="mobileDiagnosticsActions">
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
