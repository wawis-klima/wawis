// Kod pocztowy zostaje w danych zlecenia; pomijamy go tylko w trzech desktopowych listach.
const STATUSES_WITHOUT_POSTAL_CODE = new Set(["W trakcie", "Niezrealizowane", "Zakończone"]);
const POSTAL_CODE_PREFIX = /^\s*\d{2}-\d{3}(?=\s|,|$)\s*,?\s*/;

export function formatDesktopJobsTableAddress(address, status) {
  const fullAddress = String(address || "").trim();
  if (!STATUSES_WITHOUT_POSTAL_CODE.has(String(status || "").trim())) return fullAddress;
  return fullAddress.replace(POSTAL_CODE_PREFIX, "").trim();
}
