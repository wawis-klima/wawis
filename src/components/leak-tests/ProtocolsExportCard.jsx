import React, { useEffect, useRef, useState } from 'react';
import { buildProtocolsZip, countProtocols } from '../../modules/protocol-export.js';

// WAWIS 14.37 — zakładka „Protokoły”: pobieranie zbiorcze (decyzja właściciela 08.11.2026).
// Zakres dat + rodzaje protokołów → jeden plik ZIP (folder na każdy rodzaj). Tylko administrator, tylko odczyt.

function todayIso() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
}

function shiftIso(iso, { months = 0, years = 0 }) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y + years, m - 1 + months, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, last));
  return date.toISOString().slice(0, 10);
}

const PRESETS = [
  ['month', 'Ten miesiąc'],
  ['prevMonth', 'Poprzedni miesiąc'],
  ['year', 'Ten rok'],
  ['all', 'Wszystkie'],
];

function presetRange(key) {
  const today = todayIso();
  const [y, m] = today.split('-');
  if (key === 'month') return { from: `${y}-${m}-01`, to: today };
  if (key === 'prevMonth') {
    const start = shiftIso(`${y}-${m}-01`, { months: -1 });
    const end = new Date(Date.UTC(Number(y), Number(m) - 1, 0)).toISOString().slice(0, 10);
    return { from: start, to: end };
  }
  if (key === 'year') return { from: `${y}-01-01`, to: today };
  return { from: '', to: '' };
}

export default function ProtocolsExportCard({ supabase }) {
  const [range, setRange] = useState(() => presetRange('month'));
  const [kinds, setKinds] = useState({ client: true, leak: true });
  const [counts, setCounts] = useState(null);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const abortRef = useRef(null);
  const countSeq = useRef(0);

  useEffect(() => {
    if (!supabase) return undefined;
    const seq = countSeq.current + 1;
    countSeq.current = seq;
    setCounting(true);
    setCounts(null);
    const timer = setTimeout(() => {
      countProtocols({ supabase, from: range.from, to: range.to, kinds: { client: true, leak: true } })
        .then((result) => { if (countSeq.current === seq) setCounts(result); })
        .catch(() => { if (countSeq.current === seq) setCounts(null); })
        .finally(() => { if (countSeq.current === seq) setCounting(false); });
    }, 250);
    return () => clearTimeout(timer);
  }, [supabase, range.from, range.to]);

  const invalidRange = range.from && range.to && range.from > range.to;
  const selectedCount = counts ? (kinds.client ? counts.client : 0) + (kinds.leak ? counts.leak : 0) : null;

  async function handleDownload() {
    setError('');
    setMessage('');
    if (invalidRange) { setError('Data „od” jest późniejsza niż „do”.'); return; }
    if (!kinds.client && !kinds.leak) { setError('Zaznacz co najmniej jeden rodzaj protokołów.'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setProgress({ done: 0, total: selectedCount || 0 });
    try {
      const result = await buildProtocolsZip({
        supabase, from: range.from, to: range.to, kinds, signal: controller.signal,
        onProgress: (value) => setProgress(value),
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url; link.download = result.fileName; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      const parts = [];
      if (kinds.client) parts.push(`montażu: ${result.added.client}`);
      if (kinds.leak) parts.push(`szczelności: ${result.added.leak}`);
      setMessage(`Pobrano ${result.fileName} (protokoły ${parts.join(', ')})${result.skipped.length ? ` · pominięte: ${result.skipped.length} — lista w pliku „Pominięte.txt”` : ''}.`);
    } catch (err) {
      setError(err?.name === 'AbortError' ? 'Przerwano pobieranie.' : (err?.message || 'Nie udało się przygotować archiwum.'));
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  return (
    <section className="card protocolsExportCard" data-testid="protocols-export-card">
      <div className="leakTestsHead">
        <div>
          <h2>Protokoły</h2>
          <p className="leakTestsLead">Pobierz protokoły z wybranego okresu jednym plikiem ZIP — osobny folder na protokoły montażu (podpisane przez klienta) i protokoły szczelności.</p>
        </div>
      </div>
      <div className="protocolsExportPresets" role="group" aria-label="Szybki wybór okresu">
        {PRESETS.map(([key, label]) => (
          <button key={key} type="button" className="btn" disabled={busy} onClick={() => setRange(presetRange(key))}>{label}</button>
        ))}
      </div>
      <div className="protocolsExportRow">
        <label className="leakTestField">
          <span>Od</span>
          <input type="date" className="input" value={range.from} disabled={busy} onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))} />
        </label>
        <label className="leakTestField">
          <span>Do</span>
          <input type="date" className="input" value={range.to} disabled={busy} onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))} />
        </label>
        <label className="protocolsExportKind">
          <input type="checkbox" checked={kinds.client} disabled={busy} onChange={(e) => setKinds((prev) => ({ ...prev, client: e.target.checked }))} />
          <span>Protokoły montażu{counts ? ` (${counts.client})` : ''}</span>
        </label>
        <label className="protocolsExportKind">
          <input type="checkbox" checked={kinds.leak} disabled={busy} onChange={(e) => setKinds((prev) => ({ ...prev, leak: e.target.checked }))} />
          <span>Protokoły szczelności{counts ? ` (${counts.leak})` : ''}</span>
        </label>
        {busy ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Przerwij</button>
        ) : (
          <button type="button" className="btn primary" data-testid="protocols-export-download" onClick={() => void handleDownload()}
            disabled={invalidRange || (!kinds.client && !kinds.leak) || selectedCount === 0}>
            {counting ? 'Liczę…' : `Pobierz ZIP${selectedCount != null ? ` (${selectedCount})` : ''}`}
          </button>
        )}
      </div>
      <small className="protocolsExportHint">
        {range.from || range.to ? `Okres: ${range.from || 'od początku'} – ${range.to || 'dziś'}` : 'Okres: wszystkie protokoły'}
        {' '}· data zakończenia montażu (szczelność: data badania).
      </small>
      {invalidRange ? <p className="leakTestsError" role="alert">Data „od” jest późniejsza niż „do”.</p> : null}
      {progress ? <p className="protocolsExportProgress" role="status">Przygotowuję… {progress.done} z {progress.total}</p> : null}
      {error ? <p className="leakTestsError" role="alert">{error}</p> : null}
      {message ? <p className="protocolsExportDone" role="status" data-testid="protocols-export-result">{message}</p> : null}
    </section>
  );
}
