import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithTimeout, resolveSupabaseRequestTimeoutMs } from '../src/mobile791/modules/request-timeout.js';
import { isTransientSupabaseError } from '../src/mobile791/modules/supabase-errors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const hungFetch = (_input, init = {}) => new Promise((resolve, reject) => {
  const rejectAbort = () => reject(init.signal?.reason || Object.assign(new Error('aborted'), { name: 'AbortError' }));
  if (init.signal?.aborted) rejectAbort();
  else init.signal?.addEventListener?.('abort', rejectAbort, { once: true });
  void resolve;
});

const startedAt = Date.now();
let timeoutError = null;
try {
  await fetchWithTimeout('https://example.test/rest/v1/jobs', {}, { timeoutMs: 25, fetchImpl: hungFetch });
} catch (error) {
  timeoutError = error;
}
assert(timeoutError, 'Zawieszony fetch musi zakończyć się timeoutem.');
assert.equal(timeoutError.code, 'SUPABASE_REQUEST_TIMEOUT');
assert.equal(timeoutError.name, 'AbortError');
assert.equal(isTransientSupabaseError(timeoutError), true, 'Timeout/abort musi trafić do retry, nie do trwałego błędu.');
assert(Date.now() - startedAt < 1000, 'Testowy timeout nie może pozostawić nierozwiązanej obietnicy.');
assert(resolveSupabaseRequestTimeoutMs('https://x.supabase.co/storage/v1/object/job-photos/a.jpg') > resolveSupabaseRequestTimeoutMs('https://x.supabase.co/rest/v1/jobs'));

const storeSource = read('src', 'mobile791', 'modules', 'job-offline-store.js');
const queueMatch = storeSource.match(/async function putOfflineJobOperationAtomically[\s\S]*?export async function recoverStaleOfflineJobOperations/);
assert(queueMatch, 'Brak atomowego zapisu kolejki offline.');
const atomicSource = queueMatch[0];
assert.match(atomicSource, /db\.transaction\(OPERATION_STORE, 'readwrite'\)/);
assert.match(atomicSource, /objectStore\.getAll\(\)/);
assert.match(atomicSource, /transaction\.abort\(\)/);
assert.match(atomicSource, /objectStore\.delete\(item\.id\)/);
assert.match(atomicSource, /objectStore\.put\(finalRecord\)/);
assert.doesNotMatch(atomicSource, /await withStore\(OPERATION_STORE, 'readwrite', \(store\) => store\.delete/);

const mobileSupabase = read('src', 'mobile791', 'lib', 'supabase.js');
assert.match(mobileSupabase, /createTimedSupabaseFetch/);
assert.match(mobileSupabase, /global: \{ fetch: timedSupabaseFetch \}/);
const photosSource = read('src', 'mobile791', 'modules', 'photos.js');
assert.match(photosSource, /abort\|timed out\|timeout/);

console.log('OK: v10.75 ma atomową kolejkę offline i abortowalne timeouty requestów Supabase.');
