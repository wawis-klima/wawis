export const MAX_INDOOR_UNITS_PER_DEVICE = 5;
export const DEVICE_TYPE_SINGLE = 'single-split';
export const DEVICE_TYPE_MULTI = 'multi-split';
export const DEVICE_TYPES = [DEVICE_TYPE_SINGLE, DEVICE_TYPE_MULTI];

function normalizeDeviceLine(value, options = {}) {
  const withoutNewlines = String(value || '').replace(/[\r\n]+/g, ' ');
  if (options.keepTypingSpaces) return withoutNewlines;
  return withoutNewlines.replace(/\s+/g, ' ').trim();
}

function splitDeviceField(value) {
  const raw = String(value || '');
  if (!raw) return [];
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(normalizeDeviceLine);
}

function splitIndoorSerials(value) {
  if (Array.isArray(value)) return value.map(normalizeDeviceLine).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n|\s*[|;,]\s*/)
    .map((item) => stripSerialLabel(item))
    .filter(Boolean);
}

function uniqueDeviceLines(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = normalizeDeviceLine(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_INDOOR_UNITS_PER_DEVICE) break;
  }
  return result;
}

function normalizeIndoorSerialPlaceholders(values = [], options = {}) {
  const normalized = Array.isArray(values)
    ? values.map((value) => normalizeDeviceLine(value, { keepTypingSpaces: Boolean(options.keepTypingSpaces) })).slice(0, MAX_INDOOR_UNITS_PER_DEVICE)
    : [];
  return normalized.length ? normalized : [''];
}

function normalizeIndoorModelPlaceholders(values = [], options = {}) {
  const normalized = Array.isArray(values)
    ? values.map((value) => normalizeDeviceLine(value, { keepTypingSpaces: Boolean(options.keepTypingSpaces) })).slice(0, MAX_INDOOR_UNITS_PER_DEVICE)
    : [];
  const minimumLength = Math.min(
    Math.max(Number.parseInt(String(options.minimumLength || ''), 10) || 0, options.keepEmpty ? 1 : 0),
    MAX_INDOOR_UNITS_PER_DEVICE,
  );
  while (normalized.length < minimumLength) normalized.push('');
  return normalized.length ? normalized : (options.keepEmpty ? [''] : []);
}

export function normalizeDeviceType(value, device = {}) {
  const normalized = normalizeDeviceLine(value).toLowerCase();
  if (normalized === DEVICE_TYPE_MULTI || normalized === 'multi' || normalized === 'multisplit' || normalized === 'multi split') {
    return DEVICE_TYPE_MULTI;
  }
  if (normalized === DEVICE_TYPE_SINGLE || normalized === 'single' || normalized === 'singlesplit' || normalized === 'single split') {
    return DEVICE_TYPE_SINGLE;
  }

  const indoorSerialCount = Array.isArray(device?.indoor_serial_numbers)
    ? Math.min(device.indoor_serial_numbers.length, MAX_INDOOR_UNITS_PER_DEVICE)
    : 0;
  const indoorModelCount = Array.isArray(device?.indoor_models)
    ? Math.min(device.indoor_models.length, MAX_INDOOR_UNITS_PER_DEVICE)
    : 0;
  return Math.max(indoorSerialCount, indoorModelCount) > 1 ? DEVICE_TYPE_MULTI : DEVICE_TYPE_SINGLE;
}

export function getDeviceType(device = {}) {
  const explicitType = device?.device_type ?? device?.deviceType ?? device?.type;
  return normalizeDeviceType(explicitType, device);
}

function stripSerialLabel(value) {
  return normalizeDeviceLine(value)
    .replace(/^(jw|j\.w\.|jz|j\.z\.)\s*\d{0,2}\s*:\s*/i, '')
    .replace(/^(wew\.?|wewn\.?|wewnętrzna|wewnetrzna|jednostka\s+wewnętrzna|jednostka\s+wewnetrzna|zew\.?|zewn\.?|zewnętrzna|zewnetrzna|jednostka\s+zewnętrzna|jednostka\s+zewnetrzna)\s*\d{0,2}\s*[:\-–—]?\s+/i, '')
    .trim();
}

