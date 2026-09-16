const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(path, needle, replacement, label = needle.slice(0, 80)) {
  const source = read(path);
  if (!source.includes(needle)) throw new Error(`Brak wzorca ${label} w ${path}`);
  write(path, source.replace(needle, replacement));
}
function patchBlock(path, startNeedle, endNeedle, transform) {
  const source = read(path);
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`Brak początku bloku ${startNeedle} w ${path}`);
  const end = source.indexOf(endNeedle, start);
  if (end < 0) throw new Error(`Brak końca bloku ${endNeedle} w ${path}`);
  const block = source.slice(start, end);
  const next = transform(block);
  if (next === block) throw new Error(`Blok ${startNeedle} w ${path} nie został zmieniony`);
  write(path, source.slice(0, start) + next + source.slice(end));
}

const sessionHelper = `  const captureCurrentSessionToken = useCallback((expectedUserId = '') => {\n    const userId = String(expectedUserId || sessionGenerationStateRef.current.userId || '').trim();\n    return captureSessionGeneration(sessionGenerationStateRef.current, userId);\n  }, []);\n\n  const isSessionTokenCurrent = useCallback((token) => (\n    Boolean(token) && isSessionGenerationCurrent(sessionGenerationStateRef.current, token)\n  ), []);\n\n`;

for (const path of ['src/hooks/useAppSession.js', 'src/mobile791/hooks/useAppSession.js']) {
  replaceOnce(
    path,
    `}, []);\n\n  const applyLoggedOutState = useCallback(() => {`,
    `}, []);\n\n${sessionHelper}  const applyLoggedOutState = useCallback(() => {`,
    'session loader token helpers',
  );
  replaceOnce(
    path,
    `    refreshChanged,\n    applyLoggedOutState,`,
    `    refreshChanged,\n    captureCurrentSessionToken,\n    isSessionTokenCurrent,\n    applyLoggedOutState,`,
    'return session loader token helpers',
  );
  replaceOnce(
    path,
    `    const refreshRequestId = refreshRequestIdRef.current + 1;\n    refreshRequestIdRef.current = refreshRequestId;`,
    `    const refreshRequestId = refreshRequestIdRef.current + 1;\n    refreshRequestIdRef.current = refreshRequestId;\n    const isCurrentRefreshRequest = () => (\n      isCurrentSession() && refreshRequestId >= lastAppliedServerRequestIdRef.current\n    );`,
    'refreshAll request freshness helper',
  );

  patchBlock(path, '  const refreshChanged = useCallback(async (user, options = {}) => {', '\n\n  async function login', (block) => {
    let next = block;
    next = next.replace(
      `    if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };\n    if (incrementalRefreshInFlightRef.current) return incrementalRefreshInFlightRef.current;\n\n    const request = (async () => {`,
      `    if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };\n    if (incrementalRefreshInFlightRef.current) return incrementalRefreshInFlightRef.current;\n    const refreshRequestId = refreshRequestIdRef.current + 1;\n    refreshRequestIdRef.current = refreshRequestId;\n    const isCurrentDataRequest = () => (\n      isCurrentSession() && refreshRequestId >= lastAppliedServerRequestIdRef.current\n    );\n    const staleRefreshResult = () => (isCurrentSession()\n      ? { ok: true, incremental: true, ignoredOlderResponse: true }\n      : { ok: false, ignoredStaleSession: true });\n\n    const request = (async () => {`,
    );
    const marker = '    const request = (async () => {';
    const innerStart = next.indexOf(marker);
    if (innerStart < 0) throw new Error(`Nie udało się znaleźć wnętrza refreshChanged w ${path}`);
    const prefix = next.slice(0, innerStart + marker.length);
    let inner = next.slice(innerStart + marker.length);
    inner = inner.replace(/if \(!isCurrentSession\(\)\) return \{ ok: false, ignoredStaleSession: true \};/g, 'if (!isCurrentDataRequest()) return staleRefreshResult();');
    inner = inner.replace(
      `        if (processed > 0) {`,
      `        if (processed > 0) {\n          if (!isCurrentDataRequest()) return staleRefreshResult();\n          lastAppliedServerRequestIdRef.current = Math.max(lastAppliedServerRequestIdRef.current, refreshRequestId);`,
    );
    if (path.includes('mobile791')) {
      inner = inner.replace(
        `            await updateOfflineSyncCursor(userId, nextCursor);\n            processed += 1;`,
        `            await updateOfflineSyncCursor(userId, nextCursor);\n            if (!isCurrentDataRequest()) return staleRefreshResult();\n            processed += 1;`,
      );
    }
    return prefix + inner;
  });
}

