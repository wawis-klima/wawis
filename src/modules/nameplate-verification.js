import {
  DEVICE_TYPE_MULTI,
  getDeviceIndoorUnits,
  getDeviceType,
  getJobDeviceRows,
} from './job-devices.js';

function safeText(value) {
  return String(value ?? '').trim();
}

export function normalizeNameplateUnitRef(value) {
  const normalized = safeText(value).toLowerCase().replace(/_/g, '-');
  if (normalized === 'jz') return 'jz';
  const indoorMatch = normalized.match(/^jw-?(\d+)$/);
  if (!indoorMatch) return '';
  const unitNumber = Number(indoorMatch[1]);
  if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > 5) return '';
  return `jw-${unitNumber}`;
}

export function getNameplatePhotoTarget(photo = {}) {
  const storagePath = safeText(photo?.storage_path || photo?.path);
  const pathMatch = storagePath.match(/\/nameplates\/device-(\d+)_(jz|jw-\d+)_/i);
  const deviceIndex = Number(photo?.device_index || pathMatch?.[1] || 0);
  const unitRef = normalizeNameplateUnitRef(photo?.unit_ref || pathMatch?.[2]);
  if (!Number.isInteger(deviceIndex) || deviceIndex < 1 || !unitRef) return null;
  return { deviceIndex, unitRef };
}

export function getNameplateVerificationKey(deviceIndex, unitRef) {
  const normalizedIndex = Number(deviceIndex || 0);
  const normalizedUnitRef = normalizeNameplateUnitRef(unitRef);
  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || !normalizedUnitRef) return '';
  return `${normalizedIndex}:${normalizedUnitRef}`;
}

function getAvailableNameplatePhotos(job = {}) {
  if (job?.detailsLoaded && Array.isArray(job?.photos)) return job.photos;
  if (Array.isArray(job?.nameplatePhotosMeta)) return job.nameplatePhotosMeta;
  if (Array.isArray(job?.photos)) return job.photos;
  return [];
}

function buildPhotoMap(photos = []) {
  const result = new Map();
  for (const photo of Array.isArray(photos) ? photos : []) {
    const target = getNameplatePhotoTarget(photo);
    if (!target) continue;
    const key = getNameplateVerificationKey(target.deviceIndex, target.unitRef);
    if (!key) continue;
    const previous = result.get(key);
    if (!previous) {
      result.set(key, photo);
      continue;
    }
    const previousApproved = safeText(previous?.ocr_status).toLowerCase() === 'approved';
    const currentApproved = safeText(photo?.ocr_status).toLowerCase() === 'approved';
    if (!previousApproved && currentApproved) result.set(key, photo);
  }
  return result;
}

function buildManualVerificationMap(verifications = []) {
  const result = new Map();
  for (const verification of Array.isArray(verifications) ? verifications : []) {
    const key = getNameplateVerificationKey(verification?.device_index, verification?.unit_ref);
    if (key) result.set(key, verification);
  }
  return result;
}

function getMaxPhotoIndoorUnit(photos = [], deviceIndex) {
  let maxUnit = 0;
  for (const photo of Array.isArray(photos) ? photos : []) {
    const target = getNameplatePhotoTarget(photo);
    if (!target || target.deviceIndex !== deviceIndex || !target.unitRef.startsWith('jw-')) continue;
    const unitNumber = Number(target.unitRef.split('-')[1] || 0);
    if (unitNumber > maxUnit) maxUnit = unitNumber;
  }
  return maxUnit;
}

export function getExpectedNameplateTargets(job = {}) {
  const photos = getAvailableNameplatePhotos(job);
  let devices = [];
  try {
    devices = getJobDeviceRows({ ...job, photos });
  } catch {
    devices = [];
  }

  if (!devices.length) {
    const photoTargets = photos.map(getNameplatePhotoTarget).filter(Boolean);
    const uniqueKeys = new Set();
    return photoTargets.filter((target) => {
      const key = getNameplateVerificationKey(target.deviceIndex, target.unitRef);
      if (!key || uniqueKeys.has(key)) return false;
      uniqueKeys.add(key);
      return true;
    }).sort((a, b) => a.deviceIndex - b.deviceIndex || a.unitRef.localeCompare(b.unitRef));
  }

  const targets = [];
  devices.forEach((device, offset) => {
    const deviceIndex = offset + 1;
    targets.push({ deviceIndex, unitRef: 'jz' });

    const photoIndoorCount = getMaxPhotoIndoorUnit(photos, deviceIndex);
    const isMulti = getDeviceType(device) === DEVICE_TYPE_MULTI;
    const minimumIndoorCount = Math.max(1, photoIndoorCount, isMulti ? 2 : 1);
    let indoorCount = minimumIndoorCount;
    try {
      indoorCount = Math.max(
        minimumIndoorCount,
        getDeviceIndoorUnits(device, { keepEmpty: true, minimumLength: minimumIndoorCount }).length,
      );
    } catch {
      indoorCount = minimumIndoorCount;
    }
    indoorCount = Math.min(Math.max(indoorCount, 1), 5);
    for (let unitNumber = 1; unitNumber <= indoorCount; unitNumber += 1) {
      targets.push({ deviceIndex, unitRef: `jw-${unitNumber}` });
    }
  });

  return targets;
}