function setStructuredIndoorValue(target, rawIndex, value) {
  const normalizedValue = normalizeDeviceLine(value);
  if (!normalizedValue) return;
  const parsedIndex = Number.parseInt(String(rawIndex || ''), 10);
  const targetIndex = Number.isFinite(parsedIndex) && parsedIndex > 0
    ? Math.min(parsedIndex, MAX_INDOOR_UNITS_PER_DEVICE) - 1
    : Math.max(0, target.findIndex((item) => !normalizeDeviceLine(item)));
  while (target.length <= targetIndex && target.length < MAX_INDOOR_UNITS_PER_DEVICE) target.push('');
  if (targetIndex < MAX_INDOOR_UNITS_PER_DEVICE) target[targetIndex] = normalizedValue;
}

function trimTrailingIndoorPlaceholders(values = [], minimumLength = 0) {
  const normalized = Array.isArray(values)
    ? values.map((value) => normalizeDeviceLine(value)).slice(0, MAX_INDOOR_UNITS_PER_DEVICE)
    : [];
  while (normalized.length > minimumLength && !normalized[normalized.length - 1]) normalized.pop();
  return normalized;
}

function parseStructuredSerialSegments(raw) {
  const indoorSerials = [];
  let outdoorSerial = '';
  const segments = normalizeDeviceLine(raw)
    .split(/\s*[|;,]\s*/)
    .map(normalizeDeviceLine)
    .filter(Boolean);

  for (const segment of segments) {
    const indoorMatch = segment.match(/^(?:JW|J\.W\.)\s*(\d{0,2})\s*:\s*(.+)$/i)
      || segment.match(/^(?:wew\.?|wewn\.?|wewnętrzna|wewnetrzna|jednostka\s+wewnętrzna|jednostka\s+wewnetrzna)\s*(\d{0,2})\s*[:\-–—]?\s+(.+)$/i);
    if (indoorMatch?.[2]) {
      setStructuredIndoorValue(indoorSerials, indoorMatch[1], stripSerialLabel(indoorMatch[2]));
      continue;
    }

    const outdoorMatch = segment.match(/^(?:JZ|J\.Z\.)\s*:\s*(.+)$/i)
      || segment.match(/^(?:zew\.?|zewn\.?|zewnętrzna|zewnetrzna|jednostka\s+zewnętrzna|jednostka\s+zewnetrzna)\s*[:\-–—]?\s+(.+)$/i);
    if (outdoorMatch?.[1]) {
      const outdoor = stripSerialLabel(outdoorMatch[1]);
      if (outdoor) outdoorSerial = outdoor;
    }
  }

  return {
    indoor_serial_numbers: trimTrailingIndoorPlaceholders(indoorSerials),
    outdoor_serial_number: outdoorSerial,
  };
}

function stripModelLabel(value) {
  return normalizeDeviceLine(value)
    .replace(/^(jw|j\.w\.|jz|j\.z\.)\s*\d{0,2}\s*:\s*/i, '')
    .trim();
}

function parseStructuredModelSegments(raw) {
  const indoorModels = [];
  let outdoorModel = '';
  const segments = normalizeDeviceLine(raw)
    .split(/\s*\|\s*/)
    .map(normalizeDeviceLine)
    .filter(Boolean);

  for (const segment of segments) {
    const indoorMatch = segment.match(/^(?:JW|J\.W\.)\s*(\d{0,2})\s*:\s*(.+)$/i);
    if (indoorMatch?.[2]) {
      setStructuredIndoorValue(indoorModels, indoorMatch[1], stripModelLabel(indoorMatch[2]));
      continue;
    }

    const outdoorMatch = segment.match(/^(?:JZ|J\.Z\.)\s*:\s*(.+)$/i);
    if (outdoorMatch?.[1]) {
      outdoorModel = stripModelLabel(outdoorMatch[1]);
    }
  }

  return {
    indoor_models: trimTrailingIndoorPlaceholders(indoorModels),
    outdoor_model: outdoorModel,
  };
}

export function parseDeviceModelLine(value) {
  const raw = normalizeDeviceLine(value);
  if (!raw) {
    return {
      model: '',
      indoor_model: '',
      indoor_models: [],
      outdoor_model: '',
      is_structured_model: false,
    };
  }

  const parsed = parseStructuredModelSegments(raw);
  if (parsed.indoor_models.length || parsed.outdoor_model) {
    return {
      model: raw,
      indoor_model: parsed.indoor_models[0] || '',
      indoor_models: parsed.indoor_models,
      outdoor_model: parsed.outdoor_model,
      is_structured_model: true,
    };
  }

  return {
    model: raw,
    indoor_model: '',
    indoor_models: [],
    outdoor_model: raw,
    is_structured_model: false,
  };
}