// Mobile refreshAll: await IndexedDB nie może przepuścić starszej odpowiedzi.
replaceOnce(
  'src/mobile791/hooks/useAppSession.js',
  `        const cached = await loadOfflineAppSnapshot(userId);\n        if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };`,
  `        const cached = await loadOfflineAppSnapshot(userId);\n        if (!isCurrentRefreshRequest()) return { ok: true, ignoredOlderResponse: true };`,
  'mobile cache freshness after await',
);
replaceOnce(
  'src/mobile791/hooks/useAppSession.js',
  `      changeCursorAtRefreshStart = await loadMobileChangeHead({ supabase }).catch(() => null);\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };`,
  `      changeCursorAtRefreshStart = await loadMobileChangeHead({ supabase }).catch(() => null);\n      if (!isCurrentRefreshRequest()) return { ok: true, ignoredOlderResponse: true };`,
  'mobile head freshness after await',
);
replaceOnce(
  'src/mobile791/hooks/useAppSession.js',
  `        const operations = await listOfflineJobOperations(String(activeUser?.id || userId));\n        if (!isCurrentSession()) return;`,
  `        const operations = await listOfflineJobOperations(String(activeUser?.id || userId));\n        if (!isCurrentRefreshRequest()) return;`,
  'mobile applyJobsFirst freshness after queue await',
);
replaceOnce(
  'src/mobile791/hooks/useAppSession.js',
  `      const operations = await listOfflineJobOperations(String(payload.sessionUser?.id || activeUser?.id || userId));\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied }; // stale-session-final-queue-guard-v1080`,
  `      const operations = await listOfflineJobOperations(String(payload.sessionUser?.id || activeUser?.id || userId));\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };\n      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {\n        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };\n      } // stale-session-and-request-final-queue-guard-v1084`,
  'mobile final queue request freshness',
);
replaceOnce(
  'src/mobile791/hooks/useAppSession.js',
  `    } catch (error) {\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };\n      console.error('refreshAll failed', error);`,
  `    } catch (error) {\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };\n      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {\n        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };\n      }\n      console.error('refreshAll failed', error);`,
  'mobile stale refresh error guard',
);

// Desktop cache/head również nie mogą wrócić po nowszym pełnym odświeżeniu.
replaceOnce(
  'src/hooks/useAppSession.js',
  `        const cached = await loadAppDataSnapshot(userId);\n        if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };`,
  `        const cached = await loadAppDataSnapshot(userId);\n        if (!isCurrentRefreshRequest()) return { ok: true, ignoredOlderResponse: true };`,
  'desktop cache freshness after await',
);
replaceOnce(
  'src/hooks/useAppSession.js',
  `      changeCursorAtRefreshStart = await loadMobileChangeHead({ supabase }).catch(() => null);\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true };`,
  `      changeCursorAtRefreshStart = await loadMobileChangeHead({ supabase }).catch(() => null);\n      if (!isCurrentRefreshRequest()) return { ok: true, ignoredOlderResponse: true };`,
  'desktop head freshness after await',
);
replaceOnce(
  'src/hooks/useAppSession.js',
  `    } catch (error) {\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };\n      console.error('refreshAll failed', error);`,
  `    } catch (error) {\n      if (!isCurrentSession()) return { ok: false, ignoredStaleSession: true, coreJobsApplied };\n      if (refreshRequestId < lastAppliedServerRequestIdRef.current) {\n        return { ok: true, transient: false, ignoredOlderResponse: true, coreJobsApplied };\n      }\n      console.error('refreshAll failed', error);`,
  'desktop stale refresh error guard',
);

