import React from "react";
import MOBILE_DEVICE_TABLE_V889_CSS from "./mobile-device-table-v889.css.js";
import { IconCalendar, IconCamera, IconCheckCircle, IconClock, IconFileText, IconImage, IconMail, IconMapPin, IconMessageCircle, IconPhone, IconUsers } from "./ui.jsx";
import { getInitials, getViewerNames, renderInitialBadges } from "../utils/jobHelpers.jsx";
import JobAddressLink from "./JobAddressLink.jsx";
import { canAddJobComment, canDeleteJob, canDeleteJobComment, canEditJob, canManageAdminNote, canManageJobViewers, canModifyJobPhotos, canWorkerFinishJob, canWorkerRestartJob, isWorkerLockedCompletedJob, STATUSES } from "../utils/jobPermissions.js";
import { getDeviceIndoorUnits, getDeviceOutdoorModel, getJobDeviceRows } from "../modules/job-devices.js";
import { getNameplatePhotoMetadata } from "../modules/photos.js";
import { formatMissingNameplateMessage, getJobNameplateCompletion, getLatestNameplatePhotoForUnit, isNameplatePhotoReady } from "../modules/nameplate-requirements.js";
import { formatStoredProtocolDate, loadJobProtocolRecord } from "../modules/job-protocol-storage.js";
import ProtocolTestModal from "./modals/ProtocolTestModal.jsx";

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

function formatViewerChipName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0];
  const [firstName, ...rest] = parts;
  return `${firstName.charAt(0)}. ${rest.join(" ")}`;
}


function DeviceUnitDocumentationRow({
  unitCode,
  unitLabel,
  model,
  photo,
  photoIndex,
  previewPhotos,
  openPreview,
  openEditor,
  busy,
  retryPhotoUpload,
}) {
  const photoUrl = photo?.thumbnail_image_url || photo?.local_preview_url || photo?.image_url || photo?.signed_url || photo?.original_image_url || '';
  const uploadStatus = String(photo?.upload_status || '').trim();
  const isLocal = uploadStatus === 'local';
  const isUploading = uploadStatus === 'uploading';
  const isFailed = uploadStatus === 'error';
  const isReady = isNameplatePhotoReady(photo);
  const modelLabel = String(model || '').trim() || 'Model nieuzupełniony';
  const isOutdoor = unitCode === 'JZ';

  function handleAction() {
    if (isUploading || busy) return;
    if (isFailed && photo) {
      retryPhotoUpload?.(photo);
      return;
    }
    if ((isReady || isLocal) && photo) {
      openPreview(photo, photoIndex, previewPhotos);
      return;
    }
    openEditor?.();
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleAction();
  }

  const actionLabel = isUploading
    ? 'Wysyłanie tabliczki'
    : isFailed
      ? 'Wyślij ponownie tabliczkę'
      : (isReady || isLocal)
        ? 'Otwórz tabliczkę znamionową'
        : 'Dodaj tabliczkę znamionową';

  const statusLabel = uploadStatus === 'local'
    ? 'Zapisano na telefonie'
    : uploadStatus === 'uploading'
      ? 'Wysyłanie'
      : uploadStatus === 'error'
        ? 'Błąd wysyłania'
        : photo
          ? 'Zapisano w systemie'
          : 'Brak tabliczki';

  const stateLabel = isReady
    ? 'Tabliczka zapisana'
    : isUploading
      ? 'Wysyłanie tabliczki'
      : isFailed
        ? 'Błąd wysyłania tabliczki'
        : isLocal
          ? 'Tabliczka zapisana na telefonie'
          : 'Brak tabliczki';

  return (
    <div
      className={`deviceUnitDocumentationRow${isReady ? ' hasNameplate' : ' missingNameplate'}`}
      role="button"
      tabIndex={busy || isUploading ? -1 : 0}
      aria-disabled={busy || isUploading}
      aria-label={`${actionLabel} ${unitCode}`}
      title={`${actionLabel} ${unitCode}`}
      onClick={handleAction}
      onKeyDown={handleKeyDown}
    >
      <div className="deviceUnitDocumentationIdentity">
        <span className={`deviceUnitDocumentationCode ${isOutdoor ? 'outdoor' : 'indoor'}`}>{unitCode}</span>
        <span className="deviceUnitDocumentationKind">{unitLabel}</span>
      </div>
      <div className="deviceUnitDocumentationModel" title={modelLabel}>
        <span>{modelLabel}</span>
      </div>
      <div className="deviceUnitDocumentationStatus" aria-label={`Tabliczka ${unitCode}: ${statusLabel}`}>
        <IconFileText />
        <span className={`deviceUnitDocumentationSync sync-${photo ? (uploadStatus || 'uploaded') : 'missing'}`}>{statusLabel}</span>
      </div>
      <div
        className={`deviceUnitDocumentationState ${isReady ? 'ready' : isFailed ? 'error' : isUploading ? 'uploading' : isLocal ? 'local' : 'missing'}`}
        role="img"
        aria-label={stateLabel}
        title={stateLabel}
      >
        <span aria-hidden="true">{isReady ? '✓' : isFailed ? '!' : isUploading ? '↻' : isLocal ? '•' : '—'}</span>
      </div>
    </div>
  );
}

