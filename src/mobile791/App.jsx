import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "./components/AuthScreen";
import AppAuthenticatedLayout from "./components/layout/AppAuthenticatedLayout.jsx";
import JobsPanel from "./components/JobsPanel";
import ConfirmActionModal from "./components/modals/ConfirmActionModal.jsx";

import PreviewModal from "./components/modals/PreviewModal";
import { createJobAccessors } from "./utils/jobAccessors.js";
import { countSmsDueToday } from "./modules/sms.js";
import { normalizeStatus, STATUSES } from "./utils/jobPermissions.js";
import { supabase, supabaseUrl, LOGOUT_FLAG_KEY, isSupabaseConfigured } from "./lib/supabase.js";
import { EMPTY_JOB_FORM, loadJobDetailsData, loadJobSummaryData } from "./modules/jobs.js";
import { loadContractors } from "./modules/contractors-fetch.js";
import {
  formatDate,
  getNextSortValue,
  getSortLabel as getSortLabelForField,
  getVisibleJobs,
} from "./modules/jobs-selectors.js";
import { createNotification } from "./modules/notifications.js";
import { getPhotoStoragePath, getSignedPhotoUrl, hasDisplayablePhotoUrl, hasRemotePhotoUrl, isLocalQueuedPhoto, restorePersistedJobPhotos, resumePersistedPhotoUploads, retryAllPersistedPhotoUploads } from "./modules/photos.js";
import { sendAssignmentPush, sendJobCompletionPush } from "./modules/jobs-assignment.js";
import PushNotificationsControl from "./components/PushNotificationsControl.jsx";
import { usePhotoPreview } from "./hooks/usePhotoPreview.js";
import { useJobFormModal } from "./hooks/useJobFormModal.js";
import { useConfirmDialog } from "./hooks/useConfirmDialog.js";
import { useRealtimeRefresh } from "./hooks/useRealtimeRefresh.js";
import { usePushNotificationsState } from "./hooks/usePushNotificationsState.js";
import { useAppSession } from "./hooks/useAppSession.js";
import { useSelectedJobActions } from "./hooks/useSelectedJobActions.js";
import { usePhotoSyncStatus } from "./hooks/usePhotoSyncStatus.js";
import { getRequestedJobIdFromLocation } from "./utils/jobSelectionState.js";
import { deleteOfflineJobOperation, saveOfflineAppSnapshot, updateOfflineJobOperation } from "./modules/job-offline-store.js";
import { deletePhotoQueueItem, getPhotoQueueSummary } from "./modules/photo-offline-queue.js";
import { syncOfflineJobOperations } from "./modules/job-offline-sync.js";
import { logDiagnostic, startSilentDiagnosticSync } from "./modules/diagnostics.js";
import { isTransientSupabaseError } from "./modules/supabase-errors.js";
import { APP_VERSION } from "./version.js";

const statusBlueImg = "/status-buttons/status-blue.png";
const statusAmberImg = "/status-buttons/status-amber.png";
const statusSlateImg = "/status-buttons/status-slate.png";
const statusGreenImg = "/status-buttons/status-green.png";

const SmsPanel = lazy(() => import("./components/sms/SmsPanel.jsx"));
const ContractorsPanel = lazy(() => import("./components/contractors/ContractorsPanel.jsx"));
const DevicesPanel = lazy(() => import("./components/devices/DevicesPanel.jsx"));
const CalendarPanel = lazy(() => import("./components/calendar/CalendarPanel.jsx"));
const JobDetailsPanel = lazy(() => import("./components/JobDetailsPanel.jsx"));
const JobFormModal = lazy(() => import("./components/modals/JobFormModal.jsx"));
const FuelPanel = lazy(() => import("../components/fuel/FuelPanel.jsx"));

const adminModuleFallback = (
  <div className="card authCard">Trwa ładowanie modułu...</div>
);

const jobDetailsFallback = (
  <div className="card premiumCard">Trwa ładowanie szczegółów montażu...</div>
);

const jobFormModalFallback = (
  <div className="card authCard">Trwa ładowanie formularza montażu...</div>
);

const JOBS_PAGE_SIZE = 10;
const JOB_DETAILS_TIMEOUT_MS = 3200;
const JOB_DETAILS_RETRY_DELAYS_MS = Object.freeze([0, 500]);
const MOBILE_THUMBNAIL_TRANSFORM = Object.freeze({ width: 400, quality: 72, resize: 'contain' });
const MOBILE_THUMBNAIL_RECOVERY_LIMIT = 2;

function markThumbnailRecoveryUrl(url, attempt) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return '';
  return `${normalizedUrl}#wawis-thumbnail-recovery-${attempt}`;
}

function toCalendarDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarDateKeyForJob(job = {}) {
  const rawDate = job.installation_date;
  if (!rawDate) return "";
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return "";
  return toCalendarDateKey(date);
}

function getIsProbablyPhoneDevice() {
  if (typeof navigator === "undefined") return true;

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";

  // Pozwala na typowe telefony. Celowo nie traktujemy tabletów jako telefonu,
  // bo rola Pracownik ma korzystać z aplikacji w widoku mobilnym.
  const matchesPhoneUserAgent = /Android.+Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobi/i.test(userAgent);
  const isIphoneLike = /iPhone|iPod/i.test(platform);

  return matchesPhoneUserAgent || isIphoneLike;
}

