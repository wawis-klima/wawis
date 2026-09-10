import React, { useEffect, useMemo, useRef, useState } from "react";
import AppModal from "./AppModal.jsx";
import { buildJobProtocolData, createJobProtocolPdfFile } from "../../modules/job-protocol-pdf.js";
import {
  downloadStoredJobProtocol,
  formatStoredProtocolDate,
  shareStoredJobProtocol,
  storeJobProtocol,
} from "../../modules/job-protocol-storage.js";
import {
  getJobProtocolRecipientEmail,
  isValidProtocolEmail,
  JOB_PROTOCOL_EMAIL_SENDER,
  sendJobProtocolEmail,
} from "../../modules/job-protocol-email.js";
import {
  formatPaymentAmount,
  getPaymentDraftFromJob,
  getPaymentKindLabel,
  getPaymentMethodLabel,
  normalizePaymentConfirmation,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  saveJobPaymentConfirmation,
} from "../../modules/job-payment-confirmation.js";
import { logDiagnostic } from "../../modules/diagnostics.js";
import {
  isProtocolSaveTimeoutError,
  PROTOCOL_SAVE_STEP_TIMEOUT_MS,
  PROTOCOL_SAVE_TIMEOUT_MESSAGE,
  PROTOCOL_SAVE_TOTAL_TIMEOUT_MS,
  withProtocolSaveTimeout,
} from "../../modules/protocol-save-timeout.js";
import { APP_VERSION } from "../../version.js";
import "../devices/mobile-device-wizard.css";

const SIGNATURE_HEIGHT = 280;

function ProtocolBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function setupSignatureCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const logicalHeight = Math.max(SIGNATURE_HEIGHT, Math.round(rect.height || SIGNATURE_HEIGHT));
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.round(logicalHeight * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, rect.width, logicalHeight);
  context.strokeStyle = "#142a3a";
  context.lineWidth = 2.8;
  context.lineCap = "round";
  context.lineJoin = "round";
  return context;
}

function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
}