export function parseDeviceSerialLine(value) {
  const raw = normalizeDeviceLine(value);
  if (!raw) {
    return {
      serial_number: '',
      indoor_serial_number: '',
      indoor_serial_numbers: [],
      outdoor_serial_number: '',
      legacy_serial_number: '',
      is_structured_serial: false,
    };
  }

  const parsedSegments = parseStructuredSerialSegments(raw);
  const indoorSerials = parsedSegments.indoor_serial_numbers;
  const outdoor = parsedSegments.outdoor_serial_number;

  if (indoorSerials.length || outdoor) {
    const serialNumber = formatDeviceSerialNumber({ indoor_serial_numbers: indoorSerials, outdoor_serial_number: outdoor });
    return {
      serial_number: serialNumber,
      indoor_serial_number: indoorSerials[0] || '',
      indoor_serial_numbers: indoorSerials,
      outdoor_serial_number: outdoor,
      legacy_serial_number: '',
      is_structured_serial: true,
    };
  }

  return {
    serial_number: raw,
    indoor_serial_number: '',
    indoor_serial_numbers: [],
    outdoor_serial_number: '',
    legacy_serial_number: raw,
    is_structured_serial: false,
  };
}

export function getDeviceIndoorSerials(device = {}, options = {}) {
  const keepEmpty = Boolean(options.keepEmpty);
  const keepTypingSpaces = Boolean(options.keepTypingSpaces || options.preserveInputSpaces || keepEmpty);
  const explicitIndoorSerials = Array.isArray(device?.indoor_serial_numbers)
    ? device.indoor_serial_numbers
    : (Array.isArray(device?.indoorSerialNumbers) ? device.indoorSerialNumbers : null);

  if (explicitIndoorSerials) {
    const normalizedExplicit = normalizeIndoorSerialPlaceholders(explicitIndoorSerials, { keepTypingSpaces });
    return keepEmpty ? normalizedExplicit : normalizedExplicit.map(normalizeDeviceLine).filter(Boolean);
  }

  const parsed = parseDeviceSerialLine(device?.serial_number ?? device?.device_serial_number);
  if (keepEmpty && parsed.indoor_serial_numbers?.length) {
    return normalizeIndoorSerialPlaceholders(parsed.indoor_serial_numbers, { keepTypingSpaces });
  }

  const sourceValues = [
    ...splitIndoorSerials(device?.indoor_serial_number),
    ...splitIndoorSerials(device?.serial_number_indoor),
    ...splitIndoorSerials(device?.indoorSerialNumber),
    ...(parsed.indoor_serial_numbers || []),
  ];
  const normalized = uniqueDeviceLines(sourceValues);
  if (!normalized.length && keepEmpty) return [''];
  return normalized;
}

export function getDeviceIndoorModels(device = {}, options = {}) {
  const keepEmpty = Boolean(options.keepEmpty);
  const keepTypingSpaces = Boolean(options.keepTypingSpaces || options.preserveInputSpaces || keepEmpty);
  const explicitIndoorModels = Array.isArray(device?.indoor_models)
    ? device.indoor_models
    : (Array.isArray(device?.indoorModels) ? device.indoorModels : null);
  const parsed = parseDeviceModelLine(device?.model ?? device?.device_model);
  const sourceValues = explicitIndoorModels || parsed.indoor_models || [];
  const normalized = normalizeIndoorModelPlaceholders(sourceValues, {
    keepEmpty,
    keepTypingSpaces,
    minimumLength: options.minimumLength,
  });
  return keepEmpty ? normalized : normalized.map(normalizeDeviceLine).filter(Boolean);
}

export function getDeviceIndoorUnits(device = {}, options = {}) {
  const keepEmpty = Boolean(options.keepEmpty);
  const keepTypingSpaces = Boolean(options.keepTypingSpaces || options.preserveInputSpaces || keepEmpty);
  const minimumLength = Math.min(
    Math.max(Number.parseInt(String(options.minimumLength || ''), 10) || 0, keepEmpty ? 1 : 0),
    MAX_INDOOR_UNITS_PER_DEVICE,
  );
  const serials = getDeviceIndoorSerials(device, { keepEmpty: true, keepTypingSpaces });
  const models = getDeviceIndoorModels(device, {
    keepEmpty: true,
    keepTypingSpaces,
    minimumLength: serials.length,
  });
  const unitCount = Math.min(
    Math.max(serials.length, models.length, minimumLength),
    MAX_INDOOR_UNITS_PER_DEVICE,
  );
  const units = Array.from({ length: unitCount }, (_, index) => ({
    index,
    unitNumber: index + 1,
    model: normalizeDeviceLine(models[index], { keepTypingSpaces }),
    serialNumber: normalizeDeviceLine(serials[index], { keepTypingSpaces }),
  }));
  if (keepEmpty) return units;
  return units.filter((unit) => unit.model || unit.serialNumber);
}

