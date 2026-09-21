import React from "react";
import AppModal from "../modals/AppModal.jsx";
import { IconFileText } from "../ui.jsx";
import {
  formatStoredProtocolDate,
  getStoredJobProtocolBlob,
  loadJobProtocolRecord,
  printStoredJobProtocol,
} from "../../modules/job-protocol-storage.js";
import {
  getJobProtocolRecipientEmail,
  isValidProtocolEmail,
  JOB_PROTOCOL_EMAIL_SENDER,
  sendJobProtocolEmail,
} from "../../modules/job-protocol-email.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export default function DesktopJobProtocolCard({ job, supabase }) {
  const [record, setRecord] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [backendAvailable, setBackendAvailable] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [actionBusy, setActionBusy] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState("");
  const jobId = normalizeText(job?.id);
  const isCompleted = normalizeText(job?.status) === "Zakończone";
  const recipientEmail = getJobProtocolRecipientEmail(job);
  const canSendEmail = isValidProtocolEmail(recipientEmail);

  React.useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setMessage("");
    setBackendAvailable(true);
    setPreviewOpen(false);
    setLoading(Boolean(supabase && jobId && isCompleted));

    if (!supabase || !jobId || !isCompleted) return () => { cancelled = true; };

    void loadJobProtocolRecord({ supabase, jobId })
      .then((result) => {
        if (cancelled) return;
        setRecord(result.record);
        setBackendAvailable(result.backendAvailable);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error?.message || "Nie udało się sprawdzić zapisanego protokołu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isCompleted, jobId, supabase]);

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function closePreview() {
    setPreviewOpen(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }

  async function openPreview() {
    if (!record || actionBusy) return;
    setPreviewOpen(true);
    setActionBusy("preview");
    setMessage("");
    try {
      const blob = await getStoredJobProtocolBlob({ supabase, record });
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    } catch (error) {
      setPreviewOpen(false);
      setMessage(error?.message || "Nie udało się otworzyć podglądu protokołu.");
    } finally {
      setActionBusy("");
    }
  }

  async function runAction(action) {
    if (!record || actionBusy) return;
    setActionBusy(action);
    setMessage("");
    try {
      if (action === "print") {
        await printStoredJobProtocol({ supabase, record });
        setMessage("Protokół został otwarty w oknie drukowania.");
      } else {
        const result = await sendJobProtocolEmail({ supabase, job, record });
        setMessage(`Protokół został wysłany z ${result.senderEmail} do ${result.recipientEmail}.`);
      }
    } catch (error) {
      setMessage(error?.message || "Nie udało się wykonać operacji na protokole.");
    } finally {
      setActionBusy("");
    }
  }

  const storedDate = record ? formatStoredProtocolDate(record.signed_at || record.created_at) : "";

  return (
    <>
      <section className="detailsSection detailsSectionCompact jobDetailsSectionCard desktopJobProtocolCard" data-desktop-protocol="9.96">
        <h4 className="sectionHeadingWithIcon"><IconFileText /><span>Protokół klienta</span></h4>
        {loading ? <div className="muted">Sprawdzam zapisany protokół…</div> : null}
        {!loading && !backendAvailable ? <div className="muted">Obsługa protokołów nie jest jeszcze włączona w bazie aplikacji.</div> : null}
        {!loading && backendAvailable && !record ? <div className="muted">Brak zapisanego protokołu dla tego zlecenia.</div> : null}
        {!loading && record ? (
          <>
            <div className="desktopJobProtocolSummary">
              <span className="desktopJobProtocolBadge">PDF</span>
              <div><strong>Protokół zapisany</strong><span>{storedDate || "Data zapisu niedostępna"}</span></div>
            </div>
            <div className="desktopJobProtocolActions" aria-label="Działania na zapisanym protokole klienta">
              <button type="button" className="btn premiumActionBtn" onClick={openPreview} disabled={Boolean(actionBusy)}>{actionBusy === "preview" ? "Otwieram…" : "Podgląd PDF"}</button>
              <button type="button" className="btn premiumActionBtn" onClick={() => runAction("print")} disabled={Boolean(actionBusy)}>{actionBusy === "print" ? "Otwieram druk…" : "Drukuj"}</button>
              <button type="button" className="btn premiumActionBtn primary" onClick={() => runAction("email")} disabled={Boolean(actionBusy) || !canSendEmail}>{actionBusy === "email" ? "Wysyłam…" : "Wyślij klientowi"}</button>
            </div>
            <div className="desktopJobProtocolEmailHint">
              {canSendEmail ? `Z: ${JOB_PROTOCOL_EMAIL_SENDER} · Do: ${recipientEmail}` : "Uzupełnij prawidłowy e-mail klienta w zleceniu, aby wysłać protokół."}
            </div>
          </>
        ) : null}
        {message ? <div className="desktopJobProtocolMessage" role="status">{message}</div> : null}
      </section>

      <AppModal open={previewOpen} onClose={closePreview} contentClassName="card desktopJobProtocolPreviewModal" closeOnOverlay={!actionBusy} closeOnEscape={!actionBusy}>
        <div className="desktopJobProtocolPreviewHeader">
          <div><span>Protokół klienta</span><strong>{job?.client || job?.title || "Zlecenie"}</strong></div>
          <button type="button" className="btn" onClick={closePreview} disabled={Boolean(actionBusy)}>Zamknij</button>
        </div>
        <div className="desktopJobProtocolPreviewBody">
          {!previewUrl ? <div className="desktopJobProtocolPreviewLoading">Ładowanie podglądu PDF…</div> : <iframe src={previewUrl} title={`Protokół klienta ${job?.client || job?.title || ""}`} />}
        </div>
        <div className="desktopJobProtocolPreviewFooter">
          <button type="button" className="btn premiumActionBtn" onClick={() => runAction("print")} disabled={Boolean(actionBusy) || !record}>{actionBusy === "print" ? "Otwieram druk…" : "Drukuj"}</button>
          <button type="button" className="btn premiumActionBtn primary" onClick={() => runAction("email")} disabled={Boolean(actionBusy) || !record || !canSendEmail}>{actionBusy === "email" ? "Wysyłam…" : "Wyślij klientowi"}</button>
        </div>
      </AppModal>
    </>
  );
}
