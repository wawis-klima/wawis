import React from "react";

import { DESKTOP_JOBS_TABLE_COLUMNS } from "./desktop-jobs-table.columns.jsx";

export function DesktopJobsTableColGroup() {
  return (
    <colgroup>
      {DESKTOP_JOBS_TABLE_COLUMNS.map((column) => (
        <col
          key={column.key}
          className={column.colClassName}
          data-column={column.key}
          style={{ width: column.width }}
        />
      ))}
    </colgroup>
  );
}

export default function DesktopJobsTableHeader({ toggleSort, getSortLabel }) {
  return (
    <thead>
      <tr>
        {DESKTOP_JOBS_TABLE_COLUMNS.map((column) => (
          <th key={column.key} className={column.headerClassName} data-column={column.key}>
            {column.sortable ? (
              <button
                type="button"
                className="sortBtn"
                onClick={() => toggleSort(column.sortKey)}
              >
                {getSortLabel(column.sortKey, column.label)}
              </button>
            ) : (
              column.label
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
