import React from "react";
import ModuleSwitcher from "./ModuleSwitcher.jsx";
import AdminDesktopShell from "./AdminDesktopShell.jsx";

export default function AppAuthenticatedLayout({
  isMobile,
  isAdmin,
  showAssignedJobsOnly,
  desktopStatusFilter,
  desktopStatusLabels,
  errorMsg,
  isRefreshingData = false,
  activeModule,
  activeNavKey,
  setActiveModule,
  onDesktopNavigate,
  jobsPanel,
  detailsPanel,
  smsDueTodayCount = 0,
  profile = null,
  logout = () => {},
}) {
  const content = (
    <>
      {isRefreshingData ? (
        <div className="appDataRefreshStatus" role="status" aria-live="polite">
          <span className="appDataRefreshSpinner" aria-hidden="true" />
          <span>Odświeżanie</span>
        </div>
      ) : null}

      {isMobile ? (
        <div className="summary premiumSummary">
          <div>
            <div className="summaryHeader">
              <h1>{activeModule === 'fuel' ? 'Tankowania' : 'Podsumowanie montaży'}</h1>
            </div>
            {activeModule === 'fuel' ? null : <p>
              {!isAdmin && showAssignedJobsOnly
                ? "Na dole masz jedną tabelę wszystkich Twoich przypisanych zleceń. Kliknięcie w Twoje imię i nazwisko wraca do pełnej listy."
                : `Na dole masz tabelę dla sekcji: ${desktopStatusLabels[desktopStatusFilter]}. Kliknięcie w kafelek zmienia widok tabeli.`}
            </p>}
          </div>
        </div>
      ) : null}

      {isMobile ? (
        <div className="moduleSwitcherWrap">
          <ModuleSwitcher activeModule={activeModule} setActiveModule={setActiveModule} isAdmin={isAdmin} />
        </div>
      ) : null}

      {errorMsg ? <div className="errorBox">{errorMsg}</div> : null}

      <div className={`twoCol twoColDesktopStatusLeft ${["sms", "contractors", "devices", "calendar", "diagnostics", "fuel"].includes(activeModule) ? "singleModuleColumn" : ""}`}>
        <div>{jobsPanel}</div>
        {detailsPanel ? <div className="desktopDetailColumnTight">{detailsPanel}</div> : null}
      </div>
    </>
  );

  if (!isMobile && isAdmin) {
    return (
      <AdminDesktopShell activeModule={activeModule} activeNavKey={activeNavKey} setActiveModule={setActiveModule} onNavigate={onDesktopNavigate} profile={profile} onLogout={logout}>
        <div className={activeModule === "calendar" ? "adminDesktopPage calendarDesktopPageWide" : "page pageDesktopStatusLeft adminDesktopPage"}>
          {content}
        </div>
      </AdminDesktopShell>
    );
  }

  return <div className="page pageDesktopStatusLeft">{content}</div>;
}
