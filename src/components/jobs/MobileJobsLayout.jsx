import React from "react";
import { APP_VERSION } from "../../version";
import { IconFilter, IconLogout, IconPlus, IconRefresh, IconUser } from "../ui";
import { getJobAddress, getJobTypeClass, getJobTypeLabel, getViewerNames, renderInitialBadges } from "../../utils/jobHelpers.jsx";
import JobsPagination from "./JobsPagination.jsx";

export default function MobileJobsLayout({
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
  statuses,
  jobs,
  normalizeStatusFn,
  statusButtonConfig,
  desktopStatusFilter,
  setDesktopStatusFilter,
  visibleJobs,
  pagedVisibleJobs,
  jobsPageSize,
  jobsCurrentPage,
  jobsTotalPages,
  setJobsPage,
  selectedJob,
  setSelectedJob,
  formatDate,
  profiles,
}) {
  const jobsPageRows = pagedVisibleJobs || visibleJobs;

  function handleManualReload() {
    if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
      window.location.reload();
      return;
    }
    void refreshAll?.(sessionUser, { preserveJobDetails: false });
  }

  return (
    <>
      <div className="mobileHeaderV2">
        <div className="mobileHeaderTop">
          <div className="mobileVersionTag">WERSJA {APP_VERSION}</div>
          <div className="mobileHeaderActions">
            {isAdmin ? (
              <button className="mobileActionBtn primary" onClick={openAddJob} title="Dodaj">
                <IconPlus />
              </button>
            ) : null}
            <button className="mobileActionBtn" onClick={handleManualReload} title="Przeładuj aplikację" aria-label="Przeładuj aplikację">
              <IconRefresh />
            </button>
            {!isAdmin ? (
              <button className="mobileActionBtn" onClick={logout} title="Wyloguj" aria-label="Wyloguj">
                <IconLogout />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mobileHeaderBottom">
          <div className="mobileFilterBox">
            <IconFilter />
            <input className="mobileFilterInput" placeholder="Filtruj klienta, telefon..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="mobileUserBox mobileUserLogoutButton"
              title={`Wyloguj: ${profile.full_name}`}
              aria-label={`Wyloguj użytkownika ${profile.full_name}`}
              onClick={logout}
            >
              <IconUser />
              <span>{profile.full_name}</span>
            </button>
          ) : (
            <button
              type="button"
              className={`mobileUserBox userToggleBtn ${showAssignedJobsOnly ? "activeUserToggleBtn" : ""}`}
              title={showAssignedJobsOnly ? "Pokaż wszystkie zlecenia" : "Pokaż wszystkie moje zlecenia"}
              onClick={toggleAssignedJobsOnly}
            >
              <IconUser />
              <span>{profile.full_name}</span>
            </button>
          )}
        </div>
        <div className="pushControlRow mobilePushControlRow">{pushControl}</div>
      </div>

      <div className="statusButtonsBar" aria-label="Statusy zleceń">
        {statuses.map((status) => {
          const statusCount = jobs.filter((job) => normalizeStatusFn(job.status) === status).length;
          const config = statusButtonConfig[status];
          return (
            <button
              key={status}
              type="button"
              className={`statusActionButton ${config.buttonClass} ${desktopStatusFilter === status ? "activeStatusActionButton" : ""}`}
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

      <div className="mobileJobList">
        {jobsPageRows.map((job) => (
          <div key={job.id} className={`mobileJobCard ${selectedJob?.id === job.id ? "activeMobileJobCard" : ""}`}>
            <button type="button" className="mobileJobCardButton" onClick={() => setSelectedJob(job)}>
              <div className="mobileJobTop">
                <strong className="mobileJobClient">{job.client || job.title}</strong>
                <span className="mobileJobDate">{job.installation_date ? formatDate(job.installation_date) : "-"}</span>
              </div>
              <div className="mobileJobGrid mobileJobGridSingleField">
                <div className="mobileJobAddressBlock">
                  <span className="mobileJobLabel">Adres</span>
                  <div className="mobileJobValue mobileJobAddressValue">{getJobAddress(job) || "Brak adresu"}</div>
                </div>
                <div className={`jobTypeTag jobTypeTagRight ${getJobTypeClass(job)}`}>{getJobTypeLabel(job)}</div>
              </div>
              <div className="mobileJobFooter">
                <span className="mobileJobLabel"></span>
                <div className="mobileJobBadges">{renderInitialBadges(getViewerNames(job, profiles))}</div>
              </div>
            </button>
          </div>
        ))}
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
