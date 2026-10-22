import assert from 'node:assert/strict';
import fs from 'node:fs';
import { overlayPendingDeviceOperation } from '../src/mobile791/modules/job-pending-device-overlay.js';

const oldServer = { id: 'job-a', device_model: null, device_serial_number: null, status: 'W trakcie' };
const pending = [{
  user_id: 'u1', job_id: 'job-a', type: 'device', status: 'pending',
  base: { device_model: '', device_serial_number: '' },
  payload: { device_fields: { device_model: 'Rotenso iMoto', device_serial_number: 'TEST123' } },
}];
const overlay = overlayPendingDeviceOperation(oldServer, pending);
assert.equal(overlay.device_model, 'Rotenso iMoto', 'pending local device should survive server refresh');
assert.equal(overlay.offline_pending, true);
assert.equal(oldServer.device_model, null, 'input object must not be mutated');
assert.equal(overlayPendingDeviceOperation({ ...oldServer, device_model: 'Rotenso iMoto', device_serial_number: 'TEST123' }, pending).offline_pending, true);
assert.equal(overlayPendingDeviceOperation({ ...oldServer, device_model: 'Other by colleague' }, pending).device_model, 'Other by colleague', 'must not hide remote conflict');
assert.equal(overlayPendingDeviceOperation(oldServer, [{ ...pending[0], status: 'conflict' }]).device_model, null);
assert.equal(overlayPendingDeviceOperation(oldServer, [{ ...pending[0], job_id: 'other-job' }]).device_model, null);
assert.equal(overlayPendingDeviceOperation(oldServer, []).device_model, null);

const app = fs.readFileSync(new URL('../src/mobile791/App.jsx', import.meta.url), 'utf8');
const photos = fs.readFileSync(new URL('../src/mobile791/modules/photos.js', import.meta.url), 'utf8');
assert.match(app, /jobId: requestedJobId,[\s\S]*?onQueueStart:/, 'manual card sync must pass selected jobId');
assert.match(app, /const mergeWithPending = \(job\) => overlayPendingDeviceOperation\(/, 'details reload must overlay pending local device');
assert.match(app, /const nextJob = overlayPendingDeviceOperation\(/, 'summary reload must overlay pending local device');
assert.match(photos, /const selectedJobId = String\(jobId \|\| ''\)\.trim\(\);/, 'photo queue must accept selected job ID');
assert.match(photos, /!selectedJobId \|\| String\(record\.job_id \|\| ''\) === selectedJobId/, 'photo queue must restrict retry to selected job');
assert.match(photos, /if \(existing && !requestedJobId\)/, 'manual retry must not await global worker belonging to unrelated jobs');
console.log('13.47 selected job priority and pending device overlay smoke PASS');
