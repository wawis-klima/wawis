import { useRef, useState } from "react";
import {
  ADMIN_NOTE_DELETE_ERROR_MESSAGE,
  COMMENT_DELETE_ERROR_MESSAGE,
  EDIT_SAVE_ERROR_MESSAGE,
  JOB_DELETE_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  WORKER_COMPLETED_JOB_LOCK_MESSAGE,
  WORKER_FINISH_STATUS_MESSAGE,
} from "../utils/jobMessages.js";
import { canChangeJobStatus, canDeleteJob, canManageAdminNote } from "../utils/jobPermissions.js";
import {
  addJobRecord,
  buildEditJobForm,
  confirmDeleteJobRecord,
  saveEditedJobRecord,
  saveJobDeviceSerialsRecord,
  saveJobAdminNote,
  updateJobStatus,
  loadJobNameplatePhotosData,
} from "../modules/jobs.js";
import { addJobComment, deleteJobComment, withTimeout } from "../modules/jobs-comments.js";
import { toggleJobViewer } from "../modules/jobs-assignment.js";
import { deleteJobPhoto, getNameplatePhotoMetadata, isLocalQueuedPhoto, retryQueuedJobPhoto, uploadJobDocumentationPhotos, uploadJobPhotos } from "../modules/photos.js";
import { normalizeDatabaseErrorMessage } from "../modules/database-errors.js";
import { formatMissingNameplateMessage, getJobNameplateCompletion } from "../modules/nameplate-requirements.js";
import { logDiagnostic } from "../modules/diagnostics.js";
import { serializeJobDevicesToFields } from "../modules/job-devices.js";
import { createOfflineUuid, queueOfflineJobOperation } from "../modules/job-offline-store.js";
import { isTransientSupabaseError } from "../modules/supabase-errors.js";
import { deleteJobDeviceRecord } from "../modules/job-device-delete.js";


const NAMEPLATE_SAVE_TIMEOUT_MS = 15000;
const NAMEPLATE_VERIFY_TIMEOUT_MS = 8000;

function buildPendingNameplatePreviewPhotos(documents = []) {
  return (documents || []).filter((document) => document?.file).map((document, index) => ({
    id: `pending-new-job-${index}`,
    photo_kind: 'nameplate',
    device_index: Number(document.deviceIndex || 0) + 1,
    unit_ref: String(document.unitRef || '').toLowerCase(),
    upload_status: 'local',
    local_preview_url: 'pending://nameplate',
  }));
}

function getNewJobLocalNameplateCompletion(form = {}) {
  return getJobNameplateCompletion({
    ...form,
    photos: buildPendingNameplatePreviewPhotos(form.pending_nameplate_photos || []),
  }, { allowLocal: true });
}


function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function settleWithin(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true, label }), timeoutMs);
  });
  return Promise.race([
    Promise.resolve(promise).then((value) => ({ timedOut: false, value })),
    timeoutPromise,
  ]).finally(() => clearTimeout(timeoutId));
}

function getPendingNameplateKeys(documents = []) {
  return new Set((documents || []).filter((item) => item?.file).map((item) => (
    `${Number(item.deviceIndex || 0) + 1}:${String(item.unitRef || '').toLowerCase()}`
  )));
}

function serverHasPendingNameplates(photos = [], documents = []) {
  const pendingKeys = getPendingNameplateKeys(documents);
  if (!pendingKeys.size) return true;
  const serverKeys = new Set((photos || []).map((photo) => {
    const metadata = getNameplatePhotoMetadata(photo);
    return `${Number(metadata.device_index || 0)}:${String(metadata.unit_ref || '').toLowerCase()}`;
  }));
  return [...pendingKeys].every((key) => serverKeys.has(key));
}

