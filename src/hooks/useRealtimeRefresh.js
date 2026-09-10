import { useEffect, useRef } from "react";

const FALLBACK_POLLING_MS = 5 * 60 * 1000;
const RESUME_GLOBAL_REFRESH_MIN_AGE_MS = 2 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 1200;
const DETAILS_DEBOUNCE_MS = 250;
const SUMMARY_DEBOUNCE_MS = 180;

function normalizeId(value) {
  return String(value || '').trim();
}

function getChangedJobId(payload, tableName = '') {
  const table = String(tableName || payload?.table || '').trim();
  if (table === 'jobs') return normalizeId(payload?.new?.id || payload?.old?.id);
  return normalizeId(payload?.new?.job_id || payload?.old?.job_id);
}

export function useRealtimeRefresh({
  supabase,
  sessionUser,
  isMobile,
  selectedJobId,
  refreshAll,
  refreshChanged = refreshAll,
  reloadJobSummary,
  reloadJobDetails,
}) {
  const refreshAllRef = useRef(refreshAll);
  const refreshChangedRef = useRef(refreshChanged);
  const reloadJobSummaryRef = useRef(reloadJobSummary);
  const reloadJobDetailsRef = useRef(reloadJobDetails);
  const selectedJobIdRef = useRef(selectedJobId);
  const inFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const detailsDebounceTimerRef = useRef(null);
  const summaryTimersRef = useRef(new Map());
  const lastGlobalRefreshAttemptAtRef = useRef(Date.now());

  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    refreshChangedRef.current = refreshChanged;
  }, [refreshChanged]);

  useEffect(() => {
    reloadJobSummaryRef.current = reloadJobSummary;
  }, [reloadJobSummary]);

  useEffect(() => {
    reloadJobDetailsRef.current = reloadJobDetails;
  }, [reloadJobDetails]);

  useEffect(() => {
    selectedJobIdRef.current = selectedJobId;
  }, [selectedJobId]);

  useEffect(() => {
    if (!supabase || !sessionUser) return undefined;
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    let disposed = false;

    const runSelectedDetailsReload = async (jobId = '') => {
      const targetJobId = normalizeId(jobId || selectedJobIdRef.current);
      if (!targetJobId || disposed || document.hidden) return null;
      return reloadJobDetailsRef.current?.(targetJobId, { force: true, background: true }) || null;
    };

    const scheduleSelectedDetailsReload = (changedJobId = '', options = {}) => {
      const selectedId = normalizeId(selectedJobIdRef.current);
      const changedId = normalizeId(changedJobId);
      if (!selectedId) return;
      if (changedId && changedId !== selectedId) return;
      window.clearTimeout(detailsDebounceTimerRef.current);
      detailsDebounceTimerRef.current = window.setTimeout(
        () => { void runSelectedDetailsReload(selectedId); },
        options.immediate ? 0 : DETAILS_DEBOUNCE_MS,
      );
    };

    const scheduleJobSummaryReload = (jobId = '', options = {}) => {
      const targetJobId = normalizeId(jobId);
      if (!targetJobId || disposed) return;
      const existingTimer = summaryTimersRef.current.get(targetJobId);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timerId = window.setTimeout(() => {
        summaryTimersRef.current.delete(targetJobId);
        void reloadJobSummaryRef.current?.(targetJobId);
      }, options.immediate ? 0 : SUMMARY_DEBOUNCE_MS);
      summaryTimersRef.current.set(targetJobId, timerId);
    };

    const runRefresh = async () => {
      if (disposed) return;
      if (document.hidden) {
        pendingRefreshRef.current = true;
        return;
      }

      if (inFlightRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      inFlightRef.current = true;
      pendingRefreshRef.current = false;
      lastGlobalRefreshAttemptAtRef.current = Date.now();

      try {
        await refreshChangedRef.current(sessionUser, { silent: true, preserveJobDetails: true });
      } finally {
        inFlightRef.current = false;
        if (disposed) return;
        if (pendingRefreshRef.current && !document.hidden) {
          pendingRefreshRef.current = false;
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = window.setTimeout(runRefresh, REFRESH_DEBOUNCE_MS);
        }
      }
    };

    const scheduleRefresh = (options = {}) => {
      if (disposed) return;
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(runRefresh, options.immediate ? 0 : REFRESH_DEBOUNCE_MS);
    };

    const handleJobScopedRealtime = (payload, tableName) => {
      const changedJobId = getChangedJobId(payload, tableName);
      const selectedId = normalizeId(selectedJobIdRef.current);
      const affectsSelectedJob = Boolean(selectedId && (!changedJobId || changedJobId === selectedId));

      // Zdjęcia i komentarze należą tylko do szczegółów konkretnego zlecenia.
      // Nie uruchamiają już pełnego refreshAll całej listy.
      if (tableName === 'photos' || tableName === 'comments') {
        if (affectsSelectedJob) scheduleSelectedDetailsReload(changedJobId);
        return;
      }

      // Zmiana zlecenia lub przypisania odświeża wyłącznie ten jeden rekord.
      if (tableName === 'jobs' || tableName === 'job_access') {
        if (changedJobId) {
          scheduleJobSummaryReload(changedJobId);
          return;
        }
        // Nietypowy event bez job_id — tylko wtedy awaryjnie odświeżamy listę.
        scheduleRefresh();
      }
    };

    const channel = supabase
      .channel(`live-refresh-${sessionUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, (payload) => handleJobScopedRealtime(payload, "jobs"))
      .on("postgres_changes", { event: "*", schema: "public", table: "job_access" }, (payload) => handleJobScopedRealtime(payload, "job_access"))
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) => handleJobScopedRealtime(payload, "comments"))
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, (payload) => handleJobScopedRealtime(payload, "photos"))
      .subscribe();

    // Realtime jest podstawą dla zmian zleceń/zdjęć/komentarzy. Pełny refresh jest tylko rzadkim zabezpieczeniem.
    const fallbackTimer = window.setInterval(() => {
      if (!document.hidden) scheduleRefresh();
    }, FALLBACK_POLLING_MS);

    const refreshVisibleSelection = () => {
      const selectedId = normalizeId(selectedJobIdRef.current);
      if (selectedId) scheduleJobSummaryReload(selectedId, { immediate: true });

      const ageMs = Date.now() - Number(lastGlobalRefreshAttemptAtRef.current || 0);
      if (ageMs >= RESUME_GLOBAL_REFRESH_MIN_AGE_MS) {
        // Po dłuższej przerwie odświeżamy szczegóły raz, bo w tle mogliśmy
        // ominąć event zdjęcia/komentarza. Krótkie przełączenie karty tego nie robi.
        if (selectedId) scheduleSelectedDetailsReload(selectedId, { immediate: true });
        scheduleRefresh({ immediate: true });
      }
    };

    const handleWindowFocus = () => refreshVisibleSelection();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshVisibleSelection();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      pendingRefreshRef.current = false;
      window.clearTimeout(debounceTimerRef.current);
      window.clearTimeout(detailsDebounceTimerRef.current);
      for (const timerId of summaryTimersRef.current.values()) window.clearTimeout(timerId);
      summaryTimersRef.current.clear();
      window.clearInterval(fallbackTimer);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [isMobile, sessionUser, supabase]);
}
