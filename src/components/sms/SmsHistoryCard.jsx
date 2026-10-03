import React from 'react';
import { formatSmsDate, getSmsStatusLabel } from '../../modules/sms.js';

export default function SmsHistoryCard({ logs }) {
  return (
    <div className="smsCard smsHistoryCard">
      <div className="smsCardHeader">
        <div>
          <h3>Historia wysyłek</h3>
          <p>Podgląd prób wysyłki i decyzji dla danego cyklu przeglądu urządzenia.</p>
        </div>
      </div>

      <div className="smsHistoryGridHeader" aria-hidden="true">
        <span>Klient</span>
        <span>Telefon</span>
        <span>Termin</span>
        <span>Cykl</span>
        <span>Data wpisu</span>
        <span>Status</span>
      </div>

      <div className="smsHistoryList">
        {logs.map((log) => {
          const when = log.delivered_at || log.sent_at || log.approved_at || log.created_at;
          const normalizedStatus = String(log.status || '').toLowerCase();
          const statusLabel = getSmsStatusLabel(log.status);
          return (
            <div key={log.id} className="smsHistoryItem">
              <div className="smsHistoryCell smsHistoryClient" data-label="Klient">
                <strong>{log.client || 'Klient'}</strong>
              </div>
              <div className="smsHistoryCell" data-label="Telefon">{log.phone || '—'}</div>
              <div className="smsHistoryCell" data-label="Termin">
                {log.reminder_due_date ? formatSmsDate(log.reminder_due_date) : '—'}
              </div>
              <div className="smsHistoryCell" data-label="Cykl">
                {log.reminder_cycle ? `Cykl ${log.reminder_cycle}` : '—'}
              </div>
              <div className="smsHistoryCell" data-label="Data wpisu">{when ? formatSmsDate(when) : '—'}</div>
              <div className="smsHistoryCell smsHistoryStatusCell" data-label="Status">
                <span className={`smsStatusBadge smsStatus-${normalizedStatus}`}>{statusLabel}</span>
              </div>

              {normalizedStatus === 'error' ? (
                <div className="smsHistoryError smsHistoryErrorWide">Błąd: {log.error_message || 'Nieznany błąd'}</div>
              ) : null}
              {normalizedStatus === 'not_sent' && log.error_message ? (
                <div className="smsHistoryError smsHistoryErrorWide">Powód: {log.error_message}</div>
              ) : null}
            </div>
          );
        })}
        {logs.length === 0 ? <div className="muted">Brak zapisanej historii SMS.</div> : null}
      </div>
    </div>
  );
}