export function getDeviceOutdoorModel(device = {}) {
  const parsed = parseDeviceModelLine(device?.model ?? device?.device_model);
  return normalizeDeviceLine(
    device?.outdoor_model
    ?? device?.outdoorModel
    ?? parsed.outdoor_model,
  );
}

export function createEmptyJobDevice(overrides = {}) {
  return normalizeDeviceRow({
    model: '',
    indoor_model: '',
    indoor_models: [''],
    outdoor_model: '',
    serial_number: '',
    indoor_serial_number: '',
    indoor_serial_numbers: [''],
    outdoor_serial_number: '',
    legacy_serial_number: '',
    device_type: DEVICE_TYPE_SINGLE,
    ...overrides,
  }, { keepEmptyIndoor: true });
}

function normalizeDeviceRow(device = {}, options = {}) {
  const parsed = parseDeviceSerialLine(device?.serial_number ?? device?.device_serial_number);
  const keepTypingSpaces = Boolean(options.keepTypingSpaces || options.preserveInputSpaces || options.keepEmptyIndoor);
  const keepEmptyIndoor = Boolean(options.keepEmptyIndoor);
  const initialUnits = getDeviceIndoorUnits(device, {
    keepEmpty: keepEmptyIndoor,
    keepTypingSpaces,
  });
  const indoorSerials = initialUnits.map((unit) => unit.serialNumber);
  const indoorModels = initialUnits.map((unit) => unit.model);
  const hasIndoorSerials = indoorSerials.some((value) => Boolean(normalizeDeviceLine(value)));
  const outdoor = normalizeDeviceLine(
    device?.outdoor_serial_number
    ?? device?.serial_number_outdoor
    ?? device?.outdoorSerialNumber
    ?? parsed.outdoor_serial_number,
    { keepTypingSpaces },
  );
  const legacy = normalizeDeviceLine(
    device?.legacy_serial_number
    ?? device?.legacySerialNumber
    ?? ((hasIndoorSerials || normalizeDeviceLine(outdoor)) ? '' : parsed.legacy_serial_number),
    { keepTypingSpaces },
  );
  const rawModel = device?.model ?? device?.device_model ?? '';
  const parsedModel = parseDeviceModelLine(rawModel);
  const outdoorModel = normalizeDeviceLine(
    device?.outdoor_model
    ?? device?.outdoorModel
    ?? parsedModel.outdoor_model,
    { keepTypingSpaces },
  );
  const normalizedInputModel = normalizeDeviceLine(rawModel, { keepTypingSpaces });
  const formattedModel = formatDeviceModel({ indoor_models: indoorModels, indoor_serial_numbers: indoorSerials, outdoor_model: outdoorModel });
  const model = keepTypingSpaces && !parsedModel.is_structured_model
    ? normalizedInputModel
    : (formattedModel || normalizedInputModel);
  const structuredSerial = formatDeviceSerialNumber({ indoor_models: indoorModels, indoor_serial_numbers: indoorSerials, outdoor_serial_number: outdoor });
  const serialNumber = structuredSerial || legacy || parsed.serial_number || '';
  const deviceType = normalizeDeviceType(device?.device_type ?? device?.deviceType ?? device?.type, {
    ...device,
    indoor_serial_numbers: indoorSerials,
    indoor_models: indoorModels,
  });

  return {
    model,
    indoor_model: indoorModels[0] || '',
    indoor_models: indoorModels,
    outdoor_model: outdoorModel,
    serial_number: serialNumber,
    indoor_serial_number: indoorSerials[0] || '',
    indoor_serial_numbers: indoorSerials,
    outdoor_serial_number: outdoor,
    legacy_serial_number: structuredSerial ? '' : legacy,
    device_type: deviceType,
  };
}

