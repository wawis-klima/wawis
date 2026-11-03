// WAWIS 14.20 — zakładka „Zgłoszenia”: zgłoszenia klientów z naklejki QR (awaria / przegląd).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatRequestDate, formatRequestPhone, loadServiceRequests, setServiceRequestStatus,
  SERVICE_REQUEST_KIND_LABELS, SERVICE_REQUEST_STATUS_LABELS,
} from '../../modules/service-requests.js';
import './service-requests.css';

export default function ServiceRequestsPanel({ supabase, onOpenContractor = null }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('nowe');
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await loadServiceRequests({ supabase }));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const newCount = rows.filter((row) => row.status === 'nowe').length;
  const visible = useMemo(() => (filter === 'wszystkie' ? rows : rows.filter((row) => row.status === filter)), [rows, filter]);

  const toggleStatus = async (row) => {
    const next = row.status === 'nowe' ? 'zalatwione' : 'nowe';
    setBusyId(row.id);
    setError('');
    try {
      await setServiceRequestStatus({ supabase, id: row.id, status: next });
      setRows((current) => current.map((item) => (item.id === row.id
        ? { ...item, status: next, handled_at: next === 'zalatwione' ? new Date().toISOString() : null }
        : item)));
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="card serviceRequestsPanel" data-testid="service-requests-panel">
      <div className="serviceRequestsHead">
        <div>
          <h2>Zgłoszenia od klientów</h2>
          <p className="serviceRequestsLead">Wysłane po zeskanowaniu naklejki QR na klimatyzatorze. Oddzwoń i oznacz jako załatwione.</p>
        </div>
        <div className="serviceRequestsTools">
          <div className="serviceRequestsFilter" role="group" aria-label="Pokaż">
            {[['nowe', `Nowe (${newCount})`], ['zalatwione', 'Załatwione'], ['wszystkie', 'Wszystkie']].map(([key, label]) => (
              <button key={key} type="button" className={`btn ${filter === key ? 'primary' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>{loading ? 'Wczytywanie…' : 'Odśwież'}</button>
        </div>
      </div>

      {error ? <p className="serviceRequestsError" role="alert">{error}</p> : null}
      {!loading && !error && !visible.length ? (
        <p className="serviceRequestsEmpty">{filter === 'nowe' ? 'Brak nowych zgłoszeń.' : 'Brak zgłoszeń.'}</p>
      ) : null}

      <div className="serviceRequestsList">
        {visible.map((row) => (
          <article key={row.id} className={`serviceRequestRow ${row.status === 'nowe' ? 'isNew' : ''}`} data-testid="service-request-row">
            <div className="serviceRequestMain">
              <div className="serviceRequestTop">
                <span className={`serviceRequestKind kind-${row.kind}`}>{SERVICE_REQUEST_KIND_LABELS[row.kind] || row.kind}</span>
                <span className="serviceRequestDate">{formatRequestDate(row.created_at)}</span>
                <span className={`serviceRequestStatus status-${row.status}`}>{SERVICE_REQUEST_STATUS_LABELS[row.status] || row.status}</span>
              </div>
              <div className="serviceRequestClient">
                {row.contractor_name ? (
                  onOpenContractor && row.contractor_id
                    ? <button type="button" className="serviceRequestLink" onClick={() => onOpenContractor(row.contractor_id)}>{row.contractor_name}</button>
                    : <strong>{row.contractor_name}</strong>
                ) : <strong>Naklejka bez przypisanego urządzenia</strong>}
                {[row.contractor_street, row.contractor_city].filter(Boolean).length ? <span> · {[row.contractor_street, row.contractor_city].filter(Boolean).join(', ')}</span> : null}
              </div>
              <div className="serviceRequestDevice">
                {row.device_model || 'Urządzenie nieznane'}{row.device_serial ? ` · nr ${row.device_serial}` : ''} · naklejka {String(row.qr_code || '').replace(/^(.{4})(.{4})$/, '$1-$2')}
              </div>
              {row.description ? <p className="serviceRequestText">{row.description}</p> : <p className="serviceRequestText isEmpty">Bez opisu.</p>}
            </div>
            <div className="serviceRequestSide">
              <div className="serviceRequestPhone" title="Numer podany przez klienta w zgłoszeniu">Tel. <strong>{formatRequestPhone(row.phone)}</strong></div>
              {row.contractor_phone && formatRequestPhone(row.contractor_phone) !== formatRequestPhone(row.phone)
                ? <div className="serviceRequestPhoneAlt">w karcie: {formatRequestPhone(row.contractor_phone)}</div> : null}
              <button type="button" className={`btn ${row.status === 'nowe' ? 'primary' : ''}`} disabled={busyId === row.id} onClick={() => void toggleStatus(row)}>
                {busyId === row.id ? 'Zapisywanie…' : row.status === 'nowe' ? 'Oznacz jako załatwione' : 'Przywróć jako nowe'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
