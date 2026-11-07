import React, { useCallback, useEffect, useState } from 'react';
import { loadStaffSignaturesAdmin } from '../../../modules/leak-tests.js';

// WAWIS 14.34 — Diagnostyka administratora: podgląd wzorów podpisów pracowników (decyzja właściciela 07.11.2026).
// Tylko podgląd; wzór składa i zmienia sam pracownik na swoim koncie (karta „Wzór podpisu”).

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export default function StaffSignaturesAdminCard({ supabase }) {
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
    <section className="mobileDiagnosticsCard" data-testid="staff-signatures-card">
      <h2>Wzory podpisów pracowników</h2>
      {loading ? <p>Wczytuję…</p> : null}
      {error ? <p className="leakSignError" role="alert">{error}</p> : null}
      {!loading && !error ? (
        <>
          <p data-testid="staff-signatures-count">Złożone wzory: {withPattern} z {rows.length}</p>
          <ul className="staffSignaturesList">
            {rows.map((row) => (
              <li key={row.profile_id} data-testid="staff-signature-row">
                <div className="staffSignaturesHead">
                  <strong>{row.full_name || 'Bez nazwy'}</strong>
                  <small>{row.image_png ? `Zapisany ${formatDate(row.created_at)}` : 'Brak wzoru'}</small>
                </div>
                {row.image_png ? <img src={row.image_png} alt={`Wzór podpisu: ${row.full_name || ''}`} /> : null}
              </li>
            ))}
          </ul>
          <div className="mobileDiagnosticsActions">
            <button type="button" className="btn" onClick={() => void reload()}>Odśwież</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
