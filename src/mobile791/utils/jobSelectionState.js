export function getRequestedJobIdFromLocation(locationHref = "") {
  if (!locationHref) return "";

  try {
    const url = new URL(locationHref);
    return String(url.searchParams.get("jobId") || "").trim();
  } catch {
    return "";
  }
}
