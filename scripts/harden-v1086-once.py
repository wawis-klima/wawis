from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


# F8/F9: small pure contracts used by production code and by behavior tests.
Path('src/mobile791/modules/sync-contract-v1086.js').write_text("""export function getOrCreateRefreshPayloadRequest(registry, key, requestId, requestFactory) {
  const existing = registry.get(key);
  if (existing) return existing;
  let entry = null;
  const request = Promise.resolve().then(requestFactory).finally(() => {
    if (registry.get(key) === entry) registry.delete(key);
  });
  entry = { request, requestId };
  registry.set(key, entry);
  return entry;
}

export function persistedSnapshotCoversCursor(snapshot, nextCursor) {
  return Number(snapshot?.change_cursor || 0) >= Number(nextCursor || 0);
}
""")

hook_path = Path('src/mobile791/hooks/useAppSession.js')
hook = hook_path.read_text()
hook = replace_once(
    hook,
    'import { transitionPushSessionContext } from "../modules/push-lifecycle-v1078.js";\n',
    'import { transitionPushSessionContext } from "../modules/push-lifecycle-v1078.js";\nimport { getOrCreateRefreshPayloadRequest, persistedSnapshotCoversCursor } from "../modules/sync-contract-v1086.js";\n',
    'sync contract import',
)
old_fetch = """        const existingRequest = refreshPayloadInFlightRef.current.get(requestKey);
        if (existingRequest) return existingRequest;

        const requestId = refreshRequestId;
        const request = withRefreshTimeout(loadServerPayload(activeUser)).finally(() => {
          if (refreshPayloadInFlightRef.current.get(requestKey)?.request === request) {
            refreshPayloadInFlightRef.current.delete(requestKey);
          }
        });
        const requestEntry = { request, requestId };
        refreshPayloadInFlightRef.current.set(requestKey, requestEntry);
        return requestEntry;"""
new_fetch = """        return getOrCreateRefreshPayloadRequest(
          refreshPayloadInFlightRef.current,
          requestKey,
          refreshRequestId,
          () => withRefreshTimeout(loadServerPayload(activeUser)),
        );"""
hook = replace_once(hook, old_fetch, new_fetch, 'F8 fetch ownership block')
hook = replace_once(
    hook,
    '              if (Number(persistedSnapshot?.change_cursor || 0) < Number(nextCursor || 0)) {\n',
    '              if (!persistedSnapshotCoversCursor(persistedSnapshot, nextCursor)) {\n',
    'F9 persisted cursor predicate',
)
hook_path.write_text(hook)

# F5: reject foreign/ownerless records and stop stale sessions across awaited boundaries.
photos_path = Path('src/mobile791/modules/photos.js')
photos = photos_path.read_text()
photos = replace_once(
    photos,
    "function photoQueueRecordBelongsToProfile(record, profileId) {\n  const ownerId = String(record?.user_id || record?.uploaded_by || '').trim();\n  return Boolean(profileId && ownerId && ownerId === String(profileId));\n}\n",
    "function photoQueueRecordBelongsToProfile(record, profileId) {\n  const ownerId = String(record?.user_id || record?.uploaded_by || '').trim();\n  return Boolean(profileId && ownerId && ownerId === String(profileId));\n}\n\nfunction photoSessionIsCurrent(isSessionCurrent = () => true) {\n  try {\n    return isSessionCurrent?.() !== false;\n  } catch {\n    return false;\n  }\n}\n\nexport const PHOTO_OFFLINE_TESTING = Object.freeze({\n  recordBelongsToProfile: photoQueueRecordBelongsToProfile,\n  sessionIsCurrent: photoSessionIsCurrent,\n});\n",
    'photo session helper',
)
photos = replace_once(
    photos,
    """  onPhotoUploaded,
}) {
  const localPreviewUrl = queuedPhoto.local_preview_url || queuedPhoto.image_url || '';
  const photoForUi = await createServerPhotoForUi({ supabase, supabaseUrl, serverPhoto, queuedPhoto, localPreviewUrl });
  applyUploadedPhoto({""",
    """  onPhotoUploaded,
  isSessionCurrent = () => true,
}) {
  if (!photoSessionIsCurrent(isSessionCurrent)) return null;
  const localPreviewUrl = queuedPhoto.local_preview_url || queuedPhoto.image_url || '';
  const photoForUi = await createServerPhotoForUi({ supabase, supabaseUrl, serverPhoto, queuedPhoto, localPreviewUrl });
  if (!photoSessionIsCurrent(isSessionCurrent)) return null;
  applyUploadedPhoto({""",
    'reconcile session guard',
)
photos = replace_once(
    photos,
    """  onPhotoUploaded,
  onPhotoUploadError,
}) {
  if (!supabase || !profile || !queuedPhoto?.__localFile) return null;

  const allowLegacyNameplate""",
    """  onPhotoUploaded,
  onPhotoUploadError,
  isSessionCurrent = () => true,
}) {
  if (!supabase || !profile || !queuedPhoto?.__localFile || !photoSessionIsCurrent(isSessionCurrent)) return null;
  if (!photoQueueRecordBelongsToProfile(queuedPhoto, profile?.id)) return null;

  const allowLegacyNameplate""",
    'perform upload signature/session guard',
)

