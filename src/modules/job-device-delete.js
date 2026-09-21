import { getJobDeviceRows } from './job-devices.js';
import { PHOTO_BUCKET } from './photos.js';

function normalizeIndex(value) {
  return Math.max(0, Number.parseInt(String(value || ''), 10) || 0);
}

function normalizeStoragePaths(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

export async function deleteJobDeviceRecord({
  supabase,
  job,
  deviceIndex,
  isAdmin = false,
}) {
  if (!supabase || !job?.id) throw new Error('Brak montażu do usunięcia urządzenia.');
  if (!isAdmin) throw new Error('Tylko administrator może usuwać urządzenia z montażu.');

  const normalizedDeviceIndex = normalizeIndex(deviceIndex);
  const currentDevices = getJobDeviceRows(job);
  if (!normalizedDeviceIndex || normalizedDeviceIndex > currentDevices.length) {
    throw new Error('Nie znaleziono wskazanego urządzenia.');
  }

  // Od v9.73 baza przechowuje przypisanie tabliczki do urządzenia osobno od
  // storage_path. Pozostałych plików nie przenosimy ani nie zmieniamy ich nazw.
  // Dzięki temu usunięcie urządzenia 1 nie może zerwać tabliczek urządzenia 2.
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_job_device', {
    p_job_id: job.id,
    p_device_index: normalizedDeviceIndex,
  });
  if (rpcError) throw rpcError;

  const cleanupStoragePaths = normalizeStoragePaths(rpcData?.cleanup_storage_paths);
  if (cleanupStoragePaths.length) {
    const { error: storageDeleteError } = await supabase.storage.from(PHOTO_BUCKET).remove(cleanupStoragePaths);
    if (storageDeleteError && !/not\s*found/i.test(String(storageDeleteError.message || ''))) {
      console.warn(
        'Urządzenie usunięto, ale nie udało się posprzątać wszystkich nieużywanych plików tabliczek ze Storage.',
        storageDeleteError.message,
      );
    }
  }

  return {
    jobId: String(job.id),
    deletedDeviceIndex: normalizedDeviceIndex,
    devices: currentDevices.filter((_, index) => index !== normalizedDeviceIndex - 1),
    device_model: rpcData?.device_model || '',
    device_serial_number: rpcData?.device_serial_number || '',
  };
}
