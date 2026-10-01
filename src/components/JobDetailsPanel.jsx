import React from "react";
import { IconCalendar, IconCamera, IconCheckCircle, IconClock, IconFileText, IconImage, IconMail, IconMapPin, IconMessageCircle, IconPhone, IconUsers } from "./ui.jsx";
import { getInitials, getJobTypeClass, getJobTypeLabel, getViewerNames, renderInitialBadges } from "../utils/jobHelpers.jsx";
import JobAddressLink from "./JobAddressLink.jsx";
import DesktopJobDeviceCards from "./desktop/DesktopJobDeviceCards.jsx";
import DesktopJobProtocolCard from "./desktop/DesktopJobProtocolCard.jsx";
import { canAddJobComment, canDeleteJob, canDeleteJobComment, canEditJob, canManageAdminNote, canManageJobViewers, canModifyJobPhotos, canWorkerFinishJob, isWorkerLockedCompletedJob, STATUSES } from "../utils/jobPermissions.js";
import { getJobDeviceRows } from "../modules/job-devices.js";
import { blockUnsavedWork } from "../modules/update-reload-guard.js";
import { confirmVatInvoiceFromFakturownia, saveVatInvoiceStatus } from "../modules/jobs-crud.js";
import { prepareFakturowniaInvoice, verifyFakturowniaInvoice } from "../modules/fakturownia.js";


function getSafeJobDeviceRows(job = {}) {
  try {
    const rows = getJobDeviceRows(job || {});
    return Array.isArray(rows) ? rows.filter(Boolean) : [];
  } catch (error) {
    console.error('Nie udało się odczytać urządzeń w szczegółach montażu. Zastosowano pustą listę awaryjną.', error, job);
    return [];
  }
}

function formatInstallationDate(dateStr = "") {
  if (!dateStr) return "-";
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1].slice(-2)}`;
  }
  return dateStr;
}

function formatCompletionDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getPaymentMethodDisplay(job = {}) {
  const method = String(job?.payment_method || '').trim().toLowerCase();
  if (method === 'cash') return { label: 'Gotówka', className: 'cash' };
  if (method === 'transfer') return { label: 'Przelew', className: 'transfer' };
  return { label: 'Nieokreślono', className: 'unknown' };
}

function formatViewerChipName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0];
  const [firstName, ...rest] = parts;
  return `${firstName.charAt(0)}. ${rest.join(" ")}`;
}

function getPhoneHref(phone = "") {
  const normalizedPhone = String(phone || "").replace(/[^+\d]/g, "");
  return normalizedPhone ? `tel:${normalizedPhone}` : "";
}

const DESKTOP_INVOICE_EMAIL_SUBJECT = "Faktura VAT Klimatyzacja";
const DESKTOP_INVOICE_EMAIL_BODY = `Witam,

FV w załączniku. Proszę zerknąć, czy dane się zgadzają.

Mam też małą prośbę — mam nadzieję, że są Państwo zadowoleni 🙂 Jeśli można, proszę o kilka gwiazdek i krótką opinię o mojej firmie w Google pod tym adresem:

https://g.page/r/CT1HzUgl3dXeEAg/review