for old, new, label in [
    ('queuedPhoto = await ensureQueuedPhotoIdentity(queuedPhoto);\n  const jobId', 'queuedPhoto = await ensureQueuedPhotoIdentity(queuedPhoto);\n  if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n  const jobId', 'after identity'),
    ('    allowLegacyNameplate,\n  });\n  if (existingServerPhoto)', '    allowLegacyNameplate,\n  });\n  if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n  if (existingServerPhoto)', 'after existing lookup'),
    ('  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });\n\n  if (!uploaderId)', '  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });\n  if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n\n  if (!uploaderId)', 'after uploader auth'),
    ('  await updatePhotoQueueItem(localPhotoId, uploadingPatch);\n\n  let storagePath', '  await updatePhotoQueueItem(localPhotoId, uploadingPatch);\n  if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n\n  let storagePath', 'after uploading patch'),
    ('      preparedResult = await compressImageFn(queuedPhoto.__localFile);\n      uploadFile', '      preparedResult = await compressImageFn(queuedPhoto.__localFile);\n      if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n      uploadFile', 'after compression'),
    ('    await updatePhotoQueueItem(localPhotoId, { planned_storage_path: storagePath, ...preparedPatch });\n\n    const { error: uploadError }', '    await updatePhotoQueueItem(localPhotoId, { planned_storage_path: storagePath, ...preparedPatch });\n    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n\n    const { error: uploadError }', 'before storage'),
    ("      .upload(storagePath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type || 'image/jpeg' });\n    if (uploadError", "      .upload(storagePath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type || 'image/jpeg' });\n    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n    if (uploadError", 'after storage'),
    ("      lease_until: new Date(Date.now() + PHOTO_UPLOAD_LEASE_MS).toISOString(),\n    });\n\n    if (uploadError", "      lease_until: new Date(Date.now() + PHOTO_UPLOAD_LEASE_MS).toISOString(),\n    });\n    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n\n    if (uploadError", 'after storage stage'),
    ('    const insertResult = await supabase\n', '    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n    const insertResult = await supabase\n', 'before db insert'),
    ("      .single();\n\n    if (insertResult.error)", "      .single();\n    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n\n    if (insertResult.error)", 'after db insert'),
    ('    const signedUrl = await getSignedPhotoUrl({ storagePath: finalStoragePath, fallbackUrl: insertedPhoto.image_url || localPreviewUrl, supabase });\n    const photoForUi', '    const signedUrl = await getSignedPhotoUrl({ storagePath: finalStoragePath, fallbackUrl: insertedPhoto.image_url || localPreviewUrl, supabase });\n    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n    const photoForUi', 'after signed url'),
    ('  } catch (error) {\n    const waitingForInternet', '  } catch (error) {\n    if (!photoSessionIsCurrent(isSessionCurrent)) return null;\n    const waitingForInternet', 'stale catch short circuit'),
]:
    photos = replace_once(photos, old, new, label)

# Reconciliation calls inside performQueuedPhotoUpload use the same guard.
perform_start = photos.index('async function performQueuedPhotoUpload({')
perform_end = photos.index('async function uploadQueuedPhoto', perform_start)
perform = photos[perform_start:perform_end]
perform = perform.replace('      onPhotoUploaded,\n    });', '      onPhotoUploaded,\n      isSessionCurrent,\n    });')
perform = perform.replace('          onPhotoUploaded,\n        });', '          onPhotoUploaded,\n          isSessionCurrent,\n        });')
photos = photos[:perform_start] + perform + photos[perform_end:]

