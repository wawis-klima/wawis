import { EXPORT_SCOPE_OPTIONS } from "./jobs-export-shared.js";

export async function exportJobsToExcel(payload) {
  const { exportJobsToExcelImpl } = await import("./jobs-export-excel.js");
  return exportJobsToExcelImpl(payload);
}

export async function exportJobsToPdf(payload) {
  const { exportJobsToPdfImpl } = await import("./jobs-export-pdf.js");
  return exportJobsToPdfImpl(payload);
}

export { EXPORT_SCOPE_OPTIONS };
