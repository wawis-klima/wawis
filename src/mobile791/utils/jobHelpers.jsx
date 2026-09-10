import React from "react";
import { STATUSES, normalizeStatus } from "./jobPermissions.js";

export { STATUSES, normalizeStatus } from "./jobPermissions.js";

export function isOlderThan30Days(dateStr) {
  if (!dateStr) return false;
  const createdAt = new Date(dateStr);
  if (Number.isNaN(createdAt.getTime())) return false;
  return Date.now() - createdAt.getTime() >= 30 * 24 * 60 * 60 * 1000;
}

export function getInitials(name) {
  if (!name) return "-";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function getBadgeColorClass(personKey) {
  const classes = ["badgeBlue", "badgeGreen", "badgeAmber", "badgePurple", "badgePink", "badgeSlate"];
  const normalizedKey = String(personKey || "").trim().toLowerCase();

  if (!normalizedKey) return classes[0];

  let hash = 0;
  for (let i = 0; i < normalizedKey.length; i += 1) {
    hash = (hash * 31 + normalizedKey.charCodeAt(i)) >>> 0;
  }

  return classes[hash % classes.length];
}

export function renderInitialBadges(names) {
  if (!names || names.length === 0) return "-";
  return (
    <div className="initialsRow">
      {names.map((name, index) => (
        <span key={`${name}-${index}`} className={`initialBadge ${getBadgeColorClass(name)}`} title={name}>
          {getInitials(name)}
        </span>
      ))}
    </div>
  );
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

export function getJobCity(job) {
  return job.city || job.location?.split(",")[0]?.trim() || "-";
}

export function getJobStreet(job) {
  return job.street || job.location?.split(",").slice(1).join(",").trim() || "-";
}

export function getJobAddress(job) {
  const city = getJobCity(job);
  const street = getJobStreet(job);
  const addressParts = [city, street].filter((part) => part && part !== "-");
  return addressParts.length ? addressParts.join(", ") : "";
}

export function getGoogleMapsUrl(jobOrAddress) {
  const address = typeof jobOrAddress === "string" ? jobOrAddress.trim() : getJobAddress(jobOrAddress);
  if (!address) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function getJobTypeLabel(job) {
  const normalizedStatus = normalizeStatus(job?.status);

  if (normalizedStatus === "Zakończone") return "Zakończone";
  if (normalizedStatus === "W trakcie") return "W trakcie";
  if (normalizedStatus === "Niezrealizowane") return "Niezrealizowane";
  return "Nowe";
}

export function getJobTypeClass(job) {
  const normalizedStatus = normalizeStatus(job?.status);

  if (normalizedStatus === "Zakończone") return "jobTypeArchive";
  if (normalizedStatus === "W trakcie") return "jobTypeProgress";
  if (normalizedStatus === "Niezrealizowane") return "jobTypeFailed";
  return "jobTypeNew";
}

export function getViewerNames(job, profiles) {
  return profiles
    .filter((profile) => job.viewers.some((viewer) => viewer.user_id === profile.id) && profile.id !== job.main_technician_id)
    .map((profile) => profile.full_name);
}
