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
    <div className="smsDesktopPagination" aria-label="Paginacja listy SMS">
      <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>‹</button>
      {pages[0] > 1 ? <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(1)}>1</button> : null}
      {pages[0] > 2 ? <span className="smsDesktopPaginationDots">…</span> : null}
      {pages.map((page) => (
        <button key={page} type="button" className={`smsDesktopPaginationBtn ${page === currentPage ? 'active' : ''}`} onClick={() => onPageChange(page)}>{page}</button>
      ))}
      {pages[pages.length - 1] < totalPages - 1 ? <span className="smsDesktopPaginationDots">…</span> : null}
      {pages[pages.length - 1] < totalPages ? <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(totalPages)}>{totalPages}</button> : null}
      <button type="button" className="smsDesktopPaginationBtn" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>›</button>
    </div>
  );
}

export default function SmsQueueTable({ rows, pageRows, currentPage, totalPages, totalRows, selectedIds, onToggleOne, onToggleAll, onSendSelected, onDeleteSelected, sendBusy, autoRefreshBusy, selectedClientKey, onSelectClient, onSelectDevice, onPageChange }) {
  const selectableRows = rows.filter((job) => job.canSelect);
  const allChecked = selectableRows.length > 0 && selectableRows.every((job) => selectedIds.includes(job.selectionKey));

  return (
    <section className="smsDesktopTableCard">
      {selectedIds.length > 0 ? (
        <div className="smsDesktopSelectionBar">
          <span>Zaznaczono {selectedIds.length} pozycji.</span>
          <div>
            <button type="button" className="smsDesktopGhostBtn" disabled={sendBusy} onClick={onDeleteSelected}>{sendBusy ? 'Usuwanie…' : 'Usuń zaznaczone'}</button>
            <button type="button" className="smsDesktopPrimaryBtn" disabled={sendBusy} onClick={onSendSelected}>{sendBusy ? 'Wysyłanie…' : 'Wyślij zaznaczone'}</button>
          </div>
        </div>
      ) : null}

      <div className="tableWrap smsDesktopTableWrap">
        <table className="smsDesktopTable smsDesktopTableCompact smsDesktopTableQueue">
          <colgroup>
            <col className="smsDesktopColCheckbox" />
            <col className="smsDesktopColClientWide" />
            <col className="smsDesktopColModel" />
            <col className="smsDesktopColSerial" />
            <col className="smsDesktopColStatus" />
          </colgroup>
          <thead>
            <tr>
              <th className="smsDesktopCheckboxCol">
                <input type="checkbox" checked={allChecked} onChange={(event) => onToggleAll(event.target.checked)} aria-label="Zaznacz wszystkie pozycje" />
              </th>
              <th>KLIENT</th>
              <th>MODEL URZĄDZENIA</th>
              <th>NUMER SERYJNY</th>
              <th>STATUS SMS</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const checked = row.canSelect ? selectedIds.includes(row.selectionKey) : false;
              const isSelected = selectedClientKey === row.selectionKey;
              return (
                <tr key={row.key} className={isSelected ? 'smsDesktopRowSelected' : ''}>
                  <td className="smsDesktopCheckboxCol">
                    {row.canSelect ? <input type="checkbox" checked={checked} onChange={() => onToggleOne(row.selectionKey)} aria-label={`Zaznacz ${row.client}`} /> : null}
                  </td>
                  <td>
                    <button type="button" className={`smsDesktopClientButton smsClientLink ${isSelected ? 'active' : ''}`} onClick={() => onSelectClient?.(row)}>
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
                    <button type="button" className="smsDesktopSerialButton smsDesktopSerialCell" onClick={() => onSelectDevice?.(row)}>
                      {row.serial_number || '—'}
                    </button>
                  </td>
                  <td>
                    <span className={`smsDesktopStatusBadge tone-${row.statusTone}`}>{row.statusLabel}</span>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="smsDesktopEmptyState">Brak klientów gotowych do obsługi SMS.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="smsDesktopTableFooter">
        <div>{autoRefreshBusy ? 'Odświeżanie listy…' : `1–${Math.min(totalRows, currentPage * 10)} z ${totalRows}`}</div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </section>
  );
}