export function useSelectedJobActions({
  supabase,
  supabaseUrl,
  profile,
  profiles,
  jobs,
  contractorsCatalog,
  selectedJob,
  setJobs,
  setSelectedJob,
  sessionUser,
  isAdmin,
  normalizeStatus,
  createNotification,
  sendAssignmentPush,
  sendCompletionPush,
  openConfirmDialog,
  runConfirmAction,
  previewImage,
  setPreviewImage,
  jobFormRef,
  setJobForm,
  editingJobId,
  serialOnlyMode,
  resetJobModalState,
  openEditJobForm,
  commentDrafts,
  setCommentDrafts,
  getResolvedJob,
  canEditResolvedJob,
  canModifyResolvedJobPhotos,
  canAddResolvedJobComment,
  canManageResolvedJobViewers,
  refreshAll,
  reloadJobSummary,
  reloadJobDetails,
  setBusy,
  onPhotoSyncStart,
  onPhotoSyncSuccess,
  onPhotoSyncError,
  performOfflineJobSync,
}) {
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const photoDetailsSyncTimersRef = useRef(new Map());

  function applyOptimisticJobPatch(jobId, patch) {
    const applyPatch = (job) => (String(job?.id) === String(jobId) ? { ...job, ...patch } : job);
    setJobs((prev) => prev.map(applyPatch));
    setSelectedJob((prev) => (prev && String(prev.id) === String(jobId) ? applyPatch(prev) : prev));
  }

  async function queueDeviceSaveOffline(form, pendingDocuments, reason = 'offline') {
    const currentJob = getResolvedJob(editingJobId) || {};
    const deviceFields = serializeJobDevicesToFields(form);
    const documentationResult = await uploadJobDocumentationPhotos({
      supabase,
      profile,
      jobId: editingJobId,
      documents: pendingDocuments,
      setJobs,
      setSelectedJob,
      supabaseUrl,
      onPhotoUploaded: onPhotoSyncSuccess,
      onPhotoUploadError: onPhotoSyncError,
    });
    if (documentationResult.failedCount) {
      throw new Error('Nie udało się zapisać wszystkich tabliczek w pamięci telefonu. Zwolnij miejsce i spróbuj ponownie.');
    }

    await queueOfflineJobOperation({
      user_id: profile.id,
      job_id: editingJobId,
      type: 'device',
      base: {
        device_model: currentJob.device_model || '',
        device_serial_number: currentJob.device_serial_number || '',
      },
      payload: {
        device_fields: {
          device_model: deviceFields.device_model || '',
          device_serial_number: deviceFields.device_serial_number || '',
        },
      },
    });
    applyOptimisticJobPatch(editingJobId, {
      device_model: deviceFields.device_model || '',
      device_serial_number: deviceFields.device_serial_number || '',
      offline_pending: true,
    });
    resetJobModalState();
    logDiagnostic('offline.device.queued', { jobId: editingJobId, reason, queuedPhotos: documentationResult.queuedCount });
    alert('Dane urządzenia zapisano na telefonie. Aplikacja wyśle je automatycznie po odzyskaniu internetu.');
    return true;
  }

  async function queueCommentOffline({ jobId, type, text, commentId, reason = 'offline' }) {
    await queueOfflineJobOperation({
      id: `comment-${commentId}`,
      user_id: profile.id,
      job_id: jobId,
      type: 'comment',
      payload: { comment_id: commentId, type, text: text.trim() },
    });
    const localComment = {
      id: commentId,
      job_id: jobId,
      author_id: profile.id,
      author_name: profile.full_name || profile.email || 'Pracownik',
      type,
      text: text.trim(),
      created_at: new Date().toISOString(),
      offline_pending: true,
    };
    const addLocalComment = (job) => {
      if (String(job?.id) !== String(jobId)) return job;
      const comments = Array.isArray(job.comments) ? job.comments : [];
      return { ...job, comments: [...comments.filter((comment) => String(comment.id) !== String(commentId)), localComment], detailsLoaded: true, offline_pending: true };
    };
    setJobs((prev) => prev.map(addLocalComment));
    setSelectedJob((prev) => (prev && String(prev.id) === String(jobId) ? addLocalComment(prev) : prev));
    setCommentDrafts((prev) => ({ ...prev, [jobId]: '' }));
    logDiagnostic('offline.comment.queued', { jobId, commentId, reason });
  }

  async function queueStatusOffline({ job, status, reason = 'offline', message = '' }) {
    await queueOfflineJobOperation({
      user_id: profile.id,
      job_id: job.id,
      type: 'status',
      base: { status: normalizeStatus(job.status) },
      payload: { status },
    });
    applyOptimisticJobPatch(job.id, { status, offline_pending: true, offline_previous_status: normalizeStatus(job.status) });
    logDiagnostic('offline.status.queued', { jobId: job.id, status, reason });
    alert(message || 'Zakończenie zapisano na telefonie. Zostanie wysłane automatycznie po synchronizacji tabliczek.');
  }

  function refreshAfterNameplateSave(jobId, source) {
    logDiagnostic('nameplate.save.refresh.started', { jobId, source });
    const targetedRefresh = Promise.all([
      reloadJobSummary?.(jobId),
      reloadJobDetails?.(jobId, { force: true, background: true }),
    ]);
    void settleWithin(targetedRefresh, NAMEPLATE_SAVE_TIMEOUT_MS, 'refresh')
      .then((result) => {
        if (result.timedOut) {
          logDiagnostic('nameplate.save.refresh.timeout', { jobId, source, timeoutMs: NAMEPLATE_SAVE_TIMEOUT_MS });
          return;
        }
        logDiagnostic('nameplate.save.refresh.completed', { jobId, source });
      })
      .catch((error) => logDiagnostic('nameplate.save.refresh.failed', { jobId, source, error }));
  }

  async function verifyPendingNameplatesOnServer(jobId, documents, source) {
    logDiagnostic('nameplate.save.verify.started', { jobId, source, pendingCount: getPendingNameplateKeys(documents).size });
    try {
      const result = await settleWithin(loadJobNameplatePhotosData({ supabase, jobId }), NAMEPLATE_VERIFY_TIMEOUT_MS, 'verify');
      if (result.timedOut) {
        logDiagnostic('nameplate.save.verify.timeout', { jobId, source, timeoutMs: NAMEPLATE_VERIFY_TIMEOUT_MS });
        return false;
      }
      const confirmed = serverHasPendingNameplates(result.value?.photos || [], documents);
      logDiagnostic('nameplate.save.verify.completed', { jobId, source, confirmed });
      return confirmed;
    } catch (error) {
      logDiagnostic('nameplate.save.verify.failed', { jobId, source, error });
      return false;
    }
  }

  async function addJob(formOverride) {
    if (!supabase || !profile) return;
    if (!isAdmin && isBrowserOffline()) {
      alert('Dodanie nowego klienta wymaga internetu. Wróć do formularza po odzyskaniu połączenia.');
      return;
    }
    const form = formOverride || jobFormRef.current;
    const workerWantsImmediateCompletion = !isAdmin && normalizeStatus(form.status) === 'Zakończone';
    if (workerWantsImmediateCompletion) {
      const localCompletion = getNewJobLocalNameplateCompletion(form);
      if (!localCompletion.isComplete) {
        alert(`Nie można zakończyć montażu od razu. Dodaj wymagane zdjęcia tabliczek znamionowych: ${formatMissingNameplateMessage(localCompletion)}.`);
        return;
      }
    }
    setBusy(true);

    try {
      const createdJob = await addJobRecord({
        supabase,
        profile,
        form,
        contractors: contractorsCatalog,
        isAdmin,
        normalizeStatus,
        createNotification,
        sendAssignmentPushFn: sendAssignmentPush,
      });

      if (!isAdmin && String(form.worker_comment || '').trim() && createdJob?.id) {
        try {
          await addJobComment({
            supabase,
            profile,
            jobs: [...jobs, {
              id: createdJob.id,
              title: String(form.client || '').trim(),
              client: String(form.client || '').trim(),
              viewers: [{ user_id: profile.id }],
            }],
            profiles,
            jobId: createdJob.id,
            type: 'Komentarz',
            text: String(form.worker_comment || '').trim(),
            createNotification,
          });
        } catch (commentError) {
          logDiagnostic('worker.new-job.comment.failed', { jobId: createdJob.id, error: commentError });
          window.alert('Klient został zapisany, ale komentarza nie udało się dodać. Możesz dopisać go po otwarciu montażu.');
        }
      }

      const documentationResult = await uploadJobDocumentationPhotos({
        supabase,
        profile,
        jobId: createdJob?.id,
        documents: form.pending_nameplate_photos || [],
        setJobs,
        setSelectedJob,
        supabaseUrl,
        onPhotoUploaded: (uploadedPhoto) => {
          onPhotoSyncSuccess?.();
          schedulePhotoDetailsSync(uploadedPhoto?.job_id || createdJob?.id);
          if (workerWantsImmediateCompletion && typeof window !== 'undefined') {
            window.setTimeout(() => { void performOfflineJobSync?.(); }, 700);
          }
        },
        onPhotoUploadError: onPhotoSyncError,
        background: true,
      });

      let immediateCompletionQueued = false;
      if (workerWantsImmediateCompletion && createdJob?.id && !documentationResult.failedCount) {
        await queueOfflineJobOperation({
          user_id: profile.id,
          job_id: createdJob.id,
          type: 'status',
          base: { status: 'W trakcie' },
          payload: { status: 'Zakończone' },
        });
        immediateCompletionQueued = true;
        logDiagnostic('worker.new-job.immediate-completion.queued', { jobId: createdJob.id, queuedPhotos: documentationResult.queuedCount });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => { void performOfflineJobSync?.(); }, 900);
        }
      }

      resetJobModalState();
      logDiagnostic('nameplate.save.modal.closed', { jobId: createdJob?.id, source: 'new-job', uploadedCount: documentationResult.uploadedCount, queuedCount: documentationResult.queuedCount });
      refreshAfterNameplateSave(createdJob?.id, 'new-job');
      if (documentationResult.failedCount) {
        alert(workerWantsImmediateCompletion ? `Montaż został zapisany jako W trakcie, ale ${documentationResult.failedCount} zdjęć nie udało się zachować w kolejce. Dodaj je ponownie z karty montażu, a potem zakończ zlecenie.` : `Montaż został zapisany, ale ${documentationResult.failedCount} zdjęć nie udało się zachować w kolejce. Dodaj je ponownie z karty montażu.`);
      } else if (immediateCompletionQueued) {
        alert('Montaż został zapisany. Zakończy się automatycznie po wysłaniu i potwierdzeniu wszystkich tabliczek znamionowych.');
      } else if (documentationResult.backgroundCount) {
        alert(`Montaż został zapisany. ${documentationResult.backgroundCount} ${documentationResult.backgroundCount === 1 ? 'zdjęcie wysyła się' : 'zdjęcia wysyłają się'} w tle.`);
      } else if (documentationResult.queuedCount) {
        alert(`${documentationResult.queuedCount} ${documentationResult.queuedCount === 1 ? 'zdjęcie zapisano' : 'zdjęcia zapisano'} na telefonie. Aplikacja wyśle je automatycznie po odzyskaniu internetu.`);
      }
    } catch (error) {
      alert(normalizeDatabaseErrorMessage(error, SAVE_ERROR_MESSAGE));
    } finally {
      setBusy(false);
    }
  }

  function openEditJob(job) {
    if (!job) return;
    if (!canEditResolvedJob(job)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }
    const nextForm = buildEditJobForm({ job, profiles, normalizeStatus });
    openEditJobForm({ jobId: job.id, form: nextForm, serialOnly: false });
  }

  function openSerialNumbersJob(job) {
    if (!job) return;
    if (!canEditResolvedJob(job)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }
    const nextForm = buildEditJobForm({ job, profiles, normalizeStatus });
    openEditJobForm({ jobId: job.id, form: nextForm, serialOnly: true });
  }

  async function saveEditedJob(formOverride) {
    if (!supabase || !editingJobId) return;
    if (!canEditResolvedJob(editingJobId)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }
    const form = formOverride || jobFormRef.current;
    const pendingDocuments = form.pending_nameplate_photos || [];
    const operationId = `${editingJobId}-${Date.now()}`;
    setBusy(true);
    logDiagnostic('nameplate.save.started', { jobId: editingJobId, operationId, serialOnlyMode, pendingCount: getPendingNameplateKeys(pendingDocuments).size });

    try {
      if (!isAdmin && isBrowserOffline()) {
        await queueDeviceSaveOffline(form, pendingDocuments);
        return;
      }
      const recordSave = serialOnlyMode
        ? saveJobDeviceSerialsRecord({ supabase, editingJobId, form })
        : saveEditedJobRecord({
          supabase, editingJobId, form, contractors: contractorsCatalog, isAdmin, jobs, normalizeStatus, sendAssignmentPushFn: sendAssignmentPush,
        });
      const recordResult = await settleWithin(recordSave, NAMEPLATE_SAVE_TIMEOUT_MS, 'record-save');
      if (recordResult.timedOut) {
        logDiagnostic('nameplate.save.record.timeout', { jobId: editingJobId, operationId, timeoutMs: NAMEPLATE_SAVE_TIMEOUT_MS });
        throw new Error('Zapisywanie danych urządzenia trwa zbyt długo. Spróbuj ponownie.');
      }
      logDiagnostic('nameplate.save.record.completed', { jobId: editingJobId, operationId });

      const uploadPromise = uploadJobDocumentationPhotos({
        supabase, profile, jobId: editingJobId, documents: pendingDocuments, setJobs, setSelectedJob, supabaseUrl,
        onPhotoUploaded: (uploadedPhoto) => {
          onPhotoSyncSuccess?.();
          schedulePhotoDetailsSync(uploadedPhoto?.job_id || editingJobId);
        },
        onPhotoUploadError: onPhotoSyncError,
      });
      logDiagnostic('nameplate.save.upload.started', { jobId: editingJobId, operationId });
      const uploadOutcome = await settleWithin(uploadPromise, NAMEPLATE_SAVE_TIMEOUT_MS, 'upload');

      if (uploadOutcome.timedOut) {
        logDiagnostic('nameplate.save.upload.timeout', { jobId: editingJobId, operationId, timeoutMs: NAMEPLATE_SAVE_TIMEOUT_MS });
        const confirmed = await verifyPendingNameplatesOnServer(editingJobId, pendingDocuments, 'upload-timeout');
        if (confirmed) {
          resetJobModalState();
          logDiagnostic('nameplate.save.modal.closed.after-timeout-confirmation', { jobId: editingJobId, operationId });
          refreshAfterNameplateSave(editingJobId, 'upload-timeout-confirmed');
          void uploadPromise.catch((error) => logDiagnostic('nameplate.save.late-upload.failed', { jobId: editingJobId, operationId, error }));
          return;
        }
        logDiagnostic('nameplate.save.modal.kept-open', { jobId: editingJobId, operationId, reason: 'upload-timeout-not-confirmed' });
        alert('Wysyłanie trwa dłużej niż zwykle. Okno pozostaje otwarte, ponieważ nie udało się jeszcze potwierdzić zdjęć na serwerze.');
        return;
      }

      const documentationResult = uploadOutcome.value;
      logDiagnostic('nameplate.save.upload.completed', {
        jobId: editingJobId, operationId, uploadedCount: documentationResult.uploadedCount, queuedCount: documentationResult.queuedCount, failedCount: documentationResult.failedCount,
      });

      if (serialOnlyMode && documentationResult.failedCount) {
        const confirmed = await verifyPendingNameplatesOnServer(editingJobId, pendingDocuments, 'reported-failure');
        if (!confirmed) {
          const uploadedKeys = new Set(documentationResult.photos.map((photo) => {
            const metadata = getNameplatePhotoMetadata(photo);
            return `${Number(metadata.device_index) - 1}:${metadata.unit_ref}`;
          }));
          setJobForm?.((prev) => {
            const previousExisting = Array.isArray(prev.existing_nameplate_photos) ? prev.existing_nameplate_photos : [];
            const nextExistingByKey = new Map(previousExisting.map((item) => [`${Number(item.deviceIndex)}:${item.unitRef}`, item]));
            documentationResult.photos.forEach((photo) => {
              const metadata = getNameplatePhotoMetadata(photo);
              const deviceIndex = Number(metadata.device_index) - 1;
              const unitRef = String(metadata.unit_ref || '');
              if (deviceIndex < 0 || !unitRef) return;
              nextExistingByKey.set(`${deviceIndex}:${unitRef}`, { deviceIndex, unitRef, url: photo.image_url || photo.signed_url || photo.original_image_url || '', uploadStatus: String(photo.upload_status || 'uploaded') });
            });
            return { ...prev, pending_nameplate_photos: (prev.pending_nameplate_photos || []).filter((item) => !uploadedKeys.has(`${Number(item.deviceIndex)}:${item.unitRef}`)), existing_nameplate_photos: [...nextExistingByKey.values()] };
          });
          logDiagnostic('nameplate.save.modal.kept-open', { jobId: editingJobId, operationId, reason: 'failed-photos-not-confirmed', failedCount: documentationResult.failedCount });
          refreshAfterNameplateSave(editingJobId, 'partial-failure');
          alert(`Nie udało się potwierdzić ${documentationResult.failedCount} zdjęć tabliczek. Okno pozostaje otwarte.`);
          return;
        }
      }

      resetJobModalState();
      logDiagnostic('nameplate.save.modal.closed', { jobId: editingJobId, operationId, uploadedCount: documentationResult.uploadedCount, queuedCount: documentationResult.queuedCount });
      refreshAfterNameplateSave(editingJobId, 'save-confirmed');

      if (documentationResult.failedCount) {
        alert(`Zmiany zapisano, ale ${documentationResult.failedCount} zdjęć nie udało się zachować w kolejce. Dodaj je ponownie z karty montażu.`);
      } else if (documentationResult.queuedCount) {
        alert(`${documentationResult.queuedCount} ${documentationResult.queuedCount === 1 ? 'zdjęcie zapisano' : 'zdjęcia zapisano'} na telefonie. Aplikacja wyśle je automatycznie.`);
      }
    } catch (error) {
      logDiagnostic('nameplate.save.failed', { jobId: editingJobId, operationId, error });
      if (!isAdmin && isTransientSupabaseError(error)) {
        try {
          await queueDeviceSaveOffline(form, pendingDocuments, 'transient-error');
          return;
        } catch (queueError) {
          alert(queueError?.message || 'Nie udało się zapisać zmiany w pamięci telefonu.');
          return;
        }
      }
      alert(normalizeDatabaseErrorMessage(error, EDIT_SAVE_ERROR_MESSAGE));
    } finally {
      setBusy(false);
    }
  }

  function deleteDeviceFromJob(job, deviceIndex) {
    if (!isAdmin || !job?.id) return;
    const normalizedDeviceIndex = Math.max(1, Number(deviceIndex) || 1);
    openConfirmDialog({
      variant: "delete",
      title: `Usunąć urządzenie ${normalizedDeviceIndex}?`,
      message: `Usunięte zostaną dane urządzenia ${normalizedDeviceIndex} oraz jego tabliczki JZ/JW. Pozostałe urządzenia zostaną poprawnie przenumerowane. Tej operacji nie można cofnąć.`,
      confirmLabel: "Usuń urządzenie",
      onConfirm: async () => {
        setBusy(true);
        try {
          return await runConfirmAction(async () => {
            const result = await deleteJobDeviceRecord({
              supabase,
              supabaseUrl,
              job,
              deviceIndex: normalizedDeviceIndex,
              isAdmin,
            });

            const patchJob = (current) => {
              if (!current || String(current.id) !== String(job.id)) return current;
              return {
                ...current,
                devices: result.devices,
                device_model: result.device_model || '',
                device_serial_number: result.device_serial_number || '',
                detailsLoaded: false,
              };
            };
            setJobs((prev) => prev.map(patchJob));
            setSelectedJob((prev) => patchJob(prev));
            await Promise.all([
              reloadJobSummary?.(job.id),
              reloadJobDetails?.(job.id, { force: true }),
            ]);
            return true;
          });
        } catch (error) {
          alert(normalizeDatabaseErrorMessage(error, 'Nie udało się usunąć urządzenia.'));
          return false;
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function deleteJob(job) {
    if (!canDeleteJob(job, isAdmin)) return;
    openConfirmDialog({
      variant: "delete",
      title: "Usunąć kartę montażu?",
      message: `Czy na pewno chcesz usunąć: ${job.title}?`,
      confirmLabel: "Usuń na stałe",
      onConfirm: async () => {
        if (!supabase) return;
        setBusy(true);

        try {
          await runConfirmAction(async () => {
            await confirmDeleteJobRecord({ supabase, jobToDelete: job });
            if (selectedJob?.id === job.id) {
              setSelectedJob(null);
            }
            await refreshAll(sessionUser);
            return true;
          });
        } catch (error) {
          alert(normalizeDatabaseErrorMessage(error, JOB_DELETE_ERROR_MESSAGE));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function updateStatus(jobId, status) {
    let job = getResolvedJob(jobId);
    const currentStatus = normalizeStatus(job?.status);
    const completingNow = status === "Zakończone" && currentStatus !== "Zakończone";
    const workerFinishing = !isAdmin && status === "Zakończone";
    const workerRestarting = !isAdmin && status === "W trakcie" && ["Nowe", "Niezrealizowane"].includes(currentStatus);

    if (!canChangeJobStatus(job, status, isAdmin)) {
      if (workerFinishing && currentStatus !== "Zakończone") {
        alert(WORKER_FINISH_STATUS_MESSAGE);
      }
      return;
    }

    if (workerFinishing && currentStatus === "Zakończone") return;

    if (workerRestarting && isBrowserOffline()) {
      try {
        await queueStatusOffline({
          job,
          status,
          reason: 'offline-restart',
          message: currentStatus === 'Nowe' ? 'Rozpoczęcie zapisano na telefonie. Status zmieni się w systemie automatycznie po odzyskaniu internetu.' : 'Ponowne rozpoczęcie zapisano na telefonie. Status zmieni się w systemie automatycznie po odzyskaniu internetu.',
        });
      } catch (error) {
        alert(error?.message || 'Nie udało się zapisać ponownego rozpoczęcia w pamięci telefonu.');
      }
      return;
    }

    if (workerFinishing && isBrowserOffline()) {
      const localCompletion = getJobNameplateCompletion(job, { allowLocal: true });
      if (!localCompletion.isComplete) {
        alert(`Nie można zakończyć zlecenia. Dodaj wymagane zdjęcia tabliczek znamionowych: ${formatMissingNameplateMessage(localCompletion)}.`);
        return;
      }
      try {
        await queueStatusOffline({ job, status });
      } catch (error) {
        alert(error?.message || 'Nie udało się zapisać zakończenia w pamięci telefonu.');
      }
      return;
    }

    if (workerFinishing || workerRestarting) setBusy(true);
    try {
      if (workerFinishing) {
        let verificationJob = job;
        try {
          const verification = await loadJobNameplatePhotosData({ supabase, jobId });
          verificationJob = { ...job, photos: verification.photos };
        } catch (verificationError) {
          console.warn('Nie udało się pobrać lekkiej weryfikacji tabliczek.', verificationError?.message || verificationError);
          const localCompletion = getJobNameplateCompletion(job);
          const locallyConfirmedOnServer = localCompletion.isComplete
            && localCompletion.units.every((unit) => {
              const photo = unit.photo || {};
              const uploadStatus = String(photo.upload_status || '').trim().toLowerCase();
              return !isLocalQueuedPhoto(photo)
                && uploadStatus !== 'uploading'
                && uploadStatus !== 'error'
                && Boolean(String(photo.storage_path || '').trim());
            });

          if (!locallyConfirmedOnServer) {
            alert('Nie udało się potwierdzić zdjęć tabliczek na serwerze. Odśwież zlecenie i spróbuj ponownie.');
            return;
          }
        }

        const completion = getJobNameplateCompletion(verificationJob);
        if (!completion.isComplete) {
          const localCompletion = getJobNameplateCompletion(job, { allowLocal: true });
          if (localCompletion.isComplete) {
            await queueStatusOffline({ job, status, reason: 'waiting-for-photo-sync' });
            return;
          }
          const missingLabel = formatMissingNameplateMessage(completion);
          alert(`Nie można zakończyć zlecenia. Dodaj wymagane zdjęcia tabliczek znamionowych: ${missingLabel}.`);
          return;
        }
      }

      await updateJobStatus({ supabase, jobId, status });
      if (completingNow) {
        try {
          await sendCompletionPush?.({ jobId });
        } catch (pushError) {
          console.warn('Zlecenie zostało zakończone, ale push do administratora nie został wysłany:', pushError?.message || pushError);
        }
      }
      await reloadJobSummary?.(jobId);
    } catch (error) {
      if (workerRestarting && isTransientSupabaseError(error)) {
        try {
          await queueStatusOffline({
            job,
            status,
            reason: 'transient-restart',
            message: currentStatus === 'Nowe' ? 'Rozpoczęcie zapisano na telefonie. Status zmieni się w systemie automatycznie po synchronizacji.' : 'Ponowne rozpoczęcie zapisano na telefonie. Status zmieni się w systemie automatycznie po synchronizacji.',
          });
          return;
        } catch (queueError) {
          alert(queueError?.message || 'Nie udało się zapisać ponownego rozpoczęcia w pamięci telefonu.');
          return;
        }
      }
      if (workerFinishing && isTransientSupabaseError(error)) {
        const localCompletion = getJobNameplateCompletion(job, { allowLocal: true });
        if (localCompletion.isComplete) {
          try {
            await queueStatusOffline({ job, status, reason: 'transient-error' });
            return;
          } catch (queueError) {
            alert(queueError?.message || 'Nie udało się zapisać zakończenia w pamięci telefonu.');
            return;
          }
        }
      }
      alert(normalizeDatabaseErrorMessage(error));
    } finally {
      if (workerFinishing || workerRestarting) setBusy(false);
    }
  }

  async function saveAdminNote(jobId, admin_note) {
    if (!supabase || !jobId) return false;

    const normalizedAdminNote = String(admin_note || "").trim() || null;
    const previousJobs = jobs;
    const previousSelectedJob = selectedJob;

    setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, admin_note: normalizedAdminNote } : job)));
    setSelectedJob((prev) => (prev && prev.id === jobId ? { ...prev, admin_note: normalizedAdminNote } : prev));

    try {
      await saveJobAdminNote({ supabase, jobId, adminNote: normalizedAdminNote });
      await reloadJobSummary?.(jobId);
      return true;
    } catch (error) {
      setJobs(previousJobs);
      setSelectedJob(previousSelectedJob);
      alert(normalizeDatabaseErrorMessage(error, ADMIN_NOTE_DELETE_ERROR_MESSAGE));
      return false;
    }
  }

  function requestClearAdminNote(job) {
    if (!canManageAdminNote(job, isAdmin)) return;
    openConfirmDialog({
      variant: "delete",
      title: "Usunąć komentarz administratora?",
      message: "Komentarz administratora zostanie wyczyszczony z tej karty.",
      onConfirm: async () => runConfirmAction(() => saveAdminNote(job.id, "")),
    });
  }

  async function addComment(jobId, type) {
    if (!profile) return;
    if (!canAddResolvedJobComment(jobId)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }
    const text = commentDrafts[jobId] || "";
    if (!text.trim()) return;
    const commentId = createOfflineUuid();

    try {
      if (!isAdmin && isBrowserOffline()) {
        await queueCommentOffline({ jobId, type, text, commentId });
        return;
      }
      await addJobComment({
        supabase,
        profile,
        jobs,
        profiles,
        jobId,
        type,
        text,
        commentId,
        createNotification,
      });
      setCommentDrafts((prev) => ({ ...prev, [jobId]: "" }));
      await reloadJobDetails?.(jobId, { force: true });
    } catch (error) {
      if (!isAdmin && isTransientSupabaseError(error)) {
        try {
          await queueCommentOffline({ jobId, type, text, commentId, reason: 'transient-error' });
          return;
        } catch (queueError) {
          alert(queueError?.message || 'Nie udało się zapisać komentarza w pamięci telefonu.');
          return;
        }
      }
      alert(normalizeDatabaseErrorMessage(error));
    }
  }

  async function removeComment(commentId) {
    if (!supabase || !isAdmin || !commentId) return false;

    const previousJobs = jobs;
    const previousSelectedJob = selectedJob;

    setJobs((prev) => prev.map((job) => ({
      ...job,
      comments: Array.isArray(job.comments) ? job.comments.filter((comment) => comment.id !== commentId) : [],
    })));
    setSelectedJob((prev) => (prev ? {
      ...prev,
      comments: Array.isArray(prev.comments) ? prev.comments.filter((comment) => comment.id !== commentId) : [],
    } : prev));

    try {
      await deleteJobComment({ supabase, commentId });

      const selectedJobId = previousSelectedJob?.id;
      void (async () => {
        try {
          if (selectedJobId) {
            await withTimeout(
              reloadJobDetails?.(selectedJobId, { force: true }),
              15000,
              "Odświeżanie szczegółów zlecenia trwa zbyt długo.",
            );
          }
        } catch (refreshError) {
          console.warn("Nie udało się odświeżyć komentarzy w tle po usunięciu.", refreshError);
        }
      })();

      return true;
    } catch (error) {
      setJobs(previousJobs);
      setSelectedJob(previousSelectedJob);
      alert(normalizeDatabaseErrorMessage(error, COMMENT_DELETE_ERROR_MESSAGE));
      return false;
    }
  }

  function requestRemoveComment(comment) {
    if (!comment?.id || !isAdmin) return;
    openConfirmDialog({
      variant: "delete",
      title: "Usunąć komentarz?",
      message: `Czy na pewno chcesz usunąć komentarz użytkownika ${comment.author_name || ""}?`.trim(),
      onConfirm: async () => runConfirmAction(() => removeComment(comment.id)),
    });
  }

  function deletePhoto(photo) {
    if (!canModifyResolvedJobPhotos(photo?.job_id)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }
    if (!photo) return;

    openConfirmDialog({
      variant: "delete",
      title: "Usunąć zdjęcie?",
      message: "Czy na pewno chcesz usunąć to zdjęcie z karty montażu?",
      onConfirm: async () => runConfirmAction(async () => {
        onPhotoSyncStart?.();
        const deleted = await deleteJobPhoto({
          supabase,
          photo,
          deletingPhotoId,
          previewImage,
          setPreviewImage,
          jobs,
          selectedJob,
          setJobs,
          setSelectedJob,
          setDeletingPhotoId,
          supabaseUrl,
          skipConfirmation: true,
        });
        if (deleted) {
          await reloadJobDetails?.(photo.job_id, { force: true, background: true });
          onPhotoSyncSuccess?.();
        } else {
          onPhotoSyncError?.();
        }
        return deleted;
      }),
    });
  }

  function schedulePhotoDetailsSync(jobId) {
    if (!jobId || typeof window === "undefined" || typeof window.setTimeout !== "function") return;

    // Realtime jest podstawą. Zostaje tylko jeden debounced fallback dla konkretnego
    // zlecenia, zamiast czterech kolejnych odświeżeń 1,2 / 5 / 12 / 20 s.
    const targetId = String(jobId);
    const existingTimer = photoDetailsSyncTimersRef.current.get(targetId);
    if (existingTimer) window.clearTimeout(existingTimer);
    const timerId = window.setTimeout(() => {
      photoDetailsSyncTimersRef.current.delete(targetId);
      void reloadJobDetails?.(targetId, { force: true, background: true });
    }, 1200);
    photoDetailsSyncTimersRef.current.set(targetId, timerId);
  }

  async function handlePhotoUpload(jobId, event) {
    if (!canModifyResolvedJobPhotos(jobId)) {
      if (event?.target) event.target.value = "";
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }

    if (event?.target?.files?.length) onPhotoSyncStart?.();
    void (async () => {
      try {
        const result = await uploadJobPhotos({
          supabase,
          profile,
          jobId,
          event,
          setJobs,
          setSelectedJob,
          supabaseUrl,
          onPhotoUploaded: (uploadedPhoto) => {
            onPhotoSyncSuccess?.();
            schedulePhotoDetailsSync(uploadedPhoto?.job_id || jobId);
          },
          onPhotoUploadError: onPhotoSyncError,
        });
        if (result?.failedCount) {
          alert(`${result.failedCount} ${result.failedCount === 1 ? 'zdjęcia nie udało się' : 'zdjęć nie udało się'} zapisać na telefonie. Zwolnij miejsce i dodaj je ponownie.`);
        }
      } catch (error) {
        alert(error?.message || 'Nie udało się dodać zdjęcia.');
      }
    })();
  }

  function retryPhotoUpload(photo) {
    if (!photo) return false;
    onPhotoSyncStart?.();
    return retryQueuedJobPhoto({
      supabase,
      profile,
      photo,
      setJobs,
      setSelectedJob,
      supabaseUrl,
      onPhotoUploaded: (uploadedPhoto) => {
        onPhotoSyncSuccess?.();
        schedulePhotoDetailsSync(uploadedPhoto?.job_id || photo.job_id);
      },
      onPhotoUploadError: onPhotoSyncError,
    });
  }

  async function toggleViewer(jobId, userId, viewers) {
    if (!canManageResolvedJobViewers(jobId)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }

    const previousJobs = jobs;
    const previousSelectedJob = selectedJob;
    const currentViewers = Array.isArray(viewers) ? viewers : [];
    const exists = currentViewers.some((viewer) => viewer.user_id === userId);
    const optimisticViewer = {
      id: `local-${jobId}-${userId}`,
      job_id: jobId,
      user_id: userId,
      optimistic: true,
    };
    const nextViewers = exists
      ? currentViewers.filter((viewer) => viewer.user_id !== userId)
      : [...currentViewers, optimisticViewer];

    const applyOptimisticViewers = (job) => (String(job?.id) === String(jobId) ? { ...job, viewers: nextViewers } : job);
    setJobs((prev) => prev.map(applyOptimisticViewers));
    setSelectedJob((prev) => (prev && String(prev.id) === String(jobId) ? applyOptimisticViewers(prev) : prev));

    try {
      await toggleJobViewer({
        supabase,
        jobId,
        userId,
        viewers: currentViewers,
        jobs,
        sendAssignmentPushFn: sendAssignmentPush,
      });
      await reloadJobSummary?.(jobId);
    } catch (error) {
      setJobs(previousJobs);
      setSelectedJob(previousSelectedJob);
      alert(normalizeDatabaseErrorMessage(error));
    }
  }

  return {
    deletingPhotoId,
    addJob,
    openEditJob,
    openSerialNumbersJob,
    saveEditedJob,
    deleteJob,
    deleteDeviceFromJob,
    updateStatus,
    saveAdminNote,
    requestClearAdminNote,
    addComment,
    removeComment,
    requestRemoveComment,
    deletePhoto,
    handlePhotoUpload,
    retryPhotoUpload,
    toggleViewer,
  };
}
