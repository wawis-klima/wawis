import React, { useCallback, useEffect, useRef, useState } from 'react';
// Styl (leak-test-sign.css) ładuje src/main.jsx — import CSS tutaj nie dotarłby do telefonu (14.30).
import { loadOwnPendingLeakTests, signOwnLeakTests } from '../../../modules/leak-tests.js';

// WAWIS 14.29 — instalator podpisuje SWOJE protokoły z próby szczelności (dane przepisał administrator
// z podpisanych protokołów papierowych). Widzi listę i sam zatwierdza; wzór podpisu zapisuje się w bazie
// (nie w telefonie), więc kolejne protokoły podpisze jednym kliknięciem. Bez internetu i bez listy — nic nie widać.

function formatDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d3a8a';
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event) {
    event.preventDefault();
    try { canvasRef.current.setPointerCapture?.(event.pointerId); } catch { /* syntetyczne zdarzenie — bez przechwycenia */ }
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = point(event);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
  }
  function move(event) {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(event);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    if (!hasInk.current) { hasInk.current = true; onChange?.(true); }
  }
  function end() { drawing.current = false; }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false; onChange?.(false);
  }

  return (
    <div className="leakSignPad">
      <canvas ref={canvasRef} className="leakSignCanvas" data-testid="leak-sign-canvas" aria-label="Pole podpisu"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} />
      <button type="button" className="btn leakSignClear" onClick={clear}>Wyczyść</button>
    </div>
  );
}

export function exportSignaturePng(root) {
  const canvas = root?.querySelector('canvas.leakSignCanvas');
  return canvas ? canvas.toDataURL('image/png') : null;
}

export default function LeakTestSignBanner({ supabase, userId }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [drawNew, setDrawNew] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const sheetRef = useRef(null);

  const reload = useCallback(async () => {
    if (!supabase || !userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    try {
      setRows(await loadOwnPendingLeakTests({ supabase }));
    } catch {
      setRows([]); // przed migracją / bez uprawnień — baner ukryty, nic się nie dzieje
    }
  }, [supabase, userId]);

  useEffect(() => { void reload(); }, [reload]);

  const hasSaved = rows.some((row) => row.has_saved_signature);
  const useSaved = hasSaved && !drawNew;

  async function handleSign() {
    setError('');
    const imagePng = useSaved ? null : exportSignaturePng(sheetRef.current);
    if (!useSaved && !hasInk) { setError('Podpisz się palcem w polu poniżej.'); return; }
    setBusy(true);
    try {
      const count = await signOwnLeakTests({ supabase, jobIds: rows.map((row) => row.job_id), imagePng });
      setMessage(`Podpisano protokołów: ${count}.`);
      setOpen(false);
      setDrawNew(false);
      setHasInk(false);
      await reload();
    } catch (signError) {
      setError(signError?.message || 'Nie udało się podpisać.');
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length && !message) return null;

  return (
    <div className="leakSignBanner" data-testid="leak-sign-banner">
      {rows.length ? (
        <div className="leakSignBannerRow">
          <span><strong>Protokoły szczelności do podpisu: {rows.length}</strong></span>
          <button type="button" className="btn primary" onClick={() => { setOpen(true); setMessage(''); setError(''); }}>Podpisz</button>
        </div>
      ) : null}
      {message ? <p className="leakSignDone" role="status">{message}</p> : null}
      {open ? (
        <div className="leakSignOverlay" role="dialog" aria-modal="true" aria-label="Podpis protokołów szczelności">
          <div className="leakSignSheet" ref={sheetRef}>
            <h3>Podpis protokołów z próby szczelności</h3>
            <p className="leakSignLead">Twoje montaże z danymi próby przepisanymi z protokołów. Sprawdź listę i podpisz.</p>
            <ul className="leakSignList">
              {rows.map((row) => (
                <li key={row.job_id}>
                  <strong>{row.client || 'Klient'}</strong>
                  <span>{[row.city, row.street].filter(Boolean).join(', ')}</span>
                  <span>{formatDate(row.test_date)} · {String(Number(row.temperature_c)).replace('.', ',')} °C · {row.result === 'negatywny' ? 'Negatywny' : 'Pozytywny'}</span>
                </li>
              ))}
            </ul>
            {useSaved ? (
              <div className="leakSignSaved">
                <span>Użyję Twojego zapisanego podpisu.</span>
                <button type="button" className="btn" onClick={() => setDrawNew(true)}>Narysuj nowy</button>
              </div>
            ) : (
              <SignaturePad onChange={setHasInk} />
            )}
            <p className="leakSignConfirm">Podpisując, potwierdzam, że wykonałem te próby szczelności z podanym wynikiem.</p>
            {error ? <p className="leakSignError" role="alert">{error}</p> : null}
            <div className="leakSignActions">
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>Anuluj</button>
              <button type="button" className="btn primary" onClick={() => void handleSign()} disabled={busy}>
                {busy ? 'Podpisuję…' : `Podpisz (${rows.length})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
