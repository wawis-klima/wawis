import React from "react";

import {
  getJobAddress,
  getJobTypeClass,
  getJobTypeLabel,
  getViewerNames,
  renderInitialBadges,
} from "../utils/jobHelpers.jsx";

function renderClientCell({ job }) {
  return (
    <div className="desktopCellContent desktopClientCellContent">
      <div className="desktopClientCell">
        <span className="desktopClientName">{job.client || job.title}</span>
      </div>
    </div>
  );
}

function renderStatusCell({ job }) {
  return (
    <div className="desktopCellContent desktopStatusCellContent">
      <div className="desktopStatusCell">
        <div className={`jobTypeTag desktopJobTypeTag ${getJobTypeClass(job)}`}>{getJobTypeLabel(job)}</div>
      </div>
    </div>
  );
}

function renderAddressCell({ job }) {
  const address = getJobAddress(job);

  return (
    <div className="desktopCellContent desktopAddressCellContent">
      <div className="desktopAddressValue desktopAddressValueSingleLine">
        <span className="desktopAddressLine desktopAddressCombined">{address || "Brak adresu"}</span>
      </div>
    </div>
  );
}

function renderInstallerCell({ job, profiles }) {
  return (
    <div className="desktopCellContent desktopInstallerCellContent">
      <div className="desktopInstallersCell">{renderInitialBadges(getViewerNames(job, profiles))}</div>
    </div>
  );
}

function renderDateCell({ job, formatDate }) {
  const hasInstallationDate = Boolean(job.installation_date);

  return (
    <div className="desktopCellContent desktopDateCellContent">
      {hasInstallationDate ? (
        <div className="desktopDateCell">{formatDate(job.installation_date)}</div>
      ) : (
        <span className="desktopDateMissingBadge" title="Brak ustawionej daty montażu" aria-label="Brak ustawionej daty montażu">
          <span className="desktopDateMissingDot" aria-hidden="true">!</span>
          Brak daty
        </span>
      )}
    </div>
  );
}

export const DESKTOP_JOBS_TABLE_COLUMNS = [
  {
    key: "client",
    label: "Klient",
    sortable: true,
    sortKey: "client",
    width: "480px",
    textAlign: "left",
    whiteSpace: "normal",
    paddingInlineStart: "16px",
    paddingInlineEnd: "16px",
    contentJustifyContent: "flex-start",
    contentAlignItems: "center",
    contentTextAlign: "left",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "44px",
    colClassName: "desktopJobsColClient",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellClient",
    cellRenderer: renderClientCell,
  },
  {
    key: "status",
    label: "Status",
    sortable: false,
    sortKey: null,
    width: "1%",
    textAlign: "left",
    whiteSpace: "nowrap",
    paddingInlineStart: "4px",
    paddingInlineEnd: "4px",
    contentJustifyContent: "flex-start",
    contentAlignItems: "center",
    contentTextAlign: "left",
    contentWidth: "auto",
    contentMinWidth: "0",
    contentMaxWidth: "max-content",
    contentMinHeight: "36px",
    colClassName: "desktopJobsColStatus",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellStatus",
    cellRenderer: renderStatusCell,
  },
  {
    key: "address",
    label: "Adres",
    sortable: true,
    sortKey: "city",
    width: "auto",
    textAlign: "center",
    whiteSpace: "normal",
    paddingInlineStart: "16px",
    paddingInlineEnd: "16px",
    contentJustifyContent: "center",
    contentAlignItems: "center",
    contentTextAlign: "center",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "36px",
    colClassName: "desktopJobsColAddress",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellAddress",
    cellRenderer: renderAddressCell,
  },
  {
    key: "installer",
    label: "Monter",
    sortable: false,
    sortKey: null,
    width: "132px",
    textAlign: "left",
    whiteSpace: "nowrap",
    paddingInlineStart: "12px",
    paddingInlineEnd: "12px",
    contentJustifyContent: "flex-start",
    contentAlignItems: "center",
    contentTextAlign: "left",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "36px",
    badgesWrap: "nowrap",
    badgesJustifyContent: "flex-start",
    badgesAlignItems: "center",
    badgesGap: "5px",
    badgesRowWidth: "100px",
    badgesRowMinWidth: "100px",
    badgesRowMaxWidth: "100px",
    badgesRowMinHeight: "30px",
    badgeSize: "30px",
    badgeMinSize: "30px",
    badgeFontSize: "11px",
    colClassName: "desktopJobsColInstallers",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellInstaller",
    cellRenderer: renderInstallerCell,
  },
  {
    key: "date",
    label: "Data montażu",
    sortable: true,
    sortKey: "date",
    width: "112px",
    textAlign: "center",
    whiteSpace: "nowrap",
    paddingInlineStart: "6px",
    paddingInlineEnd: "6px",
    contentJustifyContent: "center",
    contentAlignItems: "center",
    contentTextAlign: "center",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "36px",
    colClassName: "desktopJobsColDate",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellDate",
    cellRenderer: renderDateCell,
  },
];