export function getJobNameplateVerificationSummary(job = {}) {
  const photos = getAvailableNameplatePhotos(job);
  const photoMap = buildPhotoMap(photos);
  const manualMap = buildManualVerificationMap(job?.nameplateVerifications);
  const targets = getExpectedNameplateTargets(job);

  const items = targets.map((target) => {
    const key = getNameplateVerificationKey(target.deviceIndex, target.unitRef);
    const photo = photoMap.get(key) || null;
    const manualVerification = manualMap.get(key) || null;
    const photoApproved = safeText(photo?.ocr_status).toLowerCase() === 'approved';
    const approved = photoApproved || Boolean(manualVerification);
    return {
      ...target,
      key,
      photo,
      manualVerification,
      photoApproved,
      approved,
      source: photoApproved ? 'photo' : (manualVerification ? 'manual' : 'pending'),
    };
  });

  const total = items.length;
  const approved = items.filter((item) => item.approved).length;
  const manualApproved = items.filter((item) => item.source === 'manual').length;
  const photoApproved = items.filter((item) => item.source === 'photo').length;
  const missingPhotos = items.filter((item) => !item.photo).length;
  const pending = Math.max(0, total - approved);

  return {
    state: total === 0 ? 'none' : (pending === 0 ? 'approved' : 'pending'),
    total,
    approved,
    pending,
    manualApproved,
    photoApproved,
    missingPhotos,
    items,
  };
}

export function getManualNameplateVerification(verifications = [], deviceIndex, unitRef) {
  const key = getNameplateVerificationKey(deviceIndex, unitRef);
  if (!key) return null;
  return (Array.isArray(verifications) ? verifications : []).find((verification) => (
    getNameplateVerificationKey(verification?.device_index, verification?.unit_ref) === key
  )) || null;
}

export async function setManualNameplateVerification({
  supabase,
  jobId,
  deviceIndex,
  unitRef,
  approved,
}) {
  if (!supabase || !jobId) throw new Error('Brak połączenia z bazą albo identyfikatora montażu.');
  const normalizedDeviceIndex = Number(deviceIndex || 0);
  const normalizedUnitRef = normalizeNameplateUnitRef(unitRef);
  if (!Number.isInteger(normalizedDeviceIndex) || normalizedDeviceIndex < 1 || !normalizedUnitRef) {
    throw new Error('Nieprawidłowe przypisanie tabliczki do urządzenia.');
  }

  if (!approved) {
    const { error } = await supabase
      .from('nameplate_manual_verifications')
      .delete()
      .eq('job_id', jobId)
      .eq('device_index', normalizedDeviceIndex)
      .eq('unit_ref', normalizedUnitRef);
    if (error) {
      const rawMessage = String(error?.message || '');
      if (/nameplate_manual_verifications|schema cache|does not exist/i.test(rawMessage)) {
        throw new Error('Brak tabeli ręcznych potwierdzeń. Uruchom w Supabase plik nameplate-manual-verifications-v9.13.sql.');
      }
      throw error;
    }
    return { removed: true, verification: null, deviceIndex: normalizedDeviceIndex, unitRef: normalizedUnitRef };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('nameplate_manual_verifications')
    .upsert({
      job_id: jobId,
      device_index: normalizedDeviceIndex,
      unit_ref: normalizedUnitRef,
      verified_at: now,
    }, { onConflict: 'job_id,device_index,unit_ref' })
    .select('id, job_id, device_index, unit_ref, verified_by, verified_at')
    .single();
  if (error) {
    const rawMessage = String(error?.message || '');
    if (/nameplate_manual_verifications|schema cache|does not exist/i.test(rawMessage)) {
      throw new Error('Brak tabeli ręcznych potwierdzeń. Uruchom w Supabase plik nameplate-manual-verifications-v9.13.sql.');
    }
    throw error;
  }
  const savedVerification = Array.isArray(data) ? (data[0] || null) : data;
  return { removed: false, verification: savedVerification, deviceIndex: normalizedDeviceIndex, unitRef: normalizedUnitRef };
}
