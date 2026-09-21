import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProtocolSaveTimeoutError,
  PROTOCOL_SAVE_TOTAL_TIMEOUT_MS,
  withProtocolSaveTimeout,
} from '../src/mobile791/modules/protocol-save-timeout.js';
import { JOB_PROTOCOLS_TABLE, storeJobProtocol } from '../src/mobile791/modules/job-protocol-storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modalSource = fs.readFileSync(path.join(root, 'src/mobile791/components/modals/ProtocolTestModal.jsx'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src/mobile791/modules/job-protocol-storage.js'), 'utf8');
const timeoutSource = fs.readFileSync(path.join(root, 'src/mobile791/modules/protocol-save-timeout.js'), 'utf8');

assert.match(modalSource, /withProtocolSaveTimeout\(saveOperation/);
assert.match(modalSource, /timeoutMs: PROTOCOL_SAVE_TOTAL_TIMEOUT_MS/);
assert.match(modalSource, /logDiagnostic\("protocol\.save\.timeout"/);
assert.match(modalSource, /finally\s*\{[\s\S]*?setIsGenerating\(false\)/);
assert.match(timeoutSource, /Ekran został odblokowany/);
assert.doesNotMatch(
  storageSource,
  /const saved = await loadJobProtocolRecord/,
  'Protocol storage must not read the record again after a successful write.',
);
assert.match(storageSource, /\.insert\(row\)[\s\S]*?\.select\(PROTOCOL_RECORD_COLUMNS\)[\s\S]*?\.single\(\)/);
assert.match(storageSource, /\.update\(row\)[\s\S]*?\.select\(PROTOCOL_RECORD_COLUMNS\)[\s\S]*?\.single\(\)/);

let timeoutCallbackCalled = false;
const startedAt = Date.now();
await assert.rejects(
  () => withProtocolSaveTimeout(new Promise(() => {}), {
    phase: () => 'test-phase',
    timeoutMs: 25,
    onTimeout: () => { timeoutCallbackCalled = true; },
  }),
  (error) => {
    assert.equal(isProtocolSaveTimeoutError(error), true);
    assert.equal(error.code, 'PROTOCOL_SAVE_TIMEOUT');
    assert.equal(error.phase, 'test-phase');
    assert.equal(error.timeoutMs, 25);
    return true;
  },
);
assert.equal(timeoutCallbackCalled, true);
assert.ok(Date.now() - startedAt < 500, 'Timeout guard did not settle promptly.');
assert.equal(PROTOCOL_SAVE_TOTAL_TIMEOUT_MS, 45_000);

const hangingUploadSupabase = {
  auth: {
    async getSession() {
      return { data: { session: { user: { id: 'worker-timeout' } } }, error: null };
    },
  },
  from(table) {
    assert.equal(table, JOB_PROTOCOLS_TABLE);
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: null, error: null }; },
    };
  },
  storage: {
    from() {
      return {
        upload() { return new Promise(() => {}); },
        async remove() { return { data: null, error: null }; },
      };
    },
  },
};

await assert.rejects(
  () => storeJobProtocol({
    supabase: hangingUploadSupabase,
    job: { id: '11111111-1111-4111-8111-111111111111', status: 'Zakończone' },
    pdfBlob: new Blob(['%PDF-1.4 timeout test'], { type: 'application/pdf' }),
    fileName: 'timeout-test.pdf',
    timeoutMs: 25,
    uploadTimeoutMs: 25,
  }),
  (error) => {
    assert.equal(isProtocolSaveTimeoutError(error), true);
    assert.equal(error.phase, 'upload');
    return true;
  },
);

console.log('PASS smoke-mobile-protocol-save-v1011');