function getPhotoTime(photo = {}) {
  const timestamp = Date.parse(photo.created_at || photo.detailsLoadedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isFreshMobileUploadedPhoto(photo = {}) {
  const status = String(photo.upload_status || '').trim();
  if (isLocalQueuedPhoto(photo) || status === 'uploading' || status === 'error') return true;
  if (status !== 'uploaded') return false;

  const createdAt = getPhotoTime(photo);
  const hasLocalBlobPreview = [photo.image_url, photo.signed_url, photo.original_image_url, photo.local_preview_url]
    .some((value) => String(value || '').startsWith('blob:'));

  // Po własnym uploadzie trzymamy lokalny blob tylko chwilę, żeby iPhone nie
  // zgubił miniatury zanim Supabase odda signed URL. Nie trzymamy go minutami,
  // bo wtedy usunięte zdjęcia mogłyby zostać w mobilnym cache.
  return Boolean(hasLocalBlobPreview && createdAt && Date.now() - createdAt < 60 * 1000);
}

function carryMobilePhotoDisplayState(incomingPhoto = {}, existingPhoto = null) {
  if (!existingPhoto) return incomingPhoto;

  const nextPhoto = { ...incomingPhoto };
  if (!nextPhoto.thumbnail_image_url && existingPhoto.thumbnail_image_url) {
    nextPhoto.thumbnail_image_url = existingPhoto.thumbnail_image_url;
  }
  if (!nextPhoto.preview_full_url && existingPhoto.preview_full_url) {
    nextPhoto.preview_full_url = existingPhoto.preview_full_url;
  }
  if (!hasDisplayablePhotoUrl(nextPhoto) && hasDisplayablePhotoUrl(existingPhoto)) {
    nextPhoto.thumbnail_image_url = nextPhoto.thumbnail_image_url || existingPhoto.thumbnail_image_url || '';
    nextPhoto.image_url = existingPhoto.image_url || existingPhoto.signed_url || existingPhoto.original_image_url || '';
    nextPhoto.signed_url = existingPhoto.signed_url || existingPhoto.image_url || '';
    nextPhoto.original_image_url = existingPhoto.original_image_url || existingPhoto.image_url || '';
    nextPhoto.local_preview_url = nextPhoto.local_preview_url || existingPhoto.local_preview_url || '';
  }

  if (!hasRemotePhotoUrl(nextPhoto) && hasRemotePhotoUrl(existingPhoto)) {
    nextPhoto.thumbnail_image_url = nextPhoto.thumbnail_image_url || existingPhoto.thumbnail_image_url || '';
    nextPhoto.preview_full_url = nextPhoto.preview_full_url || existingPhoto.preview_full_url || '';
    nextPhoto.image_url = nextPhoto.image_url || existingPhoto.image_url || '';
    nextPhoto.signed_url = nextPhoto.signed_url || existingPhoto.signed_url || '';
    nextPhoto.original_image_url = nextPhoto.original_image_url || existingPhoto.original_image_url || '';
  }

  return nextPhoto;
}

function mergeMobilePhotoDetails(currentPhotos = [], loadedPhotos = []) {
  const existingById = new Map((currentPhotos || []).map((photo) => [String(photo.id || ''), photo]).filter(([id]) => id));
  const loadedIds = new Set();

  const mergedPhotos = (loadedPhotos || []).map((photo) => {
    const id = String(photo.id || '');
    loadedIds.add(id);
    return carryMobilePhotoDisplayState(photo, existingById.get(id));
  });

  for (const photo of currentPhotos || []) {
    const id = String(photo.id || '');
    if (!id || loadedIds.has(id)) continue;
    if (isFreshMobileUploadedPhoto(photo)) {
      mergedPhotos.push(photo);
    }
  }

  return mergedPhotos.sort((a, b) => getPhotoTime(a) - getPhotoTime(b));
}

function mergeJobDetailsForMobile(currentJob = {}, details = {}) {
  const merged = { ...currentJob, ...details };
  merged.photos = mergeMobilePhotoDetails(currentJob.photos || [], details.photos || []);
  return merged;
}

function EmployeeMobileOnlyBlock({ profile, logout }) {
  return (
    <div className="page mobileOnlyBlockPage">
      <div className="card authCard mobileOnlyBlockCard">
        <div className="sectionPill">Dostęp pracownika</div>
        <h1>Aplikacja dla pracownika jest dostępna tylko na telefonie</h1>
        <p>
          Zaloguj się z telefonu, aby korzystać z modułu zleceń.
          Wersja komputerowa jest dostępna tylko dla administratora.
        </p>
        <p className="mobileOnlyBlockUser">
          Zalogowano jako: <strong>{profile?.name || profile?.email || "Pracownik"}</strong>
        </p>
        <button className="btn primary" type="button" onClick={logout}>Wyloguj</button>
      </div>
    </div>
  );
}

export default function App() {
  const [selectedJob, setSelectedJob] = useState(null);
  const selectedJobIdRef = useRef(null);
  const jobDetailsRequestsRef = useRef(new Map());
  const jobSummaryRequestsRef = useRef(new Map());
  const jobsRef = useRef([]);
  const profilesRef = useRef([]);
  const backgroundDetailsTimersRef = useRef(new Map());
  const offlinePhotoQueueUserRef = useRef('');
  const offlineSyncContextRef = useRef({ profile: null, profiles: [], jobs: [], sessionUser: null });
  const thumbnailRecoveryAttemptsRef = useRef(new Map());
  const thumbnailRecoveryInFlightRef = useRef(new Map());
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [desktopStatusFilter, setDesktopStatusFilter] = useState("W trakcie");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth <= 700 : false);
  const [isProbablyPhoneDevice, setIsProbablyPhoneDevice] = useState(getIsProbablyPhoneDevice);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [activeModule, setActiveModule] = useState("jobs");
  const [contractorsCatalog, setContractorsCatalog] = useState([]);
  const [requestedContractorId, setRequestedContractorId] = useState(null);
  const [desktopNavKey, setDesktopNavKey] = useState("orders");
  const [jobsPage, setJobsPage] = useState(1);
  const [pendingOpenJobId, setPendingOpenJobId] = useState(null);
  const [calendarReturnContext, setCalendarReturnContext] = useState(null);
  const [calendarFocusDateKey, setCalendarFocusDateKey] = useState("");
  const [detailsLoadingJobId, setDetailsLoadingJobId] = useState(null);
  const isConfigured = isSupabaseConfigured;
  const desktopStatusLabels = {
    "Nowe": "Nowe",
    "W trakcie": "W trakcie",
    "Niezrealizowane": "Niezrealizowane",
    "Zakończone": "Zakończone",
  };
  const statusButtonConfig = {
    "Nowe": { buttonClass: "statusButtonBlue", imageSrc: statusBlueImg },
    "W trakcie": { buttonClass: "statusButtonAmber", imageSrc: statusAmberImg },
    "Niezrealizowane": { buttonClass: "statusButtonSlate", imageSrc: statusSlateImg },
    "Zakończone": { buttonClass: "statusButtonGreen", imageSrc: statusGreenImg },
  };

  const {
    sessionUser,
    profile,
    profiles,
    jobs,
    busy,
    errorMsg,
    authResolved,
    loginForm,
    registerForm,
    showRegisterModal,
    showAssignedJobsOnly,
    isRefreshingData,
    setJobs,
    setBusy,
    setLoginForm,
    setRegisterForm,
    setShowRegisterModal,
    setShowAssignedJobsOnly,
    refreshAll,
    refreshChanged,
    captureCurrentSessionToken,
    isSessionTokenCurrent,
    login,
    registerUser,
    logout,
  } = useAppSession({
    supabase,
    logoutFlagKey: LOGOUT_FLAG_KEY,
    normalizeStatus,
    selectedJobIdRef,
    setSelectedJob,
  });

  const isAdmin = profile?.role === "Administrator";
  useEffect(() => {
    jobDetailsRequestsRef.current.clear();
    jobSummaryRequestsRef.current.clear();
    if (typeof window !== 'undefined') {
      for (const timerId of backgroundDetailsTimersRef.current.values()) window.clearTimeout(timerId);
    }
    backgroundDetailsTimersRef.current.clear();
    thumbnailRecoveryAttemptsRef.current.clear();
    thumbnailRecoveryInFlightRef.current.clear();
    setDetailsLoadingJobId(null);
  }, [sessionUser?.id]);
  useEffect(() => startSilentDiagnosticSync({
    supabase,
    userId: sessionUser?.id || '',
    appVersion: APP_VERSION,
    platform: 'mobile',
    getQueueSummary: getPhotoQueueSummary,
  }), [sessionUser?.id]);
  const photoSyncStatus = usePhotoSyncStatus(profile?.id || sessionUser?.id || "");
  offlineSyncContextRef.current = { profile, profiles, jobs, sessionUser };
  const offlineSyncUserId = String(profile?.id || sessionUser?.id || '').trim();
  const offlineSyncProfileId = String(profile?.id || '').trim();
  const offlineSyncJobCount = Array.isArray(jobs) ? jobs.length : 0;
  const hasPendingOfflineWork = (
    photoSyncStatus.queueSummary.local
    + photoSyncStatus.queueSummary.uploading
    + photoSyncStatus.operationSummary.pending
    + photoSyncStatus.operationSummary.syncing
  ) > 0;

  const resolveFullPhotoUrl = React.useCallback(async (photoOrUrl) => {
    if (typeof photoOrUrl === "string") return photoOrUrl;
    const photo = photoOrUrl && typeof photoOrUrl === "object" ? photoOrUrl : null;
    if (!photo) return "";
    const alreadyResolved = String(photo.preview_full_url || photo.image_url || photo.signed_url || "").trim();
    if (alreadyResolved) return alreadyResolved;
    const storagePath = getPhotoStoragePath({ photo, supabaseUrl });
    return getSignedPhotoUrl({
      storagePath,
      fallbackUrl: photo.original_image_url || photo.local_preview_url || "",
      supabase,
    });
  }, [supabase]);

  function handleDesktopNavigation(targetModule, navKey = targetModule) {
    setActiveModule(targetModule);
    setDesktopNavKey(navKey);
  }

  const { previewImage, setPreviewImage, openPreview, previewPrev, previewNext } = usePhotoPreview(selectedJob, resolveFullPhotoUrl);

  const {
    confirmModalProps,
    openConfirmDialog,
    runConfirmAction,
  } = useConfirmDialog();

  const {
    pushState,
    pushBusy,
    togglePush,
  } = usePushNotificationsState({ supabase, sessionUser });

  const {
    showModal,
    editingJobId,
    serialOnlyMode,
    jobForm,
    jobFormDirty,
    jobFormRef,
    setJobForm,
    resetJobModalState,
    openAddJob,
    openEditJobForm,
    closeJobModal,
  } = useJobFormModal({
    emptyJobForm: EMPTY_JOB_FORM,
    normalizeStatus,
    openConfirmDialog,
  });

  const {
    getResolvedJob,
    canEditResolvedJob,
    canModifyResolvedJobPhotos,
    canAddResolvedJobComment,
    canManageResolvedJobViewers,
  } = useMemo(() => createJobAccessors({ jobs, selectedJob, isAdmin }), [jobs, selectedJob, isAdmin]);

  const createNotificationAction = ({ userId, title, body, linkJobId = null }) => createNotification({
    supabase,
    userId,
    title,
    body,
    linkJobId,
  });

  const sendAssignmentPushAction = ({ newUserIds, jobId }) => sendAssignmentPush({
    supabase,
    newUserIds,
    jobId,
  });

  const sendCompletionPushAction = ({ jobId }) => sendJobCompletionPush({
    supabase,
    jobId,
  });

  const hydrateJobThumbnails = React.useCallback(async (jobId, photos = [], sessionToken = captureCurrentSessionToken()) => {
    const targetId = String(jobId || '').trim();
    if (!targetId || !supabase || !Array.isArray(photos) || photos.length === 0 || !isSessionTokenCurrent(sessionToken)) return;

    const settled = await Promise.allSettled(photos.map(async (photo) => {
      if (!photo || photo.thumbnail_image_url || isLocalQueuedPhoto(photo)) return null;
      const storagePath = getPhotoStoragePath({ photo, supabaseUrl });
      if (!storagePath && !photo.original_image_url) return null;

      let thumbnailUrl = await getSignedPhotoUrl({
        storagePath,
        fallbackUrl: storagePath ? '' : (photo.original_image_url || ''),
        supabase,
        transform: MOBILE_THUMBNAIL_TRANSFORM,
      });

      // Gdy podpis miniatury utknie lub transformacja chwilowo nie odpowiada,
      // nie zostawiamy pustego kafelka do kolejnego logowania. Od razu próbujemy
      // świeżego podpisu do oryginału; karta montażu pozostaje interaktywna,
      // bo cały proces działa w tle.
      if (!thumbnailUrl && storagePath && isSessionTokenCurrent(sessionToken)) {
        thumbnailUrl = await getSignedPhotoUrl({
          storagePath,
          fallbackUrl: photo.original_image_url || '',
          supabase,
          expiresIn: 3598,
          transform: null,
          forceRefresh: true,
        });
      }

      if (!thumbnailUrl && storagePath && isSessionTokenCurrent(sessionToken)) {
        logDiagnostic('photo.thumbnail.load.failed', {
          retry_count: 2,
          phase: 'initial_signing_fallback',
          error: {
            code: 'THUMBNAIL_SIGNING_FAILED',
            message: 'Mobile thumbnail and original signing failed during initial hydration.',
          },
        });
      }

      return thumbnailUrl ? { id: String(photo.id || ''), thumbnailUrl } : null;
    }));

    if (!isSessionTokenCurrent(sessionToken)) return;

    const patches = new Map(
      settled
        .filter((item) => item.status === 'fulfilled' && item.value?.id && item.value?.thumbnailUrl)
        .map((item) => [item.value.id, item.value.thumbnailUrl]),
    );
    if (patches.size === 0) return;

    const patchJob = (job) => {
      if (!job || String(job.id) !== targetId || !Array.isArray(job.photos)) return job;
      return {
        ...job,
        photos: job.photos.map((photo) => {
          const thumbnailUrl = patches.get(String(photo?.id || ''));
          return thumbnailUrl ? { ...photo, thumbnail_image_url: thumbnailUrl, thumbnail_load_failed: false } : photo;
        }),
      };
    };

    setJobs((prev) => prev.map(patchJob));
    setSelectedJob((prev) => patchJob(prev));
  }, [captureCurrentSessionToken, isSessionTokenCurrent, supabase]);

  const recoverPhotoThumbnail = React.useCallback(async (photo) => {
    const sessionToken = captureCurrentSessionToken();
    const jobId = String(photo?.job_id || selectedJobIdRef.current || '').trim();
    const photoId = String(photo?.id || '').trim();
    const storagePath = getPhotoStoragePath({ photo, supabaseUrl });
    if (!jobId || !photoId || !storagePath || !supabase || !isSessionTokenCurrent(sessionToken)) return '';

    const recoveryKey = `${jobId}:${photoId}`;
    const activeRecovery = thumbnailRecoveryInFlightRef.current.get(recoveryKey);
    if (activeRecovery) return activeRecovery;

    const attempt = Number(thumbnailRecoveryAttemptsRef.current.get(recoveryKey) || 0);
    if (attempt >= MOBILE_THUMBNAIL_RECOVERY_LIMIT) {
      const markFailed = (job) => {
        if (!job || String(job.id) !== jobId || !Array.isArray(job.photos)) return job;
        return {
          ...job,
          photos: job.photos.map((item) => (
            String(item?.id || '') === photoId
              ? { ...item, thumbnail_image_url: '', thumbnail_load_failed: true }
              : item
          )),
        };
      };
      setJobs((prev) => prev.map(markFailed));
      setSelectedJob((prev) => markFailed(prev));
      return '';
    }

    const nextAttempt = attempt + 1;
    thumbnailRecoveryAttemptsRef.current.set(recoveryKey, nextAttempt);
    const useOriginal = nextAttempt === MOBILE_THUMBNAIL_RECOVERY_LIMIT;

    logDiagnostic('photo.thumbnail.load.retry', {
      retry_count: nextAttempt,
      phase: useOriginal ? 'original_fallback' : 'thumbnail_retry',
      error: {
        code: useOriginal ? 'THUMBNAIL_ORIGINAL_FALLBACK' : 'THUMBNAIL_LOAD_RETRY',
        message: useOriginal
          ? 'Mobile thumbnail still failed; trying the original image.'
          : 'Mobile photo thumbnail failed to load; refreshing signed URL.',
      },
    });

    const recoveryPromise = (async () => {
      let recoveredUrl = await getSignedPhotoUrl({
        storagePath,
        fallbackUrl: photo.original_image_url || '',
        supabase,
        expiresIn: useOriginal ? 3598 : 3599,
        transform: useOriginal ? null : MOBILE_THUMBNAIL_TRANSFORM,
        forceRefresh: true,
      });
      if (!isSessionTokenCurrent(sessionToken)) return '';
      let resolvedAttempt = nextAttempt;

      // Jeśli nie udało się nawet podpisać pomniejszonej wersji, nie czekamy
      // na kolejne zdarzenie obrazka. Od razu pobieramy link do oryginału.
      if (!recoveredUrl && !useOriginal) {
        resolvedAttempt = MOBILE_THUMBNAIL_RECOVERY_LIMIT;
        thumbnailRecoveryAttemptsRef.current.set(recoveryKey, resolvedAttempt);
        logDiagnostic('photo.thumbnail.load.retry', {
          retry_count: resolvedAttempt,
          phase: 'original_fallback',
          error: {
            code: 'THUMBNAIL_SIGNING_FAILED',
            message: 'Mobile thumbnail signing failed; trying the original image.',
          },
        });
        recoveredUrl = await getSignedPhotoUrl({
          storagePath,
          fallbackUrl: photo.original_image_url || '',
          supabase,
          expiresIn: 3598,
          transform: null,
          forceRefresh: true,
        });
        if (!isSessionTokenCurrent(sessionToken)) return '';
      }

      if (!isSessionTokenCurrent(sessionToken)) return '';
      const markedUrl = markThumbnailRecoveryUrl(recoveredUrl, resolvedAttempt);

      if (markedUrl) {
        logDiagnostic('photo.thumbnail.load.succeeded', {
          retry_count: resolvedAttempt,
          phase: resolvedAttempt >= MOBILE_THUMBNAIL_RECOVERY_LIMIT ? 'original_fallback' : 'thumbnail_retry',
        });
      } else if (resolvedAttempt >= MOBILE_THUMBNAIL_RECOVERY_LIMIT) {
        logDiagnostic('photo.thumbnail.load.failed', {
          retry_count: resolvedAttempt,
          phase: 'recovery_exhausted',
          error: {
            code: 'THUMBNAIL_RECOVERY_FAILED',
            message: 'Mobile thumbnail and original image recovery both failed.',
          },
        });
        thumbnailRecoveryAttemptsRef.current.set(recoveryKey, MOBILE_THUMBNAIL_RECOVERY_LIMIT + 1);
      }

      const patchPhoto = (job) => {
        if (!job || String(job.id) !== jobId || !Array.isArray(job.photos)) return job;
        return {
          ...job,
          photos: job.photos.map((item) => (
            String(item?.id || '') === photoId
              ? {
                ...item,
                thumbnail_image_url: markedUrl,
                thumbnail_load_failed: !markedUrl && resolvedAttempt >= MOBILE_THUMBNAIL_RECOVERY_LIMIT,
              }
              : item
          )),
        };
      };
      setJobs((prev) => prev.map(patchPhoto));
      setSelectedJob((prev) => patchPhoto(prev));
      return markedUrl;
    })().catch((error) => {
      console.warn('Nie udało się odświeżyć miniatury zdjęcia mobilnego:', error?.message || error);
      return '';
    }).finally(() => {
      if (thumbnailRecoveryInFlightRef.current.get(recoveryKey) === recoveryPromise) {
        thumbnailRecoveryInFlightRef.current.delete(recoveryKey);
      }
    });

    thumbnailRecoveryInFlightRef.current.set(recoveryKey, recoveryPromise);
    return recoveryPromise;
  }, [captureCurrentSessionToken, isSessionTokenCurrent, supabase]);

  const markPhotoThumbnailLoaded = React.useCallback((photo) => {
    const jobId = String(photo?.job_id || selectedJobIdRef.current || '').trim();
    const photoId = String(photo?.id || '').trim();
    if (!jobId || !photoId) return;
    const recoveryKey = `${jobId}:${photoId}`;
    thumbnailRecoveryAttemptsRef.current.delete(recoveryKey);
    thumbnailRecoveryInFlightRef.current.delete(recoveryKey);
  }, []);

  const reloadJobDetails = React.useCallback(async (jobId, options = {}) => {
    const targetId = String(jobId || '').trim();
    const sessionToken = captureCurrentSessionToken();
    if (!targetId || !supabase || !isSessionTokenCurrent(sessionToken)) return null;

    const targetJob = jobsRef.current.find((job) => String(job.id) === targetId);
    if (!targetJob) return null;
    if (targetJob.detailsLoaded && !options.force) return targetJob;

    const requestKey = `${sessionToken.generation}:${sessionToken.userId}:${targetId}`;
    const existingRequest = jobDetailsRequestsRef.current.get(requestKey);
    if (existingRequest) return existingRequest;

    if (!options.background) setDetailsLoadingJobId(targetId);
    const request = (async () => {
      let lastError = null;

      try {
        for (let attemptIndex = 0; attemptIndex < JOB_DETAILS_RETRY_DELAYS_MS.length; attemptIndex += 1) {
          const delayMs = JOB_DETAILS_RETRY_DELAYS_MS[attemptIndex];
          if (delayMs && typeof window !== 'undefined') {
            await new Promise((resolve) => window.setTimeout(resolve, delayMs));
          }
          if (!isSessionTokenCurrent(sessionToken)) return null;

          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timeoutId = typeof window !== 'undefined'
            ? window.setTimeout(() => controller?.abort(), JOB_DETAILS_TIMEOUT_MS)
            : null;

          try {
            const details = await loadJobDetailsData({
              supabase,
              jobId: targetId,
              team: profilesRef.current,
              getSignedPhotoUrl,
              supabaseUrl,
              signal: controller?.signal || null,
              deferThumbnailSigning: true,
            });
            if (!isSessionTokenCurrent(sessionToken)) return null;

            const cleanDetails = { ...details, detailsLoadError: '' };
            let mergedJob = null;
            setJobs((prev) => prev.map((job) => {
              if (String(job.id) !== targetId) return job;
              mergedJob = mergeJobDetailsForMobile(job, cleanDetails);
              return mergedJob;
            }));
            setSelectedJob((prev) => (prev && String(prev.id) === targetId ? mergeJobDetailsForMobile(prev, cleanDetails) : prev));

            // Szczegóły są gotowe od razu, a podpisy miniatur robią się dopiero
            // w tle. Dzięki temu chwilowa awaria Storage nie blokuje całej karty.
            void hydrateJobThumbnails(targetId, cleanDetails.photos || [], sessionToken);
            return mergedJob;
          } catch (error) {
            lastError = error;
            if (!isSessionTokenCurrent(sessionToken)) return null;

            const transient = controller?.signal?.aborted || isTransientSupabaseError(error);
            const hasNextAttempt = attemptIndex + 1 < JOB_DETAILS_RETRY_DELAYS_MS.length;
            if (!transient || !hasNextAttempt) throw error;

            logDiagnostic('job.details.retry', {
              retry_count: attemptIndex + 1,
              phase: 'mobile_details_read',
              error: {
                code: error?.code || (controller?.signal?.aborted ? 'DETAILS_TIMEOUT' : 'DETAILS_TRANSIENT'),
                message: 'Mobile job details transient read failed; retrying automatically.',
              },
            });
            console.warn('Chwilowy błąd szczegółów montażu — ponawiam automatycznie.', error?.message || error);
          } finally {
            if (timeoutId !== null && typeof window !== 'undefined') window.clearTimeout(timeoutId);
          }
        }

        throw lastError || new Error('Nie udało się pobrać szczegółów montażu.');
      } catch (error) {
        if (!isSessionTokenCurrent(sessionToken)) return null;

        // Odświeżenie w tle nie może schować już załadowanych danych.
        if (options.background && targetJob.detailsLoaded) {
          console.warn('Tło szczegółów montażu nie odświeżyło się — zachowuję poprzednie dane.', error?.message || error);
          return targetJob;
        }

        const transient = isTransientSupabaseError(error) || error?.name === 'AbortError';
        const message = transient
          ? 'Połączenie z serwerem zostało przerwane. Aplikacja spróbowała ponownie. Kliknij „Ponów”.'
          : 'Nie udało się pobrać zdjęć i komentarzy. Kliknij „Ponów”.';
        const patchError = (job) => (
          job && String(job.id) === targetId
            ? { ...job, detailsLoaded: false, detailsLoadError: message }
            : job
        );
        setJobs((prev) => prev.map(patchError));
        setSelectedJob((prev) => patchError(prev));
        console.warn('Nie udało się pobrać szczegółów montażu w wersji mobilnej.', error?.message || error);
        return null;
      } finally {
        if (!options.background && isSessionTokenCurrent(sessionToken)) {
          setDetailsLoadingJobId((current) => (current === targetId ? null : current));
        }
      }
    })();

    jobDetailsRequestsRef.current.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (jobDetailsRequestsRef.current.get(requestKey) === request) {
        jobDetailsRequestsRef.current.delete(requestKey);
      }
    }
  }, [captureCurrentSessionToken, hydrateJobThumbnails, isSessionTokenCurrent, supabase]);

  const scheduleBackgroundJobDetailsReload = React.useCallback((jobId, delayMs = 900) => {
    const targetId = String(jobId || '').trim();
    if (!targetId || typeof window === 'undefined') return;
    const existingTimer = backgroundDetailsTimersRef.current.get(targetId);
    if (existingTimer) window.clearTimeout(existingTimer);
    const timerId = window.setTimeout(() => {
      backgroundDetailsTimersRef.current.delete(targetId);
      void reloadJobDetails(targetId, { force: true, background: true });
    }, Math.max(0, Number(delayMs) || 0));
    backgroundDetailsTimersRef.current.set(targetId, timerId);
  }, [reloadJobDetails]);

  const reloadJobSummary = React.useCallback(async (jobId) => {
    const targetId = String(jobId || '').trim();
    const sessionToken = captureCurrentSessionToken();
    if (!targetId || !supabase || !isSessionTokenCurrent(sessionToken)) return null;

    const requestKey = `${sessionToken.generation}:${sessionToken.userId}:${targetId}`;
    const existingRequest = jobSummaryRequestsRef.current.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      try {
        const summary = await loadJobSummaryData({ supabase, jobId: targetId });
        if (!isSessionTokenCurrent(sessionToken)) return null;
        if (summary?.missing || !summary?.job) {
          setJobs((prev) => prev.filter((job) => String(job.id) !== targetId));
          setSelectedJob((prev) => (prev && String(prev.id) === targetId ? null : prev));
          return null;
        }

        let mergedJob = null;
        setJobs((prev) => {
          const existing = prev.find((job) => String(job.id) === targetId);
          const nextJob = {
            ...(existing || {}),
            ...summary.job,
            viewers: summary.viewers || [],
          };
          mergedJob = nextJob;
          if (!existing) return [nextJob, ...prev];
          return prev.map((job) => (String(job.id) === targetId ? nextJob : job));
        });
        setSelectedJob((prev) => {
          if (!prev || String(prev.id) !== targetId) return prev;
          return { ...prev, ...summary.job, viewers: summary.viewers || [] };
        });
        return mergedJob;
      } catch (error) {
        if (!isSessionTokenCurrent(sessionToken)) return null;
        console.warn('Nie udało się odświeżyć pojedynczego montażu.', error?.message || error);
        return null;
      }
    })();

    jobSummaryRequestsRef.current.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (jobSummaryRequestsRef.current.get(requestKey) === request) {
        jobSummaryRequestsRef.current.delete(requestKey);
      }
    }
  }, [captureCurrentSessionToken, isSessionTokenCurrent, supabase]);

  const performOfflineJobSync = React.useCallback(async () => {
    const syncContext = offlineSyncContextRef.current;
    const currentProfile = syncContext.profile;
    if (!supabase || !currentProfile || isAdmin || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      await photoSyncStatus.refreshQueueSummary();
      return { processed: 0, synced: 0, conflicts: 0, errors: 0 };
    }
    photoSyncStatus.markPhotoSyncing();
    try {
      const result = await syncOfflineJobOperations({
        supabase,
        profile: currentProfile,
        profiles: syncContext.profiles,
        jobs: syncContext.jobs,
        createNotification: createNotificationAction,
        sendCompletionPush: sendCompletionPushAction,
      });
      if (result.synced > 0 || result.conflicts > 0) {
        for (const changedJobId of result.changedJobIds || []) {
          await reloadJobSummary(changedJobId);
        }
        if (selectedJobIdRef.current) {
          await reloadJobDetails(selectedJobIdRef.current, { force: true, background: true });
        }
      }
      if (result.errors > 0) photoSyncStatus.markPhotoSyncError();
      else photoSyncStatus.markPhotoSynced();
      await photoSyncStatus.refreshQueueSummary();
      return result;
    } catch (error) {
      photoSyncStatus.markPhotoSyncError();
      await photoSyncStatus.refreshQueueSummary();
      return { processed: 0, synced: 0, conflicts: 0, errors: 1, error };
    }
  }, [isAdmin, reloadJobDetails, reloadJobSummary, supabase, photoSyncStatus.markPhotoSyncError, photoSyncStatus.markPhotoSynced, photoSyncStatus.markPhotoSyncing, photoSyncStatus.refreshQueueSummary]);

  useEffect(() => {
    const userId = offlineSyncUserId;
    if (!userId || !supabase) return undefined;
    let cancelled = false;
    const sessionToken = captureCurrentSessionToken(userId);
    const isQueueSessionCurrent = () => !cancelled && isSessionTokenCurrent(sessionToken);

    async function restoreAndResumeQueue() {
      if (!isQueueSessionCurrent()) return;
      const currentProfile = offlineSyncContextRef.current.profile;
      if (!currentProfile) return;
      const currentJobs = offlineSyncContextRef.current.jobs;
      const hasJobsReady = Array.isArray(currentJobs) && currentJobs.length > 0;
      if (offlinePhotoQueueUserRef.current !== userId && hasJobsReady) {
        // Nie oznaczamy kolejki jako odtworzonej, dopóki lista zleceń nie istnieje.
        // Inaczej lokalne zdjęcie z IndexedDB nie ma jeszcze karty, do której można je podpiąć,
        // a kolejny refresh nie podejmuje już drugiej próby.
        offlinePhotoQueueUserRef.current = userId;
        await restorePersistedJobPhotos({
          supabase,
          supabaseUrl,
          profile: currentProfile,
          isSessionCurrent: isQueueSessionCurrent,
          setJobs,
          setSelectedJob,
          onPhotoUploaded: (photo) => {
            photoSyncStatus.markPhotoSynced();
            if (photo?.job_id) {
              scheduleBackgroundJobDetailsReload(photo.job_id, 700);
            }
          },
        });
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      await resumePersistedPhotoUploads({
        supabase,
        profile: currentProfile,
        isSessionCurrent: isQueueSessionCurrent,
        setJobs,
        setSelectedJob,
        supabaseUrl,
        onQueueStart: photoSyncStatus.markPhotoSyncing,
        onQueueIdle: photoSyncStatus.markPhotoSynced,
        onPhotoUploaded: (photo) => {
          photoSyncStatus.markPhotoSynced();
          if (photo?.job_id) {
            scheduleBackgroundJobDetailsReload(photo.job_id, 900);
          }
        },
        onPhotoUploadError: photoSyncStatus.markPhotoSyncError,
      });
      if (isQueueSessionCurrent()) await performOfflineJobSync();
    }

    void restoreAndResumeQueue();
    const onlineHandler = () => void restoreAndResumeQueue();
    window.addEventListener('online', onlineHandler);
    const intervalId = hasPendingOfflineWork
      ? window.setInterval(() => {
        if (navigator.onLine !== false) void restoreAndResumeQueue();
      }, 45000)
      : null;
    return () => {
      cancelled = true;
      window.removeEventListener('online', onlineHandler);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [offlineSyncUserId, offlineSyncProfileId, offlineSyncJobCount, hasPendingOfflineWork, supabase, setJobs, setSelectedJob, scheduleBackgroundJobDetailsReload, performOfflineJobSync, photoSyncStatus.markPhotoSyncError, photoSyncStatus.markPhotoSynced, photoSyncStatus.markPhotoSyncing, captureCurrentSessionToken, isSessionTokenCurrent]);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    for (const timerId of backgroundDetailsTimersRef.current.values()) window.clearTimeout(timerId);
    backgroundDetailsTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (isAdmin || !profile?.id || !jobs.length) return undefined;
    const timerId = window.setTimeout(() => {
      void saveOfflineAppSnapshot({ userId: profile.id, profile, profiles, jobs });
    }, 300);
    return () => window.clearTimeout(timerId);
  }, [isAdmin, jobs, profile, profiles]);

  const {
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
  } = useSelectedJobActions({
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
    createNotification: createNotificationAction,
    sendAssignmentPush: sendAssignmentPushAction,
    sendCompletionPush: sendCompletionPushAction,
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
    onPhotoSyncStart: photoSyncStatus.markPhotoSyncing,
    onPhotoSyncSuccess: photoSyncStatus.markPhotoSynced,
    onPhotoSyncError: photoSyncStatus.markPhotoSyncError,
    performOfflineJobSync,
  });

  async function retryAllPhotoUploads() {
    if (!supabase || !profile || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      await photoSyncStatus.refreshQueueSummary();
      return { processed: 0, uploaded: 0 };
    }

    photoSyncStatus.markPhotoSyncing();
    try {
      const result = await retryAllPersistedPhotoUploads({
        supabase,
        profile,
        setJobs,
        setSelectedJob,
        supabaseUrl,
        onQueueStart: photoSyncStatus.markPhotoSyncing,
        onQueueIdle: photoSyncStatus.markPhotoSynced,
        onPhotoUploaded: (photo) => {
          photoSyncStatus.markPhotoSynced();
          if (photo?.job_id) {
            scheduleBackgroundJobDetailsReload(photo.job_id, 900);
          }
        },
        onPhotoUploadError: photoSyncStatus.markPhotoSyncError,
      });
      const offlineDataResult = await performOfflineJobSync();
      await photoSyncStatus.refreshQueueSummary();
      return { ...result, offlineDataResult };
    } catch (error) {
      photoSyncStatus.markPhotoSyncError();
      await photoSyncStatus.refreshQueueSummary();
      return { processed: 0, uploaded: 0, error };
    }
  }

  async function retryOfflineOperation(operation) {
    if (!operation?.id) return;
    await updateOfflineJobOperation(operation.id, { status: 'pending', error: '', next_attempt_at: '', lease_until: '' });
    await performOfflineJobSync();
  }

  async function discardOfflineOperation(operation) {
    if (!operation?.id) return;
    const confirmed = window.confirm('Odrzucić zmianę zapisaną na telefonie i zachować dane z systemu?');
    if (!confirmed) return;
    await deleteOfflineJobOperation(operation.id);
    await refreshAll(sessionUser, { silent: true, preserveJobDetails: false });
    if (operation.job_id) await reloadJobDetails(operation.job_id, { force: true, background: true });
    await photoSyncStatus.refreshQueueSummary();
  }

  async function discardQueuedPhoto(photo) {
    if (!photo?.id) return false;
    if (String(photo.upload_status || '').toLowerCase() === 'uploading') {
      window.alert('To zdjęcie jest właśnie wysyłane. Poczekaj na zakończenie synchronizacji.');
      return false;
    }
    const confirmed = window.confirm(
      'Usunąć ten niewysłany element tylko z kolejki tego telefonu? Montaż, klient i dane zapisane już w systemie pozostaną bez zmian.',
    );
    if (!confirmed) return false;

    const removed = await deletePhotoQueueItem(photo.id);
    if (!removed) {
      window.alert('Nie udało się usunąć elementu z pamięci telefonu. Spróbuj ponownie.');
      return false;
    }

    const removeLocalPhoto = (job) => {
      if (!job || String(job.id || '') !== String(photo.job_id || '')) return job;
      return {
        ...job,
        photos: Array.isArray(job.photos)
          ? job.photos.filter((candidate) => String(candidate?.id || '') !== String(photo.id))
          : job.photos,
      };
    };
    setJobs((currentJobs) => currentJobs.map(removeLocalPhoto));
    setSelectedJob((currentJob) => removeLocalPhoto(currentJob));
    await photoSyncStatus.refreshQueueSummary();
    return true;
  }

  function toggleSort(field) {
    setSortBy((prev) => getNextSortValue(prev, field));
  }

  function getSortLabel(field, label) {
    return getSortLabelForField(sortBy, field, label);
  }

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    selectedJobIdRef.current = selectedJob?.id || null;
  }, [selectedJob]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 700px)");
    const updateMobileState = (event) => setIsMobile(event.matches);

    setIsMobile(media.matches);
    setIsProbablyPhoneDevice(getIsProbablyPhoneDevice());

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMobileState);
      return () => media.removeEventListener("change", updateMobileState);
    }

    media.addListener(updateMobileState);
    return () => media.removeListener(updateMobileState);
  }, []);

  useRealtimeRefresh({
    supabase,
    sessionUser,
    isMobile,
    selectedJobId: selectedJob?.id || null,
    refreshAll,
    refreshChanged,
    reloadJobSummary,
    reloadJobDetails,
  });

  useEffect(() => {
    if (!selectedJob?.id || activeModule !== 'jobs') return;
    if (selectedJob.detailsLoaded || selectedJob.detailsLoadError) return;
    void reloadJobDetails(selectedJob.id);
  }, [activeModule, selectedJob?.id, selectedJob?.detailsLoaded, selectedJob?.detailsLoadError, reloadJobDetails]);

  const smsDueTodayCount = useMemo(() => countSmsDueToday(jobs), [jobs]);

  function openJobInJobsModule(jobLike, options = {}) {
    const requestedJobId = String(jobLike?.source_job_id || jobLike?.job_id || jobLike?.id || '').trim();
    if (!requestedJobId) return;
    const resolvedJob = jobs.find((job) => String(job.id) === requestedJobId);
    if (!resolvedJob) return;

    if (options.fromCalendar) {
      const dateKey = options.calendarDateKey || getCalendarDateKeyForJob(resolvedJob);
      setCalendarReturnContext({ jobId: String(resolvedJob.id), dateKey });
      if (dateKey) setCalendarFocusDateKey(dateKey);
    } else {
      setCalendarReturnContext(null);
    }

    setQuery('');
    setShowAssignedJobsOnly(false);
    setDesktopStatusFilter(normalizeStatus(resolvedJob.status || 'Nowe'));
    setSelectedJob(resolvedJob);
    setPendingOpenJobId(String(resolvedJob.id));
    handleDesktopNavigation('jobs', 'orders');
  }

  function handleOpenJobFromSms(jobLike) {
    openJobInJobsModule(jobLike);
  }

  function handleOpenJobFromCalendar(jobLike) {
    openJobInJobsModule(jobLike, { fromCalendar: true, calendarDateKey: getCalendarDateKeyForJob(jobLike) });
  }

  function handleReturnToCalendarFromJobDetails() {
    const dateKey = calendarReturnContext?.dateKey || getCalendarDateKeyForJob(selectedJob);
    if (dateKey) setCalendarFocusDateKey(dateKey);
    handleDesktopNavigation('calendar', 'calendar');
  }

  function handleOpenContractorFromSms(jobLike) {
    const requestedId = String(jobLike?.contractor_id || '').trim();
    if (!requestedId) return;
    setRequestedContractorId(requestedId);
    handleDesktopNavigation('contractors', 'contractors');
  }

  useEffect(() => {
    if (!isAdmin && !["jobs", "fuel"].includes(activeModule)) {
      handleDesktopNavigation("jobs", "orders");
    }
  }, [activeModule, isAdmin]);

  useEffect(() => {
    if (isAdmin && isMobile && activeModule === "devices") {
      handleDesktopNavigation("jobs", "orders");
    }
  }, [activeModule, isAdmin, isMobile]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminContractorsCatalog() {
      if (!isAdmin) {
        setContractorsCatalog([]);
        return;
      }

      try {
        const data = await loadContractors({ supabase, isAdmin: true });
        if (!cancelled) setContractorsCatalog(data.filter((item) => item.is_active !== false));
      } catch (error) {
        console.warn('Nie udało się pobrać bazy kontrahentów do formularza montażu.', error?.message || error);
      }
    }

    void loadAdminContractorsCatalog();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, showModal, activeModule]);

  const visibleJobs = useMemo(() => getVisibleJobs({
    jobs,
    profile,
    query,
    isAdmin,
    showAssignedJobsOnly,
    desktopStatusFilter,
    sortBy,
    normalizeStatus,
  }), [desktopStatusFilter, isAdmin, jobs, profile, query, showAssignedJobsOnly, sortBy]);

  const jobsTotalPages = Math.max(1, Math.ceil(visibleJobs.length / JOBS_PAGE_SIZE));
  const currentJobsPage = Math.min(jobsPage, jobsTotalPages);
  const pagedVisibleJobs = useMemo(() => {
    const start = (currentJobsPage - 1) * JOBS_PAGE_SIZE;
    return visibleJobs.slice(start, start + JOBS_PAGE_SIZE);
  }, [currentJobsPage, visibleJobs]);

  useEffect(() => {
    setJobsPage(1);
  }, [desktopStatusFilter, query, sortBy, showAssignedJobsOnly]);

  useEffect(() => {
    if (!pendingOpenJobId) return;
    const targetIndex = visibleJobs.findIndex((job) => String(job.id) === String(pendingOpenJobId));
    if (targetIndex === -1) return;

    const targetPage = Math.floor(targetIndex / JOBS_PAGE_SIZE) + 1;
    setJobsPage(targetPage);
    setSelectedJob(visibleJobs[targetIndex]);
    setPendingOpenJobId(null);
  }, [pendingOpenJobId, visibleJobs]);

  useEffect(() => {
    setJobsPage((previousPage) => Math.min(Math.max(previousPage, 1), jobsTotalPages));
  }, [jobsTotalPages]);

  useEffect(() => {
    if (selectedJob && !visibleJobs.some((job) => job.id === selectedJob.id)) {
      setSelectedJob(null);
    }
  }, [selectedJob, visibleJobs]);

  useEffect(() => {
    if (typeof window === "undefined" || !jobs.length) return;

    const requestedJobId = getRequestedJobIdFromLocation(window.location.href);
    if (!requestedJobId) return;

    const requestedJob = jobs.find((job) => String(job.id) === String(requestedJobId));
    if (!requestedJob) return;

    openJobInJobsModule(requestedJob);

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("jobId");
    const cleanHref = `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`;
    window.history.replaceState(window.history.state, "", cleanHref);
  }, [jobs]);

  if (!isConfigured) {
    return <div className="page"><div className="card authCard">Brakuje pliku .env.local z Supabase.</div></div>;
  }

  if (!authResolved) {
    return <div className="page"><div className="card authCard">Trwa przywracanie sesji...</div></div>;
  }

  if (!sessionUser) {
    return (
      <AuthScreen
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        registerForm={registerForm}
        setRegisterForm={setRegisterForm}
        login={login}
        registerUser={registerUser}
        busy={busy}
        showRegisterModal={showRegisterModal}
        setShowRegisterModal={setShowRegisterModal}
        errorMsg={errorMsg}
      />
    );
  }

  if (!profile) {
    return <div className="page"><div className="card authCard">{errorMsg || "Logowanie zakończone. Trwa ładowanie danych..."}</div></div>;
  }

  const isWorker = profile?.role === "Pracownik";
  const shouldBlockWorkerDesktop = isWorker && (!isMobile || !isProbablyPhoneDevice);

  if (shouldBlockWorkerDesktop) {
    return <EmployeeMobileOnlyBlock profile={profile} logout={logout} />;
  }

  return (
    <>
      <AppAuthenticatedLayout
        isMobile={isMobile}
        isAdmin={isAdmin}
        showAssignedJobsOnly={showAssignedJobsOnly}
        desktopStatusFilter={desktopStatusFilter}
        desktopStatusLabels={desktopStatusLabels}
        errorMsg={errorMsg}
        isRefreshingData={isRefreshingData}
        activeModule={activeModule}
        activeNavKey={desktopNavKey}
        setActiveModule={setActiveModule}
        onDesktopNavigate={handleDesktopNavigation}
        profile={profile}
        logout={logout}
        jobsPanel={activeModule === "jobs" ? (
          <JobsPanel
            desktopStatusLabels={desktopStatusLabels}
            desktopStatusFilter={desktopStatusFilter}
            statuses={STATUSES}
            jobs={jobs}
            normalizeStatusFn={normalizeStatus}
            statusButtonConfig={statusButtonConfig}
            setDesktopStatusFilter={setDesktopStatusFilter}
            isAdmin={isAdmin}
            openAddJob={openAddJob}
            refreshAll={refreshAll}
            sessionUser={sessionUser}
            logout={logout}
            query={query}
            setQuery={setQuery}
            profile={profile}
            showAssignedJobsOnly={showAssignedJobsOnly}
            toggleAssignedJobsOnly={() => setShowAssignedJobsOnly((prev) => !prev)}
            isMobile={isMobile}
            visibleJobs={visibleJobs}
            pagedVisibleJobs={pagedVisibleJobs}
            jobsPageSize={JOBS_PAGE_SIZE}
            jobsCurrentPage={currentJobsPage}
            jobsTotalPages={jobsTotalPages}
            setJobsPage={setJobsPage}
            selectedJob={selectedJob}
            setSelectedJob={setSelectedJob}
            formatDate={formatDate}
            toggleSort={toggleSort}
            getSortLabel={getSortLabel}
            profiles={profiles}
            pushControl={(
              <PushNotificationsControl
                pushState={pushState}
                busy={pushBusy}
                compact={isMobile}
                onToggle={togglePush}
              />
            )}
            photoSyncStatus={photoSyncStatus}
            retryPhotoUpload={retryPhotoUpload}
            retryAllPhotoUploads={retryAllPhotoUploads}
            retryOfflineOperation={retryOfflineOperation}
            discardOfflineOperation={discardOfflineOperation}
            discardQueuedPhoto={discardQueuedPhoto}
          />
        ) : (
          <Suspense fallback={adminModuleFallback}>
            {activeModule === "contractors" ? (
              <ContractorsPanel key={sessionUser?.id || "signed-out"} userId={sessionUser?.id || ""}
                supabase={supabase}
                isAdmin={isAdmin}
                refreshAll={refreshAll}
                jobs={jobs}
                requestedContractorId={requestedContractorId}
              />
            ) : activeModule === "devices" ? (
              <DevicesPanel key={sessionUser?.id || "signed-out"} userId={sessionUser?.id || ""}
                supabase={supabase}
                jobs={jobs}
                contractors={contractorsCatalog}
                isAdmin={isAdmin}
                refreshAll={refreshAll}
              />
            ) : activeModule === "calendar" ? (
              <CalendarPanel
                jobs={jobs}
                focusedDateKey={calendarFocusDateKey}
                onOpenJob={handleOpenJobFromCalendar}
              />
            ) : activeModule === "fuel" ? (
              <FuelPanel key={sessionUser?.id || "signed-out"} userId={sessionUser?.id || ""}
                supabase={supabase}
                isAdmin={isAdmin}
                logDiagnostic={logDiagnostic}
              />
            ) : (
              <SmsPanel
                supabase={supabase}
                jobs={jobs}
                isAdmin={isAdmin}
                isMobile={isMobile}
                refreshAll={refreshAll}
                onOpenJob={handleOpenJobFromSms}
                onOpenContractor={handleOpenContractorFromSms}
                requestedSection={desktopNavKey}
              />
            )}
          </Suspense>
        )}
        smsDueTodayCount={smsDueTodayCount}
        detailsPanel={activeModule === "jobs" && selectedJob ? (
          <Suspense fallback={jobDetailsFallback}>
            <JobDetailsPanel
              selectedJob={selectedJob}
              isAdmin={isAdmin}
              busy={busy}
              profiles={profiles}
              formatDate={formatDate}
              openEditJob={openEditJob}
              openSerialNumbersJob={openSerialNumbersJob}
              deleteJob={deleteJob}
              deleteDeviceFromJob={deleteDeviceFromJob}
              setSelectedJob={setSelectedJob}
              setSelectedJobByUpdater={setSelectedJob}
              setJobs={setJobs}
              saveAdminNote={saveAdminNote}
              requestClearAdminNote={requestClearAdminNote}
              openPreview={openPreview}
              deletePhoto={deletePhoto}
              deletingPhotoId={deletingPhotoId}
              handlePhotoUpload={handlePhotoUpload}
              retryPhotoUpload={retryPhotoUpload}
              onThumbnailLoadError={recoverPhotoThumbnail}
              onThumbnailLoad={markPhotoThumbnailLoaded}
              toggleViewer={toggleViewer}
              commentDrafts={commentDrafts}
              setCommentDrafts={setCommentDrafts}
              addComment={addComment}
              removeComment={removeComment}
              requestRemoveComment={requestRemoveComment}
              updateStatus={updateStatus}
              supabase={supabase}
              showReturnToCalendar={Boolean(calendarReturnContext?.jobId && selectedJob?.id && String(calendarReturnContext.jobId) === String(selectedJob.id))}
              calendarReturnDateKey={calendarReturnContext?.dateKey || ''}
              onReturnToCalendar={handleReturnToCalendarFromJobDetails}
              refreshAll={refreshAll}
              detailsLoading={detailsLoadingJobId === String(selectedJob?.id || '')}
              onRetryDetails={() => {
                if (!selectedJob?.id) return;
                const targetId = String(selectedJob.id);
                const clearError = (job) => (job && String(job.id) === targetId ? { ...job, detailsLoadError: '' } : job);
                setJobs((prev) => prev.map(clearError));
                setSelectedJob((prev) => clearError(prev));
                void reloadJobDetails(targetId, { force: true });
              }}
            />
          </Suspense>
        ) : null}
      />

      <PreviewModal previewImage={previewImage} setPreviewImage={setPreviewImage} previewNext={previewNext} previewPrev={previewPrev} />
      <ConfirmActionModal {...confirmModalProps} />
      <Suspense fallback={showModal ? jobFormModalFallback : null}>
        <JobFormModal
          showModal={showModal}
          closeJobModal={() => closeJobModal({ busy })}
          editingJobId={editingJobId}
          serialOnlyMode={serialOnlyMode}
          jobForm={jobForm}
          jobFormDirty={jobFormDirty}
          setJobForm={setJobForm}
          profiles={profiles}
          contractors={contractorsCatalog}
          isAdmin={isAdmin}
          addJob={addJob}
          saveEditedJob={saveEditedJob}
          busy={busy}
        />
      </Suspense>
    </>
  );
}
