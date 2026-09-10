const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const modalPath = path.join(root, 'src', 'components', 'modals', 'JobFormModal.jsx');
const stylesPath = path.join(root, 'src', 'styles.css');
const jobDevicesPath = path.join(root, 'src', 'modules', 'job-devices.js');
const jobsFormPath = path.join(root, 'src', 'modules', 'jobs-form.js');

const modalSource = fs.readFileSync(modalPath, 'utf8');
const stylesSource = fs.readFileSync(stylesPath, 'utf8');
const jobDevicesSource = fs.readFileSync(jobDevicesPath, 'utf8');
const jobsFormSource = fs.readFileSync(jobsFormPath, 'utf8');

assert.match(jobDevicesSource, /DEVICE_TYPE_SINGLE\s*=\s*'single-split'/);
assert.match(jobDevicesSource, /DEVICE_TYPE_MULTI\s*=\s*'multi-split'/);
assert.match(jobDevicesSource, /function normalizeIndoorSerialPlaceholders/);
assert.match(jobDevicesSource, /export function getDeviceType/);
assert.match(jobsFormSource, /device_type: DEVICE_TYPE_SINGLE/);
assert.match(modalSource, /function updateDeviceType\(index, type\)/);
assert.match(modalSource, /Single-split/);
assert.match(modalSource, /Multi-split/);
assert.match(modalSource, /role="group"/);
assert.match(modalSource, /jobDeviceTypeToggle/);
assert.match(modalSource, /jobIndoorUnitsBlock\$\{isMultiSplit \? ' multi' : ' single'\}/);
assert.match(modalSource, /indoorSerials\.length >= MAX_INDOOR_UNITS_PER_DEVICE/);
assert.match(stylesSource, /\.jobDeviceTypeBlock/);
assert.match(stylesSource, /\.jobDeviceTypeOption\.active/);
assert.match(stylesSource, /\.jobIndoorUnitsBlock\.single/);
assert.match(stylesSource, /\.jobIndoorUnitsBlock\.multi/);

(async () => {
  const jobDevices = await import(pathToFileURL(jobDevicesPath).href);

  assert.equal(jobDevices.DEVICE_TYPE_SINGLE, 'single-split');
  assert.equal(jobDevices.DEVICE_TYPE_MULTI, 'multi-split');

  const emptyDevice = jobDevices.createEmptyJobDevice();
  assert.equal(emptyDevice.device_type, jobDevices.DEVICE_TYPE_SINGLE);
  assert.deepEqual(jobDevices.getDeviceIndoorSerials(emptyDevice, { keepEmpty: true }), ['']);

  const multiDraft = jobDevices.normalizeJobDevices({
    devices: [{
      model: 'Multi w formularzu',
      device_type: jobDevices.DEVICE_TYPE_MULTI,
      indoor_serial_numbers: ['', ''],
      outdoor_serial_number: '',
    }],
  }, { keepEmptyRow: true, keepEmptyIndoor: true });
  assert.equal(jobDevices.getDeviceType(multiDraft[0]), jobDevices.DEVICE_TYPE_MULTI);
  assert.deepEqual(multiDraft[0].indoor_serial_numbers, ['', '']);
  assert.deepEqual(jobDevices.getDeviceIndoorSerials(multiDraft[0], { keepEmpty: true }), ['', '']);

  const parsedMulti = jobDevices.parseDeviceSerialLine('JW1: IN-1 | JW2: IN-2 | JZ: OUT-1');
  assert.equal(jobDevices.getDeviceType(parsedMulti), jobDevices.DEVICE_TYPE_MULTI);

  const parsedSingle = jobDevices.parseDeviceSerialLine('JW: IN-1 | JZ: OUT-1');
  assert.equal(jobDevices.getDeviceType(parsedSingle), jobDevices.DEVICE_TYPE_SINGLE);

  const legacyDraft = jobDevices.normalizeJobDevices({
    device_model: 'Stary model',
    device_serial_number: 'LEGACY-123',
  }, { keepEmptyRow: true, keepEmptyIndoor: true });
  assert.equal(legacyDraft[0].legacy_serial_number, 'LEGACY-123');
  assert.equal(legacyDraft[0].serial_number, 'LEGACY-123');
  assert.deepEqual(jobDevices.getDeviceIndoorSerials(legacyDraft[0], { keepEmpty: true }), ['']);

  const serialized = jobDevices.serializeJobDevicesToFields({
    devices: [{
      model: 'Rotenso multi',
      device_type: jobDevices.DEVICE_TYPE_MULTI,
      indoor_serial_numbers: ['IN-1', '', 'IN-2'],
      outdoor_serial_number: 'OUT-1',
    }],
  });
  assert.equal(serialized.devices[0].device_type, jobDevices.DEVICE_TYPE_MULTI);
  assert.deepEqual(serialized.devices[0].indoor_serial_numbers, ['IN-1', 'IN-2']);
  assert.equal(serialized.device_serial_number, 'JW1: IN-1 | JW2: IN-2 | JZ: OUT-1');

  console.log('Smoke OK: device type switch single-split/multi-split is wired and preserves multi placeholders');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