// F9: GET + warunkowy PUT kursora w jednej transakcji readwrite.
patchBlock('src/mobile791/modules/job-offline-store.js', 'export async function updateOfflineSyncCursor', '\n\nexport async function loadOfflineAppSnapshot', () => `export async function updateOfflineSyncCursor(userId, changeCursor) {\n  const normalizedUserId = String(userId || '').trim();\n  const normalizedCursor = Math.max(0, Number(changeCursor) || 0);\n  if (!normalizedUserId) return false;\n  let db;\n  try {\n    db = await openOfflineDb();\n    if (!db) return false;\n    return await new Promise((resolve, reject) => {\n      const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');\n      const store = transaction.objectStore(SNAPSHOT_STORE);\n      const readRequest = store.get(normalizedUserId);\n      let found = false;\n\n      readRequest.onsuccess = () => {\n        const current = readRequest.result;\n        if (!current) return;\n        found = true;\n        if (Number(current.change_cursor || 0) >= normalizedCursor) return;\n        store.put({\n          ...current,\n          user_id: normalizedUserId,\n          change_cursor: normalizedCursor,\n          saved_at: new Date().toISOString(),\n        });\n      };\n      readRequest.onerror = () => reject(readRequest.error || new Error('Nie udało się odczytać punktu wznowienia synchronizacji.'));\n      transaction.oncomplete = () => resolve(found);\n      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zapisać punktu wznowienia synchronizacji.'));\n      transaction.onabort = transaction.onerror;\n    });\n  } catch (error) {\n    console.warn('Nie udało się zapisać punktu wznowienia synchronizacji.', error?.message || error);\n    return false;\n  } finally {\n    db?.close();\n  }\n}`);

// F7: fallback polling zawsze odświeża otwarte szczegóły, nie tylko summary/feed.
for (const path of ['src/hooks/useRealtimeRefresh.js', 'src/mobile791/hooks/useRealtimeRefresh.js']) {
  replaceOnce(
    path,
    `    const fallbackTimer = window.setInterval(() => {\n      if (!document.hidden) scheduleRefresh();\n    }, FALLBACK_POLLING_MS);`,
    `    const fallbackTimer = window.setInterval(() => {\n      if (document.hidden) return;\n      const selectedId = normalizeId(selectedJobIdRef.current);\n      if (selectedId) scheduleSelectedDetailsReload(selectedId, { immediate: true });\n      scheduleRefresh();\n    }, FALLBACK_POLLING_MS);`,
    'fallback details polling',
  );
}

