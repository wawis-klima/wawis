import React, { useMemo } from "react";

export default function JobsPagination({ currentPage, totalPages, totalRows, pageSize, onPageChange }) {
  const pages = useMemo(() => {
    const values = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let page = start; page <= end; page += 1) values.push(page);
    return values;
  }, [currentPage, totalPages]);

  if (totalRows <= pageSize || totalPages <= 1) return null;

  const pageStart = (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(totalRows, currentPage * pageSize);

  return (
    <div className="jobsPaginationFooter">
      <div className="jobsPaginationSummary">
        {pageStart}–{pageEnd} z {totalRows} zleceń
      </div>
      <div className="jobsPagination" aria-label="Paginacja zleceń montażu">
        <button
          type="button"
          className="jobsPaginationBtn"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Poprzednia strona zleceń"
        >
          ‹
        </button>
        {pages[0] > 1 ? (
          <button type="button" className="jobsPaginationBtn" onClick={() => onPageChange(1)}>
            1
          </button>
        ) : null}
        {pages[0] > 2 ? <span className="jobsPaginationDots">…</span> : null}
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={`jobsPaginationBtn ${page === currentPage ? "active" : ""}`}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages - 1 ? <span className="jobsPaginationDots">…</span> : null}
        {pages[pages.length - 1] < totalPages ? (
          <button type="button" className="jobsPaginationBtn" onClick={() => onPageChange(totalPages)}>
            {totalPages}
          </button>
        ) : null}
        <button
          type="button"
          className="jobsPaginationBtn"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="Następna strona zleceń"
        >
          ›
        </button>
      </div>
    </div>
  );
}
