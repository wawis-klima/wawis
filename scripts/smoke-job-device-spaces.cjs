const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const variants = [
  {
    label: 'desktop/shared',
    jobDevicesPath: path.join(root, 'src', 'modules', 'job-devices.js'),
    modalPath: path.join(root, 'src', 'components', 'modals', 'JobFormModal.jsx'),
    mobile: false,
  },
  {
    label: 'mobile',
    jobDevicesPath: path.join(root, 'src', 'mobile791', 'modules', 'job-devices.js'),
    modalPath: path.join(root, 'src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx'),
    mobile: true,
  },
];

function verifySource({ label, jobDevicesPath, modalPath, mobile }) {
  const jobDevicesSource = fs.readFileSync(jobDevicesPath, 'utf8');
  const modalSource = fs.readFileSync(modalPath, 'utf8');

  assert.match(jobDevicesSource, /keepTypingSpaces/, `${label}: brak keepTypingSpaces`);
  assert.match(jobDevicesSource, /const normalizedInputModel = normalizeDeviceLine\(rawModel, \{ keepTypingSpaces \}\)/, `${label}: model nie zachowuje spacji podczas pisania`);
  assert.match(jobDevicesSource, /keepTypingSpaces && !parsedModel\.is_structured_model/, `${label}: brak bezpiecznego rozróżnienia modelu prostego i strukturalnego`);
  assert.match(jobDevicesSource, /normalizeIndoorSerialPlaceholders\(explicitIndoorSerials, \{ keepTypingSpaces \}\)/, `${label}: numery JW nie zachowują spacji podczas pisania`);
  if (mobile) {
    assert.match(modalSource, /onChange=\{\(e\) => updateDeviceField\(index, "outdoor_model", e\.target\.value\)\}/, `${label}: pole modelu JZ nie przekazuje surowej wartości`);
    assert.match(modalSource, /onChange=\{\(e\) => updateDeviceField\(index, "outdoor_serial_number", e\.target\.value\)\}/, `${label}: pole JZ nie przekazuje surowej wartości`);
    assert.match(modalSource, /onChange=\{\(e\) => updateIndoorUnitField\(index, indoorIndex, 'model', e\.target\.value\)\}/, `${label}: pole modelu JW nie przekazuje surowej wartości`);
    assert.match(modalSource, /onChange=\{\(e\) => updateIndoorUnitField\(index, indoorIndex, 'serial', e\.target\.value\)\}/, `${label}: pole numeru JW nie przekazuje surowej wartości`);
  } else {
    assert.match(modalSource, /onChange=\{\(e\) => updateDeviceField\(index, "model", e\.target\.value\)\}/, `${label}: pole modelu nie przekazuje surowej wartości`);
    assert.match(modalSource, /onChange=\{\(e\) => updateDeviceField\(index, "outdoor_serial_number", e\.target\.value\)\}/, `${label}: pole JZ nie przekazuje surowej wartości`);
    assert.match(modalSource, /onChange=\{\(e\) => updateIndoorUnitField\(index, indoorIndex, e\.target\.value\)\}/, `${label}: pole JW nie przekazuje surowej wartości`);
  }
}

async function verifyBehavior({ label, jobDevicesPath }) {
  const jobDevices = await import(`${pathToFileURL(jobDevicesPath).href}?spaces=${encodeURIComponent(label)}-${Date.now()}`);

  const draftRows = jobDevices.normalizeJobDevices({
    devices: [{
      model: 'Gree Amber ',
      device_type: jobDevices.DEVICE_TYPE_MULTI,
      indoor_serial_numbers: ['JW 2026 001 ', 'JW 2026 002 '],
      outdoor_serial_number: 'JZ 2026 001 ',
    }],
  }, { keepEmptyRow: true, keepEmptyIndoor: true });

  assert.equal(draftRows[0].model, 'Gree Amber ', `${label}: formularz ucina spację na końcu modelu podczas pisania`);
  assert.equal(draftRows[0].outdoor_serial_number, 'JZ 2026 001 ', `${label}: formularz ucina spację w numerze JZ podczas pisania`);
  assert.deepEqual(
    jobDevices.getDeviceIndoorSerials(draftRows[0], { keepEmpty: true }),
    ['JW 2026 001 ', 'JW 2026 002 '],
    `${label}: formularz ucina spacje w numerach JW podczas pisania`,
  );

  const serialized = jobDevices.serializeJobDevicesToFields({ devices: draftRows });
  assert.equal(serialized.device_model, 'Gree Amber', `${label}: zapis powinien przyciąć tylko brzegi modelu`);
  assert.equal(serialized.device_serial_number, 'JW1: JW 2026 001 | JW2: JW 2026 002 | JZ: JZ 2026 001');
  assert.deepEqual(serialized.devices[0].indoor_serial_numbers, ['JW 2026 001', 'JW 2026 002']);
  assert.equal(serialized.devices[0].outdoor_serial_number, 'JZ 2026 001');

  const singleDraft = jobDevices.normalizeJobDevices({
    devices: [{
      model: 'Daikin Perfera 3,5 kW ',
      device_type: jobDevices.DEVICE_TYPE_SINGLE,
      indoor_serial_numbers: ['SN IN 12345 '],
      outdoor_serial_number: 'SN OUT 12345 ',
    }],
  }, { keepEmptyRow: true, keepEmptyIndoor: true });

  assert.equal(singleDraft[0].model, 'Daikin Perfera 3,5 kW ');
  assert.equal(jobDevices.getDeviceIndoorSerials(singleDraft[0], { keepEmpty: true })[0], 'SN IN 12345 ');
  assert.equal(singleDraft[0].outdoor_serial_number, 'SN OUT 12345 ');

  const singleSerialized = jobDevices.serializeJobDevicesToFields({ devices: singleDraft });
  assert.equal(singleSerialized.device_model, 'Daikin Perfera 3,5 kW');
  assert.equal(singleSerialized.device_serial_number, 'JW: SN IN 12345 | JZ: SN OUT 12345');
}

(async () => {
  variants.forEach(verifySource);
  for (const variant of variants) {
    await verifyBehavior(variant);
  }

  console.log('Smoke OK: desktop/shared and mobile device fields preserve spaces while editing and normalize them on save');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
