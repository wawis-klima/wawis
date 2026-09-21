import {
  createEmptyJobDevice,
  getDeviceIndoorModels,
  getDeviceIndoorSerials,
  getJobDeviceRows,
  serializeJobDevicesToFields,
} from './job-devices.js';

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function getDesktopNameplateTarget(photo = {}) {
  const storagePath = String(photo?.storage_path || photo?.path || '');
  const pathMatch = storagePath.match(/\/nameplates\/device-(\d+)_(jz|jw-\d+)_/i);
  const photoKind = String(photo?.photo_kind || '').toLowerCase();
  const deviceIndex = Number(photo?.device_index || pathMatch?.[1] || 0);
  const unitRef = String(photo?.unit_ref || pathMatch?.[2] || '').toLowerCase();
  if ((photoKind !== 'nameplate' && !pathMatch) || !deviceIndex || !/^(?:jz|jw-\d+)$/.test(unitRef)) return null;
  const unitNumber = unitRef.startsWith('jw-') ? Number(unitRef.split('-')[1] || 1) : 0;
  return {
    deviceIndex,
    deviceOffset: deviceIndex - 1,
    unitRef,
    unitNumber,
    unitLabel: unitRef === 'jz' ? 'JZ' : `JW${unitNumber}`,
    label: `Urządzenie ${deviceIndex} — ${unitRef === 'jz' ? 'jednostka zewnętrzna JZ' : `jednostka wewnętrzna JW${unitNumber}`}`,
  };
}

function ensureDeviceRows(job = {}, requiredCount = 1) {
  const rows = getJobDeviceRows(job).map((device) => ({ ...device }));
  while (rows.length < requiredCount) rows.push(createEmptyJobDevice());
  return rows;
}

function patchTargetDevice({ device, target, modelValue, serialNumber, saveModel, saveSerial }) {
  const next = { ...device };
  const normalizedModel = normalizeText(modelValue);
  const normalizedSerial = normalizeText(serialNumber).toUpperCase();

  if (target.unitRef === 'jz') {
    if (saveModel && normalizedModel) next.outdoor_model = normalizedModel;
    if (saveSerial && normalizedSerial) next.outdoor_serial_number = normalizedSerial;
    return next;
  }

  const unitOffset = Math.max(0, target.unitNumber - 1);
  const indoorModels = getDeviceIndoorModels(next, { keepEmpty: true, minimumLength: unitOffset + 1 });
  const indoorSerials = getDeviceIndoorSerials(next, { keepEmpty: true });
  while (indoorModels.length <= unitOffset) indoorModels.push('');
  while (indoorSerials.length <= unitOffset) indoorSerials.push('');
  if (saveModel && normalizedModel) indoorModels[unitOffset] = normalizedModel;
  if (saveSerial && normalizedSerial) indoorSerials[unitOffset] = normalizedSerial;
  next.indoor_models = indoorModels;
  next.indoor_model = indoorModels[0] || '';
  next.indoor_serial_numbers = indoorSerials;
  next.indoor_serial_number = indoorSerials[0] || '';
  return next;
}

export async function saveDesktopNameplateOcrResult({
  supabase,
  job,
  photo,
  modelValue,
  serialNumber,
  saveModel = true,
  saveSerial = true,
}) {
  if (!supabase || !job?.id) throw new Error('Brak połączenia z bazą albo identyfikatora montażu.');
  const target = getDesktopNameplateTarget(photo);
  if (!target) throw new Error('Nie udało się ustalić, do której JZ/JW należy ta tabliczka.');
  if (!saveModel && !saveSerial) throw new Error('Wybierz przynajmniej jedno pole do zapisania.');

  const devices = ensureDeviceRows(job, target.deviceIndex);
  devices[target.deviceOffset] = patchTargetDevice({
    device: devices[target.deviceOffset],
    target,
    modelValue,
    serialNumber,
    saveModel,
    saveSerial,
  });
  const serialized = serializeJobDevicesToFields({ devices });
  const { error } = await supabase
    .from('jobs')
    .update({
      device_model: serialized.device_model || null,
      device_serial_number: serialized.device_serial_number || null,
    })
    .eq('id', job.id);
  if (error) throw error;

  let photoOcrStatus = null;
  if (photo?.id) {
    const checkedAt = new Date().toISOString();
    const { data: updatedPhoto, error: photoStatusError } = await supabase
      .from('photos')
      .update({
        ocr_status: 'approved',
        ocr_checked_at: checkedAt,
      })
      .eq('id', photo.id)
      .eq('job_id', job.id)
      .select('id, ocr_status, ocr_checked_at')
      .maybeSingle();

    if (photoStatusError) {
      const rawMessage = String(photoStatusError.message || '');
      if (/ocr_status|ocr_checked_at|column .* does not exist|schema cache/i.test(rawMessage)) {
        console.warn('Dane tabliczki zapisano, ale status wymaga migracji desktop-nameplate-ocr-status-v8.67.sql.', photoStatusError);
      } else {
        throw photoStatusError;
      }
    } else {
      photoOcrStatus = updatedPhoto || {
        id: photo.id,
        ocr_status: 'approved',
        ocr_checked_at: checkedAt,
      };
    }
  }

  // Moduł Urządzenia synchronizuje się automatycznie przez trigger jobs_sync_device_after_change
  // po aktualizacji device_model/device_serial_number. Nie uruchamiamy dodatkowego RPC.

  return {
    target,
    devices: serialized.devices,
    device_model: serialized.device_model,
    device_serial_number: serialized.device_serial_number,
    photoOcrStatus,
  };
}
