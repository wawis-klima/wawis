import React from "react";

import { DESKTOP_JOBS_TABLE_COLUMNS } from "./desktop-jobs-table.columns.jsx";

export default function DesktopJobsTableRow({
  job,
  selected,
  onSelect,
  profiles,
  formatDate,
}) {
  const renderContext = {
    job,
    profiles,
    formatDate,
  };

  return (
    <tr className={selected ? "activeRow" : ""} onClick={() => onSelect(job)}>
      {DESKTOP_JOBS_TABLE_COLUMNS.map((column) => (
        <td key={column.key} className={column.cellClassName || undefined} data-column={column.key}>
          {column.cellRenderer(renderContext)}
        </td>
      ))}
    </tr>
  );
}
