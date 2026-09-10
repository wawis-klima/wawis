import { buildExportFileName, getPdfSections, getRangeLabel, getRoleExportLabel, loadLogoDataUrl } from "./jobs-export-shared.js";

export async function exportJobsToPdfImpl({ jobs, profiles, isAdmin, exportScope, exportStatuses }) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginBottom = 48;
  const contentWidth = pageWidth - marginX * 2;
  const logoDataUrl = await loadLogoDataUrl();
  let y = 44;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", marginX, y - 8, 70, 70);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Wawis Klimatyzacja", logoDataUrl ? marginX + 84 : marginX, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Eksport zleceń (${getRoleExportLabel(isAdmin)})`, logoDataUrl ? marginX + 84 : marginX, y + 30);
  doc.text(`Zakres: ${getRangeLabel(exportScope, exportStatuses).replace(/-/g, " ")}`, logoDataUrl ? marginX + 84 : marginX, y + 46);
  doc.text(`Liczba rekordów: ${jobs.length}`, logoDataUrl ? marginX + 84 : marginX, y + 62);
  y += 88;

  const sections = getPdfSections({ jobs, profiles, isAdmin });
  if (!sections.length) {
    doc.setFontSize(12);
    doc.text("Brak zleceń do eksportu.", marginX, y);
    doc.save(buildExportFileName({ extension: "pdf", exportScope, exportStatuses, isAdmin }));
    return;
  }

  sections.forEach((section, sectionIndex) => {
    const estimatedHeight = 28 + section.lines.reduce((total, [label, value]) => {
      const wrapped = doc.splitTextToSize(`${label}: ${value}`, contentWidth - 8);
      return total + wrapped.length * 14 + 2;
    }, 0) + 16;

    if (y + estimatedHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = 44;
    }

    doc.setDrawColor(216, 224, 236);
    doc.roundedRect(marginX, y, contentWidth, estimatedHeight, 14, 14);
    y += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(section.title, marginX + 12, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    section.lines.forEach(([label, value]) => {
      const wrapped = doc.splitTextToSize(`${label}: ${value}`, contentWidth - 24);
      doc.text(wrapped, marginX + 12, y);
      y += wrapped.length * 14 + 2;
    });

    y += 14;

    if (sectionIndex === sections.length - 1) return;
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      y = 44;
    }
  });

  doc.save(buildExportFileName({ extension: "pdf", exportScope, exportStatuses, isAdmin }));
}
