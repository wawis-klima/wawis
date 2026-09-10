import React, { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "../../version";
import { IconFilter, IconPlus, IconRefresh } from "../ui";
import { getJobAddress, getJobTypeClass, getJobTypeLabel, getViewerNames, renderInitialBadges } from "../../utils/jobHelpers.jsx";
import JobsPagination from "./JobsPagination.jsx";
import PhotoSyncStatus from "../PhotoSyncStatus.jsx";

function getProfileInitials(profile) {
  const fullName = String(profile?.full_name || "").trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
  }
  const email = String(profile?.email || "").trim();
  return email ? email.slice(0, 2).toUpperCase() : "U";
}

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
  photoSyncStatus,
  retryPhotoUpload,
  retryAllPhotoUploads,
  retryOfflineOperation,
  discardOfflineOperation,
  discardQueuedPhoto,
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
  const [filterOpen, setFilterOpen] = useState(Boolean(query));
  const filterInputRef = useRef(null);

  useEffect(() => {
    if (query) setFilterOpen(true);
  }, [query]);

  useEffect(() => {
    if (!filterOpen) return;
    const timer = window.setTimeout(() => filterInputRef.current?.focus?.(), 40);
    return () => window.clearTimeout(timer);
  }, [filterOpen]);

  async function handleManualReload() {
    const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    if (isOnline) {
      // Najpierw zawsze odświeżamy listę montaży. Kolejka zdjęć nie może
      // blokować pojawienia się zlecenia dodanego na innym urządzeniu.
      await refreshAll?.(sessionUser, { preserveJobDetails: true });
      void retryAllPhotoUploads?.();
      return;
    }
    await retryAllPhotoUploads?.();
  }

  function toggleFilter() {
    if (filterOpen && !query) {
      setFilterOpen(false);
      return;
    }
    setFilterOpen(true);
  }

  return (
    <>
      <div className={`mobileHeaderV2 wawisCompactHeader ${isAdmin ? "wawisCompactHeaderAdmin mobileHeaderAdmin" : "wawisCompactHeaderWorker mobileHeaderWorker"}`}>
        <div className={`wawisOneLineToolbar ${isAdmin ? "isAdmin" : "isWorker"}`}>
          <div className="mobileVersionTag wawisOneLineVersion" title={`Wersja ${APP_VERSION}`}>v{APP_VERSION}</div>

          <button
            className="mobileActionBtn primary wawisOneLineAction"
            onClick={openAddJob}
            title={isAdmin ? "Dodaj zlecenie" : "Dodaj nowego klienta"}
            aria-label={isAdmin ? "Dodaj zlecenie" : "Dodaj nowego klienta"}
          >
            <IconPlus />
          </button>

          <button className="mobileActionBtn wawisOneLineAction" onClick={handleManualReload} title="Synchronizuj dane" aria-label="Synchronizuj dane">
            <IconRefresh />
          </button>

          <div className="wawisOneLinePushSlot" aria-label="Powiadomienia push">{pushControl}</div>

          <button
            type="button"
            className={`wawisOneLineFilterButton ${filterOpen || query ? "active" : ""}`}
            title="Filtruj zlecenia"
            aria-label="Filtruj zlecenia"
            aria-expanded={filterOpen}
            onClick={toggleFilter}
          >
            <IconFilter />
          </button>

          <button
            type="button"
            className="wawisUserInitialsBadge"
            title={`Wyloguj: ${profile.full_name}`}
            aria-label={`Wyloguj użytkownika ${profile.full_name}`}
            onClick={logout}
          >
            {getProfileInitials(profile)}
          </button>
        </div>

        {filterOpen ? (
          <div className="wawisCompactFilterExpanded">
            <IconFilter />
            <input
              ref={filterInputRef}
              className="mobileFilterInput"
              placeholder="Klient, telefon lub adres..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Filtruj klienta, telefon lub adres"
            />
            <button
              type="button"
              className="wawisCompactFilterClose"
              onClick={() => {
                setQuery("");
                setFilterOpen(false);
              }}
              aria-label="Zamknij filtr"
              title="Zamknij filtr"
            >
              ×
            </button>
          </div>
        ) : null}

        {!isAdmin ? (
          <PhotoSyncStatus
            status={photoSyncStatus}
            jobs={jobs}
            onRetryPhoto={retryPhotoUpload}
            onRetryAll={retryAllPhotoUploads}
            onRetryOperation={retryOfflineOperation}
            onDiscardOperation={discardOfflineOperation}
            onDiscardPhoto={discardQueuedPhoto}
            onOpenJob={(jobId) => {
              const targetJob = jobs.find((job) => String(job?.id || "") === String(jobId || ""));
              if (targetJob) setSelectedJob(targetJob);
            }}
          />
        ) : null}
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
