import React, { Suspense, lazy } from "react";

const MobileJobsLayout = lazy(() => import("./jobs/MobileJobsLayout.jsx"));
const DesktopJobsLayout = lazy(() => import("./jobs/DesktopJobsLayout.jsx"));

const jobsLayoutFallback = (
  <div className="muted statusTableHint" style={{ marginTop: 12 }}>
    Trwa ładowanie widoku montaży...
  </div>
);

export default function JobsPanel(props) {
  const {
    desktopStatusLabels,
    desktopStatusFilter,
    showAssignedJobsOnly,
    isAdmin,
    isMobile,
    query,
    visibleJobs,
  } = props;

  const title = showAssignedJobsOnly && !isAdmin ? "Moje zlecenia" : desktopStatusLabels[desktopStatusFilter];
  const desktopAdminLayout = !isMobile && isAdmin;

  const tableContent = (
    <div className={`card premiumCard ${isMobile ? 'mobileJobsShellV959' : ''} ${desktopAdminLayout ? 'desktopJobsTableCard' : ''}`}>
      <div className={`tableTitle ${isMobile ? "mobileJobsStatusTitleV959" : ""}`}>{title}</div>
      <Suspense fallback={jobsLayoutFallback}>
        {isMobile ? <MobileJobsLayout {...props} /> : <DesktopJobsLayout {...props} />}
      </Suspense>

      {visibleJobs.length === 0 ? (
        <div className="muted statusTableHint" style={{ marginTop: isMobile ? 6 : 12 }}>
          {query.trim() ? "Brak klientów pasujących do wyszukiwania." : showAssignedJobsOnly && !isAdmin ? "Brak przypisanych zleceń dla tego pracownika." : `Brak klientów w sekcji: ${desktopStatusLabels[desktopStatusFilter]}.`}
        </div>
      ) : null}
    </div>
  );

  if (desktopAdminLayout) {
    return (
      <div className="desktopJobsModulePage">
        <section className="smsDesktopHeaderCard">
          <div className="smsDesktopHeaderCopy">
            <h1>Montaże</h1>
            <p>Zarządzaj zleceniami montażu, przełączaj statusy i pracuj na tej samej, spójnej stylistyce desktopowej co w modułach Urządzenia, Kontrahenci i SMS.</p>
          </div>
        </section>

        {tableContent}
      </div>
    );
  }

  return tableContent;
}
