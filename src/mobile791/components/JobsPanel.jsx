import React, { Suspense, lazy } from "react";

const MobileJobsLayout = lazy(() => import("./jobs/MobileJobsLayout.jsx"));
const DesktopJobsLayout = lazy(() => import("./jobs/DesktopJobsLayout.jsx"));

const jobsLayoutFallback = (
  <div className="muted statusTableHint" style={{ marginTop: 12 }}>
    Trwa ładowanie widoku montaży...
  </div>
);

/* v9.59 — mobile visual polish only. Bez zmian układu i logiki:
   wspólny rytm małych kontrolek/badge’y, lżejsze cienie i stały spacing. */
const MOBILE_V959_CSS = `
@media (max-width:700px){
  .page.pageDesktopStatusLeft{padding:10px 14px 14px !important;}
  .page.pageDesktopStatusLeft>.summary.premiumSummary{display:none !important;}

  .moduleSwitcherWrap{width:100% !important;margin:0 0 8px !important;}
  .moduleSwitcher{width:100% !important;min-height:52px !important;padding:5px !important;gap:4px !important;border:1px solid #dde5ef !important;border-radius:20px !important;background:rgba(255,255,255,.92) !important;box-shadow:0 2px 8px rgba(15,35,69,.025) !important;}
  .moduleSwitcherBtn{min-width:0 !important;min-height:42px !important;padding:8px 1px !important;font-size:10.5px !important;line-height:1.08 !important;border-radius:15px !important;overflow:hidden !important;text-overflow:clip !important;letter-spacing:-.01em !important;}

  .twoCol.twoColDesktopStatusLeft{display:block !important;margin:0 !important;}
  .mobileJobsShellV959{display:block !important;width:100% !important;max-width:100% !important;min-width:0 !important;margin:0 !important;padding:0 !important;border:0 !important;border-radius:0 !important;background:transparent !important;box-shadow:none !important;overflow:visible !important;}

  .mobileJobsShellV959>.mobileJobsStatusTitleV959{display:block !important;width:100% !important;margin:4px 0 8px !important;padding:0 !important;text-align:center !important;font-size:16px !important;line-height:1.1 !important;font-weight:800 !important;color:#102348 !important;}

  .mobileJobsShellV959 .mobileHeaderV2{display:block !important;width:100% !important;max-width:100% !important;min-width:0 !important;margin:0 0 6px !important;padding:7px !important;border:1px solid #dde5ef !important;border-radius:17px !important;background:rgba(255,255,255,.95) !important;box-shadow:0 2px 8px rgba(15,35,69,.025) !important;box-sizing:border-box !important;}

  .mobileJobsShellV959 .wawisOneLineToolbar{display:flex !important;width:100% !important;min-width:0 !important;align-items:center !important;justify-content:space-between !important;gap:4px !important;flex-wrap:nowrap !important;}

  .mobileJobsShellV959 .wawisOneLineVersion{display:flex !important;align-items:center !important;justify-content:center !important;width:48px !important;min-width:48px !important;max-width:48px !important;height:40px !important;min-height:40px !important;padding:0 !important;border:0 !important;border-radius:12px !important;background:transparent !important;box-shadow:none !important;color:#64748b !important;font-size:10px !important;font-weight:600 !important;line-height:1 !important;white-space:nowrap !important;}

  .mobileJobsShellV959 .wawisOneLineAction{width:40px !important;min-width:40px !important;max-width:40px !important;height:40px !important;min-height:40px !important;max-height:40px !important;margin:0 !important;padding:0 !important;border-radius:13px !important;}

  .mobileJobsShellV959 .wawisOneLinePushSlot,
  .mobileJobsShellV959 .wawisPushMini{width:54px !important;min-width:54px !important;max-width:54px !important;height:40px !important;min-height:40px !important;max-height:40px !important;}
  .mobileJobsShellV959 .wawisPushMini{display:grid !important;grid-template-rows:auto auto !important;align-content:center !important;justify-items:center !important;gap:1px !important;margin:0 !important;padding:3px 2px !important;border:1px solid #dbe3ef !important;border-radius:13px !important;background:#fff !important;box-shadow:none !important;box-sizing:border-box !important;}
  .mobileJobsShellV959 .wawisPushMiniTitle{display:block !important;font-size:8px !important;line-height:1 !important;font-weight:850 !important;color:#233650 !important;}
  .mobileJobsShellV959 .wawisPushMiniRow{display:flex !important;align-items:center !important;justify-content:center !important;gap:2px !important;}
  .mobileJobsShellV959 .wawisPushMiniSwitch{appearance:none !important;-webkit-appearance:none !important;position:relative !important;display:block !important;width:25px !important;min-width:25px !important;height:15px !important;min-height:15px !important;margin:0 !important;padding:0 !important;border:0 !important;border-radius:999px !important;background:#cbd5e1 !important;}
  .mobileJobsShellV959 .wawisPushMini.isOn .wawisPushMiniSwitch{background:#34b63f !important;}
  .mobileJobsShellV959 .wawisPushMiniKnob{position:absolute !important;top:2px !important;left:2px !important;width:11px !important;height:11px !important;border-radius:50% !important;background:#fff !important;box-shadow:0 1px 3px rgba(15,23,42,.18) !important;}
  .mobileJobsShellV959 .wawisPushMini.isOn .wawisPushMiniKnob{transform:translateX(10px) !important;}
  .mobileJobsShellV959 .wawisPushMiniState{display:block !important;font-size:8px !important;line-height:1 !important;font-weight:850 !important;color:#64748b !important;}
  .mobileJobsShellV959 .wawisPushMini.isOn .wawisPushMiniState{color:#2fa43a !important;}

  .mobileJobsShellV959 .wawisOneLineFilterButton{display:flex !important;align-items:center !important;justify-content:center !important;width:40px !important;min-width:40px !important;max-width:40px !important;height:40px !important;min-height:40px !important;max-height:40px !important;margin:0 !important;padding:0 !important;border:1px solid #dbe3ef !important;border-radius:13px !important;background:#fff !important;color:#64748b !important;box-shadow:none !important;}
  .mobileJobsShellV959 .wawisOneLineFilterButton.active{color:#2563eb !important;border-color:#bfdbfe !important;background:#eff6ff !important;}
  .mobileJobsShellV959 .wawisOneLineFilterButton .inlineIcon{width:19px !important;height:19px !important;}

  .mobileJobsShellV959 .wawisUserInitialsBadge{appearance:none !important;-webkit-appearance:none !important;display:flex !important;align-items:center !important;justify-content:center !important;width:40px !important;min-width:40px !important;max-width:40px !important;height:40px !important;min-height:40px !important;max-height:40px !important;margin:0 !important;padding:0 !important;border:1px solid #cbd9eb !important;border-radius:50% !important;background:#f2f7fd !important;color:#163157 !important;font-size:12px !important;font-weight:850 !important;letter-spacing:.02em !important;box-shadow:none !important;cursor:pointer !important;}

  .mobileJobsShellV959 .wawisCompactFilterExpanded{display:grid !important;grid-template-columns:20px minmax(0,1fr) 32px !important;align-items:center !important;gap:6px !important;width:100% !important;min-height:40px !important;margin-top:6px !important;padding:0 5px 0 10px !important;border:1px solid #bfdbfe !important;border-radius:13px !important;background:#f8fbff !important;box-sizing:border-box !important;}

  /* Statusy — grafiki bez zmian, zaakceptowane badże pozostają na dolnej części ikon. */
  .mobileJobsShellV959 .statusButtonsBar{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:4px !important;width:100% !important;margin:0 0 -14px !important;padding:2px 0 0 !important;overflow:visible !important;}
  .mobileJobsShellV959 .statusActionButton,
  .mobileJobsShellV959 .statusActionShape{min-height:82px !important;}
  .mobileJobsShellV959 .statusActionImage{width:min(23vw,94px) !important;max-width:94px !important;height:auto !important;}
  .mobileJobsShellV959 .statusActionBadge{bottom:13px !important;transform:translateY(-30px) !important;z-index:3 !important;min-width:22px !important;height:22px !important;min-height:22px !important;padding:0 6px !important;border-radius:999px !important;font-size:11px !important;line-height:1 !important;}

  /* Karty — mniej ramek, mniej powietrza, mniejsza pastylka statusu. */
  .mobileJobsShellV959 .mobileJobList{gap:8px !important;margin-top:0 !important;}
  .mobileJobsShellV959 .mobileJobCard{padding:10px 12px 7px !important;border:1px solid #e0e6ee !important;border-radius:16px !important;background:#fff !important;box-shadow:0 1px 4px rgba(15,35,69,.025) !important;}
  .mobileJobsShellV959 .mobileJobTop{gap:8px !important;margin-bottom:5px !important;}
  .mobileJobsShellV959 .mobileJobClient{font-size:16px !important;line-height:1.12 !important;font-weight:700 !important;color:#152238 !important;}
  .mobileJobsShellV959 .mobileJobDate{font-size:11px !important;line-height:1.1 !important;color:#64748b !important;font-weight:700 !important;}
  .mobileJobsShellV959 .mobileJobGrid.mobileJobGridSingleField{gap:8px !important;margin-bottom:4px !important;}
  .mobileJobsShellV959 .mobileJobLabel{font-size:9.5px !important;line-height:1.05 !important;margin-bottom:2px !important;color:#718096 !important;}
  .mobileJobsShellV959 .mobileJobGrid.mobileJobGridSingleField .mobileJobValue{font-size:13px !important;line-height:1.18 !important;color:#14233c !important;}
  .mobileJobsShellV959 .jobTypeTagRight{display:inline-flex !important;align-items:center !important;justify-content:center !important;height:22px !important;min-height:22px !important;margin-top:2px !important;padding:0 9px !important;border-radius:999px !important;font-size:10.5px !important;line-height:1 !important;}
  .mobileJobsShellV959 .mobileJobFooter{min-height:20px !important;margin-top:4px !important;}
  .mobileJobsShellV959 .mobileJobBadges{margin-top:2px !important;margin-bottom:0 !important;transform:none !important;min-height:22px !important;}
  .mobileJobsShellV959 .mobileJobBadges .initialsRow{gap:6px !important;}
  .mobileJobsShellV959 .mobileJobBadges .initialBadge{width:22px !important;height:22px !important;min-width:22px !important;max-width:22px !important;min-height:22px !important;max-height:22px !important;padding:0 !important;border-radius:50% !important;aspect-ratio:1 / 1 !important;font-size:9px !important;line-height:1 !important;}

  .mobileDiagnosticsPage{display:grid !important;gap:10px !important;}
  .mobileDiagnosticsCard{padding:12px !important;border:1px solid #e0e6ee !important;border-radius:16px !important;background:#fff !important;box-shadow:0 1px 4px rgba(15,35,69,.025) !important;}
  .mobileDiagnosticsHero{display:grid !important;grid-template-columns:minmax(0,1fr) auto !important;align-items:start !important;gap:10px !important;}
  .mobileDiagnosticsHero h1{margin:4px 0 6px !important;font-size:18px !important;line-height:1.1 !important;color:#152238 !important;}
  .mobileDiagnosticsHero p,.mobileDiagnosticsPrivacy p{margin:0 !important;font-size:12px !important;line-height:1.35 !important;color:#5f7088 !important;}
  .mobileDiagnosticsVersion{display:flex !important;align-items:center !important;justify-content:center !important;min-width:52px !important;height:32px !important;padding:0 10px !important;border-radius:999px !important;background:#eff6ff !important;color:#1d4ed8 !important;font-size:11px !important;font-weight:800 !important;}
  .mobileDiagnosticsGrid{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:8px !important;}
  .mobileDiagnosticsMetric{padding:11px !important;border:1px solid #dbe3ef !important;border-radius:14px !important;background:#fff !important;display:grid !important;gap:3px !important;}
  .mobileDiagnosticsMetric span{font-size:10px !important;line-height:1.05 !important;text-transform:uppercase !important;letter-spacing:.05em !important;color:#718096 !important;}
  .mobileDiagnosticsMetric strong{font-size:16px !important;line-height:1.1 !important;color:#152238 !important;}
  .mobileDiagnosticsMetric strong.isOk{color:#15803d !important;}
  .mobileDiagnosticsMetric strong.isWarn{color:#b45309 !important;}
  .mobileDiagnosticsMetric small{font-size:11px !important;line-height:1.3 !important;color:#64748b !important;}
  .mobileDiagnosticsCard h2{margin:0 0 9px !important;font-size:14px !important;line-height:1.1 !important;color:#152238 !important;}
  .mobileDiagnosticsActions{display:grid !important;gap:8px !important;}
  .mobileDiagnosticsActions .btn{width:100% !important;justify-content:center !important;}
  .mobileDiagnosticsMessage{margin-top:10px !important;padding:9px 10px !important;border-radius:12px !important;background:#f8fbff !important;color:#1e3a5f !important;font-size:12px !important;line-height:1.35 !important;border:1px solid #dbeafe !important;}
  .mobileDiagnosticsPrivacy strong{display:block !important;margin-bottom:5px !important;font-size:12px !important;color:#152238 !important;}
}

@media (max-width:390px){
  .mobileJobsShellV959 .wawisOneLineToolbar{gap:3px !important;}
  .mobileJobsShellV959 .wawisOneLineVersion{width:44px !important;min-width:44px !important;max-width:44px !important;height:38px !important;min-height:38px !important;max-height:38px !important;font-size:9.5px !important;}
  .mobileJobsShellV959 .wawisOneLineAction,
  .mobileJobsShellV959 .wawisOneLineFilterButton,
  .mobileJobsShellV959 .wawisUserInitialsBadge{width:38px !important;min-width:38px !important;max-width:38px !important;height:38px !important;min-height:38px !important;max-height:38px !important;}
  .mobileJobsShellV959 .wawisOneLinePushSlot,
  .mobileJobsShellV959 .wawisPushMini{width:50px !important;min-width:50px !important;max-width:50px !important;height:38px !important;min-height:38px !important;max-height:38px !important;}
}
`;

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
      {isMobile ? <style>{MOBILE_V959_CSS}</style> : null}
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
