import React from 'react';
import { formatSmsDate, getSmsStatusLabel } from '../../modules/sms.js';

export default function SmsHistoryCard({ logs }) {
  return (
    <div className="smsCard">
      <div className="smsCardHeader">
        <div>
          <h3>Historia wysyłek</h3>
          <p>Podgląd prób wysyłki i decyzji dla danego cyklu przeglądu urządzenia.</p>
        </div>
      </div>
      <div className="smsHistoryList">
        {logs.map((log) => {
          const when = log.delivered_at || log.sent_at || log.approved_at || log.created_at;
          const normalizedStatus = String(log.status || '').toLowerCase();
          const statusLabel = normalizedStatus === 'pending_approval' ? 'oczekuje na wysłanie' : getSmsStatusLabel(log.status);
          return (
            <div key={log.id} className="smsHistoryItem">
              <div className="smsHistoryTop">
                <strong>{log.client || 'Klient'}</strong>
                <span className={`smsStatusBadge smsStatus-${normalizedStatus}`}>{statusLabel}</span>
              </div>
              <div className="muted">
                {[log.phone, log.reminder_due_date ? `Termin: ${formatSmsDate(log.reminder_due_date)}` : '', log.reminder_cycle ? `Cykl ${log.reminder_cycle}` : '', formatSmsDate(when)].filter(Boolean).join(' · ')}
              </div>
              {normalizedStatus === 'error' ? (
                <div className="smsHistoryError">Błąd: {log.error_message || 'Nieznany błąd'}</div>
              ) : null}
              {normalizedStatus === 'not_sent' && log.error_message ? (
                <div className="smsHistoryError">Powód: {log.error_message}</div>
              ) : null}
            </div>
          );
        })}
        {logs.length === 0 ? <div className="muted">Brak zapisanej historii SMS.</div> : null}
      </div>
    </div>
  );
}
