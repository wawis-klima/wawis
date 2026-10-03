import React, { useMemo } from 'react';

function Pagination({ currentPage, totalPages, onPageChange }) {
  const pages = useMemo(() => {
    const values = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let page = start; page <= end; page += 1) values.push(page);
    return values;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <div className="smsDesktopPagination" aria-label="Paginacja niewysłanych SMS">
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

export default function SmsUnsentCard({
  rows,
  pageRows,
  currentPage,
  totalPages,
  totalRows,
  selectedIds,
  onToggleOne,
  onToggleAll,
  onSendSelected,
  onDeleteSelected,
  onSendNow,
  onDeleteNow,
  sendBusy,
  onPageChange,
  onSelectLog,
  onSelectDevice,
}) {
  const selectableRows = rows.filter((row) => row.canDelete);
  const selectedRows = rows.filter((row) => selectedIds.includes(row.selectionKey));
  const selectedSendableCount = selectedRows.filter((row) => row.canSend).length;
  const allChecked = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.selectionKey));

  return (
    <section className="smsDesktopTableCard">
      {selectedIds.length > 0 ? (
        <div className="smsDesktopSelectionBar">
          <span>Zaznaczono {selectedIds.length} niewysłanych wiadomości.</span>
          <div>
            <button type="button" className="smsDesktopGhostBtn" disabled={sendBusy} onClick={onDeleteSelected}>
              Usuń zaznaczone
            </button>
            <button type="button" className="smsDesktopPrimaryBtn" disabled={sendBusy || selectedSendableCount === 0} onClick={onSendSelected}>
              {sendBusy ? 'Wysyłanie…' : 'Wyślij zaznaczone'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="tableWrap smsDesktopTableWrap">
        <table className="smsDesktopTable smsDesktopTableCompact">
          <colgroup>
            <col className="smsDesktopColCheckbox" />
            <col className="smsDesktopColClientWide" />
            <col className="smsDesktopColModel" />
            <col className="smsDesktopColDate" />
            <col className="smsDesktopColStatus" />
            <col className="smsDesktopColStatus" />
          </colgroup>
          <thead>
            <tr>
              <th className="smsDesktopCheckboxCol">
                <input type="checkbox" checked={allChecked} onChange={(event) => onToggleAll(event.target.checked)} aria-label="Zaznacz wszystkie niewysłane SMS-y" />
              </th>
              <th>KLIENT</th>
              <th>URZĄDZENIE</th>
              <th>TERMIN</th>
              <th>POWÓD</th>
              <th>AKCJA</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const checked = row.canDelete ? selectedIds.includes(row.selectionKey) : false;
              return (
                <tr key={row.key}>
                  <td className="smsDesktopCheckboxCol">
                    {row.canDelete ? <input type="checkbox" checked={checked} onChange={() => onToggleOne(row.selectionKey)} aria-label={`Zaznacz ${row.client}`} /> : null}
                  </td>
                  <td>
                    <button type="button" className="smsDesktopClientButton smsClientLink" onClick={() => onSelectLog?.(row)}>
                      <strong>{row.client}</strong>
                      {row.addressLine ? <span>{row.addressLine}</span> : null}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="smsDesktopSerialButton smsDesktopSerialCell" onClick={() => onSelectDevice?.(row.linkedTarget || row)}>
                      <strong>{row.model}</strong>
                      <span>{row.serial_number || '—'}</span>
                    </button>
                  </td>
                  <td>
                    <div className="smsDesktopDateCell">
                      <strong>{row.formattedDueDate}</strong>
                      {row.cycleLabel ? <span>{row.cycleLabel}</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="smsDesktopModelCell">
                      <strong>{row.statusLabel || 'Niewysłano'}</strong>
                      <span>{row.reason || 'Przekroczono okno wysyłki.'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="smsDesktopRowActions">
                      <button type="button" className="smsDesktopGhostBtn" disabled={sendBusy || !row.canDelete} onClick={() => onDeleteNow?.(row)}>
                        Usuń
                      </button>
                      <button type="button" className="smsDesktopPrimaryBtn" disabled={sendBusy || !row.canSend} onClick={() => onSendNow?.(row)}>
                        {sendBusy ? 'Wysyłanie…' : row.status === 'pending_approval' ? 'Zatwierdź i wyślij' : 'Wyślij ponownie'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="smsDesktopEmptyState">Brak niewysłanych przypomnień.</td>
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
