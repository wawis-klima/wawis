import { createEmptyJobDevice, getDeviceIndoorUnits, getJobDeviceRows } from './job-devices.js';
import { getNameplatePhotoMetadata } from './photos.js';

function normalizeUploadStatus(photo = {}) {
  return String(photo?.upload_status || '').trim().toLowerCase();
}

export function getRequiredNameplateUnits(job = {}) {
  const resolvedRows = getJobDeviceRows(job);
  const devices = resolvedRows.length ? resolvedRows : [createEmptyJobDevice()];

  return devices.flatMap((device, deviceOffset) => {
    const deviceIndex = deviceOffset + 1;
    const indoorUnits = getDeviceIndoorUnits(device, { keepEmpty: true });
    const safeIndoorUnits = indoorUnits.length ? indoorUnits : [{ unitNumber: 1 }];

    return [
      {
        deviceIndex,
        unitRef: 'jz',
        shortLabel: `JZ urządzenia ${deviceIndex}`,
        label: deviceIndex > 1
          ? `Tabliczka znamionowa jednostki zewnętrznej JZ — urządzenie ${deviceIndex}`
          : 'Tabliczka znamionowa jednostki zewnętrznej JZ',
      },
      ...safeIndoorUnits.map((unit) => ({
        deviceIndex,
        unitRef: `jw-${unit.unitNumber}`,
        shortLabel: safeIndoorUnits.length > 1
          ? `JW ${unit.unitNumber} urządzenia ${deviceIndex}`
          : `JW urządzenia ${deviceIndex}`,
        label: deviceIndex > 1 || safeIndoorUnits.length > 1
          ? `Tabliczka znamionowa jednostki wewnętrznej JW ${unit.unitNumber} — urządzenie ${deviceIndex}`
          : 'Tabliczka znamionowa jednostki wewnętrznej JW',
      })),
    ];
  });
}

export function getLatestNameplatePhotoForUnit(photos = [], deviceIndex, unitRef) {
  let preferredPhoto = null;
  let preferredPriority = Number.NEGATIVE_INFINITY;
  let preferredTimestamp = Number.NEGATIVE_INFINITY;

  photos.forEach((photo, photoIndex) => {
    const metadata = getNameplatePhotoMetadata(photo);
    const matchesUnit = metadata.photo_kind === 'nameplate'
      && Number(metadata.device_index) === Number(deviceIndex)
      && String(metadata.unit_ref) === String(unitRef);
    if (!matchesUnit) return;

    const uploadStatus = normalizeUploadStatus(photo);
    const priority = isNameplatePhotoReady(photo)
      ? 3
      : uploadStatus === 'uploading' || uploadStatus === 'local'
        ? 2
        : uploadStatus === 'error'
          ? 1
          : 0;
    const createdAtTimestamp = Date.parse(photo?.created_at || '');
    const comparableTimestamp = Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : photoIndex;
    if (
      !preferredPhoto
      || priority > preferredPriority
      || (priority === preferredPriority && comparableTimestamp >= preferredTimestamp)
    ) {
      preferredPhoto = photo;
      preferredPriority = priority;
      preferredTimestamp = comparableTimestamp;
    }
  });

  return preferredPhoto;
}

export function isNameplatePhotoReady(photo = null, options = {}) {
  if (!photo) return false;
  const uploadStatus = normalizeUploadStatus(photo);
  if (options.allowLocal && (uploadStatus === 'local' || uploadStatus === 'uploading')) return true;
  if (uploadStatus === 'local' || uploadStatus === 'uploading' || uploadStatus === 'error') return false;
  return Boolean(
    photo.storage_path
    || photo.image_url
    || photo.signed_url
    || photo.original_image_url,
  );
}

export function getJobNameplateCompletion(job = {}, options = {}) {
  const photos = Array.isArray(job?.photos) ? job.photos : [];
  const requiredUnits = getRequiredNameplateUnits(job);
  const units = requiredUnits.map((unit) => {
    const photo = getLatestNameplatePhotoForUnit(photos, unit.deviceIndex, unit.unitRef);
    return {
      ...unit,
      photo,
      ready: isNameplatePhotoReady(photo, options),
    };
  });
  const missingUnits = units.filter((unit) => !unit.ready);

  return {
    units,
    missingUnits,
    requiredCount: units.length,
    readyCount: units.length - missingUnits.length,
    isComplete: units.length > 0 && missingUnits.length === 0,
  };
}

export function formatMissingNameplateMessage(completion = {}) {
  const missingUnits = Array.isArray(completion?.missingUnits) ? completion.missingUnits : [];
  if (!missingUnits.length) return '';
  return missingUnits.map((unit) => unit.shortLabel).join(', ');
}