function drawSignaturePreview(context, image, width, height) {
  const sourceWidth = Number(image?.naturalWidth || image?.width || 0);
  const sourceHeight = Number(image?.naturalHeight || image?.height || 0);
  if (!context || !sourceWidth || !sourceHeight || !width || !height) return;
  const inset = 12;
  const scale = Math.min((width - inset * 2) / sourceWidth, (height - inset * 2) / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function getTrimmedSignatureDataUrl(canvas) {
  if (!canvas) return "";
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas.toDataURL("image/png");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset] >= 245 && pixels[offset + 1] >= 245 && pixels[offset + 2] >= 245) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return canvas.toDataURL("image/png");
  const padding = Math.max(12, Math.round(Math.min(width, height) * 0.04));
  const sourceX = Math.max(0, minX - padding);
  const sourceY = Math.max(0, minY - padding);
  const sourceRight = Math.min(width, maxX + padding + 1);
  const sourceBottom = Math.min(height, maxY + padding + 1);
  const trimmed = document.createElement("canvas");
  trimmed.width = sourceRight - sourceX;
  trimmed.height = sourceBottom - sourceY;
  const trimmedContext = trimmed.getContext("2d");
  trimmedContext.fillStyle = "#ffffff";
  trimmedContext.fillRect(0, 0, trimmed.width, trimmed.height);
  trimmedContext.drawImage(canvas, sourceX, sourceY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed.toDataURL("image/png");
}

export default function ProtocolTestModal({ open, job, profiles, supabase, protocolRecord = null, onClose, onSaved }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const openedAtRef = useRef(new Date());
  const [savedRecord, setSavedRecord] = useState(protocolRecord);
  const [editing, setEditing] = useState(!protocolRecord);
  const [paymentDraft, setPaymentDraft] = useState(() => getPaymentDraftFromJob(job));
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [draftHasSignature, setDraftHasSignature] = useState(false);
  const [signatureCanvasReady, setSignatureCanvasReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [message, setMessage] = useState("");
  const protocolData = useMemo(
    () => buildJobProtocolData({ job, profiles, signedAt: openedAtRef.current, payment: { enabled: false } }),
    [job, profiles],
  );

  useEffect(() => {
    if (!open) return undefined;
    openedAtRef.current = new Date();
    setSavedRecord(protocolRecord || null);
    setEditing(!protocolRecord);
    setPaymentDraft(getPaymentDraftFromJob(job));
    setHasSignature(false);
    setSignatureOpen(false);
    setSignatureDataUrl("");
    setDraftHasSignature(false);
    setSignatureCanvasReady(false);
    setIsGenerating(false);
    setActionMenuOpen(false);
    setActionBusy("");
    setMessage("");
    return undefined;
  }, [open, job?.id, protocolRecord?.id]);

  useEffect(() => {
    if (!signatureOpen) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const context = setupSignatureCanvas(canvas);
      if (!canvas || !context) return;
      if (!signatureDataUrl) {
        setSignatureCanvasReady(true);
        return;
      }
      const image = new Image();
      image.onload = () => {
        const rect = canvas.getBoundingClientRect();
        drawSignaturePreview(context, image, rect.width, rect.height);
        setSignatureCanvasReady(true);
      };
      image.src = signatureDataUrl;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [signatureOpen, signatureDataUrl]);

  function invalidateSignature() {
    if (!hasSignature && !signatureDataUrl) return;
    setHasSignature(false);
    setSignatureDataUrl("");
    setDraftHasSignature(false);
    setMessage("");
  }

  function updatePaymentDraft(patch) {
    invalidateSignature();
    setPaymentDraft((current) => ({ ...current, ...patch }));
  }

  function beginEditingStoredProtocol() {
    setEditing(true);
    setActionMenuOpen(false);
    setHasSignature(false);
    setSignatureDataUrl("");
    setDraftHasSignature(false);
    setMessage("");
  }

  function openSignature() {
    setDraftHasSignature(Boolean(signatureDataUrl));
    setSignatureCanvasReady(false);
    setMessage("");
    setSignatureOpen(true);
  }

  function closeSignature() {
    drawingRef.current = false;
    lastPointRef.current = null;
    setSignatureOpen(false);
  }

  function clearSignature() {
    setupSignatureCanvas(canvasRef.current);
    drawingRef.current = false;
    lastPointRef.current = null;
    setDraftHasSignature(false);
    setMessage("");
  }

  function startDrawing(event) {
    const canvas = canvasRef.current;
    if (!canvas || !signatureCanvasReady || isGenerating) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(canvas, event);
  }

  function continueDrawing(event) {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const context = canvas.getContext("2d");
    const point = getCanvasPoint(canvas, event);
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
    setDraftHasSignature(true);
  }

  function stopDrawing(event) {
    if (!drawingRef.current) return;
    event?.preventDefault?.();
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function confirmSignature() {
    if (!draftHasSignature || !signatureCanvasReady || !canvasRef.current) return;
    setSignatureDataUrl(getTrimmedSignatureDataUrl(canvasRef.current));
    setHasSignature(true);
    setSignatureOpen(false);
    setMessage("");
  }

  async function createPdf() {
    if (!hasSignature || !signatureDataUrl || isGenerating) return;
    setIsGenerating(true);
    setMessage("");
    try {
      const progress = { phase: "payment" };
      const saveOperation = (async () => {
        const payment = normalizePaymentConfirmation(paymentDraft);
        const paymentPatch = await withProtocolSaveTimeout(
          saveJobPaymentConfirmation({ supabase, job, payment }),
          { phase: "payment", timeoutMs: PROTOCOL_SAVE_STEP_TIMEOUT_MS },
        );
        const updatedJob = { ...job, ...paymentPatch };
        const signedAt = new Date();
        progress.phase = "pdf";
        const result = await withProtocolSaveTimeout(
          createJobProtocolPdfFile({ job: updatedJob, profiles, signatureDataUrl, signedAt, payment }),
          { phase: "pdf", timeoutMs: PROTOCOL_SAVE_STEP_TIMEOUT_MS },
        );
        progress.phase = "storage";
        const record = await storeJobProtocol({
          supabase,
          job: updatedJob,
          pdfBlob: result.pdfBlob,
          fileName: result.fileName,
          signedAt,
          replaceExisting: Boolean(savedRecord),
        });
        return { paymentPatch, record };
      })();
      const { paymentPatch, record } = await withProtocolSaveTimeout(saveOperation, {
        phase: () => progress.phase,
        timeoutMs: PROTOCOL_SAVE_TOTAL_TIMEOUT_MS,
      });
      const wasReplacement = Boolean(savedRecord);
      setSavedRecord(record);
      setEditing(false);
      setActionMenuOpen(false);
      setMessage(wasReplacement ? "Protokół został zaktualizowany i podpisany ponownie." : "Protokół został zapisany przy zakończonym zleceniu.");
      onSaved?.(record, paymentPatch);
    } catch (error) {
      if (isProtocolSaveTimeoutError(error)) {
        logDiagnostic("protocol.save.timeout", {
          jobId: String(job?.id || ""),
          phase: String(error?.phase || "save"),
          timeoutMs: Number(error?.timeoutMs || 0),
        });
        setMessage(PROTOCOL_SAVE_TIMEOUT_MESSAGE);
      } else if (error?.name !== "AbortError") {
        setMessage(error?.message || "Nie udało się utworzyć i zapisać protokołu PDF.");
      }
    } finally {
      // Każda ścieżka — sukces, błąd i timeout — musi ponownie odblokować ekran.
      setIsGenerating(false);
    }
  }

  async function runSavedAction(action) {
    if (!savedRecord || actionBusy) return;
    setActionBusy(action);
    setMessage("");
    try {
      if (action === "download") {
        await downloadStoredJobProtocol({ supabase, record: savedRecord });
        setMessage("Pobieranie protokołu zostało uruchomione.");
      } else if (action === "email") {
        const result = await sendJobProtocolEmail({ supabase, record: savedRecord, job });
        setMessage(`Protokół został wysłany z ${result.senderEmail} do ${result.recipientEmail}.`);
      } else {
        await shareStoredJobProtocol({ supabase, record: savedRecord, intent: "print" });
        setMessage("Obraz protokołu został przekazany do drukowania bez zapisywania w telefonie.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setMessage(error?.message || "Nie udało się wykonać operacji na protokole.");
    } finally {
      setActionBusy("");
    }
  }

  const storedPayment = getPaymentDraftFromJob(job);
  const paymentVisible = editing ? paymentDraft : storedPayment;
  const recipientEmail = getJobProtocolRecipientEmail(job);
  const canSendEmail = isValidProtocolEmail(recipientEmail);

  return (
    <>
      <AppModal
        open={open}
        onClose={isGenerating || signatureOpen ? undefined : onClose}
        overlayClassName="formOverlay mobileDeviceWizardOverlay"
        contentClassName="card modal mobileDeviceWizardModal protocolWizardModal"
        closeOnOverlay={!isGenerating && !signatureOpen}
        closeOnEscape={!isGenerating && !signatureOpen}
      >
        <div className="mobileDeviceWizard mobileProtocolWizard">
          <div className="mobileDeviceWizardHeader">
            <button type="button" className="mobileDeviceWizardBack" onClick={onClose} disabled={isGenerating} aria-label="Wróć"><ProtocolBackIcon /></button>
            <h2>Protokół klienta</h2>
            <button type="button" className="mobileDeviceWizardClose" onClick={onClose} disabled={isGenerating}>Zamknij</button>
          </div>
          <div className="mobileDeviceWizardStep protocolTestVersionStep"><span>PDF</span>Wersja testowa · {APP_VERSION}</div>

          <div className="mobileDeviceWizardBody mobileProtocolWizardBody">
            <p className="protocolTestClientName">{protocolData.client}</p>
            <div className={`protocolTestNotice${savedRecord && !editing ? " saved" : ""}`} role="note">
              {savedRecord && !editing
                ? `Protokół podpisany i zapisany${formatStoredProtocolDate(savedRecord.signed_at || savedRecord.created_at) ? ` · ${formatStoredProtocolDate(savedRecord.signed_at || savedRecord.created_at)}` : ""}.`
                : "Protokół jest opcjonalny i nie zmienia statusu zakończonego zlecenia."}
            </div>

            <section className="protocolTestSection">
              <h3>Dane z karty zlecenia</h3>
              <dl className="protocolTestDetails">
                <div><dt>Klient</dt><dd>{protocolData.client}</dd></div>
                <div><dt>Telefon</dt><dd>{protocolData.phone}</dd></div>
                <div><dt>E-mail</dt><dd>{protocolData.email}</dd></div>
                <div><dt>Adres</dt><dd>{protocolData.address}</dd></div>
                <div><dt>Data montażu</dt><dd>{protocolData.installationDate}</dd></div>
                <div><dt>Status</dt><dd>{protocolData.status}</dd></div>
                <div className="protocolTestWide"><dt>Monterzy</dt><dd>{protocolData.technicians.join(", ")}</dd></div>
                {protocolData.completedAt !== "-" ? <div><dt>Zakończono</dt><dd>{protocolData.completedAt}</dd></div> : null}
                {protocolData.completedBy !== "-" ? <div><dt>Zakończył</dt><dd>{protocolData.completedBy}</dd></div> : null}
              </dl>
            </section>

            <section className="protocolTestSection">
              <h3>Urządzenia i tabliczki</h3>
              <div className="protocolTestDevices">
                <div className="protocolTestDeviceHeader"><span>Urządzenie</span><span>Model / moc</span><span>Tabliczka</span></div>
                {protocolData.deviceRows.length ? protocolData.deviceRows.map((row, index) => (
                  <div className="protocolTestDeviceRow" key={`${row.unit}-${index}`}>
                    <strong>{row.unit}</strong><span>{row.model}</span><span>{row.nameplate}</span>
                  </div>
                )) : <div className="protocolTestEmpty">Brak urządzeń w karcie zlecenia.</div>}
              </div>
              <div className="protocolTestPhotoSummary">
                <span>Tabliczki: <strong>{protocolData.readyNameplateCount} z {protocolData.requiredNameplateCount}</strong></span>
                <span>Pozostałe zdjęcia: <strong>{protocolData.regularPhotoCount}</strong></span>
              </div>
            </section>

            {editing || paymentVisible.enabled ? <section className="protocolTestSection protocolPaymentSection">
              <div className="protocolPaymentHeading">
                <h3>Potwierdzenie zapłaty</h3>
                {editing ? (
                  <label className="protocolPaymentToggle">
                    <input type="checkbox" checked={paymentDraft.enabled} onChange={(event) => updatePaymentDraft({ enabled: event.target.checked })} disabled={isGenerating} />
                    <span>{paymentDraft.enabled ? "Dodane" : "Dodaj"}</span>
                  </label>
                ) : null}
              </div>
              {paymentVisible.enabled && editing ? (
                <div className="protocolPaymentForm">
                  <label><span>Kwota</span><div className="protocolPaymentAmount"><input className="input" inputMode="decimal" placeholder="0,00" value={paymentDraft.amount} onChange={(event) => updatePaymentDraft({ amount: event.target.value })} disabled={isGenerating} /><b>zł</b></div></label>
                  <label><span>Rodzaj</span><select className="input" value={paymentDraft.kind} onChange={(event) => updatePaymentDraft({ kind: event.target.value })} disabled={isGenerating}>{PAYMENT_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label><span>Sposób płatności</span><select className="input" value={paymentDraft.method} onChange={(event) => updatePaymentDraft({ method: event.target.value })} disabled={isGenerating}>{PAYMENT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label><span>Data zapłaty</span><input className="input" type="date" value={paymentDraft.paidDate} onChange={(event) => updatePaymentDraft({ paidDate: event.target.value })} disabled={isGenerating} /></label>
                </div>
              ) : null}
              {paymentVisible.enabled && !editing ? (
                <dl className="protocolPaymentSummary">
                  <div><dt>Kwota</dt><dd>{formatPaymentAmount(paymentVisible.amount)}</dd></div>
                  <div><dt>Rodzaj</dt><dd>{getPaymentKindLabel(paymentVisible.kind)}</dd></div>
                  <div><dt>Sposób</dt><dd>{getPaymentMethodLabel(paymentVisible.method)}</dd></div>
                  <div><dt>Data</dt><dd>{paymentVisible.paidDate.split("-").reverse().join(".")}</dd></div>
                </dl>
              ) : null}
            </section> : null}

            <section className="protocolTestSection">
              <h3>Potwierdzenie klienta</h3>
              <div className={`protocolTestSignatureStatus${hasSignature || (savedRecord && !editing) ? " ready" : ""}`}>
                {hasSignature || (savedRecord && !editing) ? <div>
                  <strong>{savedRecord && !editing ? "Protokół podpisany i zapisany" : "Podpis klienta zapisany"}</strong>
                  {savedRecord && !editing ? null : <span>Możesz zapisać protokół PDF albo zmienić podpis.</span>}
                </div> : null}
                {editing ? (
                  <button type="button" className="btn protocolTestSignatureOpen" onClick={openSignature} disabled={isGenerating}>{hasSignature ? "Zmień podpis" : "Podpis klienta"}</button>
                ) : (
                  <button type="button" className="btn protocolTestSignatureOpen" onClick={beginEditingStoredProtocol}>Uzupełnij protokół</button>
                )}
              </div>
            </section>

            {actionMenuOpen && savedRecord && !editing ? (
              <section className="protocolOutputActions" aria-label="Drukowanie i wysyłka protokołu">
                <h3>Drukuj lub wyślij</h3>
                <button type="button" className="btn primary" onClick={() => runSavedAction("print")} disabled={Boolean(actionBusy)}>{actionBusy === "print" ? "Przygotowuję..." : "Drukuj protokół"}</button>
                <div className="protocolEmailAction">
                  <button type="button" className="btn" onClick={() => runSavedAction("email")} disabled={Boolean(actionBusy) || !canSendEmail}>{actionBusy === "email" ? "Wysyłam..." : `Wyślij z ${JOB_PROTOCOL_EMAIL_SENDER}`}</button>
                  <span>{canSendEmail ? `Do: ${recipientEmail}` : "Uzupełnij prawidłowy e-mail klienta w zleceniu."}</span>
                </div>
                <button type="button" className="btn" onClick={() => runSavedAction("download")} disabled={Boolean(actionBusy)}>{actionBusy === "download" ? "Pobieram..." : "Zapisz PDF w telefonie"}</button>
              </section>
            ) : null}
            {message ? <div className="protocolTestMessage" role="status">{message}</div> : null}
          </div>

          <div className="mobileDeviceWizardFooter">
            <div className="protocolTestFooterActions">
              <button type="button" className="btn" onClick={onClose} disabled={isGenerating || Boolean(actionBusy)}>Zamknij</button>
              {savedRecord && !editing ? (
                <button type="button" className="btn primary protocolTestGenerate" onClick={() => setActionMenuOpen((value) => !value)} disabled={Boolean(actionBusy)}>Drukuj lub wyślij</button>
              ) : (
                <button type="button" className="btn primary protocolTestGenerate" onClick={createPdf} disabled={!hasSignature || isGenerating}>{isGenerating ? "Zapisuję protokół..." : "Zapisz protokół"}</button>
              )}
            </div>
          </div>
        </div>
      </AppModal>

      <AppModal open={signatureOpen} onClose={closeSignature} overlayClassName="protocolSignatureOverlay" contentClassName="protocolSignatureModal" closeOnOverlay={false} closeOnEscape>
        <div className="protocolSignatureScreen">
          <div className="protocolSignatureHeader">
            <button type="button" className="protocolSignatureBack" onClick={closeSignature} aria-label="Wróć"><ProtocolBackIcon /></button>
            <div><h2>Podpis klienta</h2><p>{protocolData.client}</p></div>
          </div>
          <p className="protocolSignatureInstruction">Proszę podpisać się palcem w białym polu. Ten ekran nie przewija się podczas podpisywania.</p>
          <div className="protocolSignatureCanvasWrap">
            <canvas ref={canvasRef} id="protocol-test-signature" className="protocolSignatureCanvas" onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} onPointerLeave={stopDrawing} aria-label="Pole podpisu klienta" />
          </div>
          <div className="protocolSignatureActions">
            <button type="button" className="btn" onClick={clearSignature} disabled={!draftHasSignature || !signatureCanvasReady}>Wyczyść podpis</button>
            <button type="button" className="btn primary" onClick={confirmSignature} disabled={!draftHasSignature || !signatureCanvasReady}>Zatwierdź podpis</button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
