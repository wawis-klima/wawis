import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reconcileConcurrentDeviceField, reconcileConcurrentDevicePatch } from '../src/mobile791/modules/job-device-concurrency.js';

const exactAlreadySaved = reconcileConcurrentDeviceField({ baseValue: 'A', requestedValue: 'A\nB', currentValue: 'A\nB' });
assert.deepEqual(exactAlreadySaved, { value: 'A\nB', changed: false }, 'completed previous write is idempotent');

const untouched = reconcileConcurrentDeviceField({ baseValue: 'A', requestedValue: 'A', currentValue: 'A\nB' });
assert.deepEqual(untouched, { value: 'A\nB', changed: false }, 'unchanged local value never rolls back server updates');

const appended = reconcileConcurrentDeviceField({ baseValue: 'A', requestedValue: 'A\nB\nC', currentValue: 'A\nB' });
assert.deepEqual(appended, { value: 'A\nB\nC', changed: true }, 'nonoverlapping third device appended safely');

const separateRows = reconcileConcurrentDeviceField({ baseValue: 'A\nB', requestedValue: 'A\nB-local', currentValue: 'A-remote\nB' });
assert.deepEqual(separateRows, { value: 'A-remote\nB-local', changed: true }, 'disjoint rows can be reconciled');

assert.equal(
  reconcileConcurrentDeviceField({ baseValue: 'A\nB', requestedValue: 'A\nB-local', currentValue: 'A\nB-remote' }),
  null,
  'same device row edited twice requires user review'
);
assert.equal(
  reconcileConcurrentDeviceField({ baseValue: 'A\nB', requestedValue: 'A', currentValue: 'A\nB-remote' }),
  null,
  'deleted row cannot be blindly merged'
);
assert.equal(
  reconcileConcurrentDeviceField({ baseValue: 'A', requestedValue: 'A\nX', currentValue: 'A\nY' }),
  null,
  'simultaneous different additions at same device index cannot overwrite'
);

const fields = reconcileConcurrentDevicePatch({
  fields: { device_model: 'A\nB', device_serial_number: 'S1\nS2' },
  expected: { device_model: 'A', device_serial_number: 'S1' },
  current: { device_model: 'A\nB', device_serial_number: 'S1' },
});
assert.deepEqual(fields, {
  fields: { device_serial_number: 'S1\nS2' },
  expected: { device_serial_number: 'S1' },
}, 'a model already saved should not prevent adding the serial');

const photoSource = fs.readFileSync(new URL('../src/mobile791/modules/jobs-form.js', import.meta.url), 'utf8');
const wizardSource = fs.readFileSync(new URL('../src/mobile791/components/devices/MobileDeviceWizard.jsx', import.meta.url), 'utf8');
const actionSource = fs.readFileSync(new URL('../src/mobile791/hooks/useSelectedJobActions.js', import.meta.url), 'utf8');
assert.match(photoSource, /storagePath: String\(photo\.storage_path \|\| ''\)/);
assert.match(wizardSource, /existing\?\.storagePath \|\| existing\?\.url/);
assert.match(actionSource, /loadJobNameplatePhotosData\(\{ supabase, jobId: job\.id \}\)/);
assert.match(actionSource, /select\('id,status,device_model,device_serial_number'\)/);

console.log('PASS mobile 13.29 nameplate conflict, three-device merge and saved-photo detection');
