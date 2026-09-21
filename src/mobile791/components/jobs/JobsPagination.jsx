import React, { useMemo } from "react";
import MOBILE_JOBS_PAGINATION_V999_CSS from "./mobile-jobs-pagination-v999.css.js";

export default function JobsPagination({ currentPage, totalPages, totalRows, pageSize, onPageChange }) {
  const pages = useMemo(() => {
    const values = [];
    let start = Math.max(1, currentPage - 1);
    let end = Math.min(totalPages, currentPage + 1);
    if (currentPage <= 2) end = Math.min(totalPages, 3);
    if (currentPage >= totalPages - 1) start = Math.max(1, totalPages - 2);
    for (let page = start; page <= end; page += 1) values.push(page);
    return values;
  }, [currentPage, totalPages]);

  if (totalRows <= pageSize || totalPages <= 1) return null;

  const pageStart = (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(totalRows, currentPage * pageSize);

  return (
    <div className="jobsPaginationFooter jobsPaginationFooterV999" data-pagination-layout="9.99">
      <style>{MOBILE_JOBS_PAGINATION_V999_CSS}</style>
      <div className="jobsPaginationSummary">
        {pageStart}–{pageEnd} z {totalRows} zleceń
      </div>
      <div className="jobsPagination jobsPaginationV999" aria-label="Paginacja zleceń montażu">
        <button
          type="button"
          className="jobsPaginationBtn jobsPaginationBtnV999"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Poprzednia strona zleceń"
        >
          ‹
        </button>
        {pages[0] > 1 ? (
          <button type="button" className="jobsPaginationBtn jobsPaginationBtnV999" onClick={() => onPageChange(1)}>
            1
          </button>
        ) : null}
        {pages[0] > 2 ? <span className="jobsPaginationDots jobsPaginationDotsV999">…</span> : null}
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={`jobsPaginationBtn jobsPaginationBtnV999 ${page === currentPage ? "active" : ""}`}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages - 1 ? <span className="jobsPaginationDots jobsPaginationDotsV999">…</span> : null}
        {pages[pages.length - 1] < totalPages ? (
          <button type="button" className="jobsPaginationBtn jobsPaginationBtnV999" onClick={() => onPageChange(totalPages)}>
            {totalPages}
          </button>
        ) : null}
        <button
          type="button"
          className="jobsPaginationBtn jobsPaginationBtnV999"
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
