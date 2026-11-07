import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SignaturePad, exportSignaturePng } from '../signature/SignaturePad.jsx';
import { loadOwnSignaturePattern, saveOwnSignaturePattern } from '../../../modules/leak-tests.js';

// WAWIS 14.33 — Diagnostyka → „Wzór podpisu” (decyzja właściciela 07.11.2026). Pracownik składa raz swój podpis;
// wzór zapisuje się w bazie (nie w telefonie) i automatycznie podpisuje jego protokoły (próby szczelności —
// data podpisu = data badania). Nowy wzór trafia na protokoły podpisywane od teraz; podpisane zostają bez zmian.

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export default function SignaturePatternCard({ supabase, profile = null }) {
  const [pattern, setPattern] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const sheetRef = useRef(null);

  const reload = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setLoadError('');
    try {
      setPattern(await loadOwnSignaturePattern({ supabase }));
    } catch (err) {
      // Błąd odczytu ≠ „brak wzoru” — pokazujemy komunikat zamiast pustego stanu.
      setLoadError(err?.message || 'Nie udało się wczytać wzoru podpisu.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void reload(); }, [reload]);

  async function handleSave() {
    setError('');
    if (!hasInk) { setError('Podpisz się palcem w polu poniżej.'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError('Brak internetu — wzór zapisze się dopiero online.'); return; }
    const imagePng = exportSignaturePng(sheetRef.current);
    setBusy(true);
    try {
      const signed = await saveOwnSignaturePattern({ supabase, imagePng });
      setOpen(false);
      setHasInk(false);
      setMessage(signed ? `Wzór podpisu zapisany. Podpisano protokołów: ${signed}.` : 'Wzór podpisu zapisany.');
      await reload();
    } catch (err) {
      setError(err?.message || 'Nie udało się zapisać wzoru podpisu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mobileDiagnosticsCard" data-testid="signature-pattern-card">
      <h2>Wzór podpisu</h2>
      <p>
        {profile?.full_name ? <strong>{profile.full_name}. </strong> : null}
        Twój podpis, którym aplikacja sama podpisuje Twoje protokoły (np. z próby szczelności).
      </p>
      {loading ? <p>Wczytuję…</p> : null}
      {loadError ? <p className="leakSignError" role="alert">{loadError}</p> : null}
      {!loading && !loadError ? (
        pattern ? (
          <div className="signaturePatternPreview" data-testid="signature-pattern-preview">
            <img src={pattern.imagePng} alt="Zapisany wzór podpisu" />
            <small>Zapisany {formatDate(pattern.createdAt)}</small>
          </div>
        ) : (
          <p data-testid="signature-pattern-missing"><strong>Brak wzoru podpisu</strong> — protokoły czekają, aż go złożysz.</p>
        )
      ) : null}
      {message ? <p className="leakSignDone" role="status">{message}</p> : null}
      <div className="mobileDiagnosticsActions">
        <button type="button" className="btn primary" data-testid="signature-pattern-open"
          onClick={() => { setOpen(true); setError(''); setMessage(''); setHasInk(false); }} disabled={loading || Boolean(loadError)}>
          {pattern ? 'Zmień wzór podpisu' : 'Złóż wzór podpisu'}
        </button>
      </div>
      {open ? (
        <div className="leakSignOverlay" role="dialog" aria-modal="true" aria-label="Wzór podpisu">
          <div className="leakSignSheet" ref={sheetRef}>
            <h3>Wzór podpisu</h3>
            <p className="leakSignLead">Podpisz się palcem tak, jak na papierowym protokole.</p>
            <SignaturePad onChange={setHasInk} />
            <p className="leakSignConfirm">Zapisując, zgadzam się, aby aplikacja podpisywała tym wzorem moje protokoły.</p>
            {error ? <p className="leakSignError" role="alert">{error}</p> : null}
            <div className="leakSignActions">
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>Anuluj</button>
              <button type="button" className="btn primary" onClick={() => void handleSave()} disabled={busy}>
                {busy ? 'Zapisuję…' : 'Zapisz wzór'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
