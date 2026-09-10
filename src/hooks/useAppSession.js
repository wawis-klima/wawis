import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAppClientState,
  loginUser,
  logoutUser,
  registerAppUser,
  restoreAuthSession,
  subscribeToAuthState,
} from "../modules/auth.js";
import { loadJobSummaryData, refreshAppData } from "../modules/jobs.js";
import { loadAppDataSnapshot, saveAppDataSnapshot } from "../modules/app-data-snapshot.js";
import { getSupabaseUserMessage, isJwtExpiredError, isTransientSupabaseError } from "../modules/supabase-errors.js";
import { isOlderThan30Days } from "../utils/jobHelpers.jsx";
import { loadMobileChangeBatch, loadMobileChangeHead } from "../modules/incremental-sync.js";

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

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  useEffect(() => { errorMsgRef.current = errorMsg; }, [errorMsg]);

  const applyLoggedOutState = useCallback(() => {
    changeCursorRef.current = null;
    profileRef.current = null;
    profilesRef.current = [];
    notificationsRef.current = [];
    jobsRef.current = [];
    clearAppClientState({
      setSessionUser,
      setProfile,
      setProfiles,
      setJobs,
      setSelectedJob,
      setNotifications,
      setShowAssignedJobsOnly,
      setAuthResolved,
    });
  }, [setSelectedJob]);

  const refreshAll = useCallback(async (user, options = {}) => {
    if (!supabase || !user) return;
    const { silent = false, preserveJobDetails = true } = options;
    const userId = String(user.id || '').trim();
    const refreshRequestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = refreshRequestId;
    let visibleRefreshRequestId = 0;
    let coreJobsApplied = false;
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
      setErrorMsg('');
    }

    try {
      if (userId && cacheHydratedUserIdRef.current !== userId) {
        cacheHydratedUserIdRef.current = userId;
        const serverVersionBeforeCacheRead = lastAppliedServerRequestIdRef.current;
        const cached = await loadAppDataSnapshot(userId);
        const serverStateUnchanged = lastAppliedServerRequestIdRef.current === serverVersionBeforeCacheRead;

        if (cached?.profile && Array.isArray(cached.jobs) && serverStateUnchanged) {
          if (cached.change_cursor !== null && cached.change_cursor !== undefined) {
            changeCursorRef.current = Math.max(0, Number(cached.change_cursor) || 0);
          }
          const cachedProfiles = Array.isArray(cached.profiles) ? cached.profiles : [];
          const cachedNotifications = Array.isArray(cached.notifications) ? cached.notifications : [];
          profileRef.current = cached.profile;
          profilesRef.current = cachedProfiles;
          notificationsRef.current = cachedNotifications;
          jobsRef.current = cached.jobs;
          setSessionUser(user);
          setProfile(cached.profile);
          setProfiles(cachedProfiles);
          setJobs(cached.jobs);
          setNotifications(cachedNotifications);
          if (selectedJobIdRef?.current) {
            setSelectedJob(cached.jobs.find((job) => String(job.id) === String(selectedJobIdRef.current)) || null);
          }
        }
      }

      changeCursorAtRefreshStart = await loadMobileChangeHead({ supabase }).catch(() => null);

      const applyJobsFirst = async (freshJobs, activeUser = user) => {
        if (!Array.isArray(freshJobs)) return;
        if (refreshRequestId < lastAppliedServerRequestIdRef.current) return;

        coreJobsApplied = true;
        lastAppliedServerRequestIdRef.current = Math.max(lastAppliedServerRequestIdRef.current, refreshRequestId);
        jobsRef.current = freshJobs;
        setSessionUser(activeUser);
        setJobs(freshJobs);
        if (selectedJobIdRef?.current) {
          setSelectedJob(freshJobs.find((job) => String(job.id) === String(selectedJobIdRef.current)) || null);
        }
        if (errorMsgRef.current) setErrorMsg('');

        void saveAppDataSnapshot({
          userId: activeUser?.id || userId,
          profile: getProfileFallback(activeUser),
          profiles: profilesRef.current,
          jobs: freshJobs,
          notifications: notificationsRef.current,
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
        const requestKey = `${activeUserId}:${preserveJobDetails ? 'preserve' : 'replace'}`;
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
        if (!isJwtExpiredError(serverError)) throw serverError;

        const { data: refreshedSessionData, error: refreshSessionError } = await supabase.auth.refreshSession();
        const refreshedUser = refreshedSessionData?.session?.user || null;

        if (refreshSessionError && isTransientSupabaseError(refreshSessionError)) throw refreshSessionError;
        if (refreshSessionError || !refreshedUser) {
          const sessionExpiredError = new Error('Sesja wygasła — zaloguj się ponownie.');
          sessionExpiredError.code = 'SESSION_REFRESH_FAILED';
          sessionExpiredError.cause = refreshSessionError || serverError;
          throw sessionExpiredError;
        }

        activeUser = refreshedUser;
        setSessionUser(refreshedUser);
        payload = await loadServerPayloadOnce(refreshedUser);
      }

      if (!payload) {
        return coreJobsApplied ? { ok: true, transient: false, partial: true, coreJobsApplied: true } : undefined;
      }
      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {
        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };
      }

      lastAppliedServerRequestIdRef.current = refreshRequestId;
      const serverFetchedAtMs = Date.now();
      if (changeCursorAtRefreshStart !== null) {
        changeCursorRef.current = Math.max(Number(changeCursorRef.current) || 0, Number(changeCursorAtRefreshStart) || 0);
      }
      profileRef.current = payload.profile;
      profilesRef.current = payload.profiles;
      notificationsRef.current = payload.notifications;
      jobsRef.current = payload.jobs;

      setSessionUser(payload.sessionUser);
      setProfile(payload.profile);
      setProfiles(payload.profiles);
      setJobs(payload.jobs);
      setNotifications(payload.notifications);
      void saveAppDataSnapshot({
        userId: payload.sessionUser?.id || activeUser?.id || user.id,
        profile: payload.profile,
        profiles: payload.profiles,
        jobs: payload.jobs,
        notifications: payload.notifications,
        serverFetchedAtMs,
        changeCursor: changeCursorRef.current,
      });
      if (!silent || errorMsgRef.current) setErrorMsg('');

      if (selectedJobIdRef?.current) {
        setSelectedJob(payload.jobs.find((job) => String(job.id) === String(selectedJobIdRef.current)) || null);
      }
      return { ok: true, transient: false, coreJobsApplied: true };
    } catch (error) {
      console.error('refreshAll failed', error);
      const transient = isTransientSupabaseError(error);
      const sessionExpired = isJwtExpiredError(error) || error?.code === 'SESSION_REFRESH_FAILED';

      if (transient && coreJobsApplied) {
        if (errorMsgRef.current) setErrorMsg('');
        return { ok: true, transient: true, partial: true, coreJobsApplied: true };
      }

      const hasUsableJobs = Array.isArray(jobsRef.current) && jobsRef.current.length > 0;
      if (sessionExpired) {
        setErrorMsg('Sesja wygasła — zaloguj się ponownie.');
      } else if (!transient || (!silent && !hasUsableJobs)) {
        setErrorMsg(getSupabaseUserMessage(error, 'Nie udało się pobrać danych.'));
      }
      return { ok: false, transient, sessionExpired, preservedExistingData: hasUsableJobs };
    } finally {
      if (!silent) {
        setBusy(false);
        if (visibleRefreshRequestId === visibleRefreshRequestIdRef.current) setIsRefreshingData(false);
      }
    }
  }, [normalizeStatus, selectedJobIdRef, setSelectedJob, supabase]);

  const refreshChanged = useCallback(async (user, options = {}) => {
    if (!supabase || !user) return { ok: false, unavailable: true };
    if (incrementalRefreshInFlightRef.current) return incrementalRefreshInFlightRef.current;

    const request = (async () => {
      const userId = String(user.id || '').trim();
      if (!userId || changeCursorRef.current === null) {
        return refreshAll(user, { ...options, silent: true, preserveJobDetails: true });
      }
      try {
        let workingJobs = Array.isArray(jobsRef.current) ? jobsRef.current : [];
        let cursor = changeCursorRef.current;
        let processed = 0;
        const summaryCache = new Map();

        for (let batchIndex = 0; batchIndex < 5; batchIndex += 1) {
          const batch = await loadMobileChangeBatch({ supabase, afterCursor: cursor, limit: 100 });
          if (!batch.available) return refreshAll(user, { ...options, silent: true, preserveJobDetails: true });
          if (!batch.changes.length) break;

          for (const change of batch.changes) {
            let summary = summaryCache.get(change.jobId);
            if (!summary) {
              summary = await loadJobSummaryData({ supabase, jobId: change.jobId });
              summaryCache.set(change.jobId, summary);
            }
            const existing = workingJobs.find((job) => String(job.id) === change.jobId);
            if (summary?.missing || !summary?.job) {
              workingJobs = workingJobs.filter((job) => String(job.id) !== change.jobId);
            } else {
              const nextJob = { ...(existing || {}), ...summary.job, viewers: summary.viewers || [] };
              workingJobs = existing
                ? workingJobs.map((job) => (String(job.id) === change.jobId ? nextJob : job))
                : [nextJob, ...workingJobs];
            }

            const nextCursor = change.changeSeq;
            await saveAppDataSnapshot({
              userId,
              profile: profileRef.current,
              profiles: profilesRef.current,
              jobs: workingJobs,
              notifications: notificationsRef.current,
              serverFetchedAtMs: Date.now(),
              changeCursor: nextCursor,
            });
            cursor = nextCursor;
            changeCursorRef.current = nextCursor;
            processed += 1;
          }
          if (batch.changes.length < 100) break;
        }

        if (processed > 0) {
          jobsRef.current = workingJobs;
          setJobs(workingJobs);
          const selectedId = String(selectedJobIdRef?.current || '');
          if (selectedId) setSelectedJob(workingJobs.find((job) => String(job.id) === selectedId) || null);
        }
        return { ok: true, incremental: true, processed, changeCursor: cursor };
      } catch (error) {
        console.warn('Przyrostowe odświeżanie desktopowe nie powiodło się.', error?.message || error);
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
      setSessionUser,
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
    await logoutUser({ supabase, logoutFlagKey, clearLocalState: applyLoggedOutState });
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
          setSessionUser,
          setErrorMsg,
          setAuthResolved,
          refreshAll,
        });
        if (result?.retryable && isMounted && typeof window !== 'undefined') {
          retryTimerId = window.setTimeout(runRestore, AUTH_RESTORE_RETRY_MS);
        }
      } catch (error) {
        if (isMounted) {
          const transient = isTransientSupabaseError(error);
          if (!transient) setErrorMsg(getSupabaseUserMessage(error, 'Nie udało się przywrócić sesji.'));
          setAuthResolved(true);
          if (transient && typeof window !== 'undefined') {
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
      setSessionUser,
      setAuthResolved,
      refreshAll,
    });

    return () => {
      isMounted = false;
      if (retryTimerId && typeof window !== 'undefined') window.clearTimeout(retryTimerId);
      unsubscribe();
    };
  }, [applyLoggedOutState, logoutFlagKey, refreshAll, supabase]);

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
    applyLoggedOutState,
    login,
    registerUser,
    logout,
  };
}
