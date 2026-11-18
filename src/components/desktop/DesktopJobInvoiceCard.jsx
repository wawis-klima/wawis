import React from "react";
import AppModal from "../modals/AppModal.jsx";
import { IconFileText } from "../ui.jsx";
import { getFakturowniaInvoicePdf } from "../../modules/fakturownia.js";

// 14.45: faktura VAT z Fakturowni w szczegółach montażu — tylko administrator, tylko potwierdzona faktura.
// PDF pobierany na żądanie (zawsze aktualny), bez zapisu w WAWIS.
export default function DesktopJobInvoiceCard({ job, supabase }) {
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [preview, setPreview] = React.useState({ url: "", fileName: "" });
  const invoiceNumber = String(job?.vat_invoice_fakturownia_invoice_number || "").trim();

  React.useEffect(() => () => { if (preview.url) URL.revokeObjectURL(preview.url); }, [preview.url]);
  React.useEffect(() => {
    setPreviewOpen(false);
    setMessage("");
    setPreview((current) => {
      if (current.url) URL.revokeObjectURL(current.url);
      return { url: "", fileName: "" };
    });
  }, [job?.id]);

  async function loadPdf() {
    if (preview.url) return preview;
    const result = await getFakturowniaInvoicePdf({ supabase, jobId: job?.id });
    const next = { url: URL.createObjectURL(result.blob), fileName: result.fileName };
    setPreview(next);
    return next;
  }

  async function openPreview() {
    if (busy) return;
    setBusy("preview");
    setMessage("");
    setPreviewOpen(true);
    try {
      await loadPdf();
    } catch (error) {
      setPreviewOpen(false);
      setMessage(error?.message || "Nie udało się pobrać faktury z Fakturowni.");
    } finally {
      setBusy("");
    }
  }

  async function download() {
    if (busy) return;
    setBusy("download");
    setMessage("");
    try {
      const file = await loadPdf();
      const anchor = document.createElement("a");
      anchor.href = file.url;
      anchor.download = file.fileName || "faktura.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      setMessage(error?.message || "Nie udało się pobrać faktury z Fakturowni.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <section className="detailsSection detailsSectionCompact jobDetailsSectionCard desktopJobProtocolCard" data-desktop-invoice="14.45">
        <h4 className="sectionHeadingWithIcon"><IconFileText /><span>Faktura VAT</span></h4>
        <div className="desktopJobProtocolSummary">
          <span className="desktopJobProtocolBadge">PDF</span>
          <div><strong>{invoiceNumber ? `Faktura ${invoiceNumber}` : "Faktura potwierdzona"}</strong><span>Pobierana na bieżąco z Fakturowni</span></div>
        </div>
        <div className="desktopJobProtocolActions" aria-label="Działania na fakturze VAT">
          <button type="button" className="btn premiumActionBtn" onClick={openPreview} disabled={Boolean(busy)}>{busy === "preview" ? "Pobieram…" : "Podgląd faktury"}</button>
          <button type="button" className="btn premiumActionBtn" onClick={download} disabled={Boolean(busy)}>{busy === "download" ? "Pobieram…" : "Pobierz PDF"}</button>
        </div>
        {message ? <div className="desktopJobProtocolMessage" role="status">{message}</div> : null}
      </section>

      <AppModal open={previewOpen} onClose={() => setPreviewOpen(false)} contentClassName="card desktopJobProtocolPreviewModal desktopJobInvoicePreviewModal" closeOnOverlay={!busy} closeOnEscape={!busy}>
        <div className="desktopJobProtocolPreviewHeader">
          <div><span>Faktura VAT{invoiceNumber ? ` ${invoiceNumber}` : ""}</span><strong>{job?.client || job?.title || "Zlecenie"}</strong></div>
          <button type="button" className="btn" onClick={() => setPreviewOpen(false)}>Zamknij</button>
        </div>
        <div className="desktopJobProtocolPreviewBody">
          {!preview.url ? <div className="desktopJobProtocolPreviewLoading">Pobieram fakturę z Fakturowni…</div> : <iframe src={preview.url} title={`Faktura VAT ${invoiceNumber}`} />}
        </div>
      </AppModal>
    </>
  );
}
