export const PHOTO_BUCKET = 'job-photos';
export const SIGNED_PHOTO_URL_TTL_SECONDS = 60 * 60;
export const NAMEPLATE_PHOTO_FOLDER = 'nameplates';

const signedPhotoUrlCache = new Map();
const signedPhotoUrlInFlight = new Map();
const SIGNED_PHOTO_URL_CACHE_SAFETY_MS = 5 * 60 * 1000;
const SIGNED_PHOTO_URL_SESSION_KEY = 'wawis:signed-photo-url-cache:v1';
const SIGNED_PHOTO_URL_SESSION_MAX_ENTRIES = 250;

function getSignedPhotoCacheKey(storagePath, transform = null) {
  const normalizedPath = String(storagePath || '').trim();
  if (!normalizedPath) return '';
  if (!transform || typeof transform !== 'object') return `${normalizedPath}::original`;
  const width = Number(transform.width || 0);
  const height = Number(transform.height || 0);
  const quality = Number(transform.quality || 0);
  const resize = String(transform.resize || '');
  return `${normalizedPath}::w${width}:h${height}:q${quality}:r${resize}`;
}

function readSessionSignedPhotoCache() {
  if (typeof window === 'undefined' || !window.sessionStorage) return {};
  try {
    const raw = window.sessionStorage.getItem(SIGNED_PHOTO_URL_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionSignedPhotoCache(cache = {}) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    const now = Date.now();
    const liveEntries = Object.entries(cache)
      .filter(([, value]) => value?.url && Number(value?.expiresAt || 0) > now)
      .sort((a, b) => Number(b[1]?.expiresAt || 0) - Number(a[1]?.expiresAt || 0))
      .slice(0, SIGNED_PHOTO_URL_SESSION_MAX_ENTRIES);
    window.sessionStorage.setItem(SIGNED_PHOTO_URL_SESSION_KEY, JSON.stringify(Object.fromEntries(liveEntries)));
  } catch {
    // sessionStorage jest tylko optymalizacją. Brak miejsca/tryb prywatny nie może blokować zdjęć.
  }
}

export function clearSignedPhotoUrlCache() {
  signedPhotoUrlCache.clear();
  signedPhotoUrlInFlight.clear();
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(SIGNED_PHOTO_URL_SESSION_KEY);
  } catch {
    // Cache zdjęć nie może wpływać na możliwość wylogowania.
  }
}

function getCachedSignedUrl(storagePath, transform = null) {
  const cacheKey = getSignedPhotoCacheKey(storagePath, transform);
  if (!cacheKey) return '';
  const now = Date.now();
  const cached = signedPhotoUrlCache.get(cacheKey);
  if (cached?.url && Number(cached.expiresAt || 0) > now) return cached.url;
  if (cached) signedPhotoUrlCache.delete(cacheKey);

  const sessionCache = readSessionSignedPhotoCache();
  const sessionCached = sessionCache[cacheKey];
  if (sessionCached?.url && Number(sessionCached.expiresAt || 0) > now) {
    signedPhotoUrlCache.set(cacheKey, sessionCached);
    return sessionCached.url;
  }
  if (sessionCached) {
    delete sessionCache[cacheKey];
    writeSessionSignedPhotoCache(sessionCache);
  }
  return '';
}

function setCachedSignedUrl(storagePath, url, expiresIn, transform = null) {
  const cacheKey = getSignedPhotoCacheKey(storagePath, transform);
  if (!cacheKey || !url) return;
  const ttlMs = Math.max(30, Number(expiresIn) || SIGNED_PHOTO_URL_TTL_SECONDS) * 1000;
  const entry = {
    url,
    expiresAt: Date.now() + Math.max(1000, ttlMs - SIGNED_PHOTO_URL_CACHE_SAFETY_MS),
  };
  signedPhotoUrlCache.set(cacheKey, entry);
  const sessionCache = readSessionSignedPhotoCache();
  sessionCache[cacheKey] = entry;
  writeSessionSignedPhotoCache(sessionCache);
}