function patchApp(path, mobile = false) {
  replaceOnce(
    path,
    `    refreshAll,\n    refreshChanged,\n    login,`,
    `    refreshAll,\n    refreshChanged,\n    captureCurrentSessionToken,\n    isSessionTokenCurrent,\n    login,`,
    'app session guard destructuring',
  );

  const adminMarker = mobile
    ? `  const isAdmin = profile?.role === "Administrator";\n  useEffect(() => startSilentDiagnosticSync({`
    : `  const isAdmin = profile?.role === "Administrator";\n\n  useEffect(() => startSilentDiagnosticSync({`;
  const resetEffect = mobile
    ? `  const isAdmin = profile?.role === "Administrator";\n  useEffect(() => {\n    jobDetailsRequestsRef.current.clear();\n    jobSummaryRequestsRef.current.clear();\n    if (typeof window !== 'undefined') {\n      for (const timerId of backgroundDetailsTimersRef.current.values()) window.clearTimeout(timerId);\n    }\n    backgroundDetailsTimersRef.current.clear();\n    thumbnailRecoveryAttemptsRef.current.clear();\n    thumbnailRecoveryInFlightRef.current.clear();\n    setDetailsLoadingJobId(null);\n  }, [sessionUser?.id]);\n  useEffect(() => startSilentDiagnosticSync({`
    : `  const isAdmin = profile?.role === "Administrator";\n\n  useEffect(() => {\n    jobDetailsRequestsRef.current.clear();\n    jobSummaryRequestsRef.current.clear();\n    setDetailsLoadingJobId(null);\n  }, [sessionUser?.id]);\n\n  useEffect(() => startSilentDiagnosticSync({`;
  replaceOnce(path, adminMarker, resetEffect, 'clear loader state on session change');

  const hydrateStart = `  const hydrateJobThumbnails = React.useCallback(async (jobId, photos = []) => {\n    const targetId = String(jobId || '').trim();\n    if (!targetId || !supabase || !Array.isArray(photos) || photos.length === 0) return;`;
  replaceOnce(
    path,
    hydrateStart,
    `  const hydrateJobThumbnails = React.useCallback(async (jobId, photos = [], sessionToken = captureCurrentSessionToken()) => {\n    const targetId = String(jobId || '').trim();\n    if (!targetId || !supabase || !Array.isArray(photos) || photos.length === 0 || !isSessionTokenCurrent(sessionToken)) return;`,
    'thumbnail session token capture',
  );
  replaceOnce(
    path,
    `    const patches = new Map(\n      settled`,
    `    if (!isSessionTokenCurrent(sessionToken)) return;\n\n    const patches = new Map(\n      settled`,
    'thumbnail session token after await',
  );
  const thumbnailNext = mobile ? '\n\n  const recoverPhotoThumbnail' : '\n\n  const reloadJobDetails';
  replaceOnce(path, `  }, [supabase]);${thumbnailNext}`, `  }, [captureCurrentSessionToken, isSessionTokenCurrent, supabase]);${thumbnailNext}`, 'thumbnail dependencies');

  patchBlock(path, '  const reloadJobDetails = React.useCallback(async (jobId, options = {}) => {', mobile ? '\n\n  const scheduleBackgroundJobDetailsReload' : '\n\n  const reloadJobSummary', (block) => {
    let next = block;
    next = next.replace(
      `    const targetId = String(jobId || '').trim();\n    if (!targetId || !supabase) return null;`,
      `    const targetId = String(jobId || '').trim();\n    const sessionToken = captureCurrentSessionToken();\n    if (!targetId || !supabase || !isSessionTokenCurrent(sessionToken)) return null;`,
    );
    next = next.replace(
      `    const existingRequest = jobDetailsRequestsRef.current.get(targetId);\n    if (existingRequest) return existingRequest;`,
      `    const requestKey = \`${'${sessionToken.generation}:${sessionToken.userId}:${targetId}'}\`;\n    const existingRequest = jobDetailsRequestsRef.current.get(requestKey);\n    if (existingRequest) return existingRequest;`,
    );
    next = next.replace(
      `        });\n\n        const cleanDetails = { ...details, detailsLoadError: '' };`,
      `        });\n        if (!isSessionTokenCurrent(sessionToken)) return null;\n\n        const cleanDetails = { ...details, detailsLoadError: '' };`,
    );
    next = next.replace(`        void hydrateJobThumbnails(targetId, cleanDetails.photos || []);`, `        void hydrateJobThumbnails(targetId, cleanDetails.photos || [], sessionToken);`);
    next = next.replace(`      } catch (error) {\n        // Odświeżenie`, `      } catch (error) {\n        if (!isSessionTokenCurrent(sessionToken)) return null;\n        // Odświeżenie`);
    next = next.replace(`        if (!options.background) {\n          setDetailsLoadingJobId`, `        if (!options.background && isSessionTokenCurrent(sessionToken)) {\n          setDetailsLoadingJobId`);
    next = next.replace(`    jobDetailsRequestsRef.current.set(targetId, request);`, `    jobDetailsRequestsRef.current.set(requestKey, request);`);
    next = next.replace(`      if (jobDetailsRequestsRef.current.get(targetId) === request) {\n        jobDetailsRequestsRef.current.delete(targetId);`, `      if (jobDetailsRequestsRef.current.get(requestKey) === request) {\n        jobDetailsRequestsRef.current.delete(requestKey);`);
    next = next.replace(`  }, [hydrateJobThumbnails, supabase]);`, `  }, [captureCurrentSessionToken, hydrateJobThumbnails, isSessionTokenCurrent, supabase]);`);
    return next;
  });

  patchBlock(path, '  const reloadJobSummary = React.useCallback(async (jobId) => {', mobile ? '\n\n  const performOfflineJobSync' : '\n\n  const {\n    deletingPhotoId', (block) => {
    let next = block;
    next = next.replace(
      `    const targetId = String(jobId || '').trim();\n    if (!targetId || !supabase) return null;`,
      `    const targetId = String(jobId || '').trim();\n    const sessionToken = captureCurrentSessionToken();\n    if (!targetId || !supabase || !isSessionTokenCurrent(sessionToken)) return null;`,
    );
    next = next.replace(
      `    const existingRequest = jobSummaryRequestsRef.current.get(targetId);\n    if (existingRequest) return existingRequest;`,
      `    const requestKey = \`${'${sessionToken.generation}:${sessionToken.userId}:${targetId}'}\`;\n    const existingRequest = jobSummaryRequestsRef.current.get(requestKey);\n    if (existingRequest) return existingRequest;`,
    );
    next = next.replace(`        const summary = await loadJobSummaryData({ supabase, jobId: targetId });`, `        const summary = await loadJobSummaryData({ supabase, jobId: targetId });\n        if (!isSessionTokenCurrent(sessionToken)) return null;`);
    next = next.replace(`      } catch (error) {\n        console.warn('Nie udało się odświeżyć pojedynczego montażu.'`, `      } catch (error) {\n        if (!isSessionTokenCurrent(sessionToken)) return null;\n        console.warn('Nie udało się odświeżyć pojedynczego montażu.'`);
    next = next.replace(`    jobSummaryRequestsRef.current.set(targetId, request);`, `    jobSummaryRequestsRef.current.set(requestKey, request);`);
    next = next.replace(`      if (jobSummaryRequestsRef.current.get(targetId) === request) {\n        jobSummaryRequestsRef.current.delete(targetId);`, `      if (jobSummaryRequestsRef.current.get(requestKey) === request) {\n        jobSummaryRequestsRef.current.delete(requestKey);`);
    next = next.replace(`  }, [supabase]);`, `  }, [captureCurrentSessionToken, isSessionTokenCurrent, supabase]);`);
    return next;
  });

  if (mobile) {
    patchBlock(path, '  const recoverPhotoThumbnail = React.useCallback(async (photo) => {', '\n\n  const markPhotoThumbnailLoaded', (block) => {
      let next = block;
      next = next.replace(
        `    const jobId = String(photo?.job_id || selectedJobIdRef.current || '').trim();`,
        `    const sessionToken = captureCurrentSessionToken();\n    const jobId = String(photo?.job_id || selectedJobIdRef.current || '').trim();`,
      );
      next = next.replace(`    if (!jobId || !photoId || !storagePath || !supabase) return '';`, `    if (!jobId || !photoId || !storagePath || !supabase || !isSessionTokenCurrent(sessionToken)) return '';`);
      next = next.replace(`      });\n      let resolvedAttempt = nextAttempt;`, `      });\n      if (!isSessionTokenCurrent(sessionToken)) return '';\n      let resolvedAttempt = nextAttempt;`);
      next = next.replace(`        });\n      }\n\n      const markedUrl`, `        });\n        if (!isSessionTokenCurrent(sessionToken)) return '';\n      }\n\n      if (!isSessionTokenCurrent(sessionToken)) return '';\n      const markedUrl`);
      next = next.replace(`  }, [supabase]);`, `  }, [captureCurrentSessionToken, isSessionTokenCurrent, supabase]);`);
      return next;
    });
  }
}

