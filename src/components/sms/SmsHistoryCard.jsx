import React from 'react';
import { formatSmsDate, getSmsStatusLabel } from '../../modules/sms.js';

function formatSmsHistoryError(value) {
  const text = String(value || '').trim();
  if (!text) return 'Nieznany błąd';

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const statusName = String(parsed?.status_name || '').trim().toUpperCase();
      const status = String(parsed?.status || '').trim();
      if (statusName === 'UNDELIVERED' || status === '405') {
        return `SMSAPI: wiadomość niedostarczona${status ? ` (kod ${status})` : ''}.`;
      }
      if (statusName) return `SMSAPI: ${statusName}${status ? ` (kod ${status})` : ''}.`;
    } catch {
      // Starszy wpis może nie być poprawnym JSON-em — wtedy pokaż jego tekst.
    }
  }

  return text;
}

function getHistoryEventTime(log = {}) {
  const value = log.delivered_at || log.sent_at || log.approved_at || log.created_at || '';
  const parsed = value ? Date.parse(String(value)) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function expandSmsHistoryRows(logs = []) {
  const seen = new Set();
  const rows = [];

  for (const grouped of logs || []) {
    const attempts = Array.isArray(grouped?.grouped_logs) && grouped.grouped_logs.length
      ? grouped.grouped_logs
      : [grouped];

    for (const attempt of attempts) {
      const id = String(attempt?.id || '').trim();
      const fallbackKey = [attempt?.provider_message_id, attempt?.created_at, attempt?.phone, attempt?.status].map((value) => String(value || '')).join('|');
      const key = id || fallbackKey;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(attempt);
    }
  }

  return rows.sort((left, right) => getHistoryEventTime(right) - getHistoryEventTime(left));
}

export default function SmsHistoryCard({ logs }) {
  const historyRows = expandSmsHistoryRows(logs);

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
        {historyRows.map((log) => {
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
                <div className="smsHistoryError smsHistoryErrorWide">Błąd: {formatSmsHistoryError(log.error_message)}</div>
              ) : null}
              {normalizedStatus === 'not_sent' && log.error_message ? (
                <div className="smsHistoryError smsHistoryErrorWide">Powód: {log.error_message}</div>
              ) : null}
            </div>
          );
        })}
        {historyRows.length === 0 ? <div className="muted">Brak zapisanej historii SMS.</div> : null}
      </div>
    </div>
  );
}
