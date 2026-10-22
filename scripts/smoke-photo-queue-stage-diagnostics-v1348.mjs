import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getSafeDiagnosticDetails } from '../src/modules/diagnostic-error-codes.js';
import { sanitizeDiagnosticEntry } from '../src/modules/diagnostic-privacy.js';

const source = fs.readFileSync(new URL('../src/mobile791/modules/photos.js', import.meta.url), 'utf8');
for (const marker of [
  "queueStage = 'hydrate'", "queueStage = 'identity'",
  "queueStage = 'server-lookup'", "queueStage = 'upload'",
  "uploadStage = 'prepare'", "uploadStage = 'body'",
  "uploadStage = 'storage'", "uploadStage = 'database'",
  "uploadStage = 'verify'", "traceQueueStageFailure('upload.claim-write'",
  "traceQueueStageFailure('upload.prepared-write'",
]) assert.ok(source.includes(marker), 'Missing instrumentation: ' + marker);

const privateData = 'customer-private-photo-path-and-serial';
for (const code of ['PHOTO_QUEUE_STAGE_FAILED', 'PHOTO_UPLOAD_BODY_INVALID', 'PHOTO_LOCAL_FILE_READ_FAILED', 'PHOTO_UPLOAD_TRANSIENT']) {
  const event = sanitizeDiagnosticEntry({
    id: 'trace-test-1234', time: new Date().toISOString(),
    type: 'photos.upload.body.failed', module: 'photos', app_version: '13.48', platform: 'mobile',
    payload: { code, retry_count: 2, message: privateData, job_id: privateData, storage_path: privateData, file: privateData },
  });
  assert.equal(event.type, 'photos.upload.body.failed');
  assert.equal(event.payload.code, code);
  assert.equal(event.payload.retry_count, 2);
  assert.equal(getSafeDiagnosticDetails(event).code, code);
  assert.equal(JSON.stringify(event).includes(privateData), false, 'Diagnostic leaked private data');
}
console.log('Photo queue stage tracing + privacy smoke PASS');
