import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "./components/AuthScreen";
import AppAuthenticatedLayout from "./components/layout/AppAuthenticatedLayout.jsx";
import JobsPanel from "./components/JobsPanel";
import ConfirmActionModal from "./components/modals/ConfirmActionModal.jsx";

import PreviewModal from "./components/modals/PreviewModal";
import { createJobAccessors } from "./utils/jobAccessors.js";
import { buildSmsTargets, countSmsDueToday, deriveSmsQueue } from "./modules/sms.js";
import { loadSmsModuleData } from "./modules/sms-fetch.js";
import { fetchAdminDevices } from "./modules/devices-fetch.js";
import { loadDashboardMetrics } from "./modules/dashboard-metrics.js";
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
import { getPhotoStoragePath, getSignedPhotoUrl } from "./modules/photos.js";
import { sendAssignmentPush, sendJobCompletionPush } from "./modules/jobs-assignment.js";
import PushNotificationsControl from "./components/PushNotificationsControl.jsx";
import { usePhotoPreview } from "./hooks/usePhotoPreview.js";
import { useJobFormModal } from "./hooks/useJobFormModal.js";
import { useConfirmDialog } from "./hooks/useConfirmDialog.js";
import { useRealtimeRefresh } from "./hooks/useRealtimeRefresh.js";
import { usePushNotificationsState } from "./hooks/usePushNotificationsState.js";
import { useAppSession } from "./hooks/useAppSession.js";
import { useSelectedJobActions } from "./hooks/useSelectedJobActions.js";
import { getRequestedJobIdFromLocation } from "./utils/jobSelectionState.js";
import { logDiagnostic, startSilentDiagnosticSync } from "./modules/diagnostics.js";
import { APP_VERSION } from "./version.js";

const statusBlueImg = "/status-buttons/status-blue.png";
const statusAmberImg = "/status-buttons/status-amber.png";
const statusSlateImg = "/status-buttons/status-slate.png";
const statusGreenImg = "/status-buttons/status-green.png";

