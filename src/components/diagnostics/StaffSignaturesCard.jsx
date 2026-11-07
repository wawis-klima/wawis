import React, { useCallback, useEffect, useState } from 'react';
import { loadStaffSignaturesAdmin } from '../../modules/leak-tests.js';

// WAWIS 14.36 — Diagnostyka na komputerze: wzory podpisów pracowników (decyzja właściciela 07.11.2026).
// Tylko podgląd, tylko administrator. Wzór składa pracownik na telefonie (Diagnostyka → „Wzór podpisu”).

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export default function StaffSignaturesCard({ supabase }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      setRows(await loadStaffSignaturesAdmin({ supabase }));
    } catch (err) {
      setError(err?.message || 'Nie udało się wczytać wzorów podpisów.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void reload(); }, [reload]);

  const withPattern = rows.filter((row) => row.image_png).length;
  return (
    <section className="diagnosticsEventsCard" data-testid="desktop-staff-signatures-card">
      <div className="diagnosticsEventsHeader">
        <h2>Wzory podpisów pracowników</h2>
        <span data-testid="desktop-staff-signatures-count">{loading || error ? '' : `Złożone wzory: ${withPattern} z ${rows.length}`}</span>
      </div>
      <p className="muted">Wzorem pracownika podpisują się automatycznie jego protokoły. Nowy pracownik składa wzór raz na telefonie: Diagnostyka → „Wzór podpisu”.</p>
      {loading ? <div className="muted">Wczytuję…</div> : null}
      {error ? <div role="alert">{error}</div> : null}
      {!loading && !error ? (
        <div className="diagnosticsSignatureGrid">
          {rows.map((row) => (
            <div className="diagnosticsSignatureItem" key={row.profile_id} data-testid="desktop-staff-signature-row">
              <strong className={row.image_png ? 'diagnosticsOk' : 'diagnosticsError'}>{row.full_name || 'Bez nazwy'}</strong>
              <span>{row.image_png ? `Zapisany ${formatDate(row.created_at)}` : 'Brak wzoru'}</span>
              {row.image_png ? <img src={row.image_png} alt={`Wzór podpisu: ${row.full_name || ''}`} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="diagnosticsActions">
        <button type="button" className="btn" onClick={() => void reload()}>Odśwież wzory</button>
      </div>
    </section>
  );
}
