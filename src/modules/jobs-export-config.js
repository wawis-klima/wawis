import { normalizeStatus } from "../utils/jobHelpers.jsx";

export const EXPORT_SCOPE_OPTIONS = [
  { value: "all", label: "Wszystkie zlecenia" },
  { value: "visible", label: "Tylko widoczne" },
  { value: "statuses", label: "Tylko wybrane statusy" },
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "eksport";
}

function getRoleExportLabel(isAdmin) {
  return isAdmin ? "pełny" : "skrócony";
}

function getRoleExportDescription(isAdmin) {
  return isAdmin
    ? "Administrator eksportuje pełny zestaw danych zleceń."
    : "Monter eksportuje skrócony zestaw danych potrzebnych w terenie.";
}

function filterJobsByAssignment({ jobs, profile, isAdmin, showAssignedJobsOnly }) {
  if (isAdmin || !showAssignedJobsOnly || !profile?.id) return [...(jobs || [])];
  return (jobs || []).filter((job) => job.main_technician_id === profile.id || (Array.isArray(job.viewers) ? job.viewers : []).some((viewer) => viewer.user_id === profile.id));
}

export function getRangeLabel(exportScope, exportStatuses = []) {
  if (exportScope === "all") return "wszystkie-zlecenia";
  if (exportScope === "statuses") return exportStatuses.length ? `statusy-${exportStatuses.map(slugify).join("-")}` : "statusy-brak";
  return "widoczne";
}

export function getJobsForExport({
  jobs,
  visibleJobs,
  exportScope,
  exportStatuses,
  profile,
  isAdmin,
  showAssignedJobsOnly,
}) {
  if (exportScope === "visible") return [...(visibleJobs || [])];

  const baseJobs = filterJobsByAssignment({ jobs, profile, isAdmin, showAssignedJobsOnly });
  if (exportScope === "all") return baseJobs;

  const statusSet = new Set((exportStatuses || []).map((status) => normalizeStatus(status)).filter(Boolean));
  if (!statusSet.size) return [];
  return baseJobs.filter((job) => statusSet.has(normalizeStatus(job.status)));
}

export function getExportSummary({ exportScope, exportStatuses, isAdmin }) {
  const rangeText = EXPORT_SCOPE_OPTIONS.find((option) => option.value === exportScope)?.label || "Tylko widoczne";
  const statusText = exportScope === "statuses"
    ? ((exportStatuses || []).length ? exportStatuses.join(", ") : "brak zaznaczonych statusów")
    : "bieżące filtry widoku";

  return {
    modeLabel: getRoleExportLabel(isAdmin),
    modeDescription: getRoleExportDescription(isAdmin),
    rangeText,
    statusText,
  };
}
