import React, { useMemo } from 'react';
import { expandSmsHistoryRows, formatSmsDate, getSmsStatusLabel } from '../../modules/sms.js';

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

function Pagination({ currentPage, totalPages, onPageChange, busy }) {
  const pages = useMemo(() => {
    const values = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let page = start; page <= end; page += 1) values.push(page);
    return values;
  }, [currentPage, totalPages]);

  if (!onPageChange || totalPages <= 1) return null;

  return (
    <div className="smsDesktopPagination" aria-label="Paginacja historii SMS">
      <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={busy || currentPage === 1}>‹</button>
      {pages[0] > 1 ? <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(1)} disabled={busy}>1</button> : null}
      {pages[0] > 2 ? <span className="smsDesktopPaginationDots">…</span> : null}
      {pages.map((page) => (
        <button key={page} type="button" className={`smsDesktopPaginationBtn ${page === currentPage ? 'active' : ''}`} onClick={() => onPageChange(page)} disabled={busy}>{page}</button>
      ))}
      {pages[pages.length - 1] < totalPages - 1 ? <span className="smsDesktopPaginationDots">…</span> : null}
      {pages[pages.length - 1] < totalPages ? <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(totalPages)} disabled={busy}>{totalPages}</button> : null}
      <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={busy || currentPage === totalPages}>›</button>
    </div>
  );
}

export default function SmsHistoryCard({ logs, currentPage = 1, pageSize = 50, totalRows = null, onPageChange = null, busy = false }) {
  const historyRows = expandSmsHistoryRows(logs);
  const total = totalRows == null ? historyRows.length : Math.max(0, Number(totalRows) || 0);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, Number(pageSize) || 50)));

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
        {busy && historyRows.length === 0 ? <div className="muted">Ładowanie historii SMS...</div> : null}
        {!busy && historyRows.length === 0 ? <div className="muted">Brak zapisanej historii SMS.</div> : null}
      </div>

      {total > 0 ? (
        <div className="smsDesktopTableFooter">
          <span>
            {Math.min((currentPage - 1) * pageSize + 1, total)}–{Math.min(currentPage * pageSize, total)} z {total}
          </span>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} busy={busy} />
        </div>
      ) : null}
    </div>
  );
}
