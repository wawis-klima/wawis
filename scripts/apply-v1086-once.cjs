const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function replaceOnce(text, from, to, label) {
  const index = text.indexOf(from);
  if (index < 0) throw new Error(`Pattern not found: ${label}`);
  if (text.indexOf(from, index + from.length) >= 0) throw new Error(`Pattern not unique: ${label}`);
  return text.slice(0, index) + to + text.slice(index + from.length);
}
function editBlock(text, startMarker, endMarker, edit, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Block not found: ${label}`);
  const before = text.slice(0, start);
  const block = text.slice(start, end);
  const after = text.slice(end);
  return before + edit(block) + after;
}

for (const file of ['src/modules/auth.js', 'src/mobile791/modules/auth.js']) {
  let text = read(file);
  text = replaceOnce(
    text,
    `    } catch (error) {\n      if (isTransientSupabaseError(error)) {`,
    `    } catch (error) {\n      if (disposed || !isAuthOperationCurrent(verificationToken)) return;\n      if (isTransientSupabaseError(error)) {`,
    `${file} late SIGNED_OUT catch guard`,
  );
  write(file, text);
}

{
  const file = 'src/mobile791/modules/photo-offline-queue.js';
  let text = read(file);
  text = replaceOnce(text,
    `    uploaded_by: photo.uploaded_by || '',\n`,
    `    uploaded_by: photo.uploaded_by || '',\n    user_id: photo.user_id || photo.uploaded_by || '',\n`,
    'photo queue persistent owner');
  text = replaceOnce(text,
    `    uploaded_by: record.uploaded_by || '',\n`,
    `    uploaded_by: record.uploaded_by || '',\n    user_id: record.user_id || record.uploaded_by || '',\n`,
    'photo queue hydrated owner');
  write(file, text);
}

{
  const file = 'src/mobile791/modules/photos.js';
  let text = read(file);
  text = replaceOnce(text,
    `let persistedQueueResumePromise = null;`,
    `const persistedQueueResumePromises = new Map();`,
    'per-session photo resume promise');
  text = replaceOnce(text,
    `function photoQueueItemIsDue(item, nowMs = Date.now()) {\n  const nextAttempt = Date.parse(item?.next_attempt_at || '');\n  return !Number.isFinite(nextAttempt) || nextAttempt <= nowMs;\n}\n`,
    `function photoQueueItemIsDue(item, nowMs = Date.now()) {\n  const nextAttempt = Date.parse(item?.next_attempt_at || '');\n  return !Number.isFinite(nextAttempt) || nextAttempt <= nowMs;\n}\n\nfunction photoQueueRecordBelongsToProfile(record, profileId) {\n  const ownerId = String(record?.user_id || record?.uploaded_by || '').trim();\n  return Boolean(profileId && ownerId && ownerId === String(profileId));\n}\n`,
    'strict photo queue ownership helper');

  text = editBlock(text, 'export async function restorePersistedJobPhotos({', 'async function runPersistedPhotoUploads({', (block) => {
    block = replaceOnce(block, `  onPhotoUploaded,\n} = {}) {`, `  onPhotoUploaded,\n  isSessionCurrent = () => true,\n} = {}) {`, 'restore session predicate');
    block = replaceOnce(block,
      `  const profileId = String(profile?.id || '').trim();\n  const records = (await listPhotoQueueItems()).filter((record) => !profileId || !record.uploaded_by || String(record.uploaded_by) === profileId);`,
      `  const profileId = String(profile?.id || '').trim();\n  if (!profileId || !isSessionCurrent()) return [];\n  const guardedSetJobs = (updater) => { if (isSessionCurrent()) setJobs?.(updater); };\n  const guardedSetSelectedJob = (updater) => { if (isSessionCurrent()) setSelectedJob?.(updater); };\n  const records = (await listPhotoQueueItems()).filter((record) => photoQueueRecordBelongsToProfile(record, profileId));\n  if (!isSessionCurrent()) return [];`,
      'restore strict owner/session');
    block = block.replace(`  for (const record of records) {\n`, `  for (const record of records) {\n    if (!isSessionCurrent()) break;\n`);
    block = block.replaceAll('setJobs?.(', 'guardedSetJobs?.(').replaceAll('setSelectedJob?.(', 'guardedSetSelectedJob?.(');
    block = block.replaceAll('onPhotoUploaded?.(', 'if (isSessionCurrent()) onPhotoUploaded?.(');
    return block;
  }, 'restore persisted photos block');

  text = editBlock(text, 'async function runPersistedPhotoUploads({', 'export function resumePersistedPhotoUploads', (block) => {
    block = replaceOnce(block, `  includeErrors = false,\n} = {}) {`, `  includeErrors = false,\n  isSessionCurrent = () => true,\n} = {}) {`, 'resume session predicate');
    block = replaceOnce(block,
      `  if (!supabase || !profile || isBrowserOffline()) return { processed: 0, uploaded: 0 };\n  await recoverStalePhotoQueueItems();\n  const profileId = String(profile?.id || '').trim();`,
      `  if (!supabase || !profile || isBrowserOffline() || !isSessionCurrent()) return { processed: 0, uploaded: 0 };\n  await recoverStalePhotoQueueItems();\n  if (!isSessionCurrent()) return { processed: 0, uploaded: 0 };\n  const profileId = String(profile?.id || '').trim();\n  const guardedSetJobs = (updater) => { if (isSessionCurrent()) setJobs?.(updater); };\n  const guardedSetSelectedJob = (updater) => { if (isSessionCurrent()) setSelectedJob?.(updater); };\n  const guardedOnPhotoUploaded = (...args) => { if (isSessionCurrent()) onPhotoUploaded?.(...args); };\n  const guardedOnPhotoUploadError = (...args) => { if (isSessionCurrent()) onPhotoUploadError?.(...args); };`,
      'resume guard setup');
    block = block.replace(/const records = \(await listPhotoQueueItems\(\)\)\.filter\(\(record\) => \([\s\S]*?\)\)\.filter\(\(record\) => includeErrors \|\| photoQueueItemIsDue\(record\)\);/,
      `const records = (await listPhotoQueueItems())\n    .filter((record) => photoQueueRecordBelongsToProfile(record, profileId))\n    .filter((record) => includeErrors || photoQueueItemIsDue(record));`);
    block = block.replace(`  for (const record of records) {\n`, `  for (const record of records) {\n    if (!isSessionCurrent()) break;\n`);
    block = block.replaceAll('setJobs?.(', 'guardedSetJobs?.(').replaceAll('setSelectedJob?.(', 'guardedSetSelectedJob?.(');
    block = block.replaceAll('      setJobs,\n      setSelectedJob,', '      setJobs: guardedSetJobs,\n      setSelectedJob: guardedSetSelectedJob,');
    block = block.replaceAll('      onPhotoUploaded,\n      onPhotoUploadError,', '      onPhotoUploaded: guardedOnPhotoUploaded,\n      onPhotoUploadError: guardedOnPhotoUploadError,');
    block = block.replaceAll('onPhotoUploadError?.(', 'guardedOnPhotoUploadError?.(');
    block = block.replaceAll('onQueueIdle?.();', 'if (isSessionCurrent()) onQueueIdle?.();');
    return block;
  }, 'resume persisted photos block');

  const oldResume = `export function resumePersistedPhotoUploads(options = {}) {\n  if (persistedQueueResumePromise) return persistedQueueResumePromise;\n  persistedQueueResumePromise = runPersistedPhotoUploads(options)\n    .finally(() => {\n      persistedQueueResumePromise = null;\n    });\n  return persistedQueueResumePromise;\n}\n\nexport async function retryAllPersistedPhotoUploads(options = {}) {\n  if (persistedQueueResumePromise) {\n    try {\n      await persistedQueueResumePromise;\n    } catch {\n      // Nowa ręczna próba ma wystartować także po błędzie poprzedniej synchronizacji.\n    }\n  }\n  return runPersistedPhotoUploads({ ...options, includeErrors: true });\n}`;
  const newResume = `export function resumePersistedPhotoUploads(options = {}) {\n  const profileId = String(options?.profile?.id || '').trim();\n  if (!profileId || options?.isSessionCurrent?.() === false) return Promise.resolve({ processed: 0, uploaded: 0, ignoredStaleSession: true });\n  const existing = persistedQueueResumePromises.get(profileId);\n  if (existing) return existing;\n  const request = runPersistedPhotoUploads(options)\n    .finally(() => {\n      if (persistedQueueResumePromises.get(profileId) === request) persistedQueueResumePromises.delete(profileId);\n    });\n  persistedQueueResumePromises.set(profileId, request);\n  return request;\n}\n\nexport async function retryAllPersistedPhotoUploads(options = {}) {\n  const profileId = String(options?.profile?.id || '').trim();\n  const existing = profileId ? persistedQueueResumePromises.get(profileId) : null;\n  if (existing) {\n    try {\n      await existing;\n    } catch {\n      // Nowa ręczna próba ma wystartować także po błędzie poprzedniej synchronizacji.\n    }\n  }\n  if (options?.isSessionCurrent?.() === false) return { processed: 0, uploaded: 0, ignoredStaleSession: true };\n  return runPersistedPhotoUploads({ ...options, includeErrors: true });\n}`;
  text = replaceOnce(text, oldResume, newResume, 'per-profile resume/retry registry');
  write(file, text);
}

{
  const file = 'src/mobile791/App.jsx';
  let text = read(file);
  text = editBlock(text,
    `  useEffect(() => {\n    const userId = offlineSyncUserId;`,
    `  useEffect(() => () => {`,
    (block) => {
      block = replaceOnce(block,
        `    if (!userId || !supabase) return undefined;\n    let cancelled = false;\n\n    async function restoreAndResumeQueue() {\n      if (cancelled) return;`,
        `    if (!userId || !supabase) return undefined;\n    let cancelled = false;\n    const sessionToken = captureCurrentSessionToken(userId);\n    const isQueueSessionCurrent = () => !cancelled && isSessionTokenCurrent(sessionToken);\n\n    async function restoreAndResumeQueue() {\n      if (!isQueueSessionCurrent()) return;`,
        'App queue session token');
      block = block.replaceAll(`          profile: currentProfile,\n          setJobs,`, `          profile: currentProfile,\n          isSessionCurrent: isQueueSessionCurrent,\n          setJobs,`);
      block = block.replaceAll(`        profile: currentProfile,\n        setJobs,`, `        profile: currentProfile,\n        isSessionCurrent: isQueueSessionCurrent,\n        setJobs,`);
      block = block.replace(`      if (!cancelled) await performOfflineJobSync();`, `      if (isQueueSessionCurrent()) await performOfflineJobSync();`);
      return block;
    }, 'App offline restore/resume effect');
  text = text.replace(
    `  }, [offlineSyncUserId, offlineSyncProfileId, offlineSyncJobCount, hasPendingOfflineWork, supabase, setJobs, setSelectedJob, scheduleBackgroundJobDetailsReload, performOfflineJobSync, photoSyncStatus.markPhotoSyncError, photoSyncStatus.markPhotoSynced, photoSyncStatus.markPhotoSyncing]);`,
    `  }, [offlineSyncUserId, offlineSyncProfileId, offlineSyncJobCount, hasPendingOfflineWork, supabase, setJobs, setSelectedJob, scheduleBackgroundJobDetailsReload, performOfflineJobSync, photoSyncStatus.markPhotoSyncError, photoSyncStatus.markPhotoSynced, photoSyncStatus.markPhotoSyncing, captureCurrentSessionToken, isSessionTokenCurrent]);`,
  );
  write(file, text);
}

{
  const file = 'src/mobile791/hooks/useAppSession.js';
  let text = read(file);
  text = replaceOnce(text,
    `        const existingRequest = refreshPayloadInFlightRef.current.get(requestKey);\n        if (existingRequest) return existingRequest;\n\n        const request = withRefreshTimeout(loadServerPayload(activeUser)).finally(() => {\n          if (refreshPayloadInFlightRef.current.get(requestKey) === request) {\n            refreshPayloadInFlightRef.current.delete(requestKey);\n          }\n        });\n        refreshPayloadInFlightRef.current.set(requestKey, request);\n        return request;`,
    `        const existingRequest = refreshPayloadInFlightRef.current.get(requestKey);\n        if (existingRequest) return existingRequest;\n\n        const requestId = refreshRequestId;\n        const request = withRefreshTimeout(loadServerPayload(activeUser)).finally(() => {\n          if (refreshPayloadInFlightRef.current.get(requestKey)?.request === request) {\n            refreshPayloadInFlightRef.current.delete(requestKey);\n          }\n        });\n        const requestEntry = { request, requestId };\n        refreshPayloadInFlightRef.current.set(requestKey, requestEntry);\n        return requestEntry;`,
    'F8 actual fetch owns request id');
  text = replaceOnce(text,
    `      let payload;\n      let activeUser = user;\n      try {\n        payload = await loadServerPayloadOnce(activeUser);`,
    `      let payload;\n      let payloadRequestId = refreshRequestId;\n      let activeUser = user;\n      try {\n        const payloadRequest = loadServerPayloadOnce(activeUser);\n        payloadRequestId = payloadRequest.requestId;\n        payload = await payloadRequest.request;`,
    'F8 initial payload request entry');
  text = replaceOnce(text,
    `        activeUser = refreshedUser;\n        setSessionUserForGeneration(refreshedUser);\n        payload = await loadServerPayloadOnce(refreshedUser);`,
    `        activeUser = refreshedUser;\n        setSessionUserForGeneration(refreshedUser);\n        const payloadRequest = loadServerPayloadOnce(refreshedUser);\n        payloadRequestId = payloadRequest.requestId;\n        payload = await payloadRequest.request;`,
    'F8 retry payload request entry');
  text = editBlock(text, `      if (!payload) {`, `    } catch (error) {`, (block) => {
    block = block.replaceAll('refreshRequestId < lastAppliedServerRequestIdRef.current', 'payloadRequestId < lastAppliedServerRequestIdRef.current');
    block = block.replace('lastAppliedServerRequestIdRef.current = refreshRequestId;', 'lastAppliedServerRequestIdRef.current = payloadRequestId;');
    return block;
  }, 'F8 final payload apply');

  text = editBlock(text, `  const refreshChanged = useCallback(async (user, options = {}) => {`, `  const clearLocalState = useCallback(() => {`, (block) => {
    block = block.replace(`            await saveOfflineAppSnapshot({`, `            const snapshotSaved = await saveOfflineAppSnapshot({`);
    block = replaceOnce(block,
      `            if (!isCurrentDataRequest()) return staleRefreshResult();\n            cursor = nextCursor;\n            changeCursorRef.current = nextCursor;\n            await updateOfflineSyncCursor(userId, nextCursor);\n            if (!isCurrentDataRequest()) return staleRefreshResult();`,
      `            if (!isCurrentDataRequest()) return staleRefreshResult();\n            if (!snapshotSaved) {\n              const persistedSnapshot = await loadOfflineAppSnapshot(userId);\n              if (!isCurrentDataRequest()) return staleRefreshResult();\n              if (Number(persistedSnapshot?.change_cursor || 0) < Number(nextCursor || 0)) {\n                return { ok: false, transient: true, retryable: true, cachePersistFailed: true, processed };\n              }\n            }\n            cursor = nextCursor;\n            changeCursorRef.current = nextCursor;\n            if (!isCurrentDataRequest()) return staleRefreshResult();`,
      'F9 cursor only after confirmed atomic snapshot');
    return block;
  }, 'refreshChanged F9 block');
  text = text.replace(', saveOfflineAppSnapshot, updateOfflineSyncCursor }', ', saveOfflineAppSnapshot }');
  write(file, text);
}

{
  const file = 'scripts/test-groups.cjs';
  let text = read(file);
  text = replaceOnce(text,
    `    'node scripts/smoke-smsapi-webhook-security-v1085.mjs',\n`,
    `    'node scripts/smoke-smsapi-webhook-security-v1085.mjs',\n    'node scripts/smoke-audit-fixes-v1086.mjs',\n`,
    'register v1086 regression');
  write(file, text);
}

const smoke = `import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport { pathToFileURL } from 'node:url';\n\nconst root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');\nconst read = (file) => fs.readFileSync(path.join(root, file), 'utf8');\n\nfor (const file of ['src/modules/auth.js', 'src/mobile791/modules/auth.js']) {\n  const source = read(file);\n  assert.match(source, /catch \(error\) \{\\n\\s*if \(disposed \|\| !isAuthOperationCurrent\(verificationToken\)\) return;/, file + ': late auth catch must be generation-guarded');\n}\n\nconst queue = read('src/mobile791/modules/photo-offline-queue.js');\nconst photos = read('src/mobile791/modules/photos.js');\nconst app = read('src/mobile791/App.jsx');\nassert.match(queue, /user_id: photo\.user_id \|\| photo\.uploaded_by/);\nassert.match(photos, /photoQueueRecordBelongsToProfile/);\nassert.match(photos, /ownerId && ownerId === String\(profileId\)/);\nassert.doesNotMatch(photos, /!record\.uploaded_by \|\| String\(record\.uploaded_by\) === profileId/);\nassert.match(photos, /isSessionCurrent = \(\) => true/);\nassert.match(photos, /persistedQueueResumePromises = new Map\(\)/);\nassert.match(app, /const sessionToken = captureCurrentSessionToken\(userId\)/);\nassert.match(app, /isSessionCurrent: isQueueSessionCurrent/);\n\nconst session = read('src/mobile791/hooks/useAppSession.js');\nassert.match(session, /const requestEntry = \{ request, requestId \}/);\nassert.match(session, /payloadRequestId = payloadRequest\.requestId/);\nassert.match(session, /lastAppliedServerRequestIdRef\.current = payloadRequestId/);\nassert.match(session, /const snapshotSaved = await saveOfflineAppSnapshot/);\nassert.match(session, /cachePersistFailed: true/);\nconst changedBlock = session.slice(session.indexOf('const refreshChanged = useCallback'), session.indexOf('const clearLocalState = useCallback'));
assert.doesNotMatch(changedBlock, /updateOfflineSyncCursor\(/);\n\nconst authModule = await import(pathToFileURL(path.join(root, 'src/modules/auth.js')).href + '?v1086=' + Date.now());\nauthModule.AUTH_OPERATION_TESTING.reset();\nlet authCallback;\nlet rejectGetSession;\nlet loggedOut = 0;\nconst pendingGetSession = new Promise((_, reject) => { rejectGetSession = reject; });\nconst supabase = { auth: {\n  onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },\n  getSession() { return pendingGetSession; },\n  refreshSession() { return Promise.resolve({ data: { session: null }, error: null }); },\n} };\nconst oldWindow = globalThis.window;\nconst oldSessionStorage = globalThis.sessionStorage;\nglobalThis.window = { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {} };\nglobalThis.sessionStorage = { getItem() { return null; } };\ntry {\n  authModule.subscribeToAuthState({ supabase, logoutFlagKey: 'logout', applyLoggedOutState: () => { loggedOut += 1; }, setSessionUser() {}, setAuthResolved() {}, refreshAll() {} });\n  authCallback('SIGNED_OUT', null);\n  await Promise.resolve();\n  authCallback('SIGNED_IN', { user: { id: 'user-b' } });\n  rejectGetSession(new Error('late hard failure from old SIGNED_OUT'));\n  await new Promise((resolve) => setTimeout(resolve, 0));\n  assert.equal(loggedOut, 0, 'late SIGNED_OUT verification from old auth generation must not log out the newer session');\n} finally {\n  globalThis.window = oldWindow;\n  globalThis.sessionStorage = oldSessionStorage;\n}\nconsole.log('10.86 audit regressions: PASS');\n`;
write('scripts/smoke-audit-fixes-v1086.mjs', smoke);
console.log('Applied audited 10.86 fixes.');