# Restore path checks the same generation after server reads and reconciles through guarded setters.
photos = replace_once(
    photos,
    '      photo = await ensureQueuedPhotoIdentity(photo);\n      const serverPhoto',
    '      photo = await ensureQueuedPhotoIdentity(photo);\n      if (!photoSessionIsCurrent(isSessionCurrent)) return hydratedPhotos;\n      const serverPhoto',
    'restore after identity',
)
photos = replace_once(
    photos,
    '        allowLegacyNameplate,\n      });\n      if (serverPhoto) {\n        await reconcileQueuedPhotoFromServer({',
    '        allowLegacyNameplate,\n      });\n      if (!photoSessionIsCurrent(isSessionCurrent)) return hydratedPhotos;\n      if (serverPhoto) {\n        await reconcileQueuedPhotoFromServer({',
    'restore after server read',
)
photos = replace_once(
    photos,
    '          setJobs,\n          setSelectedJob,\n          onPhotoUploaded,\n        });\n        continue;',
    '          setJobs: guardedSetJobs,\n          setSelectedJob: guardedSetSelectedJob,\n          onPhotoUploaded: (...args) => { if (photoSessionIsCurrent(isSessionCurrent)) onPhotoUploaded?.(...args); },\n          isSessionCurrent,\n        });\n        if (!photoSessionIsCurrent(isSessionCurrent)) return hydratedPhotos;\n        continue;',
    'restore guarded reconcile',
)

# Resume path checks after each read/claim and passes the guard into reconciliation/upload.
photos = replace_once(photos, '  for (const queuedRecord of records) {\n    if (isBrowserOffline()) break;', '  for (const queuedRecord of records) {\n    if (isBrowserOffline() || !photoSessionIsCurrent(isSessionCurrent)) break;', 'resume loop guard')
photos = replace_once(photos, '    const record = await claimPhotoQueueItem(queuedRecord.id, { leaseMs: PHOTO_UPLOAD_LEASE_MS, force: includeErrors });\n    if (!record)', '    const record = await claimPhotoQueueItem(queuedRecord.id, { leaseMs: PHOTO_UPLOAD_LEASE_MS, force: includeErrors });\n    if (!photoSessionIsCurrent(isSessionCurrent)) break;\n    if (!record)', 'after queue claim')
photos = replace_once(photos, '    queuedPhoto = await ensureQueuedPhotoIdentity(queuedPhoto);\n\n    const serverPhoto', '    queuedPhoto = await ensureQueuedPhotoIdentity(queuedPhoto);\n    if (!photoSessionIsCurrent(isSessionCurrent)) break;\n\n    const serverPhoto', 'resume after identity')
photos = replace_once(photos, '      allowLegacyNameplate,\n    });\n    if (serverPhoto) {\n      await reconcileQueuedPhotoFromServer({', '      allowLegacyNameplate,\n    });\n    if (!photoSessionIsCurrent(isSessionCurrent)) break;\n    if (serverPhoto) {\n      await reconcileQueuedPhotoFromServer({', 'resume after server read')
photos = replace_once(photos, '        setJobs,\n        setSelectedJob,\n        onPhotoUploaded,\n      });\n      processed', '        setJobs: guardedSetJobs,\n        setSelectedJob: guardedSetSelectedJob,\n        onPhotoUploaded: guardedOnPhotoUploaded,\n        isSessionCurrent,\n      });\n      if (!photoSessionIsCurrent(isSessionCurrent)) break;\n      processed', 'resume guarded reconcile')
photos = replace_once(photos, '      onPhotoUploadError: guardedOnPhotoUploadError,\n    });\n    processed', '      onPhotoUploadError: guardedOnPhotoUploadError,\n      isSessionCurrent,\n    });\n    if (!photoSessionIsCurrent(isSessionCurrent)) break;\n    processed', 'resume upload predicate')
photos = replace_once(photos, '  onQueueStart?.();\n', '  if (photoSessionIsCurrent(isSessionCurrent)) onQueueStart?.();\n', 'queue start guard')

# Manual normal-photo, documentation-photo, and retry APIs expose the same predicate.
for marker in ['export async function uploadJobPhotos({', 'export async function uploadJobDocumentationPhotos({', 'export function retryQueuedJobPhoto({']:
    start = photos.index(marker)
    end = photos.index('}) {', start)
    block = photos[start:end]
    if 'isSessionCurrent' not in block:
        block = block.replace('  onPhotoUploadError,\n', '  onPhotoUploadError,\n  isSessionCurrent = () => true,\n')
        photos = photos[:start] + block + photos[end:]

