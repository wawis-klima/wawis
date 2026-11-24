import React, { Suspense } from "react";
import { lazy } from "../modules/lazy-safe.jsx";
import { APP_VERSION } from "../version";
import { IconPlus } from "./ui";
import "./jobs/desktop-jobs-header-v1494.css";

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
    openAddJob,
  } = props;

  const title = showAssignedJobsOnly && !isAdmin ? "Moje zlecenia" : desktopStatusLabels[desktopStatusFilter];
  const desktopAdminLayout = !isMobile && isAdmin;

  const tableContent = (
    <div className={`card premiumCard ${desktopAdminLayout ? 'desktopJobsTableCard' : ''}`}>
      <div className="tableTitle">{title}</div>
      <Suspense fallback={jobsLayoutFallback}>
        {isMobile ? <MobileJobsLayout {...props} /> : <DesktopJobsLayout {...props} />}
      </Suspense>

      {visibleJobs.length === 0 ? (
        <div className="muted statusTableHint" style={{ marginTop: 12 }}>
          {query.trim() ? "Brak klientów pasujących do wyszukiwania." : showAssignedJobsOnly && !isAdmin ? "Brak przypisanych zleceń dla tego pracownika." : `Brak klientów w sekcji: ${desktopStatusLabels[desktopStatusFilter]}.`}
        </div>
      ) : null}
    </div>
  );

  if (desktopAdminLayout) {
    return (
      <div className="desktopJobsModulePage">
        {/* 14.95 (decyzja właściciela 24.11.2026): wersja i „+” w nagłówku „Montaże”, po prawej. */}
        <section className="smsDesktopHeaderCard desktopJobsPageHeaderV1495">
          <div className="smsDesktopHeaderCopy">
            <h1>Montaże</h1>
          </div>
          <div className="desktopHeaderActionsBox desktopJobsPageHeaderActionsV1495">
            <div className="desktopVersionTag">WERSJA {APP_VERSION}</div>
            <button className="desktopActionBtn primary" onClick={openAddJob} title="Dodaj">
              <IconPlus />
            </button>
          </div>
        </section>

        {tableContent}
      </div>
    );
  }

  return tableContent;
}