export function getNameplatePhotoMetadata(photo = {}) {
  const explicitDeviceIndex = Number(photo?.device_index || 0);
  const explicitUnitRef = String(photo?.unit_ref || '').trim().toLowerCase();
  const explicitKind = String(photo?.photo_kind || '').trim().toLowerCase();

  // Od v9.73 przypisanie tabliczki do urządzenia jest osobnym polem w bazie.
  // Nazwa pliku pozostaje tylko fallbackiem dla starych rekordów.
  if (explicitDeviceIndex > 0 && explicitUnitRef && (explicitKind === 'nameplate' || explicitKind === '')) {
    const unitLabel = explicitUnitRef === 'jz' ? 'JZ' : `JW ${explicitUnitRef.split('-')[1] || ''}`.trim();
    return {
      photo_kind: 'nameplate',
      device_index: explicitDeviceIndex,
      unit_ref: explicitUnitRef,
      device_ref: `device-${explicitDeviceIndex}-${explicitUnitRef}`,
      documentation_label: `Tabliczka ${unitLabel} • urządzenie ${explicitDeviceIndex}`,
    };
  }

  const storagePath = String(photo?.storage_path || '');
  const match = storagePath.match(/\/nameplates\/device-(\d+)_(jz|jw-\d+)_([^/]+)\.jpg$/i);
  if (!match) {
    return {
      photo_kind: photo?.photo_kind || '',
      device_index: explicitDeviceIndex,
      unit_ref: explicitUnitRef,
      device_ref: photo?.device_ref || '',
      documentation_label: photo?.documentation_label || '',
    };
  }
  const deviceIndex = Number(match[1] || 0);
  const unitRef = String(match[2] || '').toLowerCase();
  const unitLabel = unitRef === 'jz' ? 'JZ' : `JW ${unitRef.split('-')[1] || ''}`.trim();
  return {
    photo_kind: 'nameplate',
    device_index: deviceIndex,
    unit_ref: unitRef,
    device_ref: `device-${deviceIndex}-${unitRef}`,
    documentation_label: `Tabliczka ${unitLabel} • urządzenie ${deviceIndex}`,
  };
}

function sanitizeStorageSegment(value = '', fallback = 'unknown') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || fallback;
}

function isHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function getPhotoStoragePath({ photo, supabaseUrl }) {
  if (photo?.storage_path) return photo.storage_path;
  const imageUrl = String(photo?.image_url || photo?.original_image_url || '').trim();
  if (!imageUrl || !supabaseUrl) return '';

  const markers = [
    `${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/`,
    `${supabaseUrl}/storage/v1/object/sign/${PHOTO_BUCKET}/`,
  ];

  const marker = markers.find((item) => imageUrl.startsWith(item));
  if (!marker) return '';

  try {
    return decodeURIComponent(imageUrl.slice(marker.length).split('?')[0]);
  } catch {
    return imageUrl.slice(marker.length).split('?')[0];
  }
}

export async function getSignedPhotoUrl({ storagePath, fallbackUrl = '', supabase, expiresIn = SIGNED_PHOTO_URL_TTL_SECONDS, transform = null }) {
  const normalizedPath = String(storagePath || '').trim();
  if (normalizedPath && supabase?.storage?.from) {
    const cachedUrl = getCachedSignedUrl(normalizedPath, transform);
    if (cachedUrl) return cachedUrl;

    const cacheKey = getSignedPhotoCacheKey(normalizedPath, transform);
    const existingRequest = cacheKey ? signedPhotoUrlInFlight.get(cacheKey) : null;
    if (existingRequest) return existingRequest;

    const request = (async () => {
      const signedUrlOptions = transform && typeof transform === 'object'
        ? { transform }
        : undefined;
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(normalizedPath, expiresIn, signedUrlOptions);

      if (!error && data?.signedUrl) {
        setCachedSignedUrl(normalizedPath, data.signedUrl, expiresIn, transform);
        return data.signedUrl;
      }
      console.warn('Nie udało się wygenerować signed URL dla zdjęcia:', error?.message || error || normalizedPath);
      return isHttpUrl(fallbackUrl) ? fallbackUrl : '';
    })();

    if (cacheKey) signedPhotoUrlInFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (cacheKey && signedPhotoUrlInFlight.get(cacheKey) === request) {
        signedPhotoUrlInFlight.delete(cacheKey);
      }
    }
  }

  return isHttpUrl(fallbackUrl) ? fallbackUrl : '';
}

// Zostaje tylko jako awaryjna kompatybilność dla starszych testów/kodu.
// Nowy kod używa getSignedPhotoUrl(), żeby nie opierać się na publicznych linkach.
export function getPublicPhotoUrl({ fallbackUrl = '' }) {
  return isHttpUrl(fallbackUrl) ? fallbackUrl : '';
}

export async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Nie udało się skompresować zdjęcia.'));
              return;
            }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.75,
        );
      };
      img.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Nie udało się otworzyć pliku.'));
    reader.readAsDataURL(file);
  });
}

