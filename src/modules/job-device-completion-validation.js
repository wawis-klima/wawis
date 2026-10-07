import {
  DEVICE_TYPE_MULTI,
  DEVICE_TYPE_SINGLE,
  getDeviceIndoorModels,
  getDeviceOutdoorModel,
  getDeviceType,
  normalizeJobDevices,
} from './job-devices.js';
import { getSingleSplitModelFamilyMismatch } from '../mobile791/modules/rotenso-models.js';

function nonEmpty(values = []) {
  return (Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean);
}

export function validateJobDevicesForCompletion(job = {}) {
  const devices = normalizeJobDevices(job);
  if (!devices.length) {
    return { ok: false, code: 'missing_devices', message: 'Najpierw dodaj urządzenie z jednostką wewnętrzną (JW) i zewnętrzną (JZ).' };
  }

  for (let index = 0; index < devices.length; index += 1) {
    const device = devices[index];
    const number = index + 1;
    const type = getDeviceType(device);
    const outdoorModel = String(getDeviceOutdoorModel(device) || '').trim();
    const indoorModels = nonEmpty(getDeviceIndoorModels(device, { keepEmpty: true }));

    if (!outdoorModel) {
      return { ok: false, code: 'missing_outdoor', deviceIndex: index, message: `Urządzenie ${number}: brakuje modelu jednostki zewnętrznej JZ.` };
    }

    if (!indoorModels.length) {
      return { ok: false, code: 'missing_indoor', deviceIndex: index, message: `Urządzenie ${number}: brakuje modelu jednostki wewnętrznej JW.` };
    }

    if (type === DEVICE_TYPE_MULTI) {
      if (indoorModels.length < 2) {
        return { ok: false, code: 'multi_requires_two_indoor', deviceIndex: index, message: `Urządzenie ${number}: Multi-split musi mieć co najmniej dwie jednostki wewnętrzne JW.` };
      }
      continue;
    }

    if (type !== DEVICE_TYPE_SINGLE || indoorModels.length !== 1) {
      return { ok: false, code: 'single_requires_one_indoor', deviceIndex: index, message: `Urządzenie ${number}: Single-split musi mieć dokładnie jedną jednostkę wewnętrzną JW.` };
    }

    const mismatch = getSingleSplitModelFamilyMismatch({
      outdoorModel,
      indoorModel: indoorModels[0],
    });
    if (mismatch) {
      return {
        ok: false,
        code: 'single_pair_mismatch',
        deviceIndex: index,
        message: `Urządzenie ${number}: ${mismatch.message}`,
      };
    }
  }

  return { ok: true, code: 'ok', message: '' };
}