export function formatDeviceModel(device = {}) {
  const indoorUnits = getDeviceIndoorUnits(device, { keepEmpty: true });
  const outdoorModel = normalizeDeviceLine(
    device?.outdoor_model
    ?? device?.outdoorModel
    ?? parseDeviceModelLine(device?.model ?? device?.device_model).outdoor_model,
  );
  const parts = [];
  const useNumberedLabels = indoorUnits.length > 1 || getDeviceType(device) === DEVICE_TYPE_MULTI;
  indoorUnits.forEach((unit) => {
    if (unit.model) parts.push(`${useNumberedLabels ? `JW${unit.unitNumber}` : 'JW'}: ${unit.model}`);
  });
  if (outdoorModel) {
    if (!parts.length) return outdoorModel;
    parts.push(`JZ: ${outdoorModel}`);
  }
  return parts.join(' | ');
}

export function formatDeviceSerialNumber(device = {}) {
  const indoorUnits = getDeviceIndoorUnits(device, { keepEmpty: true });
  const outdoor = normalizeDeviceLine(device.outdoor_serial_number ?? device.serial_number_outdoor ?? device.outdoorSerialNumber);
  const parts = [];
  const useNumberedLabels = indoorUnits.length > 1 || getDeviceType(device) === DEVICE_TYPE_MULTI;
  indoorUnits.forEach((unit) => {
    if (unit.serialNumber) parts.push(`${useNumberedLabels ? `JW${unit.unitNumber}` : 'JW'}: ${unit.serialNumber}`);
  });
  if (outdoor) parts.push(`JZ: ${outdoor}`);
  return parts.join(' | ');
}

export function getDeviceIndoorSerialDisplay(device = {}) {
  const indoorUnits = getDeviceIndoorUnits(device);
  if (!indoorUnits.length) return '';
  const useNumberedLabels = indoorUnits.some((unit) => unit.unitNumber > 1) || getDeviceType(device) === DEVICE_TYPE_MULTI;
  if (!useNumberedLabels && indoorUnits.length === 1) return indoorUnits[0].serialNumber;
  return indoorUnits.map((unit) => `JW${unit.unitNumber}: ${unit.serialNumber}`).join(', ');
}

export function getDeviceIndoorModelDisplay(device = {}) {
  const indoorUnits = getDeviceIndoorUnits(device).filter((unit) => unit.model);
  if (!indoorUnits.length) return '';
  const useNumberedLabels = indoorUnits.some((unit) => unit.unitNumber > 1) || getDeviceType(device) === DEVICE_TYPE_MULTI;
  if (!useNumberedLabels && indoorUnits.length === 1) return indoorUnits[0].model;
  return indoorUnits.map((unit) => `JW${unit.unitNumber}: ${unit.model}`).join(', ');
}

export function getDeviceSerialDisplay(device = {}) {
  const structured = formatDeviceSerialNumber(device);
  return structured || normalizeDeviceLine(device.legacy_serial_number || device.serial_number || device.device_serial_number);
}

export function normalizeJobDevices(input = {}, options = {}) {
  const keepEmptyRow = Boolean(options.keepEmptyRow);
  const sourceRows = Array.isArray(input.devices) && input.devices.length
    ? input.devices.map((device) => normalizeDeviceRow(device, { keepEmptyIndoor: options.keepEmptyIndoor }))
    : (() => {
      const models = splitDeviceField(input.device_model);
      const serials = splitDeviceField(input.device_serial_number);
      const rowCount = Math.max(models.length, serials.length);
      return Array.from({ length: rowCount }, (_, index) => normalizeDeviceRow({
        model: models[index] || '',
        serial_number: serials[index] || '',
      }, { keepEmptyIndoor: options.keepEmptyIndoor }));
    })();

  if (keepEmptyRow && Array.isArray(input.devices) && input.devices.length) {
    return sourceRows.length ? sourceRows : [createEmptyJobDevice()];
  }

  const rows = sourceRows.filter((device) => (
    device.model
    || device.outdoor_model
    || device.indoor_model
    || getDeviceIndoorModels(device).length
    || device.serial_number
    || device.indoor_serial_number
    || getDeviceIndoorSerials(device).length
    || device.outdoor_serial_number
    || device.legacy_serial_number
  ));
  if (!rows.length && keepEmptyRow) return [createEmptyJobDevice()];
  return rows;
}

