import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listProtocolsForInstallerSignature, stampAllProtocols } from '../../modules/protocol-installer-stamp.js';

// WAWIS 14.39 — zakładka „Protokoły”: jednorazowe dopisanie podpisu instalatora do protokołów montażu zapisanych
// przed 14.38 (decyzja właściciela 08.11.2026). Uruchamia administrator; oryginały zostają jako poprzednie wersje.
// Karta znika, gdy nie ma czego uzupełniać.

export default function InstallerSignatureBackfillCard({ supabase }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  const reload = useCallback(async () => {
    if (!supabase) return;
    setError('');
    try {
      setItems(await listProtocolsForInstallerSignature({ supabase }));
    } catch (err) {
      setItems(null);
      setError(err?.message || 'Nie udało się sprawdzić protokołów.');
    }
  }, [supabase]);

  useEffect(() => { void reload(); }, [reload]);

  async function handleRun() {
    if (!items?.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    const ready = items.filter((item) => !item.reason).length;
    setProgress({ done: 0, total: ready });
    try {
      setResult(await stampAllProtocols({ supabase, items, signal: controller.signal, onProgress: setProgress }));
    } catch (err) {
      setError(err?.message || 'Nie udało się dodać podpisów.');
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
      await reload();
    }
  }

  const ready = (items || []).filter((item) => !item.reason);
  const blocked = (items || []).filter((item) => item.reason);
  if (!error && !result && items && !items.length) return null;
  if (!error && !result && !items) return null;

  return (
    <section className="card protocolsExportCard" data-testid="installer-signature-backfill-card">
      <div className="leakTestsHead">
        <div>
          <h2>Podpis instalatora w starszych protokołach</h2>
          <p className="leakTestsLead">
            Protokoły montażu zapisane przed 08.11.2026 nie mają podpisu instalatora. Aplikacja dopisze go w polu
            „Pieczątka i podpis instalatora” (wzór osoby, która zakończyła montaż) — reszta dokumentu i podpis klienta bez zmian.
            Dotychczasowy plik zostaje jako poprzednia wersja protokołu.
          </p>
        </div>
      </div>
      {items?.length ? (
        <p data-testid="installer-signature-backfill-count">
          Do uzupełnienia: <strong>{ready.length}</strong>{blocked.length ? ` · nie da się teraz: ${blocked.length}` : ''}
        </p>
      ) : null}
      {blocked.length && !busy ? (
        <ul className="protocolsBackfillList">
          {blocked.map((item) => (
            <li key={item.record.id}>{[item.job?.client, item.job?.city].filter(Boolean).join(', ') || item.record.job_id} — {item.reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="protocolsExportRow">
        {busy ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Przerwij</button>
        ) : (
          <button type="button" className="btn primary" data-testid="installer-signature-backfill-run" disabled={!ready.length} onClick={() => void handleRun()}>
            {`Dodaj podpis instalatora (${ready.length})`}
          </button>
        )}
      </div>
      {progress ? <p className="protocolsExportProgress" role="status">Dodaję podpisy… {progress.done} z {progress.total}</p> : null}
      {error ? <p className="leakTestsError" role="alert">{error}</p> : null}
      {result ? (
        <div data-testid="installer-signature-backfill-result">
          <p className="protocolsExportDone" role="status">
            {`Dodano podpis instalatora: ${result.stamped}.`}{result.aborted ? ' Przerwano.' : ''}
          </p>
          {result.skipped.length ? (
            <ul className="protocolsBackfillList">
              {result.skipped.map((entry, index) => <li key={`${entry.name}-${index}`}>{entry.name} — {entry.reason}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