patchApp('src/App.jsx', false);
patchApp('src/mobile791/App.jsx', true);

// Regresja źródłowa 10.84.
write('scripts/smoke-audit-races-v1084.mjs', `import assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst mobileSession = fs.readFileSync('src/mobile791/hooks/useAppSession.js', 'utf8');\nconst desktopSession = fs.readFileSync('src/hooks/useAppSession.js', 'utf8');\nconst mobileApp = fs.readFileSync('src/mobile791/App.jsx', 'utf8');\nconst desktopApp = fs.readFileSync('src/App.jsx', 'utf8');\nconst mobileRealtime = fs.readFileSync('src/mobile791/hooks/useRealtimeRefresh.js', 'utf8');\nconst desktopRealtime = fs.readFileSync('src/hooks/useRealtimeRefresh.js', 'utf8');\nconst offline = fs.readFileSync('src/mobile791/modules/job-offline-store.js', 'utf8');\n\nfor (const source of [mobileSession, desktopSession]) {\n  assert.match(source, /captureCurrentSessionToken/);\n  assert.match(source, /isSessionTokenCurrent/);\n  assert.match(source, /refreshRequestIdRef\\.current \\+ 1/);\n  assert.match(source, /isCurrentDataRequest/);\n  assert.match(source, /lastAppliedServerRequestIdRef\\.current = Math\\.max/);\n}\nfor (const source of [mobileApp, desktopApp]) {\n  assert.match(source, /sessionToken\\.generation.*sessionToken\\.userId.*targetId/s);\n  assert.match(source, /if \\(!isSessionTokenCurrent\\(sessionToken\\)\\) return null/);\n  assert.match(source, /hydrateJobThumbnails\\(targetId, cleanDetails\\.photos \\|\\| \\[\\], sessionToken\\)/);\n}\nfor (const source of [mobileRealtime, desktopRealtime]) {\n  assert.match(source, /fallbackTimer[\\s\\S]*scheduleSelectedDetailsReload\\(selectedId, \\{ immediate: true \\}\\)[\\s\\S]*scheduleRefresh\\(\\)/);\n}\nconst cursorBlock = offline.slice(offline.indexOf('export async function updateOfflineSyncCursor'), offline.indexOf('export async function loadOfflineAppSnapshot'));\nassert.match(cursorBlock, /db\\.transaction\\(SNAPSHOT_STORE, 'readwrite'\\)/);\nassert.match(cursorBlock, /store\\.get\\(normalizedUserId\\)/);\nassert.match(cursorBlock, /store\\.put\\(/);\nassert.doesNotMatch(cursorBlock, /withStore\\(SNAPSHOT_STORE, 'readonly'/);\nconsole.log('GO: 10.84 stale loaders, polling, request order and cursor transaction are guarded.');\n`);