const SmsPanel = lazy(() => import("./components/sms/SmsPanel.jsx"));
const ContractorsPanel = lazy(() => import("./components/contractors/ContractorsPanel.jsx"));
const DevicesPanel = lazy(() => import("./components/devices/DevicesPanel.jsx"));
const CalendarPanel = lazy(() => import("./components/calendar/CalendarPanel.jsx"));
const Centrum360Panel = lazy(() => import("./components/dashboard/Centrum360Panel.jsx"));
const JobDetailsPanel = lazy(() => import("./components/JobDetailsPanel.jsx"));
const JobFormModal = lazy(() => import("./components/modals/JobFormModal.jsx"));
const DiagnosticsPanel = lazy(() => import("./components/diagnostics/DiagnosticsPanel.jsx"));
const FuelPanel = lazy(() => import("./components/fuel/FuelPanel.jsx"));

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
const JOB_DETAILS_TIMEOUT_MS = 7000;
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

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
  const dashboardMetricsCacheRef = useRef({ value: null, expiresAt: 0, promise: null });
  const dashboardAuxCacheRef = useRef({ value: null, expiresAt: 0, promise: null });
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [desktopStatusFilter, setDesktopStatusFilter] = useState("Nowe");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth <= 700 : false);
  const [isProbablyPhoneDevice, setIsProbablyPhoneDevice] = useState(getIsProbablyPhoneDevice);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [activeModule, setActiveModule] = useState("center360");
  const [contractorsCatalog, setContractorsCatalog] = useState([]);
  const [globalSearchContractors, setGlobalSearchContractors] = useState([]);
  const [globalSearchDevices, setGlobalSearchDevices] = useState([]);
  const [globalSearchDevicesLoading, setGlobalSearchDevicesLoading] = useState(false);
  const [requestedContractorId, setRequestedContractorId] = useState(null);
  const [requestedDeviceId, setRequestedDeviceId] = useState(null);
  const [desktopNavKey, setDesktopNavKey] = useState("center360");
  const [jobsPage, setJobsPage] = useState(1);
  const [pendingOpenJobId, setPendingOpenJobId] = useState(null);
  const [calendarReturnContext, setCalendarReturnContext] = useState(null);
  const [calendarFocusDateKey, setCalendarFocusDateKey] = useState("");
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [dashboardSmsQueueCount, setDashboardSmsQueueCount] = useState(null);
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

  useEffect(() => startSilentDiagnosticSync({
    supabase,
    userId: sessionUser?.id || '',
    appVersion: APP_VERSION,
    platform: 'desktop',
  }), [sessionUser?.id]);

  const resolveFullPhotoUrl = React.useCallback(async (photoOrUrl) => {
    if (typeof photoOrUrl === 'string') return photoOrUrl;
    const photo = photoOrUrl && typeof photoOrUrl === 'object' ? photoOrUrl : null;
    if (!photo) return '';
    const alreadyResolved = String(photo.image_url || photo.signed_url || photo.preview_full_url || '').trim();
    if (alreadyResolved) return alreadyResolved;
    const storagePath = getPhotoStoragePath({ photo, supabaseUrl });
    return getSignedPhotoUrl({
      storagePath,
      fallbackUrl: photo.original_image_url || '',
      supabase,
    });
  }, []);

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
  } = usePushNotificationsState({ supabase, sessionUser });

  const {
    showModal,
    editingJobId,
    serialOnlyMode,
    jobForm,
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

  const hydrateJobThumbnails = React.useCallback(async (jobId, photos = []) => {
    const targetId = String(jobId || '').trim();
    if (!targetId || !supabase || !Array.isArray(photos) || photos.length === 0) return;

    const settled = await Promise.allSettled(photos.map(async (photo) => {
      if (!photo || photo.thumbnail_image_url) return null;
      const storagePath = getPhotoStoragePath({ photo, supabaseUrl });
      if (!storagePath && !photo.original_image_url) return null;
      const thumbnailUrl = await getSignedPhotoUrl({
        storagePath,
        fallbackUrl: storagePath ? '' : (photo.original_image_url || ''),
        supabase,
        transform: { width: 400, quality: 72, resize: 'contain' },
      });
      return thumbnailUrl ? { id: String(photo.id || ''), thumbnailUrl } : null;
    }));

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
          return thumbnailUrl ? { ...photo, thumbnail_image_url: thumbnailUrl } : photo;
        }),
      };
    };

    setJobs((prev) => prev.map(patchJob));
    setSelectedJob((prev) => patchJob(prev));
  }, [supabase]);

  const reloadJobDetails = React.useCallback(async (jobId, options = {}) => {
    const targetId = String(jobId || '').trim();
    if (!targetId || !supabase) return null;

    const targetJob = jobsRef.current.find((job) => String(job.id) === targetId);
    if (!targetJob) return null;
    if (targetJob.detailsLoaded && !options.force) return targetJob;

    const existingRequest = jobDetailsRequestsRef.current.get(targetId);
    if (existingRequest) return existingRequest;

    if (!options.background) setDetailsLoadingJobId(targetId);
    const request = (async () => {
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

        const cleanDetails = { ...details, detailsLoadError: '' };
        let mergedJob = null;
        setJobs((prev) => prev.map((job) => {
          if (String(job.id) !== targetId) return job;
          mergedJob = { ...job, ...cleanDetails };
          return mergedJob;
        }));
        setSelectedJob((prev) => (prev && String(prev.id) === targetId ? { ...prev, ...cleanDetails } : prev));

        // Metadane zdjęć/komentarzy są już na ekranie. Miniatury podpisujemy dopiero
        // w tle, żeby Storage nie blokował całych szczegółów montażu.
        void hydrateJobThumbnails(targetId, cleanDetails.photos || []);
        return mergedJob;
      } catch (error) {
        // Odświeżenie w tle nie może schować już załadowanych danych.
        // Przy chwilowym 5xx/timeout zostawiamy ostatni poprawny stan na ekranie.
        if (options.background && targetJob.detailsLoaded) {
          console.warn('Tło szczegółów montażu nie odświeżyło się — zachowuję poprzednie dane.', error?.message || error);
          return targetJob;
        }

        const aborted = error?.name === 'AbortError' || controller?.signal?.aborted;
        const message = aborted
          ? 'Serwer nie odpowiedział na szczegóły w 7 s. Kliknij „Ponów”.'
          : 'Nie udało się pobrać zdjęć i komentarzy. Kliknij „Ponów”.';
        const patchError = (job) => (
          job && String(job.id) === targetId
            ? { ...job, detailsLoaded: false, detailsLoadError: message }
            : job
        );
        setJobs((prev) => prev.map(patchError));
        setSelectedJob((prev) => patchError(prev));
        console.warn('Nie udało się pobrać szczegółów montażu.', error?.message || error);
        return null;
      } finally {
        if (timeoutId !== null && typeof window !== 'undefined') window.clearTimeout(timeoutId);
        if (!options.background) {
          setDetailsLoadingJobId((current) => (current === targetId ? null : current));
        }
      }
    })();

    jobDetailsRequestsRef.current.set(targetId, request);
    try {
      return await request;
    } finally {
      if (jobDetailsRequestsRef.current.get(targetId) === request) {
        jobDetailsRequestsRef.current.delete(targetId);
      }
    }
  }, [hydrateJobThumbnails, supabase]);

  const reloadJobSummary = React.useCallback(async (jobId) => {
    const targetId = String(jobId || '').trim();
    if (!targetId || !supabase) return null;

    const existingRequest = jobSummaryRequestsRef.current.get(targetId);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      try {
        const summary = await loadJobSummaryData({ supabase, jobId: targetId });
        if (summary?.missing || !summary?.job) {
          setJobs((prev) => prev.filter((job) => String(job.id) !== targetId));
          setSelectedJob((prev) => (prev && String(prev.id) === targetId ? null : prev));
          return null;
        }

        let mergedJob = null;
        setJobs((prev) => {
          const existing = prev.find((job) => String(job.id) === targetId);
          const nextJob = { ...(existing || {}), ...summary.job, viewers: summary.viewers || [] };
          mergedJob = nextJob;
          if (!existing) return [nextJob, ...prev];
          return prev.map((job) => (String(job.id) === targetId ? nextJob : job));
        });
        setSelectedJob((prev) => (
          prev && String(prev.id) === targetId
            ? { ...prev, ...summary.job, viewers: summary.viewers || [] }
            : prev
        ));
        return mergedJob;
      } catch (error) {
        console.warn('Nie udało się odświeżyć pojedynczego montażu.', error?.message || error);
        return null;
      }
    })();

    jobSummaryRequestsRef.current.set(targetId, request);
    try {
      return await request;
    } finally {
      if (jobSummaryRequestsRef.current.get(targetId) === request) {
        jobSummaryRequestsRef.current.delete(targetId);
      }
    }
  }, [supabase]);

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
  });

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

  const fallbackSmsDueTodayCount = useMemo(() => countSmsDueToday(jobs), [jobs]);

  const loadCachedDashboardMetrics = React.useCallback(async () => {
    if (!isAdmin || !supabase) return null;
    const cache = dashboardMetricsCacheRef.current;
    if (cache.expiresAt > Date.now()) return cache.value;
    if (cache.promise) return cache.promise;

    const request = loadDashboardMetrics({ supabase, isAdmin });
    cache.promise = request;
    try {
      const value = await request;
      cache.value = value;
      cache.expiresAt = Date.now() + DASHBOARD_CACHE_TTL_MS;
      return value;
    } finally {
      if (cache.promise === request) cache.promise = null;
    }
  }, [isAdmin, supabase]);

  const loadCachedDashboardAux = React.useCallback(async () => {
    if (!isAdmin || !supabase) return null;
    const cache = dashboardAuxCacheRef.current;
    if (cache.expiresAt > Date.now()) return cache.value;
    if (cache.promise) return cache.promise;

    const request = Promise.all([
      loadSmsModuleData({ supabase, isAdmin }),
      fetchAdminDevices({ supabase, isAdmin, jobs: jobsRef.current, trySync: false }),
    ]).then(([smsSnapshot, devicesResult]) => ({ smsSnapshot, devicesResult }));
    cache.promise = request;
    try {
      const value = await request;
      cache.value = value;
      cache.expiresAt = Date.now() + DASHBOARD_CACHE_TTL_MS;
      return value;
    } finally {
      if (cache.promise === request) cache.promise = null;
    }
  }, [isAdmin, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function refreshDashboardMetrics() {
      if (!isAdmin || !supabase) {
        setDashboardMetrics(null);
        return;
      }

      try {
        const metrics = await loadCachedDashboardMetrics();
        if (!cancelled) setDashboardMetrics(metrics);
      } catch (error) {
        console.warn('Nie udało się pobrać centralnych liczników Centrum 360.', error?.message || error);
        if (!cancelled) setDashboardMetrics(null);
      }
    }

    void refreshDashboardMetrics();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, jobs, loadCachedDashboardMetrics]);

  useEffect(() => {
    let cancelled = false;

    async function refreshDashboardSmsQueueCount() {
      if (!isAdmin || !supabase || activeModule !== 'center360') {
        if (!cancelled && !isAdmin) setDashboardSmsQueueCount(null);
        return;
      }

      try {
        const { smsSnapshot, devicesResult } = await loadCachedDashboardAux();
        const targets = buildSmsTargets({ jobs, devices: devicesResult.devices || [] });
        const queue = deriveSmsQueue(targets, smsSnapshot.logs || []);
        if (!cancelled) setDashboardSmsQueueCount(queue.length);
      } catch (error) {
        console.warn('Nie udało się przeliczyć kolejki SMS dla Centrum 360.', error?.message || error);
        if (!cancelled) setDashboardSmsQueueCount(null);
      }
    }

    void refreshDashboardSmsQueueCount();

    return () => {
      cancelled = true;
    };
  }, [activeModule, isAdmin, jobs, loadCachedDashboardAux]);

  const smsDueTodayCount = dashboardSmsQueueCount ?? dashboardMetrics?.smsDueToday ?? fallbackSmsDueTodayCount;



  useEffect(() => {
    if (!selectedJob?.id || activeModule !== 'jobs') return;
    if (selectedJob.detailsLoaded || selectedJob.detailsLoadError) return;
    void reloadJobDetails(selectedJob.id);
  }, [activeModule, selectedJob?.id, selectedJob?.detailsLoaded, selectedJob?.detailsLoadError, reloadJobDetails]);

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

  function handleGlobalSearchResult(result) {
    if (!result?.type || !result?.source) return;

    if (result.type === 'job') {
      openJobInJobsModule(result.source);
      return;
    }

    if (result.type === 'contractor') {
      const contractorId = String(result.source.id || '').trim();
      if (!contractorId) return;
      setRequestedContractorId(contractorId);
      handleDesktopNavigation('contractors', 'contractors');
      return;
    }

    if (result.type === 'device') {
      const deviceId = String(result.source.id || '').trim();
      if (!deviceId) return;
      setRequestedDeviceId(deviceId);
      handleDesktopNavigation('devices', 'devices');
    }
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
        setGlobalSearchContractors([]);
        return;
      }

      try {
        const data = await loadContractors({ supabase, isAdmin: true });
        if (!cancelled) {
          setGlobalSearchContractors(data);
          setContractorsCatalog(data.filter((item) => item.is_active !== false));
        }
      } catch (error) {
        console.warn('Nie udało się pobrać bazy kontrahentów do formularza montażu.', error?.message || error);
      }
    }

    void loadAdminContractorsCatalog();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, showModal, activeModule]);

  useEffect(() => {
    let cancelled = false;

    async function loadGlobalSearchDevices() {
      if (!isAdmin || !supabase) {
        setGlobalSearchDevices([]);
        setGlobalSearchDevicesLoading(false);
        return;
      }

      setGlobalSearchDevicesLoading(true);
      try {
        const result = await fetchAdminDevices({
          supabase,
          isAdmin: true,
          jobs,
          trySync: false,
        });
        if (!cancelled) setGlobalSearchDevices(Array.isArray(result?.devices) ? result.devices : []);
      } catch (error) {
        console.warn('Nie udało się pobrać urządzeń do globalnego wyszukiwania.', error?.message || error);
        if (!cancelled) setGlobalSearchDevices([]);
      } finally {
        if (!cancelled) setGlobalSearchDevicesLoading(false);
      }
    }

    void loadGlobalSearchDevices();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, jobs, supabase]);

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

    setSelectedJob(requestedJob);
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
        globalSearchProps={isAdmin && !isMobile ? {
          jobs,
          contractors: globalSearchContractors,
          devices: globalSearchDevices,
          profiles,
          devicesLoading: globalSearchDevicesLoading,
          onSelectResult: handleGlobalSearchResult,
        } : null}
        jobsPanel={activeModule === "jobs" || (!isAdmin && activeModule !== "fuel") ? (
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
              />
            )}
          />
        ) : activeModule === "center360" ? (
          <Suspense fallback={adminModuleFallback}>
            <Centrum360Panel
              jobs={jobs}
              contractors={contractorsCatalog}
              profiles={profiles}
              profile={profile}
              smsDueTodayCount={smsDueTodayCount}
              metrics={dashboardMetrics}
              onNavigate={handleDesktopNavigation}
            />
          </Suspense>
        ) : (
          <Suspense fallback={adminModuleFallback}>
            {activeModule === "contractors" ? (
              <ContractorsPanel
                supabase={supabase}
                isAdmin={isAdmin}
                refreshAll={refreshAll}
                jobs={jobs}
                requestedContractorId={requestedContractorId}
              />
            ) : activeModule === "devices" ? (
              <DevicesPanel
                supabase={supabase}
                jobs={jobs}
                contractors={contractorsCatalog}
                isAdmin={isAdmin}
                refreshAll={refreshAll}
                requestedDeviceId={requestedDeviceId}
              />
            ) : activeModule === "calendar" ? (
              <CalendarPanel
                jobs={jobs}
                focusedDateKey={calendarFocusDateKey}
                onOpenJob={handleOpenJobFromCalendar}
              />
            ) : activeModule === "diagnostics" ? (
              <DiagnosticsPanel
                profile={profile}
                selectedJobId={selectedJob?.id || ''}
              />
            ) : activeModule === "fuel" ? (
              <FuelPanel
                supabase={supabase}
                isAdmin={isAdmin}
                showVehicleOverview={!isMobile}
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
              onRetryDetails={() => reloadJobDetails(selectedJob.id, { force: true })}
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
          setJobForm={setJobForm}
          profiles={profiles}
          contractors={contractorsCatalog}
          addJob={addJob}
          saveEditedJob={saveEditedJob}
          busy={busy}
        />
      </Suspense>
    </>
  );
}