export async function deleteJobPhoto({
  supabase,
  photo,
  deletingPhotoId,
  previewImage,
  setPreviewImage,
  jobs,
  selectedJob,
  setJobs,
  setSelectedJob,
  setDeletingPhotoId,
  supabaseUrl,
  skipConfirmation = false,
}) {
  if (!supabase || !photo || deletingPhotoId) return false;
  if (!skipConfirmation) {
    const confirmed = window.confirm('Usunąć to zdjęcie?');
    if (!confirmed) return false;
  }

  const storagePath = getPhotoStoragePath({ photo, supabaseUrl });
  const previewCandidates = [photo.image_url, photo.signed_url, photo.original_image_url].filter(Boolean);
  const rollbackJobs = jobs;
  const rollbackSelectedJob = selectedJob;

  setDeletingPhotoId(photo.id);

  if (previewCandidates.includes(previewImage)) {
    setPreviewImage(null);
  }

  setJobs((prev) => prev.map((job) => (
    job.id === photo.job_id
      ? { ...job, photos: (job.photos || []).filter((item) => item.id !== photo.id) }
      : job
  )));
  setSelectedJob((prev) => (prev && prev.id === photo.job_id
    ? { ...prev, photos: (prev.photos || []).filter((item) => item.id !== photo.id) }
    : prev));

  try {
    const { error: deleteDbError } = await supabase
      .from('photos')
      .delete()
      .eq('id', photo.id)
      .eq('job_id', photo.job_id);
    if (deleteDbError) throw deleteDbError;

    if (storagePath) {
      const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
      if (storageError && !/not\s*found/i.test(storageError.message || '')) {
        console.warn('Nie udało się usunąć pliku ze storage:', storageError.message);
      }
    }

    return true;
  } catch (error) {
    setJobs(rollbackJobs);
    setSelectedJob(rollbackSelectedJob);
    const rawMessage = error?.message || 'Nie udało się usunąć zdjęcia.';
    const details = String(rawMessage).toLowerCase();
    if (details.includes('row-level security') || details.includes('permission') || details.includes('policy')) {
      alert('Supabase blokuje usunięcie zdjęcia. Sprawdź RLS dla tabeli photos i prywatnego bucketu job-photos.');
    } else {
      alert(rawMessage);
    }
    return false;
  } finally {
    setDeletingPhotoId(null);
  }
}

export async function uploadJobPhotos({
  supabase,
  profile,
  jobId,
  event,
  compressImageFn = compressImage,
  reloadJobDetails,
}) {
  if (!supabase || !profile) return;
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  for (const file of files) {
    try {
      const compressedFile = await compressImageFn(file);
      const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressedFile, { cacheControl: '3600', upsert: false });
      if (uploadError) {
        alert(uploadError.message);
        continue;
      }
      const { error: photoError } = await supabase.from('photos').insert({
        job_id: jobId,
        image_url: '',
        storage_path: path,
        uploaded_by: profile.id,
      });
      if (photoError) alert(photoError.message);
    } catch (error) {
      alert(error.message || 'Błąd kompresji zdjęcia.');
    }
  }

  event.target.value = '';
  await reloadJobDetails?.(jobId, { force: true });
}


export async function uploadJobDocumentationPhotos({
  supabase,
  profile,
  jobId,
  documents = [],
  compressImageFn = compressImage,
  reloadJobDetails,
}) {
  if (!supabase || !profile || !jobId) return { uploadedCount: 0, failedCount: 0, photos: [] };
  const validDocuments = (documents || []).filter((document) => document?.file);
  if (!validDocuments.length) return { uploadedCount: 0, failedCount: 0, photos: [] };

  const uploadedPhotos = [];
  let failedCount = 0;

  for (const document of validDocuments) {
    try {
      const compressedFile = await compressImageFn(document.file);
      const deviceIndex = Math.max(1, Number(document.deviceIndex || 0) + 1);
      const unitRef = sanitizeStorageSegment(document.unitRef || 'unit', 'unit').toLowerCase();
      const serial = sanitizeStorageSegment(document.serialNumber || '', 'bez-numeru');
      const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const path = `${jobId}/${NAMEPLATE_PHOTO_FOLDER}/device-${deviceIndex}_${unitRef}_${serial}_${uniquePart}.jpg`;
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressedFile, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: inserted, error: photoError } = await supabase
        .from('photos')
        .insert({
          job_id: jobId,
          image_url: '',
          storage_path: path,
          uploaded_by: profile.id,
          photo_kind: 'nameplate',
          device_index: deviceIndex,
          unit_ref: unitRef,
        })
        .select('id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref')
        .single();
      if (photoError) throw photoError;
      uploadedPhotos.push({ ...inserted, ...getNameplatePhotoMetadata(inserted) });
    } catch (error) {
      failedCount += 1;
      console.warn('Nie udało się zapisać tabliczki znamionowej:', error?.message || error);
    }
  }

  if (uploadedPhotos.length) {
    await reloadJobDetails?.(jobId, { force: true, background: true });
  }

  return { uploadedCount: uploadedPhotos.length, failedCount, photos: uploadedPhotos };
}
