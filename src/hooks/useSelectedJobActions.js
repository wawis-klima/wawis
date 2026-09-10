import { useState } from "react";
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
} from "../modules/jobs.js";
import { addJobComment, deleteJobComment, withTimeout } from "../modules/jobs-comments.js";
import { toggleJobViewer } from "../modules/jobs-assignment.js";
import { deleteJobPhoto, uploadJobDocumentationPhotos, uploadJobPhotos } from "../modules/photos.js";
import { normalizeDatabaseErrorMessage } from "../modules/database-errors.js";
import { deleteJobDeviceRecord } from "../modules/job-device-delete.js";

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
  editingJobId,
  serialOnlyMode = false,
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
}) {
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);

  async function addJob(formOverride) {
    if (!supabase || !profile) return;
    const form = formOverride || jobFormRef.current;
    setBusy(true);

    try {
      await addJobRecord({
        supabase,
        profile,
        form,
        contractors: contractorsCatalog,
        isAdmin,
        normalizeStatus,
        createNotification,
        sendAssignmentPushFn: sendAssignmentPush,
      });
      resetJobModalState();
      await refreshAll(sessionUser);
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
    openEditJobForm({ jobId: job.id, form: nextForm });
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
    const pendingDocuments = Array.isArray(form.pending_nameplate_photos) ? form.pending_nameplate_photos : [];
    setBusy(true);

    try {
      if (serialOnlyMode) {
        await saveJobDeviceSerialsRecord({ supabase, editingJobId, form });
      } else {
        await saveEditedJobRecord({
          supabase,
          editingJobId,
          form,
          contractors: contractorsCatalog,
          isAdmin,
          jobs,
          normalizeStatus,
          sendAssignmentPushFn: sendAssignmentPush,
        });
      }

      const documentationResult = await uploadJobDocumentationPhotos({
        supabase,
        profile,
        jobId: editingJobId,
        documents: pendingDocuments,
        reloadJobDetails,
      });

      resetJobModalState();
      await Promise.all([
        reloadJobSummary?.(editingJobId),
        reloadJobDetails?.(editingJobId, { force: true, background: true }),
      ]);

      if (documentationResult.failedCount) {
        alert(`Dane urządzeń zapisano, ale ${documentationResult.failedCount} ${documentationResult.failedCount === 1 ? 'zdjęcia tabliczki nie udało się wysłać' : 'zdjęć tabliczek nie udało się wysłać'}. Spróbuj ponownie z karty montażu.`);
      }
    } catch (error) {
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
    const job = getResolvedJob(jobId);
    const currentStatus = normalizeStatus(job?.status);
    const completingNow = status === "Zakończone" && currentStatus !== "Zakończone";

    if (!canChangeJobStatus(job, status, isAdmin)) {
      if (!isAdmin && status === "Zakończone" && currentStatus !== "Zakończone") {
        alert(WORKER_FINISH_STATUS_MESSAGE);
      }
      return;
    }

    if (!isAdmin && status === "Zakończone" && currentStatus === "Zakończone") {
      return;
    }

    try {
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
      alert(normalizeDatabaseErrorMessage(error));
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

    try {
      await addJobComment({
        supabase,
        profile,
        jobs,
        profiles,
        jobId,
        type,
        text,
        createNotification,
      });
      setCommentDrafts((prev) => ({ ...prev, [jobId]: "" }));
      await reloadJobDetails?.(jobId, { force: true });
    } catch (error) {
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
        }
        return deleted;
      }),
    });
  }

  async function handlePhotoUpload(jobId, event) {
    if (!canModifyResolvedJobPhotos(jobId)) {
      if (event?.target) event.target.value = "";
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }

    await uploadJobPhotos({
      supabase,
      profile,
      jobId,
      event,
      reloadJobDetails,
    });
  }

  async function toggleViewer(jobId, userId, viewers) {
    if (!canManageResolvedJobViewers(jobId)) {
      alert(WORKER_COMPLETED_JOB_LOCK_MESSAGE);
      return;
    }

    try {
      await toggleJobViewer({
        supabase,
        jobId,
        userId,
        viewers,
        jobs,
        sendAssignmentPushFn: sendAssignmentPush,
      });
      await reloadJobSummary?.(jobId);
    } catch (error) {
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
    toggleViewer,
  };
}
