import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '../../version.js';
import {
  clearDiagnosticLog,
  downloadDiagnosticReport,
  getDiagnosticEntries,
  getDiagnosticOverview,
  loadRemoteDiagnosticEvents,
  loadStorageBackupOverview,
  loadPushSubscriptionOverview,
  getDiagnosticSyncStatus,
  logDiagnostic,
} from '../../modules/diagnostics.js';
import {
  DIAGNOSTIC_RECENT_HOURS,
  groupDiagnosticEntries,
  partitionDiagnosticEntries,
} from '../../modules/diagnostics-core.js';
import { sendTestPush } from '../../modules/push-subscriptions.js';
import { settleDiagnosticSection, getPushAcceptanceMessage } from '../../modules/diagnostics-package4.js';
import { supabase } from '../../lib/supabase.js';

function formatDateTime(value) {
  if (!value) return 'Brak zapisów';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pl-PL');
}

function getRuntimeSnapshot() {
  if (typeof window === 'undefined') return {};
  return {
    online: navigator.onLine,
    browser: navigator.userAgent || '',
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    screen: `${window.screen?.width || 0} × ${window.screen?.height || 0}`,
    serviceWorker: Boolean(navigator.serviceWorker?.controller),
  };
}

export default function DiagnosticsPanel({ profile = null, selectedJobId = '' }) {
  const [overview, setOverview] = useState(() => getDiagnosticOverview());
  const [runtime, setRuntime] = useState(getRuntimeSnapshot);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [message, setMessage] = useState('');
  const loadSequence = useRef(0);
  const [remoteSections, setRemoteSections] = useState({
    recent: { status: 'unknown', value: [], lastSuccessAt: '' },
    history: { status: 'unknown', value: [], lastSuccessAt: '' },
    backup: { status: 'unknown', value: { total: 0, pending: 0, errors: 0, completed: 0, lastCompletedAt: '' }, lastSuccessAt: '' },
    push: { status: 'unknown', value: [], lastSuccessAt: '' },
  });
  const remoteRecentEvents = remoteSections.recent.value;
  const remoteHistoryEvents = remoteSections.history.value;
  const backupOverview = remoteSections.backup.value;
  const pushSubscriptionOverview = remoteSections.push.value;
  const diagnosticSync = getDiagnosticSyncStatus();
  const labelStatus = (section) => {
    if (section.status === 'unknown') return 'Jeszcze nie pobrano';
    if (section.status === 'error') return section.lastSuccessAt ? 'Błąd odczytu — poprzednie dane' : 'Błąd odczytu — brak potwierdzenia';
    return (section.status === 'empty' ? 'Pobrano — brak wpisów' : 'Pobrano') + ' · ' + formatDateTime(section.lastSuccessAt);
  };

  function refresh() {
    setOverview(getDiagnosticOverview());
    setRuntime(getRuntimeSnapshot());
  }

  async function refreshServerData() {
    if (profile?.role !== 'Administrator') return;
    const requestId = ++loadSequence.current;
    const keys = ['recent', 'history', 'backup', 'push'];
    const results = await Promise.allSettled([
      loadRemoteDiagnosticEvents({ supabase, limit: 100, sinceHours: DIAGNOSTIC_RECENT_HOURS, strictAvailable: true }),
      loadRemoteDiagnosticEvents({ supabase, limit: 100, olderThanHours: DIAGNOSTIC_RECENT_HOURS, strictAvailable: true }),
      loadStorageBackupOverview({ supabase }),
      loadPushSubscriptionOverview({ supabase }),
    ]);
    if (requestId !== loadSequence.current) return;
    const timestamp = new Date().toISOString();
    setRemoteSections(previous => {
      const next = { ...previous };
      keys.forEach((key, index) => { next[key] = settleDiagnosticSection(previous[key], results[index], timestamp); });
      return next;
    });
  }

  function refreshEverything() {
    refresh();
    void refreshServerData();
  }

  useEffect(() => {
    refresh();
    void refreshServerData();
    const handleNetwork = () => refresh();
    window.addEventListener('online', handleNetwork);
    window.addEventListener('offline', handleNetwork);
    return () => {
      loadSequence.current += 1;
      window.removeEventListener('online', handleNetwork);
      window.removeEventListener('offline', handleNetwork);
    };
  }, [profile?.role]);

  const localPartitions = useMemo(
    () => partitionDiagnosticEntries(getDiagnosticEntries(), { hours: DIAGNOSTIC_RECENT_HOURS }),
    [overview.totalEntryCount, overview.lastEntryAt]
  );
  const recentEventGroups = useMemo(
    () => groupDiagnosticEntries(localPartitions.recent).slice(0, 12),
    [localPartitions]
  );
  const historyEventGroups = useMemo(
    () => groupDiagnosticEntries(localPartitions.history).slice(0, 20),
    [localPartitions]
  );
  const remoteRecentGroups = useMemo(
    () => groupDiagnosticEntries(remoteRecentEvents, { onlyProblems: true }),
    [remoteRecentEvents]
  );
  const remoteHistoryGroups = useMemo(
    () => groupDiagnosticEntries(remoteHistoryEvents, { onlyProblems: true }),
    [remoteHistoryEvents]
  );

  function renderEventGroups(groups, { remote = false } = {}) {
    if (!groups.length) return <div className="muted">Brak zapisanych zdarzeń w tym okresie.</div>;
    return (
      <div className="diagnosticsEventList">
        {groups.map((entry, index) => (
          <div className="diagnosticsEventRow" key={`${entry.type}-${entry.module}-${entry.lastAt}-${index}`}>
            <strong>
              {remote ? `${entry.severity === 'error' ? 'Błąd' : 'Ostrzeżenie'} · ` : ''}
              {entry.type || 'unknown'}{entry.count > 1 ? ` ×${entry.count}` : ''}
            </strong>
            <span>
              {entry.moduleLabel}
              {remote ? ` · ${entry.platform || 'urządzenie'} · v${entry.appVersion || '—'}` : ''}
              {remote && /^[A-Z][A-Z0-9_]{3,63}$/.test(entry.errorCode || '') ? ` · ${entry.errorCode}` : ''}
              {remote && /^[A-Z][A-Z0-9_]{3,63}$/.test(entry.errorCode || '') && entry.message ? ` · ${entry.message}` : ''}
              {` · ${formatDateTime(entry.lastAt)}`}
            </span>
          </div>
        ))}
      </div>
    );
  }

  async function handleDownload() {
    setDownloadBusy(true);
    setMessage('');
    try {
      await downloadDiagnosticReport({
        appVersion: APP_VERSION,
        role: profile?.role || 'Administrator',
        currentJobId: selectedJobId || '',
        extra: { module: 'desktop-diagnostics' },
      });
      setMessage('Raport został pobrany. Możesz przesłać plik do analizy błędu.');
      refresh();
    } catch (error) {
      logDiagnostic('diagnostic.report.download.failed', { error });
      setMessage(`Nie udało się pobrać raportu: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setDownloadBusy(false);
    }
  }


  async function handlePushTest() {
    setPushTestBusy(true);
    setMessage('');
    try {
      const result = await sendTestPush({ supabase, targetCurrentDevice: false });
      logDiagnostic('diagnostic.push-test.sent', { delivered: Number(result?.delivered || 0), failed: Number(result?.failed || 0), skipped: Number(result?.skipped || 0) });
      setMessage(getPushAcceptanceMessage(result));
    } catch (error) {
      logDiagnostic('diagnostic.push-test.failed', { error });
      setMessage(`Nie udało się wysłać testowego push: ${error?.message || 'nieznany błąd'}`);
    } finally {
      setPushTestBusy(false);
    }
  }

  function handleClear() {
    if (!window.confirm('Wyczyścić lokalny dziennik diagnostyczny na tym komputerze?')) return;
    clearDiagnosticLog();
    setMessage('Lokalny dziennik został wyczyszczony.');
    refresh();
  }

  return (
    <div className="diagnosticsPage">
      <section className="smsDesktopHeaderCard diagnosticsHeaderCard">
        <div className="smsDesktopHeaderCopy">
          <h1>Diagnostyka</h1>
          <p>Pobierz techniczny raport, gdy aplikacja się zawiesi, nie zapisze zdjęcia albo nie odczyta tabliczki.</p>
        </div>
      </section>

      <section className="diagnosticsPrivacyCard">
        <strong>Raport bez danych klientów</strong>
        <p>Plik nie zawiera zdjęć, komentarzy, adresów, telefonów, e-maili ani nazw klientów. Tokeny i adresy plików są maskowane.</p>
      </section>

      <div className="diagnosticsSummaryGrid">
        <article className="diagnosticsMetricCard">
          <span>Wersja</span>
          <strong>{APP_VERSION}</strong>
          <small>Aktualna wersja aplikacji</small>
        </article>
        <article className="diagnosticsMetricCard">
          <span>Połączenie</span>
          <strong className={runtime.online ? 'diagnosticsOk' : 'diagnosticsError'}>{runtime.online ? 'Online' : 'Offline'}</strong>
          <small>{runtime.viewport || '—'}</small>
        </article>
        <article className="diagnosticsMetricCard">
          <span>Zdarzenia — ostatnie 24 h</span>
          <strong>{overview.entryCount}</strong>
          <small>Historia: {overview.historyEntryCount} · Ostatnie: {formatDateTime(overview.lastEntryAt)}</small>
        </article>
        <article className="diagnosticsMetricCard">
          <span>Błędy / ostrzeżenia</span>
          <strong>{overview.errorCount} / {overview.warningCount}</strong>
          <small>Ostatnie 24 h · bez podwójnego liczenia</small>
        </article>
      </div>

      <section className="diagnosticsActionsCard">
        <div>
          <h2>Raport diagnostyczny</h2>
          <p>Najlepiej pobrać go od razu po wystąpieniu problemu, zanim odświeżysz stronę.</p>
        </div>
        <div className="diagnosticsActions">
          <button type="button" className="btn primary" onClick={handleDownload} disabled={downloadBusy}>
            {downloadBusy ? 'Przygotowywanie…' : 'Pobierz raport diagnostyczny'}
          </button>
          {profile?.role === 'Administrator' ? (
            <button type="button" className="btn" onClick={handlePushTest} disabled={pushTestBusy}>
              {pushTestBusy ? 'Wysyłanie testu push…' : 'Wyślij testowe powiadomienie push'}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={refreshEverything}>Odśwież dane</button>
          <button type="button" className="btn danger" onClick={handleClear}>Wyczyść dziennik</button>
        </div>
        {message ? <div className="diagnosticsMessage" role="status">{message}</div> : null}
      </section>

      {profile?.role === 'Administrator' ? (
        <section className="diagnosticsEventsCard">
          <div className="diagnosticsEventsHeader">
            <h2>Subskrypcje PUSH zespołu</h2>
            <span>Aktywne urządzenia: {pushSubscriptionOverview.reduce((sum, row) => sum + row.activeSubscriptions, 0)}</span>
          </div>
          <p className="muted">{labelStatus(remoteSections.push)}. Subskrypcja i przyjęcie przez dostawcę nie potwierdzają wyświetlenia PUSH na telefonie.</p>
          <div className="diagnosticsEventList">
            {remoteSections.push.status === 'error' ? <div role="alert">Błąd pobierania subskrypcji. Poprzednie dane mogą być nieaktualne.</div> : null}
            {pushSubscriptionOverview.length ? pushSubscriptionOverview.map((row) => (
              <div className="diagnosticsEventRow" key={row.userId}>
                <strong className={row.activeSubscriptions > 0 ? 'diagnosticsOk' : 'diagnosticsError'}>
                  {row.fullName} · {row.activeSubscriptions > 0 ? 'Subskrypcja aktywna' : 'Brak aktywnej subskrypcji'}
                </strong>
                <span>
                  {row.role}
                  {row.activeSubscriptions > 0 ? ` · aktywne: ${row.activeSubscriptions}` : ''}
                  {row.inactiveSubscriptions > 0 ? ` · historyczne: ${row.inactiveSubscriptions}` : ''}
                  {row.activeDevices.length ? ` · ${row.activeDevices.join(', ')}` : ''}
                  {row.lastSeenAt ? ` · ostatnio: ${formatDateTime(row.lastSeenAt)}` : ''}
                </span>
              </div>
            )) : <div className="muted">{remoteSections.push.status === 'empty' ? 'Brak zapisanych subskrypcji.' : 'Brak potwierdzonych danych o subskrypcjach.'}</div>}
          </div>
        </section>
      ) : null}

      <section className="diagnosticsEventsCard">
        <div className="diagnosticsEventsHeader">
          <h2>Ostatnie zdarzenia techniczne — 24 godziny</h2>
          <span>Bez treści danych użytkownika</span>
        </div>
        {renderEventGroups(recentEventGroups)}
        <details className="diagnosticsHistoryDetails">
          <summary>Historia starsza niż 24 godziny ({overview.historyEntryCount})</summary>
          {renderEventGroups(historyEventGroups)}
        </details>
      </section>

      <section className="diagnosticsEventsCard">
        <div className="diagnosticsEventsHeader">
          <h2>Cicha diagnostyka urządzeń</h2>
          <span>Automatyczne zgłoszenia bez danych klientów</span>
        </div>
        <p className="muted">24 h: {labelStatus(remoteSections.recent)} · Starsze: {labelStatus(remoteSections.history)} · Synchronizacja z serwerem: {diagnosticSync.status} · Ostatni sukces wysyłania: {formatDateTime(diagnosticSync.lastSuccessAt)}</p>
        {remoteSections.recent.status === 'error' ? <div role="alert">Nie udało się pobrać zdarzeń. Pokazano wcześniejszą próbkę, jeśli była dostępna.</div> : null}
        {remoteSections.recent.status === 'unknown' ? <div className="muted">Brak potwierdzonego odczytu zdarzeń centralnych.</div> : renderEventGroups(remoteRecentGroups, { remote: true })}
        <details className="diagnosticsHistoryDetails">
          <summary>Historia centralna starsza niż 24 godziny</summary>
          {remoteSections.history.status === 'error' ? <div role="alert">Starsza historia jest nieaktualna lub niedostępna.</div> : null}
          {remoteSections.history.status === 'unknown' ? <div className="muted">Nie pobrano jeszcze historii.</div> : renderEventGroups(remoteHistoryGroups, { remote: true })}
        </details>
      </section>

      <section className="diagnosticsEventsCard">
        <div className="diagnosticsEventsHeader">
          <h2>Kopie zdjęć i protokołów</h2>
          <span>{labelStatus(remoteSections.backup)} · Ostatnia kopia: {formatDateTime(backupOverview.lastCompletedAt)}</span>
        </div>
        <div className="diagnosticsEventList">
          <div className="diagnosticsEventRow">
            <strong>{remoteSections.backup.status === 'error' || remoteSections.backup.status === 'unknown' ? 'Brak aktualnego potwierdzenia' : 'Skopiowane: ' + backupOverview.completed + ' z ' + backupOverview.total}</strong>
            <span>Oczekuje: {backupOverview.pending} · Błędy: {backupOverview.errors}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