Dziękuję 🙂`;

function getDesktopInvoiceEmailHref(email = "") {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) return "";
  return `mailto:${normalizedEmail}?subject=${encodeURIComponent(DESKTOP_INVOICE_EMAIL_SUBJECT)}&body=${encodeURIComponent(DESKTOP_INVOICE_EMAIL_BODY)}`;
}

function isNameplatePhoto(photo = {}) {
  const photoKind = String(photo?.photo_kind || '').trim().toLowerCase();
  const storagePath = String(photo?.storage_path || photo?.path || '').trim();
  return photoKind === 'nameplate' || /\/nameplates\//i.test(storagePath);
}


export default function JobDetailsPanel({
  selectedJob,
  isAdmin,
  busy,
  profiles,
  formatDate,
  openEditJob,
  openSerialNumbersJob,
  deleteJob,
  deleteDeviceFromJob,
  setSelectedJob,
  requestClearAdminNote,
  openPreview,
  deletePhoto,
  deletingPhotoId,
  handlePhotoUpload,
  toggleViewer,
  commentDrafts,
  setCommentDrafts,
  addComment,
  requestRemoveComment,
  updateStatus,
  showReturnToCalendar = false,
  calendarReturnDateKey = "",
  onReturnToCalendar,
  detailsLoading = false,
  onRetryDetails,
  supabase,
  setJobs,
  setSelectedJobByUpdater,
}) {
  const selectedJobId = String(selectedJob?.id || '');
  const currentCommentDraft = selectedJobId ? String(commentDrafts?.[selectedJobId] || '') : '';
  const [commentSaving, setCommentSaving] = React.useState(false);
  const [vatInvoiceSaving, setVatInvoiceSaving] = React.useState(false);
  const [fakturowniaOpening, setFakturowniaOpening] = React.useState(false);
  const [fakturowniaVerifying, setFakturowniaVerifying] = React.useState(false);
  const fakturowniaVerificationRef = React.useRef(null);
  const fakturowniaVerificationBusyRef = React.useRef(false);
  const commentHasUnsavedWork = Boolean(selectedJobId && (currentCommentDraft.trim() || commentSaving));

  React.useEffect(() => {
    setCommentSaving(false);
    setVatInvoiceSaving(false);
    setFakturowniaOpening(false);
    setFakturowniaVerifying(false);
    fakturowniaVerificationRef.current = null;
    fakturowniaVerificationBusyRef.current = false;
  }, [selectedJobId]);

  React.useEffect(() => {
    if (!isAdmin || !selectedJobId) return undefined;

    let timer = null;
    const verifyAfterReturn = () => {
      if (document.visibilityState === 'hidden' || !fakturowniaVerificationRef.current) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void verifyPendingFakturowniaInvoice();
      }, 700);
    };

    window.addEventListener('focus', verifyAfterReturn);
    document.addEventListener('visibilitychange', verifyAfterReturn);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('focus', verifyAfterReturn);
      document.removeEventListener('visibilitychange', verifyAfterReturn);
    };
  }, [isAdmin, selectedJobId, supabase]);

  React.useEffect(() => {
    if (!commentHasUnsavedWork) return undefined;
    return blockUnsavedWork(`desktop-job-comment:${selectedJobId}`);
  }, [commentHasUnsavedWork, selectedJobId]);

  async function handleAddComment() {
    if (!selectedJobId || commentSaving) return;
    setCommentSaving(true);
    try {
      await addComment?.(selectedJobId, 'Komentarz');
    } finally {
      setCommentSaving(false);
    }
  }

  if (!selectedJob) {
    return <div className="card premiumCard"><div className="muted">Kliknij dowolny wiersz w tabeli, aby zobaczyć szczegóły montażu.</div></div>;
  }

  const photos = Array.isArray(selectedJob.photos) ? selectedJob.photos : [];
  const detailsLoaded = Boolean(selectedJob.detailsLoaded);
  const detailsLoadError = String(selectedJob.detailsLoadError || '').trim();
  const showDetailsLoading = !detailsLoaded && !detailsLoadError;
  const accessViewers = Array.isArray(selectedJob.viewers) ? selectedJob.viewers : [];
  const installersConfirmed = Array.isArray(selectedJob.installer_ids);
  const installerIds = [...new Set(
    (installersConfirmed
      ? selectedJob.installer_ids
      : [selectedJob.main_technician_id, ...accessViewers.map((viewer) => viewer?.user_id)])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  const viewers = installerIds.map((userId) => ({ user_id: userId }));
  const comments = Array.isArray(selectedJob.comments) ? selectedJob.comments : [];
  const isWorkerCompletedLock = isWorkerLockedCompletedJob(selectedJob, isAdmin);
  const canFinishJob = canWorkerFinishJob(selectedJob, isAdmin);
  const canEditSelectedJob = canEditJob(selectedJob, isAdmin);
  const canModifySelectedJobPhotos = canModifyJobPhotos(selectedJob, isAdmin);
  const canAddSelectedJobComment = canAddJobComment(selectedJob, isAdmin);
  const canManageSelectedJobViewers = canManageJobViewers(selectedJob, isAdmin);
  const canManageSelectedAdminNote = canManageAdminNote(selectedJob, isAdmin);
  const canDeleteSelectedJob = canDeleteJob(selectedJob, isAdmin);
  const canSubmitComment = canAddSelectedJobComment && !busy && !commentSaving && currentCommentDraft.trim().length > 0;
  const jobDevices = getSafeJobDeviceRows(selectedJob);
  const phoneHref = getPhoneHref(selectedJob.phone);
  const installationDateLabel = formatInstallationDate(selectedJob.installation_date);
  const completionDateTimeLabel = formatCompletionDateTime(selectedJob.completed_at);
  const paymentMethodDisplay = getPaymentMethodDisplay(selectedJob);
  const completedByProfile = (profiles || []).find((person) => String(person?.id || '') === String(selectedJob.completed_by || ''));
  const completedByLabel = completedByProfile?.full_name || completedByProfile?.email || '';
  const isCompletedJob = String(selectedJob.status || '') === 'Zakończone';
  const statusLabel = getJobTypeLabel(selectedJob);
  const statusClassName = getJobTypeClass(selectedJob);
  const installationPhotos = photos.filter((photo) => !isNameplatePhoto(photo));
  const nameplatePhotos = photos.filter((photo) => isNameplatePhoto(photo));

  const handleDesktopOcrSaved = async (saved) => {
    const patchJob = (job) => {
      if (!job || String(job.id) !== String(selectedJob.id)) return job;
      const patchPhoto = (photo) => (
        saved.photoOcrStatus && String(photo.id) === String(saved.photoOcrStatus.id)
          ? { ...photo, ...saved.photoOcrStatus }
          : photo
      );
      const nextPhotos = Array.isArray(job.photos) ? job.photos.map(patchPhoto) : job.photos;
      const nextNameplatePhotosMeta = Array.isArray(job.nameplatePhotosMeta)
        ? job.nameplatePhotosMeta.map(patchPhoto)
        : job.nameplatePhotosMeta;
      return {
        ...job,
        devices: saved.devices,
        device_model: saved.device_model,
        device_serial_number: saved.device_serial_number,
        photos: nextPhotos,
        nameplatePhotosMeta: nextNameplatePhotosMeta,
      };
    };

    setJobs?.((previous) => previous.map(patchJob));
    setSelectedJobByUpdater?.(patchJob);
  };

  const handleManualNameplateVerificationChanged = (result) => {
    const targetDeviceIndex = Number(result?.deviceIndex || 0);
    const targetUnitRef = String(result?.unitRef || '').trim().toLowerCase();
    const patchJob = (job) => {
      if (!job || String(job.id) !== String(selectedJob.id)) return job;
      const current = Array.isArray(job.nameplateVerifications) ? job.nameplateVerifications : [];
      const filtered = current.filter((item) => !(
        Number(item?.device_index || 0) === targetDeviceIndex
        && String(item?.unit_ref || '').trim().toLowerCase() === targetUnitRef
      ));
      return {
        ...job,
        nameplateVerifications: result?.removed || !result?.verification
          ? filtered
          : [...filtered, result.verification],
        nameplateVerificationTableMissing: false,
      };
    };

    setJobs?.((previous) => previous.map(patchJob));
    setSelectedJobByUpdater?.(patchJob);
  };

  async function handleVatInvoiceToggle() {
    if (!isAdmin || !selectedJobId || vatInvoiceSaving || fakturowniaVerifying) return;
    if (selectedJob?.vat_invoice_fakturownia_confirmed) return;
    const nextIssued = !Boolean(selectedJob?.vat_invoice_issued);
    setVatInvoiceSaving(true);
    try {
      const saved = await saveVatInvoiceStatus({
        supabase,
        jobId: selectedJobId,
        issued: nextIssued,
      });
      const issued = Boolean(saved?.vat_invoice_issued ?? nextIssued);
      const patchJob = (job) => (
        job && String(job.id) === selectedJobId
          ? { ...job, vat_invoice_issued: issued }
          : job
      );
      setJobs?.((previous) => previous.map(patchJob));
      setSelectedJobByUpdater?.(patchJob);
      // Ręczna decyzja administratora ma pierwszeństwo nad oczekującą automatyczną kontrolą.
      fakturowniaVerificationRef.current = null;
    } catch (error) {
      console.error('Nie udało się zapisać statusu faktury VAT.', error);
      window.alert(`Nie udało się zapisać statusu faktury VAT. ${error?.message || ''}`.trim());
    } finally {
      setVatInvoiceSaving(false);
    }
  }


  async function verifyPendingFakturowniaInvoice() {
    const pending = fakturowniaVerificationRef.current;
    if (!isAdmin || !selectedJobId || !pending || fakturowniaVerificationBusyRef.current) return;
    if (selectedJob?.vat_invoice_fakturownia_confirmed) {
      fakturowniaVerificationRef.current = null;
      return;
    }
    if (String(pending.jobId || '') !== selectedJobId) return;

    fakturowniaVerificationBusyRef.current = true;
    setFakturowniaVerifying(true);
    try {
      const result = await verifyFakturowniaInvoice({
        supabase,
        jobId: selectedJobId,
        clientId: pending.clientId,
        knownInvoiceIds: pending.knownInvoiceIds,
      });

      if (!result?.found || !result?.invoiceId) return;

      const saved = await confirmVatInvoiceFromFakturownia({
        supabase,
        jobId: selectedJobId,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
      });
      const patchJob = (job) => (
        job && String(job.id) === selectedJobId
          ? {
              ...job,
              vat_invoice_issued: true,
              vat_invoice_fakturownia_confirmed: true,
              vat_invoice_fakturownia_invoice_id: saved?.vat_invoice_fakturownia_invoice_id || String(result.invoiceId),
              vat_invoice_fakturownia_invoice_number: saved?.vat_invoice_fakturownia_invoice_number || String(result.invoiceNumber || ''),
              vat_invoice_fakturownia_confirmed_at: saved?.vat_invoice_fakturownia_confirmed_at || job.vat_invoice_fakturownia_confirmed_at || new Date().toISOString(),
            }
          : job
      );
      setJobs?.((previous) => previous.map(patchJob));
      setSelectedJobByUpdater?.(patchJob);
      fakturowniaVerificationRef.current = null;
    } catch (error) {
      console.warn('Nie udało się automatycznie sprawdzić faktury w Fakturowni.', error);
    } finally {
      fakturowniaVerificationBusyRef.current = false;
      setFakturowniaVerifying(false);
    }
  }


  async function handleOpenFakturowniaInvoice() {
    if (!isAdmin || !selectedJobId || fakturowniaOpening) return;

    const invoiceWindow = window.open('about:blank', '_blank');
    if (!invoiceWindow) {
      window.alert('Przeglądarka zablokowała nowe okno. Zezwól na wyskakujące okna dla aplikacji WAWIS i spróbuj ponownie.');
      return;
    }

    try {
      invoiceWindow.opener = null;
      invoiceWindow.document.title = 'Łączenie z Fakturownią';
      invoiceWindow.document.body.innerHTML = '<div style="font-family:Arial,sans-serif;padding:28px;color:#263845">Łączenie z Fakturownią…</div>';
    } catch {
      // Puste okno może zostać zabezpieczone przez przeglądarkę; nawigacja nadal zadziała.
    }

    setFakturowniaOpening(true);
    try {
      const prepared = await prepareFakturowniaInvoice({
        supabase,
        jobId: selectedJobId,
      });
      if (selectedJob?.vat_invoice_fakturownia_confirmed) {
        fakturowniaVerificationRef.current = null;
      } else if (prepared?.clientId) {
        fakturowniaVerificationRef.current = {
          jobId: selectedJobId,
          clientId: String(prepared.clientId),
          knownInvoiceIds: Array.isArray(prepared.existingInvoiceIds) ? prepared.existingInvoiceIds.map(String) : [],
        };
      }
      invoiceWindow.location.replace(prepared.invoiceUrl);
    } catch (error) {
      try { invoiceWindow.close(); } catch {}
      console.error('Nie udało się przygotować klienta w Fakturowni.', error);
      window.alert(`Nie udało się otworzyć Fakturowni. ${error?.message || ''}`.trim());
    } finally {
      setFakturowniaOpening(false);
    }
  }

  return (
    <div className="card premiumCard jobDetailsPanelCard">
      <div className="jobDetailsStickyBar">
        <div className="jobDetailsStickyIdentity">
          <h2 className="detailTitle jobDetailsStickyTitle">{selectedJob.client || selectedJob.title}</h2>
          <div className="jobDetailsStickyMeta" aria-label="Podstawowe informacje o wybranym montażu">
            <span className={`jobTypeTag desktopJobTypeTag jobDetailsStatusChip ${statusClassName}`}>{statusLabel}</span>
            <span className="jobDetailsDateChip"><IconCalendar /> {installationDateLabel}</span>
            {isAdmin ? (
              <div className="desktopInvoiceActionsRow" aria-label="Faktura VAT i płatność">
                <button
                  type="button"
                  className={`desktopVatInvoiceToggle desktopVatInvoiceHeaderToggle ${selectedJob.vat_invoice_issued ? 'issued' : 'missing'}`}
                  onClick={handleVatInvoiceToggle}
                  disabled={vatInvoiceSaving || fakturowniaVerifying || Boolean(selectedJob.vat_invoice_fakturownia_confirmed)}
                  aria-pressed={Boolean(selectedJob.vat_invoice_issued)}
                  title={selectedJob.vat_invoice_fakturownia_confirmed
                    ? 'Faktura została potwierdzona w Fakturowni — statusu nie można już cofnąć.'
                    : 'Status możesz zmienić ręcznie; po powrocie z Fakturowni aplikacja sprawdza też, czy faktycznie powstała faktura VAT'}
                >
                  <span className="desktopVatInvoiceDot" aria-hidden="true" />
                  <span className="desktopVatInvoiceHeaderLabel">Faktura VAT</span>
                  <span>{fakturowniaVerifying
                    ? 'Sprawdzam…'
                    : (vatInvoiceSaving
                      ? 'Zapisywanie…'
                      : (selectedJob.vat_invoice_issued ? 'Wystawiona' : 'Niewystawiona'))}</span>
                </button>

                <span
                  className={`desktopPaymentMethodChip ${paymentMethodDisplay.className}`}
                  title="Metoda płatności odczytana z protokołu montażu"
                  aria-label={`Płatność: ${paymentMethodDisplay.label}`}
                >
                  <span className="desktopPaymentMethodDot" aria-hidden="true" />
                  <span className="desktopPaymentMethodHeaderLabel">Płatność</span>
                  <span>{paymentMethodDisplay.label}</span>
                </span>

                <button
                  type="button"
                  className="desktopFakturowniaButton"
                  onClick={handleOpenFakturowniaInvoice}
                  disabled={fakturowniaOpening}
                  title={selectedJob.vat_invoice_fakturownia_confirmed
                    ? 'Otwórz Fakturownię — status tej faktury jest już potwierdzony i nie będzie ponownie sprawdzany.'
                    : 'Przenieś dane klienta do Fakturowni i otwórz formularz faktury'}
                >
                  <span>{fakturowniaOpening ? 'Łączenie…' : 'Wystaw fakturę'}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="jobDetailsQuickActions" aria-label="Szybkie akcje montażu">
          {canEditSelectedJob && isAdmin ? (
            <button className="btn premiumActionBtn jobDetailsQuickBtn" onClick={() => openEditJob(selectedJob)}>
              Edytuj
            </button>
          ) : null}
          <button className="btn premiumActionBtn jobDetailsQuickBtn" onClick={() => setSelectedJob(null)}>
            Zamknij
          </button>
        </div>
      </div>

      {showReturnToCalendar ? (
        <div className="jobDetailsReturnRow">
          <button
            type="button"
            className="btn ghostBtn jobDetailsReturnCalendarBtn"
            onClick={onReturnToCalendar}
            title={calendarReturnDateKey ? `Wróć do kalendarza na dzień ${calendarReturnDateKey}` : 'Wróć do kalendarza'}
          >
            Wróć do kalendarza
          </button>
        </div>
      ) : null}

      {isWorkerCompletedLock ? (
        <div className="muted workerReadOnlyNote jobDetailsReadOnlyNote">Zlecenie zakończone — karta jest tylko do podglądu dla pracownika.</div>
      ) : null}

      {detailsLoadError ? (
        <div className="jobDetailsLoadError" role="status">
          <span>{detailsLoadError}</span>
          <button type="button" className="btn premiumActionBtn" onClick={onRetryDetails} disabled={detailsLoading}>
            {detailsLoading ? 'Pobieranie...' : 'Ponów'}
          </button>
        </div>
      ) : null}

      <div className="jobDetailsContent">
        <section className="detailsSection jobDetailsSectionCard">
          <h4 className="sectionHeadingWithIcon"><IconUsers /><span>Klient</span></h4>
          <div className="detailMeta">
            <div className="infoItem">
              <span className="infoLabel infoLabelWithIcon"><IconMail /><span>Email</span></span>
              <div className="infoValue">
                {selectedJob.email ? (
                  <div className="infoValueActions">
                    <a
                      href={getDesktopInvoiceEmailHref(selectedJob.email)}
                      className="emailLink"
                      title="Kliknij, aby otworzyć klienta poczty"
                      aria-label={`Wyślij email do ${selectedJob.email}`}
                    >
                      {selectedJob.email}
                    </a>
                  </div>
                ) : "Brak emaila"}
              </div>
            </div>

            <div className="infoItem">
              <span className="infoLabel infoLabelWithIcon"><IconPhone /><span>Telefon</span></span>
              <div className="infoValue">
                {selectedJob.phone ? (
                  <div className="infoValueActions">
                    <a
                      href={phoneHref || `tel:${selectedJob.phone}`}
                      className="phoneLink"
                      title="Kliknij, aby zadzwonić"
                      aria-label={`Zadzwoń pod numer ${selectedJob.phone}`}
                    >
                      {selectedJob.phone}
                    </a>
                  </div>
                ) : "Brak telefonu"}
              </div>
            </div>

          </div>
        </section>

        {isAdmin && isCompletedJob ? <DesktopJobProtocolCard job={selectedJob} supabase={supabase} /> : null}

        <section className="detailsSection jobDetailsSectionCard">
          <h4 className="sectionHeadingWithIcon"><IconMapPin /><span>Adres i termin</span></h4>
          <div className="detailMeta">
            <div className="infoItem infoItemWide">
              <span className="infoLabel infoLabelWithIcon"><IconMapPin /><span>Adres</span></span>
              <div className="infoValue">
                <JobAddressLink
                  job={selectedJob}
                  className="addressLink"
                  emptyLabel="Brak adresu"
                  title="Kliknij, aby otworzyć adres w Google Maps"
                />
              </div>
            </div>

            <div className="infoItem">
              <span className="infoLabel infoLabelWithIcon"><IconCalendar /><span>Data montażu</span></span>
              <div className="infoValue">{installationDateLabel}</div>
            </div>

            {isAdmin && isCompletedJob ? (
              <div className="infoItem">
                <span className="infoLabel infoLabelWithIcon"><IconClock /><span>Zakończono</span></span>
                <div className="infoValue">
                  {completionDateTimeLabel || 'Brak dokładnej godziny (zlecenie sprzed 9.14)'}
                  {completedByLabel ? <div className="muted jobCompletionBy">Przez: {completedByLabel}</div> : null}
                </div>
              </div>
            ) : null}

            {!isAdmin ? (
              <div className="infoItem">
                <span className="infoLabel infoLabelWithIcon"><IconClock /><span>Data utworzenia</span></span>
                <div className="infoValue">{selectedJob.created_at ? formatDate(selectedJob.created_at) : "-"}</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="detailsSection jobDetailsSectionCard desktopJobDevicesSection">
          <div className="desktopJobDevicesHeadingRow">
            <h4 className="sectionHeadingWithIcon"><IconCheckCircle /><span>Urządzenia</span></h4>
            {isAdmin && canEditSelectedJob ? (
              <button
                type="button"
                className="btn secondary desktopJobDevicesManageBtn"
                onClick={() => openSerialNumbersJob?.(selectedJob)}
                disabled={busy}
              >
                Dodaj / edytuj urządzenia i tabliczki
              </button>
            ) : null}
          </div>
          <DesktopJobDeviceCards
            job={selectedJob}
            devices={jobDevices}
            photos={photos}
            supabase={supabase}
            disabled={busy}
            onOpenPhoto={(photo) => openPreview(photo, 0, nameplatePhotos)}
            onOcrSaved={handleDesktopOcrSaved}
            manualVerifications={selectedJob.nameplateVerifications || []}
            onManualVerificationChanged={handleManualNameplateVerificationChanged}
            onDeleteDevice={isAdmin ? (deviceIndex) => deleteDeviceFromJob?.(selectedJob, deviceIndex) : null}
          />
        </section>

        <section className="detailsSection jobDetailsSectionCard">
          <h4 className="sectionHeadingWithIcon"><IconFileText /><span>Komentarz administratora</span></h4>
          <div className="muted">{selectedJob.admin_note || "Brak komentarza."}</div>
          {canManageSelectedAdminNote ? (
            <div className="row leftAlign adminNoteActions">
              <button
                type="button"
                className="btn premiumActionBtn premiumDangerBtn adminNoteDeleteBtn compactDangerBtn"
                onClick={() => requestClearAdminNote(selectedJob)}
                disabled={busy || !selectedJob.admin_note}
              >
                Usuń
              </button>
            </div>
          ) : null}
        </section>

        <section className="detailsSection jobDetailsSectionCard">
          <h4 className="sectionHeadingWithIcon"><IconCamera /><span>Zdjęcia montażu</span></h4>
          <div className="thumbGrid">
          {showDetailsLoading ? <div className="muted">Ładowanie zdjęć...</div> : null}
          {detailsLoaded ? installationPhotos.map((photo, photoIndex) => (
            <div key={photo.id} className="thumbCard">
              <button
                type="button"
                className="thumbBtn desktopThumbBtn"
                onClick={() => openPreview(photo, photoIndex, installationPhotos)}
                disabled={!photo.thumbnail_image_url && !photo.storage_path && !photo.original_image_url}
              >
                {photo.thumbnail_image_url ? (
                  <img
                    src={photo.thumbnail_image_url}
                    className="thumb desktopThumb"
                    alt="Zdjęcie montażu"
                    loading="lazy"
                    decoding="async"
                  />
                ) : <span className="muted">Kliknij, aby wczytać zdjęcie</span>}
              </button>
              <div className="photoMeta">
                <span className="photoMetaText">{formatDate(photo.created_at)}</span>
                <span className="photoMetaText" title={photo.uploader_name || "Pracownik"}>{getInitials(photo.uploader_name || "Pracownik")}</span>
              </div>
              {canModifySelectedJobPhotos ? (
                <button
                  type="button"
                  className="btn premiumActionBtn premiumDangerBtn photoDeleteBtn compactDangerBtn"
                  disabled={deletingPhotoId === photo.id || busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePhoto(photo);
                  }}
                >
                  {deletingPhotoId === photo.id ? "Usuwanie..." : "Usuń"}
                </button>
              ) : null}
            </div>
          )) : null}
          {detailsLoaded && installationPhotos.length === 0 ? <div className="muted">Brak dodatkowych zdjęć montażu. Tabliczki są dostępne przy odpowiednich JZ/JW powyżej.</div> : null}
          </div>
          <div className="photoUploadActions" aria-label="Dodawanie zdjęć do zlecenia">
            {canModifySelectedJobPhotos ? (
              <>
                <label className="btn photoUploadBtn photoUploadBtnCamera">
                  <span className="photoUploadBtnIcon"><IconCamera /></span>
                  <span className="photoUploadBtnLabel">Aparat</span>
                  <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => handlePhotoUpload(selectedJob.id, e)} />
                </label>
                <label className="btn photoUploadBtn photoUploadBtnGallery">
                  <span className="photoUploadBtnIcon"><IconImage /></span>
                  <span className="photoUploadBtnLabel">Galeria</span>
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => handlePhotoUpload(selectedJob.id, e)} />
                </label>
              </>
            ) : (
              <div className="muted">Zlecenie zakończone — pracownik nie może już dodawać ani usuwać zdjęć.</div>
            )}
          </div>
        </section>

        {canManageSelectedJobViewers || !isAdmin ? (
          <section className="detailsSection detailsSectionCompact jobDetailsSectionCard">
            <h4 className="sectionHeadingWithIcon"><IconUsers /><span>Monterzy</span></h4>
            {!installersConfirmed ? (
              <div className="muted" role="status" style={{ marginBottom: 8 }}>
                Lista monterów w tym starszym montażu nie została jeszcze potwierdzona. Zaznaczenia są podpowiedzią z dawnego dostępu do zlecenia.
              </div>
            ) : null}
            {canManageSelectedJobViewers ? (
              <div className="viewerInlineRow" aria-label="Wybór monterów">
                {profiles.map((person) => {
                  const active = viewers.some((viewer) => viewer.user_id === person.id);
                  const isMainTechnician = String(selectedJob.main_technician_id || '') === String(person.id || '');
                  const installerLabel = isMainTechnician
                    ? `${person.full_name} — główny monter (zmiana w edycji montażu)`
                    : `${person.full_name} — ${active ? "Monter" : "Nie monter"}`;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className={`viewerDot ${active ? "active" : ""}`}
                      onClick={() => toggleViewer(selectedJob.id, person.id)}
                      disabled={isMainTechnician}
                      title={installerLabel}
                      aria-label={installerLabel}
                    >
                      <span className="viewerDotText">{formatViewerChipName(person.full_name)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="infoValue">{renderInitialBadges(getViewerNames(selectedJob, profiles))}</div>
            )}
          </section>
        ) : null}

        <section className="detailsSection jobDetailsSectionCard">
          <h4 className="sectionHeadingWithIcon"><IconMessageCircle /><span>Komentarze i pytania</span></h4>
          <div className="comments">
          {showDetailsLoading ? <div className="muted">Ładowanie komentarzy...</div> : null}
          {detailsLoaded ? comments.map((comment) => (
            <div key={comment.id} className="comment">
              <div className="commentHeader">
                <div><strong>{comment.author_name}</strong> — {comment.type}</div>
                {canDeleteJobComment(comment, isAdmin) ? (
                  <button
                    type="button"
                    className="btn premiumActionBtn premiumDangerBtn commentDeleteBtn compactDangerBtn"
                    onClick={() => requestRemoveComment(comment)}
                    disabled={busy}
                  >
                    Usuń
                  </button>
                ) : null}
              </div>
              <div>{comment.text}</div>
            </div>
          )) : null}
          {detailsLoaded && comments.length === 0 ? <div className="muted">Brak komentarzy.</div> : null}
          </div>
          {canAddSelectedJobComment ? (
            <>
              <textarea className="input textarea" placeholder="Napisz komentarz..." value={currentCommentDraft} onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [selectedJob.id]: e.target.value }))} />
              <div className="row">
                <button className="btn premiumActionBtn commentAddBtn" onClick={() => void handleAddComment()} disabled={!canSubmitComment}>Dodaj komentarz</button>
              </div>
            </>
          ) : (
            <div className="muted">Zlecenie zakończone — pracownik nie może już dodawać komentarzy ani pytań.</div>
          )}
        </section>

        {isAdmin ? (
          <section className="detailsSection detailsSectionCompact jobDetailsSectionCard jobDetailsAdminActionsCard">
            <h4 className="sectionHeadingWithIcon"><IconCheckCircle /><span>Zarządzanie</span></h4>
            <label className="infoLabel" htmlFor={`job-status-${selectedJob.id}`}>Status montażu</label>
            <select id={`job-status-${selectedJob.id}`} className="input" value={selectedJob.status} onChange={(e) => updateStatus(selectedJob.id, e.target.value)}>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <div className="jobDetailsBottomActions">
              {canDeleteSelectedJob ? (
                <button className="btn premiumActionBtn premiumDangerBtn deleteCardBtn mobileActionCompact" onClick={() => deleteJob(selectedJob)}>
                  Usuń kartę
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {canFinishJob ? (
          <section className="detailsSection detailsSectionCompact jobDetailsSectionCard jobDetailsWorkerActionsCard">
            <h4 className="sectionHeadingWithIcon"><IconCheckCircle /><span>Akcje pracownika</span></h4>
            <button
              className="btn premiumActionBtn finishJobBtn mobileActionCompact"
              onClick={() => updateStatus(selectedJob.id, "Zakończone")}
              disabled={busy}
            >
              Zakończone zlecenie
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
