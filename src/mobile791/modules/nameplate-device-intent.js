import { prepareJobDocumentationPhotoIdentities, uploadJobDocumentationPhotos, retryAllPersistedPhotoUploads } from './photos.js';
import { queueOfflineJobOperation } from './job-offline-store.js';
import { readPhotoBytes, photoBytesDigest } from './photo-bytes.js';

// A single IDB commit owns both device fields and the ORIGINAL photo bytes.
// The photo queue is a recoverable projection, not the only copy of the intent.
export async function queueNameplateDeviceIntent({ userId, jobId, base, fields, documents = [] }) {
  const materialized = await Promise.all(documents.filter(doc => doc?.file).map(async doc => {
    const bytes = await readPhotoBytes(doc.file);
    const file = new File([bytes], doc.file.name || 'tabliczka.jpg', {
      type: doc.file.type || 'image/jpeg', lastModified: doc.file.lastModified || 0,
    });
    return { ...doc, file };
  }));
  const identified = await prepareJobDocumentationPhotoIdentities({ jobId, documents: materialized, uploaderId: userId });
  const durableDocuments = await Promise.all(identified.map(async doc => {
    const bytes = await readPhotoBytes(doc.file);
    // Explicit schema: no preview URL, camera handles or arbitrary form fields.
    return {
      file: bytes, fileName: doc.file.name, fileType: doc.file.type,
      fileLastModified: doc.file.lastModified, sha256: await photoBytesDigest(bytes),
      deviceIndex: doc.deviceIndex, unitRef: doc.unitRef, deviceRef: doc.deviceRef || '',
      serialNumber: doc.serialNumber || '', documentationLabel: doc.documentationLabel || '',
      verified: doc.verified === true, ocrStatus: doc.ocrStatus || '', ocrCheckedAt: doc.ocrCheckedAt || null,
      verificationMethod: doc.verificationMethod || 'manual',
      uploadIdentity: doc.uploadIdentity,
    };
  }));
  let operation;
  try { operation = await queueOfflineJobOperation({
    user_id: userId, job_id: jobId, type: 'device', base,
    payload: { device_fields: fields, documentation: durableDocuments,
      required_nameplate_paths: durableDocuments.map(doc => doc.uploadIdentity.plannedStoragePath) },
  }); } catch (cause) {
    const error = new Error('Nie udało się zapisać urządzenia i tabliczek w pamięci telefonu. Nie zamykaj formularza; sprawdź wolne miejsce i ponów zapis.');
    error.code = 'LOCAL_PERSISTENCE_FAILED'; error.cause = cause;
    throw error;
  }
  if (!operation) throw new Error('Nie zapisano urządzenia w pamięci telefonu. Pozostaw formularz otwarty.');
  return operation;
}

export async function restoreIntentDocuments(operation) {
  return Promise.all((operation.payload?.documentation || []).map(async doc => {
    const bytes = await readPhotoBytes(doc.file);
    if (await photoBytesDigest(bytes) !== doc.sha256) {
      const error = new Error('Niepotwierdzona integralność tabliczki. Zachowano zapis na telefonie.');
      error.code = 'PHOTO_LOCAL_INTEGRITY_FAILED';
      throw error;
    }
    return { ...doc, file: new File([bytes], doc.fileName, { type: doc.fileType, lastModified: doc.fileLastModified }) };
  }));
}

export async function stageIntentPhotos({ operation, supabase, profile, isSessionCurrent = () => true, ...ui }) {
  if (!isSessionCurrent()) return;
  const documents = await restoreIntentDocuments(operation);
  if (!documents.length || !isSessionCurrent()) return;
  const result = await uploadJobDocumentationPhotos({ ...ui, supabase, profile, isSessionCurrent,
    jobId: operation.job_id, documents, localOnly: true });
  if (result.failedCount) throw new Error('Nie udało się przygotować kolejki tabliczek. Trwały zapis urządzenia pozostał na telefonie.');
}

export async function syncIntentPhotos(options) {
  await stageIntentPhotos(options);
  if (options.isSessionCurrent?.() === false) return;
  // Respect permanent failures/backoff in automatic runs. Manual retry is explicit.
  const { resumePersistedPhotoUploads } = await import('./photos.js');
  return (options.manualRetry ? retryAllPersistedPhotoUploads : resumePersistedPhotoUploads)({
    ...options, jobId: options.operation.job_id,
  });
}