write('tests/e2e/audit-races-v1084.spec.js', `import { expect, test } from '@playwright/test';\n\ntest.describe('@mobile 10.84 — wyścigi IndexedDB', () => {\n  test('stary update kursora nie przywraca starego snapshotu po nowszym zapisie', async ({ page }) => {\n    await page.goto('/');\n    const result = await page.evaluate(async () => {\n      const store = await import('/src/mobile791/modules/job-offline-store.js');\n      const userId = 'v1084-cursor-race-user';\n      const dbName = 'wawis-mobile-offline-data';\n      await new Promise((resolve) => {\n        const request = indexedDB.deleteDatabase(dbName);\n        request.onsuccess = request.onerror = request.onblocked = () => resolve();\n      });\n\n      let failures = 0;\n      for (let round = 0; round < 12; round += 1) {\n        const baseTime = 1000 + round * 10;\n        await store.saveOfflineAppSnapshot({\n          userId, profile: { id: userId }, profiles: [],\n          jobs: [{ id: 'job', marker: 'old-' + round }],\n          serverFetchedAtMs: baseTime, changeCursor: 1,\n        });\n\n        const staleUpdates = Array.from({ length: 24 }, () => store.updateOfflineSyncCursor(userId, 2));\n        const freshWrite = store.saveOfflineAppSnapshot({\n          userId, profile: { id: userId }, profiles: [],\n          jobs: [{ id: 'job', marker: 'new-' + round }],\n          serverFetchedAtMs: baseTime + 5, changeCursor: 3,\n        });\n        await Promise.all([...staleUpdates, freshWrite]);\n        const snapshot = await store.loadOfflineAppSnapshot(userId);\n        if (Number(snapshot?.change_cursor || 0) !== 3 || snapshot?.jobs?.[0]?.marker !== 'new-' + round) failures += 1;\n      }\n      return { failures };\n    });\n    expect(result.failures).toBe(0);\n  });\n});\n`);

