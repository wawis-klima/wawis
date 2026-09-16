import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAppClientState,
  loginUser,
  logoutUser,
  registerAppUser,
  restoreAuthSession,
  subscribeToAuthState,
} from "../modules/auth.js";
import { loadJobSummaryData, preserveLatestQueuedPhotos, refreshAppData } from "../modules/jobs.js";
import { getSupabaseUserMessage, isJwtExpiredError, isTransientSupabaseError } from "../modules/supabase-errors.js";
import { isOlderThan30Days } from "../utils/jobHelpers.jsx";
import { applyOfflineOperationsToJobs, clearOfflineAppSnapshot, listOfflineJobOperations, loadOfflineAppSnapshot, saveOfflineAppSnapshot, updateOfflineSyncCursor } from "../modules/job-offline-store.js";
import { loadMobileChangeBatch, loadMobileChangeHead } from "../modules/incremental-sync.js";
import { captureSessionGeneration, createSessionGenerationState, isSessionGenerationCurrent, transitionSessionGeneration } from "../modules/session-generation.js";
import { transitionPushSessionContext } from "../modules/push-lifecycle-v1078.js";

const APP_REFRESH_TIMEOUT_MS = 20000;
const AUTH_RESTORE_RETRY_MS = 30000;

function withRefreshTimeout(promise, timeoutMs = APP_REFRESH_TIMEOUT_MS) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const error = new Error('Odświeżanie danych przekroczyło limit czasu.');
      error.code = 'APP_REFRESH_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timerId));
}

