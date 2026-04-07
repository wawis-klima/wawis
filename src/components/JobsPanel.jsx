import React, { useEffect, useMemo, useRef, useState } from "react";
import { APP_VERSION } from "../version";
import { IconFilter, IconLogout, IconPlus, IconRefresh, IconUser } from "./ui";
import { getJobCity, getJobStreet, getJobTypeClass, getJobTypeLabel, getViewerNames, renderInitialBadges } from "../utils/jobHelpers.jsx";

const DESKTOP_COLUMN_DEFAULTS = {
  client: 280,
  status: 160,
  address: 320,
  installers: 170,
  date: 130,
};

const DESKTOP_COLUMN_MIN = {
  client: 180,
  status: 120,
  address: 220,
  installers: 130,
  date: 110,
};

const DESKTOP_COLUMN_STORAGE_KEY = "klima-desktop-column-widths";

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
  const [desktopColumnWidths, setDesktopColumnWidths] = useState(() => {
    if (typeof window === "undefined") return DESKTOP_COLUMN_DEFAULTS;
    try {
      const raw = window.localStorage.getItem(DESKTOP_COLUMN_STORAGE_KEY);
      if (!raw) return DESKTOP_COLUMN_DEFAULTS;
      const parsed = JSON.parse(raw);
      return {
        client: Math.max(DESKTOP_COLUMN_MIN.client, Number(parsed.client) || DESKTOP_COLUMN_DEFAULTS.client),
        status: Math.max(DESKTOP_COLUMN_MIN.status, Number(parsed.status) || DESKTOP_COLUMN_DEFAULTS.status),
        address: Math.max(DESKTOP_COLUMN_MIN.address, Number(parsed.address) || DESKTOP_COLUMN_DEFAULTS.address),
        installers: Math.max(DESKTOP_COLUMN_MIN.installers, Number(parsed.installers) || DESKTOP_COLUMN_DEFAULTS.installers),
        date: Math.max(DESKTOP_COLUMN_MIN.date, Number(parsed.date) || DESKTOP_COLUMN_DEFAULTS.date),
      };
    } catch {
      return DESKTOP_COLUMN_DEFAULTS;
    }
  });

  const resizeStateRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DESKTOP_COLUMN_STORAGE_KEY, JSON.stringify(desktopColumnWidths));
  }, [desktopColumnWidths]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      setDesktopColumnWidths((prev) => ({
        ...prev,
        [resizeState.columnKey]: Math.max(DESKTOP_COLUMN_MIN[resizeState.columnKey], nextWidth),
      }));
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      if (typeof document !== "undefined") {
        document.body.classList.remove("columnResizeActive");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const desktopTableWidth = useMemo(
    () => Object.values(desktopColumnWidths).reduce((sum, value) => sum + value, 0),
    [desktopColumnWidths]
  );

  function beginColumnResize(columnKey, event) {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      columnKey,
      startX: event.clientX,
      startWidth: desktopColumnWidths[columnKey],
    };
    if (typeof document !== "undefined") {
      document.body.classList.add("columnResizeActive");
    }
  }

  function resetDesktopColumns() {
    setDesktopColumnWidths(DESKTOP_COLUMN_DEFAULTS);
  }

  const desktopHeaders = [
    { key: "client", label: getSortLabel("client", "Klient"), sortable: true, sortField: "client" },
    { key: "status", label: "Status", sortable: false },
    { key: "address", label: getSortLabel("city", "Adres"), sortable: true, sortField: "city" },
    { key: "installers", label: "Instalator", sortable: false },
    { key: "date", label: getSortLabel("date", "Data"), sortable: true, sortField: "date" },
  ];

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
        <div className="tableWrap desktopResizableTableWrap">
          <div className="desktopTableActionsRow">
            <span className="desktopTableResizeHint">Przeciągnij pionowe kreski w nagłówkach, aby zmienić szerokość kolumn.</span>
            <button type="button" className="desktopTableResetBtn" onClick={resetDesktopColumns}>Przywróć szerokości</button>
          </div>
          <table className="jobTable desktopJobsTable" style={{ width: `${desktopTableWidth}px`, minWidth: `${desktopTableWidth}px` }}>
            <colgroup>
              <col className="desktopJobsColClient" style={{ width: `${desktopColumnWidths.client}px` }} />
              <col className="desktopJobsColStatus" style={{ width: `${desktopColumnWidths.status}px` }} />
              <col className="desktopJobsColAddress" style={{ width: `${desktopColumnWidths.address}px` }} />
              <col className="desktopJobsColInstallers" style={{ width: `${desktopColumnWidths.installers}px` }} />
              <col className="desktopJobsColDate" style={{ width: `${desktopColumnWidths.date}px` }} />
            </colgroup>
            <thead>
              <tr>
                {desktopHeaders.map((header) => (
                  <th key={header.key} className="desktopResizableHeaderCell">
                    {header.sortable ? (
                      <button type="button" className="sortBtn" onClick={() => toggleSort(header.sortField)}>{header.label}</button>
                    ) : (
                      <span className="desktopHeaderLabel">{header.label}</span>
                    )}
                    {header.key !== "date" ? (
                      <button
                        type="button"
                        className="columnResizeHandle"
                        onMouseDown={(event) => beginColumnResize(header.key, event)}
                        aria-label={`Zmień szerokość kolumny ${header.label}`}
                        title={`Zmień szerokość kolumny ${header.label}`}
                      >
                        <span className="columnResizeHandleLine" />
                      </button>
                    ) : null}
                  </th>
                ))}
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