export function serializeJobDevicesToFields(input = {}) {
  const devices = normalizeJobDevices(input);
  if (!devices.length) {
    return {
      devices: [],
      device_model: '',
      device_serial_number: '',
    };
  }

  const serializedDevices = devices.map((device) => {
    const indoorUnits = getDeviceIndoorUnits(device, { keepEmpty: true });
    while (indoorUnits.length && !indoorUnits[indoorUnits.length - 1].model && !indoorUnits[indoorUnits.length - 1].serialNumber) {
      indoorUnits.pop();
    }
    const indoorModels = indoorUnits.map((unit) => unit.model);
    const indoorSerials = indoorUnits.map((unit) => unit.serialNumber);
    const normalizedDevice = {
      ...device,
      indoor_models: indoorModels,
      indoor_model: indoorModels[0] || '',
      indoor_serial_numbers: indoorSerials,
      indoor_serial_number: indoorSerials[0] || '',
      outdoor_model: getDeviceOutdoorModel(device),
      device_type: getDeviceType(device),
    };
    const model = formatDeviceModel(normalizedDevice) || normalizeDeviceLine(device.model);
    const structuredSerial = formatDeviceSerialNumber(normalizedDevice);
    const serial_number = structuredSerial || normalizeDeviceLine(device.legacy_serial_number || device.serial_number);
    return {
      ...normalizedDevice,
      model,
      serial_number,
      legacy_serial_number: structuredSerial ? '' : normalizeDeviceLine(device.legacy_serial_number || device.serial_number),
    };
  });

  return {
    devices: serializedDevices,
    device_model: serializedDevices.map((device) => formatDeviceModel(device) || device.model || '').join('\n'),
    device_serial_number: serializedDevices.map((device) => device.serial_number || '').join('\n'),
  };
}

export function ensureJobFormDevices(input = {}) {
  const devices = normalizeJobDevices(input, { keepEmptyRow: true, keepEmptyIndoor: true });
  const serialized = serializeJobDevicesToFields({ devices });
  return {
    ...input,
    devices,
    device_model: serialized.device_model,
    device_serial_number: serialized.device_serial_number,
  };
}

function getNameplatePhotoUnitReference(photo = {}) {
  const storagePath = String(photo?.storage_path || '');
  const pathMatch = storagePath.match(/\/nameplates\/device-(\d+)_(jz|jw-\d+)_/i);
  const photoKind = String(photo?.photo_kind || '').toLowerCase();
  const unitRef = String(photo?.unit_ref || pathMatch?.[2] || '').toLowerCase();
  const deviceIndex = Number(photo?.device_index || pathMatch?.[1] || 0);
  if ((photoKind !== 'nameplate' && !pathMatch) || !deviceIndex || !/^(?:jz|jw-\d+)$/.test(unitRef)) return null;
  return { deviceIndex, unitRef };
}

function inferJobDevicesFromNameplatePhotos(job = {}) {
  const photos = Array.isArray(job?.photos) ? job.photos : [];
  const refs = photos.map(getNameplatePhotoUnitReference).filter(Boolean);
  if (!refs.length) return [];
  const maxDeviceIndex = Math.max(...refs.map((item) => item.deviceIndex));
  return Array.from({ length: maxDeviceIndex }, (_, deviceOffset) => {
    const deviceIndex = deviceOffset + 1;
    const indoorCount = Math.max(
      1,
      ...refs
        .filter((item) => item.deviceIndex === deviceIndex && item.unitRef.startsWith('jw-'))
        .map((item) => Number(item.unitRef.split('-')[1] || 0)),
    );
    return createEmptyJobDevice({
      device_type: indoorCount > 1 ? DEVICE_TYPE_MULTI : DEVICE_TYPE_SINGLE,
      indoor_models: Array.from({ length: indoorCount }, () => ''),
      indoor_serial_numbers: Array.from({ length: indoorCount }, () => ''),
    });
  });
}

export function getJobDeviceRows(job = {}) {
  const rows = normalizeJobDevices({
    devices: job.devices,
    device_model: job.device_model,
    device_serial_number: job.device_serial_number,
  });
  return rows.length ? rows : inferJobDevicesFromNameplatePhotos(job);
}

export function getPrimaryJobDevice(job = {}) {
  return getJobDeviceRows(job)[0] || createEmptyJobDevice();
}

export function getJobDevicesSummary(job = {}) {
  const devices = getJobDeviceRows(job);
  if (!devices.length) return '';
  if (devices.length === 1) {
    return [devices[0].model, getDeviceSerialDisplay(devices[0])].filter(Boolean).join(' • ');
  }
  return `${devices.length} urządzenia`;
}