function getPhotoUploadStatusLabel(photo = {}) {
  const explicitLabel = String(photo.upload_status_label || "").trim();
  if (explicitLabel) return explicitLabel;
  const status = String(photo.upload_status || "").trim();
  if (status === "local") return "Zapisano na telefonie";
  if (status === "uploading") return "Wysyłanie";
  if (status === "uploaded") return "Zapisano w systemie";
  if (status === "error") return "Błąd wysyłania";
  return "";
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
  retryPhotoUpload,
  onThumbnailLoadError,
  onThumbnailLoad,
  toggleViewer,
  commentDrafts,
  setCommentDrafts,
  addComment,
  requestRemoveComment,
  updateStatus,
  supabase,
  showReturnToCalendar = false,
  calendarReturnDateKey = "",
  onReturnToCalendar,
  detailsLoading = false,
  onRetryDetails,
}) {
  const [protocolTestOpen, setProtocolTestOpen] = React.useState(false);
  const [protocolRecord, setProtocolRecord] = React.useState(null);
  const [protocolLoading, setProtocolLoading] = React.useState(false);
  const [protocolMessage, setProtocolMessage] = React.useState("");
  const [protocolBackendAvailable, setProtocolBackendAvailable] = React.useState(true);
  const [protocolReloadKey, setProtocolReloadKey] = React.useState(0);
  const [expandedDeviceIndexes, setExpandedDeviceIndexes] = React.useState([]);
  const selectedJobId = String(selectedJob?.id || "");
  const selectedJobIsCompleted = String(selectedJob?.status || "") === "Zakończone";

  React.useEffect(() => {
    setExpandedDeviceIndexes([]);
  }, [selectedJobId]);

  React.useEffect(() => {
    let cancelled = false;
    setProtocolTestOpen(false);
    setProtocolRecord(null);
    setProtocolMessage("");
    setProtocolBackendAvailable(true);
    if (!supabase || !selectedJobId || !selectedJobIsCompleted) {
      setProtocolLoading(false);
      return () => { cancelled = true; };
    }

    setProtocolLoading(true);
    void loadJobProtocolRecord({ supabase, jobId: selectedJobId })
      .then((result) => {
        if (cancelled) return;
        setProtocolRecord(result.record);
        setProtocolBackendAvailable(result.backendAvailable);
        if (!result.backendAvailable) {
          setProtocolMessage("Obsługa zapisu protokołów wymaga aktualizacji bazy aplikacji.");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setProtocolMessage(error?.message || "Nie udało się sprawdzić protokołu.");
      })
      .finally(() => {
        if (!cancelled) setProtocolLoading(false);
      });

    return () => { cancelled = true; };
  }, [protocolReloadKey, selectedJobId, selectedJobIsCompleted, supabase]);

  if (!selectedJob) {
    return <div className="card premiumCard"><div className="muted">Kliknij dowolny wiersz w tabeli, aby zobaczyć szczegóły montażu.</div></div>;
  }

  const photos = Array.isArray(selectedJob.photos) ? selectedJob.photos : [];
  const detailsLoaded = Boolean(selectedJob.detailsLoaded);
  const detailsLoadError = String(selectedJob.detailsLoadError || '').trim();
  const showDetailsLoading = !detailsLoaded && !detailsLoadError;
  const viewers = Array.isArray(selectedJob.viewers) ? selectedJob.viewers : [];
  const comments = Array.isArray(selectedJob.comments) ? selectedJob.comments : [];
  const completionDateTimeLabel = formatCompletionDateTime(selectedJob.completed_at);
  const completedByProfile = (profiles || []).find((person) => String(person?.id || '') === String(selectedJob.completed_by || ''));
  const completedByLabel = completedByProfile?.full_name || completedByProfile?.email || '';
  const isCompletedJob = selectedJobIsCompleted;
  const isWorkerCompletedLock = isWorkerLockedCompletedJob(selectedJob, isAdmin);
  const canFinishJob = canWorkerFinishJob(selectedJob, isAdmin);
  const canRestartJob = canWorkerRestartJob(selectedJob, isAdmin);
  const workerStartLabel = String(selectedJob.status || '') === 'Nowe' ? 'Rozpocznij' : 'Rozpocznij ponownie';
  const canEditSelectedJob = canEditJob(selectedJob, isAdmin);
  const canModifySelectedJobPhotos = canModifyJobPhotos(selectedJob, isAdmin);
  const canAddSelectedJobComment = canAddJobComment(selectedJob, isAdmin);
  const canManageSelectedJobViewers = canManageJobViewers(selectedJob, isAdmin);
  const canManageSelectedAdminNote = canManageAdminNote(selectedJob, isAdmin);
  const canDeleteSelectedJob = canDeleteJob(selectedJob, isAdmin);
  const currentCommentDraft = commentDrafts[selectedJob.id] || "";
  const canSubmitComment = canAddSelectedJobComment && !busy && currentCommentDraft.trim().length > 0;
  const showCommentsSection = !isWorkerCompletedLock || showDetailsLoading || comments.length > 0;
  const jobDevices = getJobDeviceRows(selectedJob);
  const nameplateCompletion = getJobNameplateCompletion(selectedJob, { allowLocal: !isAdmin });
  const hasLocallySavedNameplates = nameplateCompletion.units.some((unit) => {
    const status = String(unit.photo?.upload_status || '').toLowerCase();
    return status === 'local' || status === 'uploading';
  });
  const missingNameplatesLabel = formatMissingNameplateMessage(nameplateCompletion);
  const nameplatePhotos = photos.filter((photo) => getNameplatePhotoMetadata(photo).photo_kind === 'nameplate');
  const regularPhotos = photos.filter((photo) => getNameplatePhotoMetadata(photo).photo_kind !== 'nameplate');
  const singleDeviceIndoorUnits = jobDevices.length === 1 ? getDeviceIndoorUnits(jobDevices[0], { keepEmpty: true }) : [];
  const singleDeviceTypeLabel = jobDevices.length === 1 ? (singleDeviceIndoorUnits.length > 1 ? 'Multi-split' : 'Single-split') : '';


  return (
    <>
      <style data-wawis-mobile-device-table="8.89">{MOBILE_DEVICE_TABLE_V889_CSS}</style>
      <div className="card premiumCard">
      {selectedJob.offline_pending ? (
        <div className="workerReadOnlyNote" role="status">Zmiany zapisane na telefonie · oczekują na synchronizację</div>
      ) : null}
      <div className="jobHead detailHeader">
        <div className="detailIdentity">
          <h2 className="detailTitle">{selectedJob.client || selectedJob.title}</h2>

          <div className="detailMeta">
            <div className="infoItem">
              <span className="infoLabel infoLabelWithIcon"><IconMail /><span>Email</span></span>
              <div className="infoValue">
                {selectedJob.email ? (
                  <div className="infoValueActions">
                    <a
                      href={`mailto:${selectedJob.email}`}
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
                      href={`tel:${selectedJob.phone}`}
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

            <div className="infoItem">
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

            <div className="infoItem jobDateInfoItem jobDateInfoItemV995" data-date-layout="9.95">
              <span className="infoLabel infoLabelWithIcon"><IconCalendar /><span>Data montażu</span></span>
              <div className="infoValue jobDateInfoValue jobDateInfoValueV995">{formatInstallationDate(selectedJob.installation_date)}</div>
            </div>

            {isAdmin && isCompletedJob ? (
              <div className="infoItem jobCompletionInfoItem jobCompletionInfoItemV999" data-completion-layout="9.99">
                <span className="infoLabel infoLabelWithIcon"><IconClock /><span>Zakończono</span></span>
                <div className="infoValue jobCompletionInfoValue jobCompletionInfoValueV999">
                  <div className="jobCompletionDateTime">{completionDateTimeLabel || 'Brak dokładnej godziny (zlecenie sprzed 9.14)'}</div>
                  {completedByLabel ? <div className="muted jobCompletionBy" title={completedByLabel}>{completedByLabel}</div> : null}
                </div>
              </div>
            ) : null}

            <div className="infoItem infoItemWide jobDevicesDetailsItem jobDevicesTableV888" data-mobile-device-table="8.89">
              <div className="jobDevicesTableV888Heading">
                <span className="infoLabel infoLabelWithIcon"><IconCheckCircle /><span>Urządzenia i tabliczki</span></span>
                {singleDeviceTypeLabel ? (
                  <span className={`jobDevicesTableV888Type ${singleDeviceTypeLabel === 'Multi-split' ? 'multi' : 'single'}`}>{singleDeviceTypeLabel}</span>
                ) : null}
              </div>
              <div className="jobDeviceDocumentationList" data-device-collapsible="9.98">
                {jobDevices.length ? jobDevices.map((device, deviceOffset) => {
                  const deviceIndex = deviceOffset + 1;
                  const isExpanded = expandedDeviceIndexes.includes(deviceIndex);
                  const indoorUnits = getDeviceIndoorUnits(device, { keepEmpty: true });
                  const isMultiSplit = indoorUnits.length > 1;
                  const outdoorModel = getDeviceOutdoorModel(device) || (!isMultiSplit ? indoorUnits[0]?.model : '') || String(device?.model || '').trim();
                  const outdoorPhoto = getLatestNameplatePhotoForUnit(nameplatePhotos, deviceIndex, 'jz');
                  const indoorRows = indoorUnits.map((unit) => {
                    const unitRef = `jw-${unit.unitNumber}`;
                    const photo = getLatestNameplatePhotoForUnit(nameplatePhotos, deviceIndex, unitRef);
                    return { ...unit, model: unit.model || (!isMultiSplit ? outdoorModel : ''), unitRef, photo };
                  });
                  const requiredPhotos = [outdoorPhoto, ...indoorRows.map((unit) => unit.photo)];
                  const missingCount = requiredPhotos.filter((photo) => !isNameplatePhotoReady(photo)).length;
                  return (
                    <section className={`jobDeviceDocumentationCard ${isExpanded ? 'isExpanded' : 'isCollapsed'}`} key={`selected-job-device-${deviceOffset}`}>
                      <div className="jobDeviceDocumentationTitle">
                        <button
                          type="button"
                          className="jobDeviceDocumentationToggle"
                          aria-expanded={isExpanded}
                          aria-controls={`job-device-details-${deviceIndex}`}
                          aria-label={`${isExpanded ? 'Zwiń' : 'Rozwiń'} Urządzenie ${deviceIndex}`}
                          onClick={() => setExpandedDeviceIndexes((current) => (
                            current.includes(deviceIndex)
                              ? current.filter((index) => index !== deviceIndex)
                              : [...current, deviceIndex]
                          ))}
                        >
                          <strong>Urządzenie {deviceIndex}</strong>
                          <span className={`jobDeviceDocumentationType ${isMultiSplit ? 'multi' : 'single'}`}>{isMultiSplit ? 'Multi-split' : 'Single-split'}</span>
                        </button>
                        <div className="jobDeviceDocumentationTitleActions">
                            {isAdmin ? (
                              <button
                                type="button"
                                className="jobDeviceDocumentationDeleteBtn"
                                disabled={busy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteDeviceFromJob?.(selectedJob, deviceIndex);
                                }}
                              >
                                Usuń
                              </button>
                            ) : null}
                        </div>
                      </div>
                      <div id={`job-device-details-${deviceIndex}`} className="jobDeviceDocumentationBody" hidden={!isExpanded}>
                        <div className="deviceUnitDocumentationTableHeader" aria-hidden="true">
                          <span>Urządzenie</span>
                          <span>Model / moc</span>
                          <span>Tabliczka</span>
                          <span>Status</span>
                        </div>
                        <div className="jobDeviceDocumentationUnits">
                          <DeviceUnitDocumentationRow
                            unitCode="JZ"
                            unitLabel="Jednostka zewnętrzna"
                            model={outdoorModel}
                            photo={outdoorPhoto}
                            photoIndex={outdoorPhoto ? nameplatePhotos.indexOf(outdoorPhoto) : -1}
                            previewPhotos={nameplatePhotos}
                            openPreview={openPreview}
                            openEditor={() => openSerialNumbersJob(selectedJob)}
                            busy={busy}
                            retryPhotoUpload={retryPhotoUpload}
                          />
                          {indoorRows.map((unit) => (
                            <DeviceUnitDocumentationRow
                              key={`device-${deviceIndex}-${unit.unitRef}`}
                              unitCode={`JW${unit.unitNumber}`}
                              unitLabel={`Jednostka wewnętrzna ${unit.unitNumber}`}
                              model={unit.model}
                              photo={unit.photo}
                              photoIndex={unit.photo ? nameplatePhotos.indexOf(unit.photo) : -1}
                              previewPhotos={nameplatePhotos}
                              openPreview={openPreview}
                              openEditor={() => openSerialNumbersJob(selectedJob)}
                              busy={busy}
                              retryPhotoUpload={retryPhotoUpload}
                            />
                          ))}
                        </div>
                        <div className={`jobDeviceDocumentationCompletion${missingCount ? ' missing' : ' ready'}`}>
                          <span aria-hidden="true">{missingCount ? '●' : '✓'}</span>
                          <span>{missingCount ? `Brakuje ${missingCount} ${missingCount === 1 ? 'tabliczki' : 'tabliczek'}` : 'Komplet tabliczek dodany'}</span>
                        </div>
                      </div>
                    </section>
                  );
                }) : (
                  <div className="muted">Brak urządzeń.</div>
                )}
              </div>
            </div>

            {!isAdmin ? (
              <>
                <div className="infoItem">
                  <span className="infoLabel infoLabelWithIcon"><IconUsers /><span>Monterzy</span></span>
                  <div className="infoValue">{renderInitialBadges(getViewerNames(selectedJob, profiles))}</div>
                </div>

                <div className="infoItem">
                  <span className="infoLabel infoLabelWithIcon"><IconClock /><span>Data utworzenia</span></span>
                  <div className="infoValue">{selectedJob.created_at ? formatDate(selectedJob.created_at) : "-"}</div>
                </div>
              </>
            ) : null}
          </div>

          <div className="detailActions detailActionsBottom mobileFourButtons">
            {canEditSelectedJob && isAdmin ? (
              <button className="btn mobileActionCompact" onClick={() => openEditJob(selectedJob)}>
                <span className="desktopLabel">Edytuj montaż</span>
                <span className="mobileLabel">Edytuj</span>
              </button>
            ) : null}
            {canEditSelectedJob ? (
              <button className="btn mobileActionCompact workerSerialNumbersBtn" onClick={() => openSerialNumbersJob(selectedJob)}>
                <span className="desktopLabel">{isAdmin ? 'Dodaj / edytuj urządzenia i tabliczki' : 'Uzupełnij urządzenia i tabliczki'}</span>
                <span className="mobileLabel">{isAdmin ? 'Urządzenia' : 'Tabliczki'}</span>
              </button>
            ) : null}
            {canDeleteSelectedJob ? (
              <button className="btn premiumActionBtn premiumDangerBtn deleteCardBtn mobileActionCompact" onClick={() => deleteJob(selectedJob)}>
                <span className="desktopLabel">Usuń kartę</span>
                <span className="mobileLabel">Usuń</span>
              </button>
            ) : null}
            {canRestartJob ? (
              <button
                className="btn premiumActionBtn restartJobBtn mobileActionCompact"
                onClick={() => updateStatus(selectedJob.id, "W trakcie")}
                disabled={busy}
                title="Zmień status zlecenia na W trakcie"
              >
                <span className="desktopLabel">{workerStartLabel}</span>
                <span className="mobileLabel">{workerStartLabel}</span>
              </button>
            ) : null}
            {canFinishJob ? (
              <button
                className="btn premiumActionBtn finishJobBtn mobileActionCompact"
                onClick={() => updateStatus(selectedJob.id, "Zakończone")}
                disabled={busy || showDetailsLoading || !nameplateCompletion.isComplete}
                title={!nameplateCompletion.isComplete ? `Brakuje tabliczek: ${missingNameplatesLabel}` : 'Zakończ zlecenie'}
              >
                <span className="desktopLabel">Zakończone zlecenie</span>
                <span className="mobileLabel">Zakończ</span>
              </button>
            ) : null}
            {showReturnToCalendar ? (
              <button
                type="button"
                className="btn premiumActionBtn calendarReturnBtn mobileActionCompact"
                onClick={onReturnToCalendar}
                title={calendarReturnDateKey ? `Wróć do kalendarza na dzień ${calendarReturnDateKey}` : 'Wróć do kalendarza'}
              >
                <span className="desktopLabel">Wróć do kalendarza</span>
                <span className="mobileLabel">Kalendarz</span>
              </button>
            ) : null}
            {isCompletedJob && protocolLoading ? (
              <button type="button" className="btn premiumActionBtn protocolTestButton mobileActionCompact" disabled>
                <span className="desktopLabel">Sprawdzam protokół...</span>
                <span className="mobileLabel">Sprawdzam...</span>
              </button>
            ) : null}
            {isCompletedJob && !protocolLoading && protocolBackendAvailable ? (
              <button
                type="button"
                className="btn premiumActionBtn protocolTestButton mobileActionCompact"
                onClick={() => setProtocolTestOpen(true)}
                title={protocolRecord ? "Otwórz zapisany protokół" : "Utwórz opcjonalny protokół dla zakończonego zlecenia"}
              >
                <span className="desktopLabel">Protokół</span>
                <span className="mobileLabel">Protokół</span>
              </button>
            ) : null}
            {isCompletedJob && !protocolLoading && !protocolRecord && !protocolBackendAvailable ? (
              <button
                type="button"
                className="btn premiumActionBtn protocolTestButton mobileActionCompact"
                onClick={() => setProtocolReloadKey((value) => value + 1)}
                title="Sprawdź ponownie dostępność protokołu"
              >
                <span className="desktopLabel">Sprawdź protokół</span>
                <span className="mobileLabel">Sprawdź</span>
              </button>
            ) : null}
            <button className="btn mobileActionCompact" onClick={() => setSelectedJob(null)}>
              <span className="desktopLabel">Zamknij</span>
              <span className="mobileLabel">Zamknij</span>
            </button>
          </div>
          {canFinishJob && showDetailsLoading ? (
            <div className="finishNameplateRequirement checking">Sprawdzam wymagane zdjęcia tabliczek…</div>
          ) : null}
          {canFinishJob && !showDetailsLoading && !nameplateCompletion.isComplete ? (
            <div className="finishNameplateRequirement missing">
              <strong>Nie można zakończyć zlecenia.</strong>
              <span>Brakuje: {missingNameplatesLabel}.</span>
              <button type="button" className="btn secondary" onClick={() => openSerialNumbersJob(selectedJob)}>Dodaj brakujące tabliczki</button>
            </div>
          ) : null}
          {canFinishJob && !showDetailsLoading && nameplateCompletion.isComplete ? (
            <div className="finishNameplateRequirement ready">
              {hasLocallySavedNameplates
                ? 'Wszystkie wymagane tabliczki są zapisane na telefonie. Zakończenie poczeka na ich synchronizację.'
                : 'Wszystkie wymagane zdjęcia tabliczek są zapisane.'}
            </div>
          ) : null}
          {isWorkerCompletedLock ? (
            <div className="workerReadOnlyNote" role="status">Zakończone · tylko podgląd</div>
          ) : null}
          {isCompletedJob && protocolRecord ? (
            <div className="protocolStoredStatus" role="status">
              Protokół zapisany{formatStoredProtocolDate(protocolRecord.signed_at || protocolRecord.created_at) ? ` · ${formatStoredProtocolDate(protocolRecord.signed_at || protocolRecord.created_at)}` : ""}
            </div>
          ) : null}
          {isCompletedJob && protocolMessage ? <div className="protocolActionMessage" role="status">{protocolMessage}</div> : null}
        </div>
      </div>

      <section className="detailsSection">
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

      {showDetailsLoading ? (
        <div className="muted mobileDetailsLoading">Ładowanie zdjęć i komentarzy dla tej karty...</div>
      ) : null}

      {detailsLoadError ? (
        <div className="mobileDetailsLoadError" role="status">
          <span>{detailsLoadError}</span>
          <button type="button" className="btn premiumActionBtn" onClick={onRetryDetails} disabled={detailsLoading}>
            {detailsLoading ? 'Pobieranie...' : 'Ponów'}
          </button>
        </div>
      ) : null}

      <section className="detailsSection">
        <h4 className="sectionHeadingWithIcon"><IconCamera /><span>Zdjęcia</span></h4>
        <div className="thumbGrid">
        {regularPhotos.map((photo, index) => {
          const uploadStatus = String(photo.upload_status || "").trim();
          const uploadStatusLabel = getPhotoUploadStatusLabel(photo);
          const isUploadingPhoto = uploadStatus === "uploading";
          const isFailedPhoto = uploadStatus === "error";
          const canOpenPhotoPreview = Boolean(photo.thumbnail_image_url || photo.local_preview_url || photo.storage_path || photo.original_image_url || photo.image_url || photo.signed_url);
          const thumbnailSource = photo.thumbnail_load_failed
            ? ''
            : (photo.thumbnail_image_url || photo.local_preview_url || photo.image_url || photo.signed_url || photo.original_image_url || '');
          return (
            <div key={photo.id} className={`thumbCard ${uploadStatus ? `photoUploadState-${uploadStatus}` : ""}`}>
              <button
                type="button"
                className="thumbBtn desktopThumbBtn"
                onClick={() => canOpenPhotoPreview && openPreview(photo, index, regularPhotos)}
                disabled={!canOpenPhotoPreview}
              >
                {thumbnailSource ? (
                  <img
                    src={thumbnailSource}
                    className="thumb desktopThumb"
                    loading="lazy"
                    decoding="async"
                    onError={() => { void onThumbnailLoadError?.(photo); }}
                    onLoad={() => onThumbnailLoad?.(photo)}
                  />
                ) : (
                  <span className="photoThumbPlaceholder">{canOpenPhotoPreview ? 'Otwórz zdjęcie' : 'Zdjęcie'}</span>
                )}
                {isUploadingPhoto ? <span className="photoUploadOverlay">{uploadStatusLabel || "Wysyłanie"}...</span> : null}
              </button>
              <div className="photoMeta">
                <span className="photoMetaText">{formatDate(photo.created_at)}</span>
                <span className="photoMetaText" title={photo.uploader_name || "Pracownik"}>{getInitials(photo.uploader_name || "Pracownik")}</span>
              </div>
              {uploadStatusLabel ? (
                <div className={`photoUploadStatus photoUploadStatus-${uploadStatus}`} title={photo.upload_error || uploadStatusLabel}>
                  <span className="photoUploadStatusDot" aria-hidden="true" />
                  <span>{uploadStatusLabel}</span>
                </div>
              ) : null}
              {isFailedPhoto && photo.upload_error ? (
                <div className="photoUploadErrorText">{photo.upload_error}</div>
              ) : null}
              {canModifySelectedJobPhotos ? (
                <div className="photoQueueActions">
                  {isFailedPhoto ? (
                    <button
                      type="button"
                      className="btn premiumActionBtn photoRetryBtn compactDangerBtn"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        retryPhotoUpload?.(photo);
                      }}
                    >
                      Wyślij ponownie
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn premiumActionBtn premiumDangerBtn photoDeleteBtn compactDangerBtn"
                    disabled={deletingPhotoId === photo.id || busy || isUploadingPhoto}
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePhoto(photo);
                    }}
                  >
                    {isUploadingPhoto ? "Wysyłanie" : deletingPhotoId === photo.id ? "Usuwanie..." : "Usuń"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {regularPhotos.length === 0 && showDetailsLoading ? <div className="muted">Ładowanie zdjęć…</div> : null}
        {detailsLoaded && regularPhotos.length === 0 ? <div className="muted">Brak zdjęć.</div> : null}
        </div>
        {canModifySelectedJobPhotos ? (
          <div className="photoUploadActions" aria-label="Dodawanie zdjęć do zlecenia">
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
          </div>
        ) : null}
      </section>

      {canManageSelectedJobViewers ? (
        <section className="detailsSection detailsSectionCompact">
          <h4 className="sectionHeadingWithIcon"><IconUsers /><span>Monterzy</span></h4>
          <div className="viewerInlineRow" aria-label="Wybór monterów">
            {profiles.map((person) => {
              const active = viewers.some((viewer) => viewer.user_id === person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  className={`viewerDot ${active ? "active" : ""}`}
                  onClick={() => toggleViewer(selectedJob.id, person.id, viewers)}
                  title={`${person.full_name} — ${active ? "Monter" : "Nie monter"}`}
                  aria-label={`${person.full_name} — ${active ? "Monter" : "Nie monter"}`}
                >
                  <span className="viewerDotText">{formatViewerChipName(person.full_name)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {showCommentsSection ? (
        <section className="detailsSection">
          <h4 className="sectionHeadingWithIcon"><IconMessageCircle /><span>Komentarze i pytania</span></h4>
          <div className="comments">
          {comments.map((comment) => (
            <div key={comment.id} className="comment">
              <div className="commentHeader">
                <div>
                  <strong>{comment.author_name}</strong> — {comment.type}
                  {comment.offline_pending ? <span className="muted"> · zapisano na telefonie</span> : null}
                </div>
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
          ))}
          {comments.length === 0 && showDetailsLoading ? <div className="muted">Ładowanie komentarzy…</div> : null}
          {detailsLoaded && comments.length === 0 ? <div className="muted">Brak komentarzy.</div> : null}
          </div>
          {canAddSelectedJobComment ? (
            <>
              <textarea className="input textarea" placeholder="Napisz komentarz..." value={currentCommentDraft} onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [selectedJob.id]: e.target.value }))} />
              <div className="row">
                <button className="btn premiumActionBtn commentAddBtn" onClick={() => addComment(selectedJob.id, "Komentarz")} disabled={!canSubmitComment}>Dodaj komentarz</button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {isAdmin ? (
        <section className="detailsSection detailsSectionCompact">
          <h4 className="sectionHeadingWithIcon"><IconCheckCircle /><span>Status</span></h4>
          <select className="input" value={selectedJob.status} onChange={(e) => updateStatus(selectedJob.id, e.target.value)}>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </section>
      ) : null}
      </div>
      <ProtocolTestModal
        open={protocolTestOpen}
        job={selectedJob}
        profiles={profiles}
        supabase={supabase}
        protocolRecord={protocolRecord}
        onClose={() => setProtocolTestOpen(false)}
        onSaved={(record, paymentPatch = {}) => {
          setProtocolRecord(record);
          setSelectedJob((current) => current ? { ...current, ...paymentPatch } : current);
          setProtocolMessage("");
        }}
      />
    </>
  );
}