export function useAppSession({
  supabase,
  logoutFlagKey,
  normalizeStatus,
  selectedJobIdRef,
  setSelectedJob,
}) {
  const [sessionUser, setSessionUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [authResolved, setAuthResolved] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ fullName: "", email: "", password: "", role: "Pracownik" });
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAssignedJobsOnly, setShowAssignedJobsOnly] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);

  const profileRef = useRef(profile);
  const profilesRef = useRef(profiles);
  const notificationsRef = useRef(notifications);
  const jobsRef = useRef(jobs);
  const errorMsgRef = useRef(errorMsg);
  const refreshRequestIdRef = useRef(0);
  const visibleRefreshRequestIdRef = useRef(0);
  const lastAppliedServerRequestIdRef = useRef(0);
  const cacheHydratedUserIdRef = useRef('');
  const refreshPayloadInFlightRef = useRef(new Map());
  const changeCursorRef = useRef(null);
  const incrementalRefreshInFlightRef = useRef(null);
  const sessionGenerationStateRef = useRef(createSessionGenerationState());

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    errorMsgRef.current = errorMsg;
  }, [errorMsg]);

  const setSessionUserForGeneration = useCallback((nextUser) => {
  transitionPushSessionContext(nextUser);
  const nextUserId = String(nextUser?.id || '').trim();
  const previousUserId = String(sessionGenerationStateRef.current.userId || '').trim();
  transitionSessionGeneration(sessionGenerationStateRef.current, nextUserId);
  if (previousUserId !== nextUserId) {
    refreshPayloadInFlightRef.current.clear();
    incrementalRefreshInFlightRef.current = null;
    changeCursorRef.current = null;
    cacheHydratedUserIdRef.current = '';
    refreshRequestIdRef.current = 0;
    lastAppliedServerRequestIdRef.current = 0;
  }
  setSessionUser(nextUser || null);
}, []);

  const captureCurrentSessionToken = useCallback((expectedUserId = '') => {
    const userId = String(expectedUserId || sessionGenerationStateRef.current.userId || '').trim();
    return captureSessionGeneration(sessionGenerationStateRef.current, userId);
  }, []);

  const isSessionTokenCurrent = useCallback((token) => (
    Boolean(token) && isSessionGenerationCurrent(sessionGenerationStateRef.current, token)
  ), []);

  const applyLoggedOutState = useCallback(() => {
    setSessionUserForGeneration(null);
    changeCursorRef.current = null;
    profileRef.current = null;
    profilesRef.current = [];
    notificationsRef.current = [];
    jobsRef.current = [];
    clearAppClientState({
      setSessionUser: setSessionUserForGeneration,
      setProfile,
      setProfiles,
      setJobs,
      setSelectedJob,
      setNotifications,
      setShowAssignedJobsOnly,
      setAuthResolved,
    });
  }, [setSelectedJob, setSessionUserForGeneration]);

  const refreshAll = useCallback(async (user, options = {}) => {
    if (!supabase || !user) return;
    const { silent = false, preserveJobDetails = true } = options;
    const userId = String(user.id || '').trim();
    const sessionToken = captureSessionGeneration(sessionGenerationStateRef.current, userId);
    const isCurrentSession = () => isSessionGenerationCurrent(sessionGenerationStateRef.current, sessionToken);
    if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };
    const refreshRequestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = refreshRequestId;
    const isCurrentRefreshRequest = () => (
      isCurrentSession() && refreshRequestId >= lastAppliedServerRequestIdRef.current
    );
    let visibleRefreshRequestId = 0;
    let coreJobsApplied = false;
    let coreJobs = null;
    let changeCursorAtRefreshStart = null;

    const getProfileFallback = (activeUser = user) => profileRef.current || {
      id: activeUser?.id || userId,
      full_name: activeUser?.user_metadata?.full_name || activeUser?.email || 'Użytkownik',
      email: activeUser?.email || '',
      role: activeUser?.user_metadata?.role || 'Pracownik',
    };

    if (!silent) {
      visibleRefreshRequestId = visibleRefreshRequestIdRef.current + 1;
      visibleRefreshRequestIdRef.current = visibleRefreshRequestId;
      setIsRefreshingData(true);
      setBusy(true);
      // Nie czyścimy istniejącego widoku. Komunikat z poprzedniego błędu
      // zniknie, gdy tylko najważniejsza lista montaży pobierze się poprawnie.
      setErrorMsg('');
    }

    try {
      if (userId && cacheHydratedUserIdRef.current !== userId) {
        cacheHydratedUserIdRef.current = userId;
        const serverVersionBeforeCacheRead = lastAppliedServerRequestIdRef.current;
        const cached = await loadOfflineAppSnapshot(userId);
        if (!isCurrentRefreshRequest()) return { ok: true, ignoredOlderResponse: true };
        const serverStateUnchanged = lastAppliedServerRequestIdRef.current === serverVersionBeforeCacheRead;

        if (cached?.profile && Array.isArray(cached.jobs) && serverStateUnchanged) {
          if (cached.change_cursor !== null && cached.change_cursor !== undefined) {
            changeCursorRef.current = Math.max(0, Number(cached.change_cursor) || 0);
          }
          const cachedProfiles = Array.isArray(cached.profiles) ? cached.profiles : [];
          const operations = await listOfflineJobOperations(userId);
          if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };
          const restoredJobs = applyOfflineOperationsToJobs(cached.jobs, operations, cached.profile);
          profileRef.current = cached.profile;
          profilesRef.current = cachedProfiles;
          jobsRef.current = restoredJobs;
          setSessionUserForGeneration(user);
          setProfile(cached.profile);
          setProfiles(cachedProfiles);
          setJobs(restoredJobs);
          if (selectedJobIdRef?.current) {
            setSelectedJob(restoredJobs.find((job) => String(job.id) === String(selectedJobIdRef.current)) || null);
          }
        }
      }

      // Kursor pobieramy przed lista. Zmiana wykonana w trakcie pelnego odczytu
      // dostanie wyzszy numer i zostanie odebrana przy nastepnym delta refreshu.
      changeCursorAtRefreshStart = await loadMobileChangeHead({ supabase }).catch(() => null);
      if (!isCurrentRefreshRequest()) return { ok: true, ignoredOlderResponse: true };

      const applyJobsFirst = async (freshJobs, activeUser = user) => {
        if (!Array.isArray(freshJobs) || !isCurrentSession()) return;
        // Starsza odpowiedź nie może nadpisać nowszej, już zastosowanej odpowiedzi.
        if (refreshRequestId < lastAppliedServerRequestIdRef.current) return;

        const operations = await listOfflineJobOperations(String(activeUser?.id || userId));
        if (!isCurrentRefreshRequest()) return;
        const profileForOffline = getProfileFallback(activeUser);
        const freshJobsWithLatestQueue = preserveJobDetails
          ? preserveLatestQueuedPhotos(freshJobs, jobsRef.current)
          : freshJobs;
        const nextJobs = applyOfflineOperationsToJobs(freshJobsWithLatestQueue, operations, profileForOffline);
        coreJobsApplied = true;
        coreJobs = nextJobs;
        lastAppliedServerRequestIdRef.current = Math.max(lastAppliedServerRequestIdRef.current, refreshRequestId);
        jobsRef.current = nextJobs;
        setSessionUserForGeneration(activeUser);
        setJobs(nextJobs);
        if (selectedJobIdRef?.current) {
          setSelectedJob(nextJobs.find((job) => String(job.id) === String(selectedJobIdRef.current)) || null);
        }

        // Samo pobranie listy montaży oznacza, że najważniejsza część synchronizacji
        // zadziałała. Poboczne timeouty profili/Auth nie powinny zostawiać czerwonego błędu.
        if (errorMsgRef.current) setErrorMsg('');

        const cachedProfile = profileForOffline;
        const cachedProfiles = profilesRef.current;
        void saveOfflineAppSnapshot({
          userId: activeUser?.id || userId,
          profile: cachedProfile,
          profiles: cachedProfiles,
          jobs: nextJobs,
          serverFetchedAtMs: Date.now(),
        });
      };

      const loadServerPayload = (activeUser) => refreshAppData({
        supabase,
        user: activeUser,
        normalizeStatus,
        isOlderThan30Days,
        existingProfile: profileRef.current,
        existingProfiles: profilesRef.current,
        existingNotifications: notificationsRef.current,
        existingJobs: jobsRef.current,
        preserveJobDetails,
        onJobsReady: (freshJobs) => applyJobsFirst(freshJobs, activeUser),
      });

      const loadServerPayloadOnce = (activeUser) => {
        const activeUserId = String(activeUser?.id || '').trim();
        const requestKey = `${sessionToken.generation}:${activeUserId}:${preserveJobDetails ? 'preserve' : 'replace'}`;
        const existingRequest = refreshPayloadInFlightRef.current.get(requestKey);
        if (existingRequest) return existingRequest;

        const request = withRefreshTimeout(loadServerPayload(activeUser)).finally(() => {
          if (refreshPayloadInFlightRef.current.get(requestKey) === request) {
            refreshPayloadInFlightRef.current.delete(requestKey);
          }
        });
        refreshPayloadInFlightRef.current.set(requestKey, request);
        return request;
      };

      let payload;
      let activeUser = user;
      try {
        payload = await loadServerPayloadOnce(activeUser);
      } catch (serverError) {
        if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };
        if (!isJwtExpiredError(serverError)) throw serverError;

        console.info('JWT wygasł — odnawiam sesję i ponawiam pobranie danych.');
        const { data: refreshedSessionData, error: refreshSessionError } = await supabase.auth.refreshSession();
        const refreshedUser = refreshedSessionData?.session?.user || null;
        if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };

        if (refreshSessionError && isTransientSupabaseError(refreshSessionError)) {
          // 500/502/503/504 z Auth nie oznacza wygaśniętej sesji. Zachowujemy widok
          // i pozwalamy kolejnej próbie odnowić token.
          throw refreshSessionError;
        }
        if (refreshSessionError || !refreshedUser) {
          const sessionExpiredError = new Error('Sesja wygasła — zaloguj się ponownie.');
          sessionExpiredError.code = 'SESSION_REFRESH_FAILED';
          sessionExpiredError.cause = refreshSessionError || serverError;
          throw sessionExpiredError;
        }

        activeUser = refreshedUser;
        setSessionUserForGeneration(refreshedUser);
        payload = await loadServerPayloadOnce(refreshedUser);
      }

      if (!payload) {
        return coreJobsApplied
          ? { ok: true, transient: false, partial: true, coreJobsApplied: true }
          : undefined;
      }
      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };
      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {
        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };
      }

      lastAppliedServerRequestIdRef.current = refreshRequestId;
      const serverFetchedAtMs = Date.now();
      if (changeCursorAtRefreshStart !== null) {
        changeCursorRef.current = Math.max(Number(changeCursorRef.current) || 0, Number(changeCursorAtRefreshStart) || 0);
      }
      const operations = await listOfflineJobOperations(String(payload.sessionUser?.id || activeUser?.id || userId));
      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };
      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {
        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };
      } // stale-session-and-request-final-queue-guard-v1084
      const payloadJobs = payload.jobs || coreJobs || [];
      const payloadJobsWithLatestQueue = preserveJobDetails
        ? preserveLatestQueuedPhotos(payloadJobs, jobsRef.current)
        : payloadJobs;
      const finalJobs = applyOfflineOperationsToJobs(payloadJobsWithLatestQueue, operations, payload.profile || getProfileFallback(activeUser));
      profileRef.current = payload.profile;
      profilesRef.current = payload.profiles;
      notificationsRef.current = payload.notifications;
      jobsRef.current = finalJobs;

      setSessionUserForGeneration(payload.sessionUser);
      setProfile(payload.profile);
      setProfiles(payload.profiles);
      setJobs(finalJobs);
      setNotifications(payload.notifications);
      void saveOfflineAppSnapshot({
        userId: payload.sessionUser?.id || activeUser?.id || user.id,
        profile: payload.profile,
        profiles: payload.profiles,
        jobs: finalJobs,
        serverFetchedAtMs,
        changeCursor: changeCursorRef.current,
      });
      if (!silent || errorMsgRef.current) setErrorMsg('');

      if (selectedJobIdRef?.current) {
        const refreshedSelectedJob = finalJobs.find((job) => String(job.id) === String(selectedJobIdRef.current)) || null;
        setSelectedJob(refreshedSelectedJob);
      }
      return { ok: true, transient: false, coreJobsApplied: coreJobsApplied || Boolean(finalJobs.length) };
    } catch (error) {
      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };
      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {
        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };
      }
      console.error('refreshAll failed', error);
      const transient = isTransientSupabaseError(error);
      const sessionExpired = isJwtExpiredError(error) || error?.code === 'SESSION_REFRESH_FAILED';

      // Najważniejsze: jeżeli lista montaży zdążyła się pobrać, traktujemy timeout
      // pobocznych danych jako częściowy sukces i nie zasłaniamy poprawnego widoku błędem.
      if (transient && coreJobsApplied) {
        if (errorMsgRef.current) setErrorMsg('');
        return { ok: true, transient: true, partial: true, coreJobsApplied: true };
      }

      // Przy chwilowym 5xx/timeoutie zachowujemy ostatni poprawny stan. Ręczny refresh
      // pokazuje błąd tylko wtedy, gdy telefon nie ma żadnych użytecznych danych.
      const hasUsableJobs = Array.isArray(jobsRef.current) && jobsRef.current.length > 0;
      if (sessionExpired) {
        setErrorMsg('Sesja wygasła — zaloguj się ponownie.');
      } else if (!transient || (!silent && !hasUsableJobs)) {
        setErrorMsg(getSupabaseUserMessage(error, 'Nie udało się pobrać danych.'));
      }
      return { ok: false, transient, sessionExpired, preservedExistingData: hasUsableJobs };
    } finally {
      if (!silent && isCurrentSession()) {
        setBusy(false);
        if (visibleRefreshRequestId === visibleRefreshRequestIdRef.current) setIsRefreshingData(false);
      }
    }
  }, [normalizeStatus, selectedJobIdRef, setSelectedJob, setSessionUserForGeneration, supabase]);

  const refreshChanged = useCallback(async (user, options = {}) => {
    if (!supabase || !user) return { ok: false, unavailable: true };
    const userId = String(user.id || '').trim();
    const sessionToken = captureSessionGeneration(sessionGenerationStateRef.current, userId);
    const isCurrentSession = () => isSessionGenerationCurrent(sessionGenerationStateRef.current, sessionToken);
    if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };
    if (incrementalRefreshInFlightRef.current) return incrementalRefreshInFlightRef.current;
    const refreshRequestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = refreshRequestId;
    const isCurrentDataRequest = () => (
      isCurrentSession() && refreshRequestId >= lastAppliedServerRequestIdRef.current
    );
    const staleRefreshResult = () => (isCurrentSession()
      ? { ok: true, incremental: true, ignoredOlderResponse: true }
      : { ok: false, ignoredStaleSession: true });

    const request = (async () => {
      if (!userId || changeCursorRef.current === null) {
        return refreshAll(user, { ...options, silent: true, preserveJobDetails: true });
      }

      try {
        let workingJobs = Array.isArray(jobsRef.current) ? jobsRef.current : [];
        let cursor = changeCursorRef.current;
        let processed = 0;
        const maxBatches = 5;
        const summaryCache = new Map();
        const operations = await listOfflineJobOperations(userId);
        if (!isCurrentDataRequest()) return staleRefreshResult();

        for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
          const batch = await loadMobileChangeBatch({ supabase, afterCursor: cursor, limit: 100 });
          if (!isCurrentDataRequest()) return staleRefreshResult();
          if (!batch.available) {
            return refreshAll(user, { ...options, silent: true, preserveJobDetails: true });
          }
          if (!batch.changes.length) break;

          for (const change of batch.changes) {
            let summary = summaryCache.get(change.jobId);
            if (!summary) {
              summary = await loadJobSummaryData({ supabase, jobId: change.jobId });
              if (!isCurrentDataRequest()) return staleRefreshResult();
              summaryCache.set(change.jobId, summary);
            }
            const existing = workingJobs.find((job) => String(job.id) === change.jobId);
            if (summary?.missing || !summary?.job) {
              workingJobs = workingJobs.filter((job) => String(job.id) !== change.jobId);
            } else {
              const nextJob = {
                ...(existing || {}),
                ...summary.job,
                viewers: summary.viewers || [],
              };
              workingJobs = existing
                ? workingJobs.map((job) => (String(job.id) === change.jobId ? nextJob : job))
                : [nextJob, ...workingJobs];
            }

            // Najpierw utrwalamy zmieniona liste, dopiero potem przesuwamy punkt
            // wznowienia. Zamkniecie aplikacji pomiedzy tymi krokami co najwyzej
            // powtorzy idempotentny odczyt, ale nigdy nie ominie zmiany.
            const nextCursor = change.changeSeq;
            const persistedJobs = applyOfflineOperationsToJobs(workingJobs, operations, profileRef.current || {});
            await saveOfflineAppSnapshot({
              userId,
              profile: profileRef.current,
              profiles: profilesRef.current,
              jobs: persistedJobs,
              serverFetchedAtMs: Date.now(),
              changeCursor: nextCursor,
            });
            if (!isCurrentDataRequest()) return staleRefreshResult();
            cursor = nextCursor;
            changeCursorRef.current = nextCursor;
            await updateOfflineSyncCursor(userId, nextCursor);
            if (!isCurrentDataRequest()) return staleRefreshResult();
            processed += 1;
          }

          if (batch.changes.length < 100) break;
        }

        if (!isCurrentDataRequest()) return staleRefreshResult();
        if (processed > 0) {
          if (!isCurrentDataRequest()) return staleRefreshResult();
          lastAppliedServerRequestIdRef.current = Math.max(lastAppliedServerRequestIdRef.current, refreshRequestId);
          const finalJobs = applyOfflineOperationsToJobs(workingJobs, operations, profileRef.current || {});
          jobsRef.current = finalJobs;
          setJobs(finalJobs);
          const selectedId = String(selectedJobIdRef?.current || '');
          if (selectedId) setSelectedJob(finalJobs.find((job) => String(job.id) === selectedId) || null);
        }
        return { ok: true, incremental: true, processed, changeCursor: cursor };
      } catch (error) {
        if (!isCurrentDataRequest()) return staleRefreshResult();
        console.warn('Przyrostowe odświeżanie nie powiodło się.', error?.message || error);
        if (isTransientSupabaseError(error)) return { ok: false, incremental: true, transient: true };
        return refreshAll(user, { ...options, silent: true, preserveJobDetails: true });
      }
    })().finally(() => {
      if (incrementalRefreshInFlightRef.current === request) incrementalRefreshInFlightRef.current = null;
    });
    incrementalRefreshInFlightRef.current = request;
    return request;
  }, [refreshAll, selectedJobIdRef, setSelectedJob, supabase]);

  async function login(credentials = {}) {
    await loginUser({
      supabase,
      credentials,
      loginForm,
      setLoginForm,
      setSessionUser: setSessionUserForGeneration,
      setAuthResolved,
      setErrorMsg,
      setBusy,
      refreshAll,
    });
  }

  async function registerUser() {
    await registerAppUser({ supabase, registerForm, setBusy, setErrorMsg });
  }

  async function logout() {
    const userId = sessionUser?.id || profile?.id || '';
    if (userId) await clearOfflineAppSnapshot(userId);
    await logoutUser({
      supabase,
      logoutFlagKey,
      sessionUser,
      clearLocalState: applyLoggedOutState,
    });
  }

  useEffect(() => {
    if (!supabase) return undefined;

    let isMounted = true;
    let retryTimerId = null;
    const runRestore = async () => {
      try {
        const result = await restoreAuthSession({
          supabase,
          logoutFlagKey,
          applyLoggedOutState,
          setSessionUser: setSessionUserForGeneration,
          setErrorMsg,
          setAuthResolved,
          refreshAll,
        });
        if (result?.retryable && isMounted && typeof window !== "undefined") {
          retryTimerId = window.setTimeout(runRestore, AUTH_RESTORE_RETRY_MS);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMsg(getSupabaseUserMessage(error, "Nie udało się przywrócić sesji."));
          setAuthResolved(true);
          if (isTransientSupabaseError(error) && typeof window !== "undefined") {
            retryTimerId = window.setTimeout(runRestore, AUTH_RESTORE_RETRY_MS);
          }
        }
      }
    };

    void runRestore();

    const unsubscribe = subscribeToAuthState({
      supabase,
      logoutFlagKey,
      applyLoggedOutState,
      setSessionUser: setSessionUserForGeneration,
      setAuthResolved,
      refreshAll,
    });

    return () => {
      isMounted = false;
      if (retryTimerId && typeof window !== "undefined") window.clearTimeout(retryTimerId);
      unsubscribe();
    };
  }, [applyLoggedOutState, logoutFlagKey, refreshAll, setSessionUserForGeneration, supabase]);

  return {
    sessionUser,
    profile,
    profiles,
    jobs,
    notifications,
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
    setErrorMsg,
    setLoginForm,
    setRegisterForm,
    setShowRegisterModal,
    setShowAssignedJobsOnly,
    refreshAll,
    refreshChanged,
    captureCurrentSessionToken,
    isSessionTokenCurrent,
    applyLoggedOutState,
    login,
    registerUser,
    logout,
  };
}
