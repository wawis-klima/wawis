import React from "react";
import { APP_VERSION } from "../version";
import { IconFilter, IconLogout, IconPlus, IconRefresh, IconUser } from "./ui";
import { getJobCity, getJobStreet, getJobTypeClass, getJobTypeLabel, getViewerNames, renderInitialBadges } from "../utils/jobHelpers.jsx";

export default function JobsPanel({
  desktopStatusLabels,
  desktopStatusFilter,
  statuses,
  jobs,
  normalizeStatusFn,
  statusButtonConfig,
  setDesktopStatusFilter,
  isAdmin,
  setShowModal,
  refreshAll,
  sessionUser,
  logout,
  query,
  setQuery,
  profile,
  showAssignedJobsOnly,
  toggleAssignedJobsOnly,
  isMobile,
  visibleJobs,
  selectedJob,
  setSelectedJob,
  formatDate,
  toggleSort,
  getSortLabel,
  profiles,
}) {
  return (
    <div className="card premiumCard">
      {isMobile ? (
        <>
        <div className="mobileHeaderV2">
          <div className="mobileHeaderTop">
            <div className="mobileVersionTag">WERSJA {APP_VERSION}</div>
            <div className="mobileHeaderActions">
              {isAdmin ? (
                <button className="mobileActionBtn primary" onClick={() => setShowModal(true)} title="Dodaj">
                  <IconPlus />
                </button>
              ) : null}
              <button className="mobileActionBtn" onClick={() => refreshAll(sessionUser)} title="Odśwież">
                <IconRefresh />
              </button>
              <button className="mobileActionBtn" onClick={logout} title="Wyloguj">
                <IconLogout />
              </button>
            </div>
          </div>

          <div className="mobileHeaderBottom">
            <div className="mobileFilterBox">
              <IconFilter />
              <input className="mobileFilterInput" placeholder="Filtruj..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {isAdmin ? (
              <div className="mobileUserBox" title={profile.full_name}>
                <IconUser />
                <span>{profile.full_name}</span>
              </div>
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
        </>
      ) : (
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
                <button className="desktopActionBtn primary" onClick={() => setShowModal(true)} title="Dodaj">
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
              <input className="desktopFilterInput" placeholder="Filtruj..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
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
      )}

      <div className="tableTitle">{showAssignedJobsOnly && !isAdmin ? "Moje zlecenia" : desktopStatusLabels[desktopStatusFilter]}</div>
      {isMobile ? (
        <div className="mobileJobList">
          {visibleJobs.map((job) => {
            const city = getJobCity(job);
            const street = getJobStreet(job);
            const addressParts = [city, street].filter((part) => part && part !== "-");
            const address = addressParts.length ? addressParts.join(", ") : "-";

            return (
              <button key={job.id} type="button" className={`mobileJobCard ${selectedJob?.id === job.id ? "activeMobileJobCard" : ""}`} onClick={() => setSelectedJob(job)}>
                <div className="mobileJobTop">
                  <strong className="mobileJobClient">{job.client || job.title}</strong>
                  <span className="mobileJobDate">{job.created_at ? formatDate(job.created_at) : "-"}</span>
                </div>
                <div className="mobileJobGrid mobileJobGridSingleField">
                  <div className="mobileJobAddressBlock">
                    <span className="mobileJobLabel">Adres</span>
                    <div className="mobileJobValue">{address}</div>
                  </div>
                  <div className={`jobTypeTag jobTypeTagRight ${getJobTypeClass(job)}`}>{getJobTypeLabel(job)}</div>
                </div>
                <div className="mobileJobFooter">
                  <span className="mobileJobLabel"></span>
                  <div className="mobileJobBadges">{renderInitialBadges(getViewerNames(job, profiles))}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tableWrap">
          <table className="jobTable desktopJobsTable">
            <colgroup>
              <col className="desktopJobsColClient" />
              <col className="desktopJobsColStatus" />
              <col className="desktopJobsColAddress" />
              <col className="desktopJobsColInstallers" />
              <col className="desktopJobsColDate" />
            </colgroup>
            <thead>
              <tr>
                <th><button type="button" className="sortBtn" onClick={() => toggleSort("client")}>{getSortLabel("client", "Klient")}</button></th>
                <th>Status</th>
                <th><button type="button" className="sortBtn" onClick={() => toggleSort("city")}>{getSortLabel("city", "Adres")}</button></th>
                <th>Instalatorzy</th>
                <th><button type="button" className="sortBtn" onClick={() => toggleSort("date")}>{getSortLabel("date", "Data")}</button></th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => {
                const city = getJobCity(job);
                const street = getJobStreet(job);
                const addressParts = [city, street].filter((part) => part && part !== "-");
                const address = addressParts.length ? addressParts.join(", ") : "-";

                return (
                <tr key={job.id} className={selectedJob?.id === job.id ? "activeRow" : ""} onClick={() => setSelectedJob(job)}>
                  <td>
                    <div className="desktopClientCell">
                      <span className="desktopClientName">{job.client || job.title}</span>
                    </div>
                  </td>
                  <td>
                    <div className="desktopStatusCell">
                      <div className={`jobTypeTag desktopJobTypeTag ${getJobTypeClass(job)}`}>{getJobTypeLabel(job)}</div>
                    </div>
                  </td>
                  <td>
                    <div className="desktopAddressValue desktopAddressValueSingleLine">
                      <span className="desktopAddressLine desktopAddressCombined">{address}</span>
                    </div>
                  </td>
                  <td>
                    <div className="desktopInstallersCell">{renderInitialBadges(getViewerNames(job, profiles))}</div>
                  </td>
                  <td className="desktopDateCell">{job.created_at ? formatDate(job.created_at) : "-"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {visibleJobs.length === 0 ? (
        <div className="muted statusTableHint" style={{ marginTop: 12 }}>
          {query.trim() ? "Brak klientów pasujących do wyszukiwania." : showAssignedJobsOnly && !isAdmin ? `Brak przypisanych zleceń dla tego pracownika.` : `Brak klientów w sekcji: ${desktopStatusLabels[desktopStatusFilter]}.`}
        </div>
      ) : null}
    </div>
  );
}