replaceOnce(
  'scripts/test-groups.cjs',
  `    'node scripts/smoke-update-reload-guard-v1082.mjs',`,
  `    'node scripts/smoke-update-reload-guard-v1082.mjs',\n    'node scripts/smoke-audit-races-v1084.mjs',`,
  '10.84 core smoke group',
);
replaceOnce(
  'scripts/test-groups.cjs',
  `    'node scripts/smoke-session-push-gate-v1083.mjs',\n  ],\n};`,
  `    'node scripts/smoke-session-push-gate-v1083.mjs',\n    'node scripts/smoke-audit-races-v1084.mjs',\n  ],\n};`,
  '10.84 infra smoke group',
);

execFileSync(process.execPath, ['version-bump.cjs'], { stdio: 'inherit' });
const version = JSON.parse(read('app-version.json')).version;
if (version !== '10.84') throw new Error(`Oczekiwano wersji 10.84, jest ${version}`);

let readme = read('README.md');
readme = readme.replace(
  '- wersja `10.84` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.',
  '- wersja `10.84` — domknięto ostatnie F5/F7/F8/F9 audytu: stare loadery i refresh nie mogą nadpisywać nowszej sesji/stanu, fallback odświeża szczegóły, a kursor IndexedDB jest atomowy.'
);
write('README.md', readme);

let changelog = read('CHANGELOG.md');
changelog = changelog.replace(
  '## 10.84\n- uzupełnij opis zmian dla wersji 10.84',
  `## 10.84\n- F5: pojedyncze loadery summary/szczegółów i podpisywanie miniaturek używają tokenu generacji sesji; spóźniona odpowiedź konta A nie zmienia stanu konta B,\n- F7: fallback polling odświeża również otwarte szczegóły zlecenia, więc zgubione zdarzenie Realtime komentarza lub zdjęcia zostaje naprawione bez ponownego logowania,\n- F8: pełne i przyrostowe odświeżenia korzystają ze wspólnego monotonicznego numeru requestu; po każdym await starszy wynik jest odrzucany przed zmianą stanu lub kursora,\n- F9: update kursora app-snapshots wykonuje GET i warunkowy PUT w jednej transakcji IndexedDB readwrite i nie może odtworzyć starego snapshotu,\n- dodano regresję 10.84 oraz realny test Chromium wyścigu app-snapshots/kursora; wersja domyka F1–F13 ostatniego audytu.`
);
write('CHANGELOG.md', changelog);

let srcVersion = read('src/version.js');
srcVersion = srcVersion.replace(/^\/\/ v10\.83:.*$/m, '// v10.84: domknięcie F5/F7/F8/F9 audytu i finalny trigger produkcyjny.');
write('src/version.js', srcVersion);

const gate = JSON.parse(read('RELEASE-GATE.json'));
gate.version = '10.84';
gate.scope = 'full';
gate.release_branch = 'release/v10.84';
gate.baseline_diagnostics = {
  checked: true,
  last_24h: true,
  checked_at: '2026-09-16T15:57:00+02:00',
  result: 'INFO',
  notes: '10.84 domyka F5/F7/F8/F9 ostatniego audytu: stale loadery, fallback szczegółów, kolejność refresh i atomowy kursor IndexedDB.',
};
gate.main_protection = {
  source_branch: 'release/v10.84',
  ready_for_main: false,
  required_check: 'WAWIS PR checks / targeted-checks',
};
write('RELEASE-GATE.json', JSON.stringify(gate, null, 2) + '\n');

execFileSync('git', ['diff', '--check'], { stdio: 'inherit' });
console.log('Prepared WAWIS 10.84 candidate.');
