const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const modalPath = path.join(root, 'src', 'components', 'modals', 'JobFormModal.jsx');
const detailsPath = path.join(root, 'src', 'components', 'JobDetailsPanel.jsx');
const desktopDeviceCardsPath = path.join(root, 'src', 'components', 'desktop', 'DesktopJobDeviceCards.jsx');
const devicesPanelPath = path.join(root, 'src', 'components', 'devices', 'DevicesPanel.jsx');
const jobDevicesPath = path.join(root, 'src', 'modules', 'job-devices.js');
const devicesFetchPath = path.join(root, 'src', 'modules', 'devices-fetch.js');

const modalSource = fs.readFileSync(modalPath, 'utf8');
const detailsSource = fs.readFileSync(detailsPath, 'utf8');
const desktopDeviceCardsSource = fs.readFileSync(desktopDeviceCardsPath, 'utf8');
const devicesPanelSource = fs.readFileSync(devicesPanelPath, 'utf8');
const jobDevicesSource = fs.readFileSync(jobDevicesPath, 'utf8');
const devicesFetchSource = fs.readFileSync(devicesFetchPath, 'utf8');

assert.match(jobDevicesSource, /MAX_INDOOR_UNITS_PER_DEVICE\s*=\s*5/);
assert.match(jobDevicesSource, /indoor_serial_numbers/);
assert.match(jobDevicesSource, /JW\$\{(?:index \+ 1|unit\.unitNumber)\}/);
assert.match(modalSource, /function addIndoorUnit\(deviceIndex\)/);
assert.match(modalSource, /DEVICE_TYPE_MULTI/);
assert.match(modalSource, /function removeIndoorUnit\(deviceIndex, indoorIndex\)/);
assert.match(modalSource, /\+ Dodaj tylko jednostkę wewnętrzną/);
assert.match(modalSource, /disabled=\{indoorSerials\.length >= MAX_INDOOR_UNITS_PER_DEVICE\}/);
assert.match(detailsSource, /DesktopJobDeviceCards/);
assert.match(desktopDeviceCardsSource, /getDeviceIndoorUnits/);
assert.match(desktopDeviceCardsSource, /JW\$\{unit\.unitNumber \|\| unitOffset \+ 1\}/);
assert.match(devicesPanelSource, /function addEditIndoorUnit\(\)/);
assert.match(devicesPanelSource, /function removeEditIndoorUnit\(indoorIndex\)/);
assert.match(devicesPanelSource, /\+ Dodaj tylko jednostkę wewnętrzną/);
assert.match(devicesFetchSource, /indoor_serial_numbers: getDeviceIndoorSerials\(device\)/);

(async () => {
  const jobDevices = await import(pathToFileURL(jobDevicesPath).href);
  const devicesFetch = await import(pathToFileURL(devicesFetchPath).href);

  const parsed = jobDevices.parseDeviceSerialLine('JW1: A-001 | JW2: A-002 | JW3: A-003 | JW4: A-004 | JW5: A-005 | JZ: OUT-001');
  assert.deepEqual(parsed.indoor_serial_numbers, ['A-001', 'A-002', 'A-003', 'A-004', 'A-005']);
  assert.equal(parsed.indoor_serial_number, 'A-001');
  assert.equal(parsed.outdoor_serial_number, 'OUT-001');
  assert.equal(parsed.serial_number, 'JW1: A-001 | JW2: A-002 | JW3: A-003 | JW4: A-004 | JW5: A-005 | JZ: OUT-001');

  const serialized = jobDevices.serializeJobDevicesToFields({
    devices: [
      {
        model: 'Rotenso multi 5x',
        indoor_serial_numbers: [' IN-1 ', 'IN-2', 'IN-3'],
        outdoor_serial_number: ' OUT-1 ',
      },
      {
        model: 'Osobny komplet',
        indoor_serial_number: 'JW-1',
        outdoor_serial_number: 'JZ-1',
      },
    ],
  });

  assert.equal(serialized.device_model, 'Rotenso multi 5x\nOsobny komplet');
  assert.equal(serialized.device_serial_number, 'JW1: IN-1 | JW2: IN-2 | JW3: IN-3 | JZ: OUT-1\nJW: JW-1 | JZ: JZ-1');
  assert.equal(serialized.devices[0].indoor_serial_number, 'IN-1');
  assert.deepEqual(serialized.devices[0].indoor_serial_numbers, ['IN-1', 'IN-2', 'IN-3']);

  const normalized = devicesFetch.normalizeDeviceRecord({
    model: 'Rotenso multi',
    serial_number: serialized.devices[0].serial_number,
  });
  assert.deepEqual(normalized.indoor_serial_numbers, ['IN-1', 'IN-2', 'IN-3']);
  assert.equal(normalized.indoor_serial_number, 'IN-1');
  assert.equal(normalized.serial_number, 'JW1: IN-1 | JW2: IN-2 | JW3: IN-3 | JZ: OUT-1');

  const tooMany = jobDevices.serializeJobDevicesToFields({
    devices: [{
      model: 'Limit test',
      indoor_serial_numbers: ['1', '2', '3', '4', '5', '6'],
      outdoor_serial_number: 'OUT',
    }],
  });
  assert.equal(tooMany.devices[0].indoor_serial_numbers.length, 5);
  assert.equal(tooMany.device_serial_number, 'JW1: 1 | JW2: 2 | JW3: 3 | JW4: 4 | JW5: 5 | JZ: OUT');

  console.log('Smoke OK: multi-split indoor units are serialized, parsed and wired');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
