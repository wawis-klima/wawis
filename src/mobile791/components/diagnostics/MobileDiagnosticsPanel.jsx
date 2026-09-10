import React, { useEffect, useState } from 'react';
import { APP_VERSION } from '../../version.js';
import { downloadDiagnosticReportImmediate, logDiagnostic } from '../../modules/diagnostics.js';
import { sendTestPush } from '../../modules/push-subscriptions.js';
import { supabase } from '../../lib/supabase.js';
import { getPhotoQueueSummary, PHOTO_QUEUE_CHANGED_EVENT } from '../../modules/photo-offline-queue.js';

const EMPTY_QUEUE = { total: 0, local: 0, uploading: 0, error: 0 };

export default function MobileDiagnosticsPanel({ profile = null, sessionUser = null, selectedJobId = '', refreshAll = null }) {
  const [queueSummary, setQueueSummary] = useState(EMPTY_QUEUE);
  const [pushBusy, setPushBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    const refreshQueue = async () => {
      try {
        const summary = await getPhotoQueueSummary();
        if (mounted) setQueueSummary(summary || EMPTY_QUEUE);
      } catch (error) {
        if (mounted) setQueueSummary(EMPTY_QUEUE);
      }
    };
    void refreshQueue();
    window.addEventListener(PHOTO_QUEUE_CHANGED_EVENT, refreshQueue);
    window.addEventListener('online', refreshQueue);
    window.addEventListener('offline', refreshQueue);
    return () => {
      mounted = false;
      window.removeEventListener(PHOTO_QUEUE_CHANGED_EVENT, refreshQueue);
      window.removeEventListener('online', refreshQueue);
      window.removeEventListener('offline', refreshQueue);
    };
  }, []);

  async function handleTestPush() {
    if (!sessionUser || profile?.role !== 'Administrator') return;
    setPushBusy(true);
    setMessage('');
    try {
      const result = await sendTestPush({ supabase, sessionUser, targetCurrentDevice: true });
      const delivered = Number(result?.delivered || 0);
      if (delivered > 0) {
        setMessage('Test push został wysłany na ten telefon.');
      } else {
        setMessage(`Test push nie został dostarczony. ${result?.reason || 'Sprawdź status push i spróbuj ponownie.'}`);
      }
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
      await refreshAll?.(sessionUser, { preserveJobDetails: true });
      setMessage('Dane zostały odświeżone.');
    } catch (error) {
      logDiagnostic('diagnostic.mobile.panel.refresh.failed', { error });
      setMessage(`Nie udało się odświeżyć danych: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <div className="mobileDiagnosticsPage">
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
          <small>Lokalne {queueSummary.local} · Wysyłane {queueSummary.uploading} · Błędy {queueSummary.error}</small>
        </article>
      </section>

      <section className="mobileDiagnosticsCard">
        <h2>Akcje</h2>
        <div className="mobileDiagnosticsActions">
          <button type="button" className="btn primary" onClick={handleDownload} disabled={downloadBusy}>
            {downloadBusy ? 'Przygotowywanie…' : 'Pobierz raport diagnostyczny'}
          </button>
          <button type="button" className="btn" onClick={handleTestPush} disabled={pushBusy}>
            {pushBusy ? 'Wysyłanie…' : 'Wyślij test push'}
          </button>
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
