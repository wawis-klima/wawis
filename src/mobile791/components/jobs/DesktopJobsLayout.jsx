import React from "react";
import { APP_VERSION } from "../../version";
import { IconFilter, IconLogout, IconPlus, IconRefresh, IconUser } from "../ui";
import DesktopJobsTableHeader, { DesktopJobsTableColGroup } from "../DesktopJobsTableHeader.jsx";
import DesktopJobsTableRow from "../DesktopJobsTableRow.jsx";
import JobsPagination from "./JobsPagination.jsx";
import { DESKTOP_JOBS_TABLE_LAYOUT_VARS } from "../desktop-jobs-table.columns.jsx";

export default function DesktopJobsLayout({
  statuses,
  jobs,
  normalizeStatusFn,
  statusButtonConfig,
  desktopStatusFilter,
  setDesktopStatusFilter,
  isAdmin,
  openAddJob,
  refreshAll,
  sessionUser,
  logout,
  query,
  setQuery,
  profile,
  showAssignedJobsOnly,
  toggleAssignedJobsOnly,
  pushControl,
  visibleJobs,
  pagedVisibleJobs,
  jobsPageSize,
  jobsCurrentPage,
  jobsTotalPages,
  setJobsPage,
  selectedJob,
  setSelectedJob,
  formatDate,
  toggleSort,
  getSortLabel,
  profiles,
}) {
  const jobsPageRows = pagedVisibleJobs || visibleJobs;

  return (
    <>
      <div className="desktopHeaderV2">
        <div className="desktopHeaderTopRow">
          <div className="desktopStatusInlineWrap">
            <div className="desktopStatusInlineInner">
              {statuses.map((status) => {
                const statusCount = jobs.filter((job) => normalizeStatusFn(job.status) === status).length;
                const config = statusButtonConfig[status];
                return (
                  <button
                    key={status}
                    type="button"
                    className={`statusActionButton desktopInlineStatusButton ${config.buttonClass} ${desktopStatusFilter === status ? "activeStatusActionButton" : ""}`}
                    onClick={() => setDesktopStatusFilter(status)}
                    aria-label={`${status}: ${statusCount}`}
                    title={status}
                  >
                    <span className="statusActionShape">
                      <img className="statusActionImage" src={config.imageSrc} alt="" aria-hidden="true" />
                      <span className={`statusActionBadge statusActionBadge${status.replace(/[^A-Za-z0-9]/g, "")}`} aria-hidden="true">
                        {statusCount}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="desktopHeaderActionsBox">
            <div className="desktopVersionTag">WERSJA {APP_VERSION}</div>
            {isAdmin ? (
              <button className="desktopActionBtn primary" onClick={openAddJob} title="Dodaj">
                <IconPlus />
              </button>
            ) : null}
            <button className="desktopActionBtn" onClick={() => refreshAll(sessionUser)} title="Odśwież">
              <IconRefresh />
            </button>
            <button className="desktopActionBtn" onClick={logout} title="Wyloguj">
              <IconLogout />
            </button>
          </div>
        </div>

        <div className="desktopHeaderBottomRow">
          <div className="desktopFilterBox">
            <IconFilter />
            <input className="desktopFilterInput" placeholder="Filtruj klienta, telefon..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="pushControlRow">{pushControl}</div>
          {isAdmin ? (
            <div className="desktopUserBox" title={profile.full_name}>
              <IconUser />
              <span>{profile.full_name}</span>
            </div>
          ) : (
            <button
              type="button"
              className={`desktopUserBox userToggleBtn ${showAssignedJobsOnly ? "activeUserToggleBtn" : ""}`}
              title={showAssignedJobsOnly ? "Pokaż wszystkie zlecenia" : "Pokaż wszystkie moje zlecenia"}
              onClick={toggleAssignedJobsOnly}
            >
              <IconUser />
              <span>{profile.full_name}</span>
            </button>
          )}
        </div>
      </div>

      <div className="tableWrap">
        <table className="jobTable desktopJobsTable" style={DESKTOP_JOBS_TABLE_LAYOUT_VARS}>
          <DesktopJobsTableColGroup />
          <DesktopJobsTableHeader toggleSort={toggleSort} getSortLabel={getSortLabel} />
          <tbody>
            {jobsPageRows.map((job) => (
              <DesktopJobsTableRow
                key={job.id}
                job={job}
                selected={selectedJob?.id === job.id}
                onSelect={setSelectedJob}
                profiles={profiles}
                formatDate={formatDate}
              />
            ))}
          </tbody>
        </table>
      </div>

      <JobsPagination
        currentPage={jobsCurrentPage}
        totalPages={jobsTotalPages}
        totalRows={visibleJobs.length}
        pageSize={jobsPageSize}
        onPageChange={setJobsPage}
      />
    </>
  );
}
