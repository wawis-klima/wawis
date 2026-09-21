import React, { useEffect, useRef } from "react";
import ModuleSwitcher from "./ModuleSwitcher.jsx";
import AdminDesktopShell from "./AdminDesktopShell.jsx";

function useIndependentWheelScroll(enabled) {
  const paneRef = useRef(null);

  useEffect(() => {
    const pane = paneRef.current;
    if (!enabled || !pane) return undefined;

    const onWheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
      if (maxScrollTop <= 1) return;

      const direction = Math.sign(event.deltaY);
      const canScrollUp = direction < 0 && pane.scrollTop > 0;
      const canScrollDown = direction > 0 && pane.scrollTop < maxScrollTop - 1;
      if (!canScrollUp && !canScrollDown) return;

      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? pane.clientHeight : 1;
      pane.scrollTop = Math.max(0, Math.min(maxScrollTop, pane.scrollTop + event.deltaY * unit));
      event.preventDefault();
      event.stopPropagation();
    };

    pane.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => pane.removeEventListener("wheel", onWheel, { capture: true });
  }, [enabled]);

  return paneRef;
}

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
  globalSearchProps = null,
}) {
  const isDesktopJobsSplitScroll = !isMobile && isAdmin && activeModule === "jobs" && Boolean(detailsPanel);
  const desktopJobsListPaneRef = useIndependentWheelScroll(isDesktopJobsSplitScroll);

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

      <div
        className={`twoCol twoColDesktopStatusLeft ${["center360", "sms", "contractors", "devices", "calendar", "diagnostics", "fuel"].includes(activeModule) ? "singleModuleColumn" : ""} ${isDesktopJobsSplitScroll ? "desktopJobsSplitScroll" : ""}`}
      >
        <div
          ref={desktopJobsListPaneRef}
          className={isDesktopJobsSplitScroll ? "desktopJobsListPane" : undefined}
          data-independent-scroll-pane={isDesktopJobsSplitScroll ? "jobs-list" : undefined}
        >
          {jobsPanel}
        </div>
        {detailsPanel ? <div className={`desktopDetailColumnTight ${isDesktopJobsSplitScroll ? "desktopJobsDetailsPane" : ""}`}>{detailsPanel}</div> : null}
      </div>
    </>
  );

  if (!isMobile && isAdmin) {
    return (
      <AdminDesktopShell activeModule={activeModule} activeNavKey={activeNavKey} setActiveModule={setActiveModule} onNavigate={onDesktopNavigate} profile={profile} onLogout={logout} globalSearchProps={globalSearchProps}>
        <div className={activeModule === "calendar" ? "adminDesktopPage calendarDesktopPageWide" : "page pageDesktopStatusLeft adminDesktopPage"}>
          {content}
        </div>
      </AdminDesktopShell>
    );
  }

  return <div className="page pageDesktopStatusLeft">{content}</div>;
}