# Normal photo upload: do not start or continue after session change; pass predicate to background upload.
normal_start = photos.index('export async function uploadJobPhotos({')
normal_end = photos.index('export async function uploadJobDocumentationPhotos({', normal_start)
normal = photos[normal_start:normal_end]
normal = normal.replace('  if (!supabase || !profile) return;', '  if (!supabase || !profile || !photoSessionIsCurrent(isSessionCurrent)) return;', 1)
normal = normal.replace('  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });\n  if (!uploaderId)', '  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });\n  if (!photoSessionIsCurrent(isSessionCurrent)) return { queuedCount: 0, uploadedCount: 0, failedCount: 0, ignoredStaleSession: true };\n  if (!uploaderId)', 1)
normal = normal.replace('  const queuedCandidates = await Promise.all(files.map((file) => createQueuedPhoto({ file, jobId, profile, uploaderId })));\n', '  const queuedCandidates = await Promise.all(files.map((file) => createQueuedPhoto({ file, jobId, profile, uploaderId })));\n  if (!photoSessionIsCurrent(isSessionCurrent)) return { queuedCount: 0, uploadedCount: 0, failedCount: 0, ignoredStaleSession: true };\n', 1)
normal = normal.replace('        onPhotoUploadError,\n      });', '        onPhotoUploadError,\n        isSessionCurrent,\n      });', 1)
photos = photos[:normal_start] + normal + photos[normal_end:]

# Documentation/nameplate upload has identical session rules.
doc_start = photos.index('export async function uploadJobDocumentationPhotos({')
doc_end = photos.index('export async function restorePersistedJobPhotos', doc_start)
doc = photos[doc_start:doc_end]
doc = doc.replace('  if (!supabase || !profile || !jobId) return { uploadedCount: 0, queuedCount: 0, failedCount: 0, photos: [] };', '  if (!supabase || !profile || !jobId || !photoSessionIsCurrent(isSessionCurrent)) return { uploadedCount: 0, queuedCount: 0, failedCount: 0, photos: [], ignoredStaleSession: true };')
doc = doc.replace('  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });\n  if (!uploaderId)', '  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });\n  if (!photoSessionIsCurrent(isSessionCurrent)) return { uploadedCount: 0, queuedCount: 0, failedCount: 0, photos: [], ignoredStaleSession: true };\n  if (!uploaderId)', 1)
doc = doc.replace('  const queuedPhotos = [...new Map(queuedCandidates.map((photo) => [String(photo.id), photo])).values()];\n', '  if (!photoSessionIsCurrent(isSessionCurrent)) return { uploadedCount: 0, queuedCount: 0, failedCount: 0, photos: [], ignoredStaleSession: true };\n  const queuedPhotos = [...new Map(queuedCandidates.map((photo) => [String(photo.id), photo])).values()];\n', 1)
doc = doc.replace('      onPhotoUploadError,\n    });', '      onPhotoUploadError,\n      isSessionCurrent,\n    });')
doc = doc.replace('            onPhotoUploadError,\n          });', '            onPhotoUploadError,\n            isSessionCurrent,\n          });')
photos = photos[:doc_start] + doc + photos[doc_end:]

# Manual retry uses the same identity guard.
retry_start = photos.index('export function retryQueuedJobPhoto({')
retry = photos[retry_start:]
retry = retry.replace('  if (!isLocalQueuedPhoto(photo)) return false;', '  if (!isLocalQueuedPhoto(photo) || !photoSessionIsCurrent(isSessionCurrent)) return false;', 1)
retry = retry.replace('    const records = await listPhotoQueueItems();\n', '    const records = await listPhotoQueueItems();\n    if (!photoSessionIsCurrent(isSessionCurrent)) return;\n', 1)
retry = retry.replace('      onPhotoUploadError,\n    });', '      onPhotoUploadError,\n      isSessionCurrent,\n    });', 1)
photos = photos[:retry_start] + retry
photos_path.write_text(photos)

# Mobile UI actions capture the current session identity in a mutable ref so old async closures observe account changes.
actions_path = Path('src/mobile791/hooks/useSelectedJobActions.js')
actions = actions_path.read_text()
actions = replace_once(
    actions,
    '  const photoDetailsSyncTimersRef = useRef(new Map());\n',
    "  const photoDetailsSyncTimersRef = useRef(new Map());\n  const photoSessionIdentityRef = useRef('');\n  photoSessionIdentityRef.current = `${String(sessionUser?.id || '')}:${String(profile?.id || '')}`;\n\n  function capturePhotoSessionGuard() {\n    const identity = photoSessionIdentityRef.current;\n    return () => Boolean(identity) && photoSessionIdentityRef.current === identity;\n  }\n",
    'mobile action photo session ref',
)
for fn in ['uploadJobPhotos', 'uploadJobDocumentationPhotos', 'retryQueuedJobPhoto']:
    pattern = re.compile(rf'({fn}\(\{{\n\s*supabase,\n\s*profile,\n)')
    def add_guard(match):
        last_line = match.group(1).splitlines()[-1]
        indent = re.match(r'\s*', last_line).group(0)
        return match.group(1) + indent + 'isSessionCurrent: capturePhotoSessionGuard(),\n'
    actions, count = pattern.subn(add_guard, actions)
    if count < 1:
        raise SystemExit(f'{fn}: no mobile call patched')
