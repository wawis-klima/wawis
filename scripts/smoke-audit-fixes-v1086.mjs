import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getOrCreateRefreshPayloadRequest, persistedSnapshotCoversCursor } from '../src/mobile791/modules/sync-contract-v1086.js';
import { PHOTO_OFFLINE_TESTING } from '../src/mobile791/modules/photos.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

for (const file of ['src/modules/auth.js', 'src/mobile791/modules/auth.js']) {
  const source = read(file);
  assert.equal(source.includes("} catch (error) {\n      if (disposed || !isAuthOperationCurrent(verificationToken)) return;"), true, file + ': late SIGNED_OUT catch must be generation-guarded');
}

const queue = read('src/mobile791/modules/photo-offline-queue.js');
const photos = read('src/mobile791/modules/photos.js');
const app = read('src/mobile791/App.jsx');
assert.equal(queue.includes('user_id: photo.user_id || photo.uploaded_by'), true, 'queue record must persist owner');
assert.equal(queue.includes('user_id: record.user_id || record.uploaded_by'), true, 'hydrated queue record must retain owner');
assert.equal(photos.includes('function photoQueueRecordBelongsToProfile(record, profileId)'), true, 'strict photo owner helper missing');
assert.equal(photos.includes('return Boolean(profileId && ownerId && ownerId === String(profileId));'), true, 'ownerless/foreign photos must not enter another profile');
assert.equal(photos.includes("!record.uploaded_by || String(record.uploaded_by) === profileId"), false, 'legacy ownerless cross-account filter still present');
assert.equal(photos.includes('const persistedQueueResumePromises = new Map();'), true, 'resume promise must be per-profile');
assert.equal(photos.includes('isSessionCurrent = () => true'), true, 'photo restore/resume must accept session guard');
assert.equal(app.includes('const sessionToken = captureCurrentSessionToken(userId);'), true, 'App must capture queue session generation');
assert.equal(app.includes('isSessionCurrent: isQueueSessionCurrent'), true, 'App must pass queue session guard');

const session = read('src/mobile791/hooks/useAppSession.js');
assert.equal(session.includes('return getOrCreateRefreshPayloadRequest('), true, 'refresh hook must use request-entry contract helper');
assert.equal(session.includes('payloadRequestId = payloadRequest.requestId;'), true, 'payload must carry actual fetch requestId');
assert.equal(session.includes('lastAppliedServerRequestIdRef.current = payloadRequestId;'), true, 'final apply must use fetch requestId');
assert.equal(session.includes('const snapshotSaved = await saveOfflineAppSnapshot({'), true, 'delta sync must observe atomic snapshot result');
assert.equal(session.includes('cachePersistFailed: true'), true, 'failed snapshot must produce retryable result');
const changedStart = session.indexOf('const refreshChanged = useCallback');
const changedEnd = session.indexOf('async function login(credentials = {})', changedStart);
const changedBlock = session.slice(changedStart, changedEnd);
assert.equal(changedBlock.includes('updateOfflineSyncCursor('), false, 'refreshChanged must not advance a separate cursor after failed snapshot persistence');

const authModule = await import(pathToFileURL(path.join(root, 'src/modules/auth.js')).href + '?v1086=' + Date.now());
authModule.AUTH_OPERATION_TESTING.reset();
let authCallback;
let rejectGetSession;
let loggedOut = 0;
const pendingGetSession = new Promise((_, reject) => { rejectGetSession = reject; });
const supabase = { auth: {
  onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
  getSession() { return pendingGetSession; },
  refreshSession() { return Promise.resolve({ data: { session: null }, error: null }); },
} };
const oldWindow = globalThis.window;
const oldSessionStorage = globalThis.sessionStorage;
globalThis.window = { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {} };
globalThis.sessionStorage = { getItem() { return null; }, removeItem() {} };
try {
  authModule.subscribeToAuthState({ supabase, logoutFlagKey: 'logout', applyLoggedOutState: () => { loggedOut += 1; }, setSessionUser() {}, setAuthResolved() {}, refreshAll() {} });
  authCallback('SIGNED_OUT', null);
  await Promise.resolve();
  authCallback('SIGNED_IN', { user: { id: 'user-b' } });
  rejectGetSession(new Error('late hard failure from old SIGNED_OUT'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(loggedOut, 0, 'late SIGNED_OUT verification from account A must not log out account B');
} finally {
  globalThis.window = oldWindow;
  globalThis.sessionStorage = oldSessionStorage;
}


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
assert.equal((performBlock.match(/photoSessionIsCurrent\(isSessionCurrent\)/g) || []).length >= 8, true, 'upload must re-check session across async boundaries');
assert.equal(performBlock.includes('if (!photoQueueRecordBelongsToProfile(queuedPhoto, profile?.id)) return null;'), true, 'upload must reject foreign/ownerless queue records');
const resumeBlock = photos.slice(photos.indexOf('async function runPersistedPhotoUploads'), photos.indexOf('export function resumePersistedPhotoUploads'));
assert.equal(resumeBlock.includes('isSessionCurrent,'), true, 'resume must propagate current-session predicate into upload/reconcile');

console.log('GO: 10.86 F3/F5/F8/F9 behavioral contracts are closed.');
