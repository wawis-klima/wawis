import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSessionGenerationState, transitionSessionGeneration, captureSessionGeneration, isSessionGenerationCurrent } from '../src/mobile791/modules/session-generation.js';
import { fetchWithTimeout } from '../src/mobile791/modules/request-timeout.js';

const state = createSessionGenerationState();
transitionSessionGeneration(state, 'user-a');
const tokenA = captureSessionGeneration(state, 'user-a');
let applied = 'none';
const lateA = new Promise((resolve) => setTimeout(() => resolve('A'), 35));
transitionSessionGeneration(state, 'user-b');
const tokenB = captureSessionGeneration(state, 'user-b');
const valueA = await lateA;
if (isSessionGenerationCurrent(state, tokenA)) applied = valueA;
if (isSessionGenerationCurrent(state, tokenB)) applied = 'B';
assert.equal(applied, 'B');
assert.equal(isSessionGenerationCurrent(state, tokenA), false);
assert.equal(isSessionGenerationCurrent(state, tokenB), true);

const bodyHungFetch = async (_input, init = {}) => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"partial":'));
      init.signal?.addEventListener?.('abort', () => controller.error(init.signal?.reason || Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
};
const response = await fetchWithTimeout('https://example.test/rest/v1/jobs', {}, { timeoutMs: 30, fetchImpl: bodyHungFetch });
let bodyTimeout = null;
try { await response.text(); } catch (error) { bodyTimeout = error; }
assert(bodyTimeout, 'Timeout musi obejmować body po nagłówkach.');
assert.equal(bodyTimeout.code, 'SUPABASE_REQUEST_TIMEOUT');
assert.equal(bodyTimeout.name, 'AbortError');

const fast = await fetchWithTimeout('https://example.test/rest/v1/jobs', {}, {
  timeoutMs: 100,
  fetchImpl: async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
});
assert.deepEqual(await fast.json(), { ok: true });

for (const path of ['src/hooks/useAppSession.js', 'src/mobile791/hooks/useAppSession.js']) {
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /createSessionGenerationState/);
  assert.match(source, /captureSessionGeneration/);
  assert.match(source, /isCurrentSession/);
  assert.match(source, /setSessionUserForGeneration/);
  assert.match(source, /ignoredStaleSession/);
  assert.match(source, /sessionToken\.generation/);
  assert.match(source, /catch \(serverError\) \{\n\s*if \(!isCurrentSession\(\)\)/);
assert.match(source, /const refreshedUser = refreshedSessionData\?\.session\?\.user \|\| null;\n\s*if \(!isCurrentSession\(\)\)/);
}
const storeSource = fs.readFileSync('src/mobile791/modules/job-offline-store.js', 'utf8');
const updateSource = storeSource.match(/export async function updateOfflineJobOperation[\s\S]*?export async function deleteOfflineJobOperation/)?.[0] || '';
assert.match(updateSource, /db\.transaction\(OPERATION_STORE, 'readwrite'\)/);
assert.match(updateSource, /const request = store\.get/);
assert.match(updateSource, /store\.put/);
assert.doesNotMatch(updateSource, /withStore\(OPERATION_STORE, 'readonly'/);
console.log('OK: 10.80 — session generation, pełny body-timeout i atomowa aktualizacja kolejki.');

const mobileHook = fs.readFileSync('src/mobile791/hooks/useAppSession.js', 'utf8');
assert.match(mobileHook, /stale-session-final-queue-guard-v1080/);
