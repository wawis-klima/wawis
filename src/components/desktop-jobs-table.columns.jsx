import React from "react";

import {
  getJobAddress,
  getJobTypeClass,
  getJobTypeLabel,
  getViewerNames,
  renderInitialBadges,
} from "../utils/jobHelpers.jsx";
import { getJobNameplateVerificationSummary } from "../modules/nameplate-verification.js";

function renderClientCell({ job }) {
  const address = getJobAddress(job);

  return (
    <div className="desktopCellContent desktopClientCellContent">
      <div className="desktopClientCell">
        <span className="desktopClientName">{job.client || job.title}</span>
        <span className="desktopClientAddress">{address || "Brak adresu"}</span>
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


function renderInstallerCell({ job, profiles }) {
  return (
    <div className="desktopCellContent desktopInstallerCellContent">
      <div className="desktopInstallersCell">{renderInitialBadges(getViewerNames(job, profiles))}</div>
    </div>
  );
}

function renderNameplateStatusCell({ job }) {
  const hasCachedOverview = Boolean(job?.detailsLoaded)
    || (Array.isArray(job?.nameplatePhotosMeta) && job.nameplatePhotosMeta.length > 0)
    || (Array.isArray(job?.nameplateVerifications) && job.nameplateVerifications.length > 0);

  if (job?.nameplateOverviewPending && !hasCachedOverview) {
    return (
      <div className="desktopCellContent desktopNameplatesCellContent">
        <span className="desktopNameplateSummaryBadge none" title="Status tabliczek jest pobierany w tle.">
          <span className="desktopNameplateSummaryDot" aria-hidden="true" />
          <span>—</span>
        </span>
      </div>
    );
  }

  const summary = getJobNameplateVerificationSummary(job);
  const className = summary.state === 'approved'
    ? 'approved'
    : (summary.state === 'pending' ? 'pending' : 'none');
  const label = summary.state === 'approved'
    ? 'Potwierdzone'
    : (summary.state === 'pending' ? 'Niepotwierdzone' : 'Brak urządzeń');
  const countLabel = summary.total > 0 ? `${summary.approved}/${summary.total}` : '';
  const title = summary.state === 'approved'
    ? `Wszystkie tabliczki potwierdzone (${summary.approved}/${summary.total}).`
    : (summary.state === 'pending'
      ? `Potwierdzone ${summary.approved} z ${summary.total} tabliczek. Otwórz montaż, aby sprawdzić lub potwierdzić ręcznie brakującą tabliczkę.`
      : 'Brak zapisanych urządzeń lub tabliczek do weryfikacji.');

  return (
    <div className="desktopCellContent desktopNameplatesCellContent">
      <span className={`desktopNameplateSummaryBadge ${className}`} title={title}>
        <span className="desktopNameplateSummaryDot" aria-hidden="true" />
        <span>{label}</span>
        {countLabel ? <small>{countLabel}</small> : null}
      </span>
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
    width: "198px",
    textAlign: "left",
    whiteSpace: "normal",
    paddingInlineStart: "12px",
    paddingInlineEnd: "12px",
    contentJustifyContent: "flex-start",
    contentAlignItems: "center",
    contentTextAlign: "left",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "50px",
    colClassName: "desktopJobsColClient",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellClient",
    cellRenderer: renderClientCell,
  },
  {
    key: "status",
    label: "Status",
    sortable: false,
    sortKey: null,
    width: "128px",
    textAlign: "left",
    whiteSpace: "nowrap",
    paddingInlineStart: "10px",
    paddingInlineEnd: "10px",
    contentJustifyContent: "flex-start",
    contentAlignItems: "center",
    contentTextAlign: "left",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "36px",
    colClassName: "desktopJobsColStatus",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellStatus",
    cellRenderer: renderStatusCell,
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
    key: "nameplates",
    label: "Tabliczki",
    sortable: false,
    sortKey: null,
    width: "146px",
    textAlign: "left",
    whiteSpace: "nowrap",
    paddingInlineStart: "8px",
    paddingInlineEnd: "8px",
    contentJustifyContent: "flex-start",
    contentAlignItems: "center",
    contentTextAlign: "left",
    contentWidth: "100%",
    contentMinWidth: "0",
    contentMaxWidth: "100%",
    contentMinHeight: "36px",
    colClassName: "desktopJobsColNameplates",
    headerClassName: "desktopJobsHeaderCell desktopJobsHeaderCellNameplates",
    cellRenderer: renderNameplateStatusCell,
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
