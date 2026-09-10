import React, { useMemo } from 'react';

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = useMemo(() => {
    const values = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let page = start; page <= end; page += 1) values.push(page);
    return values;
  }, [currentPage, totalPages]);

  return (
    <div className="smsDesktopPagination" aria-label="Paginacja historii SMS">
      <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>‹</button>
      {pages.map((page) => (
        <button key={page} type="button" className={`smsDesktopPaginationBtn ${page === currentPage ? 'active' : ''}`} onClick={() => onPageChange(page)}>{page}</button>
      ))}
      <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>›</button>
    </div>
  );
}

export default function SmsSentThisMonthCard({ rows, pageRows, currentPage, totalPages, totalRows, onPageChange, onSelectLog, onSelectDevice }) {
  return (
    <section className="smsDesktopTableCard">
      <div className="tableWrap smsDesktopTableWrap">
        <table className="smsDesktopTable smsDesktopTableCompact smsDesktopTableSent">
          <colgroup>
            <col className="smsDesktopColClientWide" />
            <col className="smsDesktopColModel" />
            <col className="smsDesktopColSerial" />
            <col className="smsDesktopColDate" />
            <col className="smsDesktopColStatus" />
          </colgroup>
          <thead>
            <tr>
              <th>KLIENT</th>
              <th>MODEL URZĄDZENIA</th>
              <th>NUMER SERYJNY</th>
              <th>DATA WYSYŁKI</th>
              <th>STATUS SMS</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.key}>
                <td>
                  <button type="button" className="smsDesktopClientButton smsClientLink" onClick={() => onSelectLog?.(row)}>
                    <strong>{row.client}</strong>
                    {row.addressLine ? <span>{row.addressLine}</span> : null}
                  </button>
                </td>
                <td>
                  <div className="smsDesktopModelCell">
                    <strong>{row.model}</strong>
                    <span>{row.modelMeta}</span>
                  </div>
                </td>
                <td>
                  <button type="button" className="smsDesktopSerialButton smsDesktopSerialCell" onClick={() => onSelectDevice?.(row.linkedTarget || row)}>
                    {row.serial_number || '—'}
                  </button>
                </td>
                <td>
                  <div className="smsDesktopDateCell">
                    <strong>{row.formattedSentAt}</strong>
                    {row.relativeDateLabel ? <span>{row.relativeDateLabel}</span> : null}
                  </div>
                </td>
                <td><span className={`smsDesktopStatusBadge tone-${row.statusTone}`}>{row.statusLabel}</span></td>
              </tr>
            ))}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="smsDesktopEmptyState">Brak wysłanych przypomnień w tym miesiącu.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="smsDesktopTableFooter">
        <div>1–{Math.min(totalRows, currentPage * 10)} z {totalRows}</div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </section>
  );
}