actions_path.write_text(actions)

# Behavioral regressions for F5/F8/F9 plus prior F3 counterexample.
smoke_path = Path('scripts/smoke-audit-fixes-v1086.mjs')
smoke = smoke_path.read_text()
smoke = smoke.replace(
    "assert.equal(session.includes('const requestEntry = { request, requestId };'), true, 'actual fetch must own requestId');",
    "assert.equal(session.includes('return getOrCreateRefreshPayloadRequest('), true, 'refresh hook must use request-entry contract helper');",
    1,
)
smoke = replace_once(
    smoke,
    "import { fileURLToPath, pathToFileURL } from 'node:url';\n",
    "import { fileURLToPath, pathToFileURL } from 'node:url';\nimport { getOrCreateRefreshPayloadRequest, persistedSnapshotCoversCursor } from '../src/mobile791/modules/sync-contract-v1086.js';\nimport { PHOTO_OFFLINE_TESTING } from '../src/mobile791/modules/photos.js';\n",
    'smoke behavior imports',
)
behavior = """
assert.equal(PHOTO_OFFLINE_TESTING.recordBelongsToProfile({ uploaded_by: 'A' }, 'A'), true);
assert.equal(PHOTO_OFFLINE_TESTING.recordBelongsToProfile({ uploaded_by: 'A' }, 'B'), false);
assert.equal(PHOTO_OFFLINE_TESTING.recordBelongsToProfile({}, 'B'), false);
let currentPhotoSession = true;
assert.equal(PHOTO_OFFLINE_TESTING.sessionIsCurrent(() => currentPhotoSession), true);
currentPhotoSession = false;
assert.equal(PHOTO_OFFLINE_TESTING.sessionIsCurrent(() => currentPhotoSession), false);

const registry = new Map();
let resolveOld;
const oldPromise = new Promise((resolve) => { resolveOld = resolve; });
const r1 = getOrCreateRefreshPayloadRequest(registry, 'same-fetch', 1, () => oldPromise);
let unexpectedFactoryRuns = 0;
const r3 = getOrCreateRefreshPayloadRequest(registry, 'same-fetch', 3, () => { unexpectedFactoryRuns += 1; return Promise.resolve('wrong'); });
assert.equal(r3, r1, 'caller joining R1 must receive R1 entry');
assert.equal(r3.requestId, 1, 'joined R1 payload must keep R1 requestId, not caller R3 id');
assert.equal(unexpectedFactoryRuns, 0, 'joining an existing fetch must not start another fetch');
resolveOld('old');
await r1.request;

assert.equal(persistedSnapshotCoversCursor({ change_cursor: 9 }, 10), false, 'older persisted cursor must not authorize advancing memory cursor');
assert.equal(persistedSnapshotCoversCursor({ change_cursor: 10 }, 10), true, 'same persisted cursor confirms atomic commit');
assert.equal(persistedSnapshotCoversCursor({ change_cursor: 11 }, 10), true, 'newer persisted cursor confirms atomic commit');

const performBlock = photos.slice(photos.indexOf('async function performQueuedPhotoUpload'), photos.indexOf('async function uploadQueuedPhoto'));
assert.equal((performBlock.match(/photoSessionIsCurrent\\(isSessionCurrent\\)/g) || []).length >= 8, true, 'upload must re-check session across async boundaries');
assert.equal(performBlock.includes('if (!photoQueueRecordBelongsToProfile(queuedPhoto, profile?.id)) return null;'), true, 'upload must reject foreign/ownerless queue records');
const resumeBlock = photos.slice(photos.indexOf('async function runPersistedPhotoUploads'), photos.indexOf('export function resumePersistedPhotoUploads'));
assert.equal(resumeBlock.includes('isSessionCurrent,'), true, 'resume must propagate current-session predicate into upload/reconcile');
"""
smoke = replace_once(
    smoke,
    "console.log('GO: 10.86 F3/F5/F8/F9 regressions are present and F3 counterexample is closed.');\n",
    behavior + "\nconsole.log('GO: 10.86 F3/F5/F8/F9 behavioral contracts are closed.');\n",
    'append behavior contracts',
)
smoke_path.write_text(smoke)

print('Applied final 10.86 session/sync hardening.')
