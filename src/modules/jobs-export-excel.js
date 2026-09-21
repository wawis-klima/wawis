import { buildExportFileName, getExportRows } from "./jobs-export-shared.js";

export async function exportJobsToExcelImpl({ jobs, profiles, isAdmin, exportScope, exportStatuses }) {
  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default || xlsxModule;
  const rows = getExportRows({ jobs, profiles, isAdmin });
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informacja: "Brak zleceń do eksportu." }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Zlecenia");

  const columnWidths = Object.keys(rows[0] || { Informacja: "" }).map((key) => ({ wch: Math.min(Math.max(String(key).length + 2, 14), 30) }));
  worksheet["!cols"] = columnWidths;

  XLSX.writeFile(workbook, buildExportFileName({ extension: "xlsx", exportScope, exportStatuses, isAdmin }));
}
