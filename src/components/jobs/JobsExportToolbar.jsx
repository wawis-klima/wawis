import React from "react";

export default function JobsExportToolbar({
  statuses,
  exportScope,
  setExportScope,
  exportStatuses,
  toggleExportStatus,
  exportBusy,
  exportSummary,
  exportCount,
  exportError,
  onExportExcel,
  onExportPdf,
}) {
  const statusesMode = exportScope === "statuses";
  const noStatusesSelected = statusesMode && exportStatuses.length === 0;
  const exportDisabled = exportBusy || exportCount === 0 || noStatusesSelected;

  return (
    <section className="jobsExportPanel" aria-label="Eksport zleceń">
      <div className="jobsExportTopRow">
        <div className="jobsExportMeta">
          <div className="jobsExportTitle">Eksport zleceń</div>
          <div className="jobsExportSubtitle">
            Tryb <strong>{exportSummary.modeLabel}</strong> — {exportSummary.modeDescription}
          </div>
        </div>

        <div className="jobsExportActions">
          <button type="button" className="btn premiumActionBtn exportActionBtn" onClick={onExportExcel} disabled={exportDisabled}>
            {exportBusy ? "Przygotowywanie..." : `Excel ${exportSummary.modeLabel === "pełny" ? "(pełny)" : "(skrót)"}`}
          </button>
          <button type="button" className="btn premiumActionBtn exportActionBtn" onClick={onExportPdf} disabled={exportDisabled}>
            {exportBusy ? "Przygotowywanie..." : `PDF ${exportSummary.modeLabel === "pełny" ? "(pełny)" : "(skrót)"}`}
          </button>
        </div>
      </div>

      <div className="jobsExportControls">
        <label className="jobsExportField">
          <span>Zakres eksportu</span>
          <select className="input jobsExportSelect" value={exportScope} onChange={(event) => setExportScope(event.target.value)} disabled={exportBusy}>
            <option value="all">Wszystkie zlecenia</option>
            <option value="visible">Tylko widoczne</option>
            <option value="statuses">Tylko wybrane statusy</option>
          </select>
        </label>

        <div className="jobsExportHint">
          <strong>{exportSummary.rangeText}</strong>
          <span>Liczba rekordów do eksportu: {exportCount}</span>
          {statusesMode ? <span>Statusy: {exportSummary.statusText}</span> : <span>Statusy: {exportSummary.statusText}</span>}
        </div>
      </div>

      {statusesMode ? (
        <div className="jobsExportStatusChips" role="group" aria-label="Statusy do eksportu">
          {statuses.map((status) => {
            const active = exportStatuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={`jobsExportStatusChip ${active ? "active" : ""}`}
                onClick={() => toggleExportStatus(status)}
                disabled={exportBusy}
              >
                {status}
              </button>
            );
          })}
        </div>
      ) : null}

      {noStatusesSelected ? <div className="muted jobsExportNote">Wybierz przynajmniej jeden status do eksportu.</div> : null}
      {exportCount === 0 ? <div className="muted jobsExportNote">Brak zleceń spełniających wybrany zakres eksportu.</div> : null}
      {exportError ? <div className="errorBox jobsExportError">{exportError}</div> : null}
    </section>
  );
}