export const DESKTOP_JOBS_TABLE_LAYOUT_VARS = DESKTOP_JOBS_TABLE_COLUMNS.reduce((vars, column) => {
  vars[`--desktop-jobs-col-${column.key}-width`] = column.width || "auto";
  vars[`--desktop-jobs-col-${column.key}-text-align`] = column.textAlign || "left";
  vars[`--desktop-jobs-col-${column.key}-white-space`] = column.whiteSpace || "normal";
  vars[`--desktop-jobs-col-${column.key}-padding-inline-start`] = column.paddingInlineStart || "16px";
  vars[`--desktop-jobs-col-${column.key}-padding-inline-end`] = column.paddingInlineEnd || "16px";
  vars[`--desktop-jobs-col-${column.key}-content-justify-content`] = column.contentJustifyContent || "flex-start";
  vars[`--desktop-jobs-col-${column.key}-content-align-items`] = column.contentAlignItems || "center";
  vars[`--desktop-jobs-col-${column.key}-content-text-align`] = column.contentTextAlign || column.textAlign || "left";
  vars[`--desktop-jobs-col-${column.key}-content-width`] = column.contentWidth || "100%";
  vars[`--desktop-jobs-col-${column.key}-content-min-width`] = column.contentMinWidth || "0";
  vars[`--desktop-jobs-col-${column.key}-content-max-width`] = column.contentMaxWidth || "100%";
  vars[`--desktop-jobs-col-${column.key}-content-min-height`] = column.contentMinHeight || "36px";
  if (column.badgesWrap) vars[`--desktop-jobs-col-${column.key}-badges-wrap`] = column.badgesWrap;
  if (column.badgesJustifyContent) vars[`--desktop-jobs-col-${column.key}-badges-justify-content`] = column.badgesJustifyContent;
  if (column.badgesAlignItems) vars[`--desktop-jobs-col-${column.key}-badges-align-items`] = column.badgesAlignItems;
  if (column.badgesGap) vars[`--desktop-jobs-col-${column.key}-badges-gap`] = column.badgesGap;
  if (column.badgesRowWidth) vars[`--desktop-jobs-col-${column.key}-badges-row-width`] = column.badgesRowWidth;
  if (column.badgesRowMinWidth) vars[`--desktop-jobs-col-${column.key}-badges-row-min-width`] = column.badgesRowMinWidth;
  if (column.badgesRowMaxWidth) vars[`--desktop-jobs-col-${column.key}-badges-row-max-width`] = column.badgesRowMaxWidth;
  if (column.badgesRowMinHeight) vars[`--desktop-jobs-col-${column.key}-badges-row-min-height`] = column.badgesRowMinHeight;
  if (column.badgeSize) vars[`--desktop-jobs-col-${column.key}-badge-size`] = column.badgeSize;
  if (column.badgeMinSize) vars[`--desktop-jobs-col-${column.key}-badge-min-size`] = column.badgeMinSize;
  if (column.badgeFontSize) vars[`--desktop-jobs-col-${column.key}-badge-font-size`] = column.badgeFontSize;
  return vars;
}, {});
