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

// Wykonaj prawdziwy kod licznika z kreatora, nie tylko statyczny regex:
const getPhotoStateSource = wizardSource.match(/function getPhotoState\\([\\s\\S]*?\\n}\\n/)?.[0];
assert.ok(getPhotoStateSource, 'getPhotoState must remain independently testable');
const getPhotoState = new Function(`${getPhotoStateSource}\\nreturn getPhotoState;`)();
const saved = (deviceIndex, unitRef) => ({ deviceIndex, unitRef, storagePath: `fixture/job/nameplates/device-${deviceIndex + 1}_${unitRef}.jpg`, url: '', ocrStatus: 'approved' });
const existingPhotos = [
  saved(0, 'jw-1'), saved(0, 'jz'),
  saved(1, 'jw-1'), saved(1, 'jz'),
  saved(2, 'jw-1'),
];
const photoPresent = (deviceIndex, unitRef) => getPhotoState({
  pendingPhotos: [], existingPhotos, deviceIndex, unitRef,
}).hasPhoto;
assert.deepEqual(
  [0, 1, 2].map((idx) => ['jw-1', 'jz'].filter((unitRef) => photoPresent(idx, unitRef)).length),
  [2, 2, 1],
  'private-bucket photo paths without image_url must show 2/2, 2/2 and 1/2'
);
assert.equal(photoPresent(2, 'jz'), false, 'genuinely missing third JZ stays missing');
assert.equal(getPhotoState({
  pendingPhotos: [], existingPhotos: [saved(2, 'jw-1')], deviceIndex: 2, unitRef: 'jw-1',
}).verified, true, 'confirmed OCR stays confirmed without a signed preview URL');
assert.match(fs.readFileSync(new URL('../src/mobile791/components/nameplate/NameplatePhotoCapture.jsx', import.meta.url), 'utf8'), /existingPhotoPresent = false/);

console.log('PASS mobile 13.29 nameplate conflict, three-device merge and saved-photo detection');
