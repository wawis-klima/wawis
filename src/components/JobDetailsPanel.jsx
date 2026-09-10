import React from "react";
import { IconCalendar, IconCamera, IconCheckCircle, IconClock, IconFileText, IconImage, IconMail, IconMapPin, IconMessageCircle, IconPhone, IconUsers } from "./ui.jsx";
import { getInitials, getJobTypeClass, getJobTypeLabel, getViewerNames, renderInitialBadges } from "../utils/jobHelpers.jsx";
import JobAddressLink from "./JobAddressLink.jsx";
import DesktopJobDeviceCards from "./desktop/DesktopJobDeviceCards.jsx";
import DesktopJobProtocolCard from "./desktop/DesktopJobProtocolCard.jsx";
import { canAddJobComment, canDeleteJob, canDeleteJobComment, canEditJob, canManageAdminNote, canManageJobViewers, canModifyJobPhotos, canWorkerFinishJob, isWorkerLockedCompletedJob, STATUSES } from "../utils/jobPermissions.js";
import { getJobDeviceRows } from "../modules/job-devices.js";


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
  if (!selectedJob) {
    return <div className="card premiumCard"><div className="muted">Kliknij dowolny wiersz w tabeli, aby zobaczyć szczegóły montażu.</div></div>;
  }

  const photos = Array.isArray(selectedJob.photos) ? selectedJob.photos : [];
  const detailsLoaded = Boolean(selectedJob.detailsLoaded);
  const detailsLoadError = String(selectedJob.detailsLoadError || '').trim();
  const showDetailsLoading = !detailsLoaded && !detailsLoadError;
  const viewers = Array.isArray(selectedJob.viewers) ? selectedJob.viewers : [];
  const comments = Array.isArray(selectedJob.comments) ? selectedJob.comments : [];
  const isWorkerCompletedLock = isWorkerLockedCompletedJob(selectedJob, isAdmin);
  const canFinishJob = canWorkerFinishJob(selectedJob, isAdmin);
  const canEditSelectedJob = canEditJob(selectedJob, isAdmin);
  const canModifySelectedJobPhotos = canModifyJobPhotos(selectedJob, isAdmin);
  const canAddSelectedJobComment = canAddJobComment(selectedJob, isAdmin);
  const canManageSelectedJobViewers = canManageJobViewers(selectedJob, isAdmin);
  const canManageSelectedAdminNote = canManageAdminNote(selectedJob, isAdmin);
  const canDeleteSelectedJob = canDeleteJob(selectedJob, isAdmin);
  const currentCommentDraft = commentDrafts[selectedJob.id] || "";
  const canSubmitComment = canAddSelectedJobComment && !busy && currentCommentDraft.trim().length > 0;
  const jobDevices = getSafeJobDeviceRows(selectedJob);
  const phoneHref = getPhoneHref(selectedJob.phone);
  const installationDateLabel = formatInstallationDate(selectedJob.installation_date);
  const completionDateTimeLabel = formatCompletionDateTime(selectedJob.completed_at);
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

  return (
    <div className="card premiumCard jobDetailsPanelCard">
      <div className="jobDetailsStickyBar">
        <div className="jobDetailsStickyIdentity">
          <h2 className="detailTitle jobDetailsStickyTitle">{selectedJob.client || selectedJob.title}</h2>
          <div className="jobDetailsStickyMeta" aria-label="Podstawowe informacje o wybranym montażu">
            <span className={`jobTypeTag desktopJobTypeTag jobDetailsStatusChip ${statusClassName}`}>{statusLabel}</span>
            <span className="jobDetailsDateChip"><IconCalendar /> {installationDateLabel}</span>
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
            {canManageSelectedJobViewers ? (
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
                <button className="btn premiumActionBtn commentAddBtn" onClick={() => addComment(selectedJob.id, "Komentarz")} disabled={!canSubmitComment}>Dodaj komentarz</button>
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
