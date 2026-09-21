import { getJobAddress, normalizeStatus } from "../utils/jobHelpers.jsx";
import { EXPORT_SCOPE_OPTIONS, getRangeLabel } from "./jobs-export-config.js";

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function getProfileMap(profiles) {
  return new Map((profiles || []).map((profile) => [profile.id, profile.full_name || profile.email || "Użytkownik"]));
}

function getMainTechnicianName(job, profilesMap) {
  return profilesMap.get(job?.main_technician_id) || "-";
}

function getAdditionalTechnicians(job, profilesMap) {
  const viewers = Array.isArray(job?.viewers) ? job.viewers : [];
  const names = viewers
    .filter((viewer) => viewer.user_id && viewer.user_id !== job?.main_technician_id)
    .map((viewer) => profilesMap.get(viewer.user_id) || "")
    .filter(Boolean);
  return names.length ? names.join(", ") : "-";
}

function getRoleExportLabel(isAdmin) {
  return isAdmin ? "pełny" : "skrócony";
}

function getExportRows({ jobs, profiles, isAdmin }) {
  const profilesMap = getProfileMap(profiles);

  return (jobs || []).map((job, index) => {
    const baseRow = {
      Lp: index + 1,
      Klient: job.client || job.title || "-",
      Status: normalizeStatus(job.status),
      "Data montażu": formatDate(job.installation_date),
      Telefon: job.phone || "-",
      Adres: getJobAddress(job) || "-",
      "Główny monter": getMainTechnicianName(job, profilesMap),
    };

    if (!isAdmin) return baseRow;

    return {
      ...baseRow,
      Email: job.email || "-",
      Miasto: job.city || "-",
      Ulica: job.street || "-",
      "Dodatkowi monterzy": getAdditionalTechnicians(job, profilesMap),
      "Komentarz administratora": job.admin_note || "-",
      "Liczba komentarzy": Array.isArray(job.comments) ? job.comments.length : 0,
      "Liczba zdjęć": Array.isArray(job.photos) ? job.photos.length : 0,
      "Data utworzenia": formatDate(job.created_at),
    };
  });
}

function getPdfSections({ jobs, profiles, isAdmin }) {
  const profilesMap = getProfileMap(profiles);

  return (jobs || []).map((job, index) => {
    const lines = [
      ["Klient", job.client || job.title || "-"],
      ["Status", normalizeStatus(job.status)],
      ["Data montażu", formatDate(job.installation_date)],
      ["Telefon", job.phone || "-"],
      ["Adres", getJobAddress(job) || "-"],
      ["Główny monter", getMainTechnicianName(job, profilesMap)],
    ];

    if (isAdmin) {
      lines.push(
        ["Email", job.email || "-"],
        ["Miasto", job.city || "-"],
        ["Ulica", job.street || "-"],
        ["Dodatkowi monterzy", getAdditionalTechnicians(job, profilesMap)],
        ["Komentarz administratora", job.admin_note || "-"],
        ["Liczba komentarzy", String(Array.isArray(job.comments) ? job.comments.length : 0)],
        ["Liczba zdjęć", String(Array.isArray(job.photos) ? job.photos.length : 0)],
        ["Data utworzenia", formatDate(job.created_at)],
      );
    }

    return {
      title: `${index + 1}. ${job.client || job.title || "Klient"}`,
      lines,
    };
  });
}

async function loadLogoDataUrl() {
  if (typeof window === "undefined" || typeof fetch !== "function") return "";

  try {
    const response = await fetch("/logo.png");
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Nie udało się odczytać logo do PDF."));
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function buildExportFileName({ extension, exportScope, exportStatuses, isAdmin }) {
  return `zlecenia-${getRangeLabel(exportScope, exportStatuses)}-${getRoleExportLabel(isAdmin)}.${extension}`;
}

export {
  EXPORT_SCOPE_OPTIONS,
  buildExportFileName,
  formatDate,
  getExportRows,
  getPdfSections,
  getRangeLabel,
  getRoleExportLabel,
  loadLogoDataUrl,
};
