import { claimPhotoQueueItem, deletePhotoQueueItem, hydratePhotoQueueItem, listPhotoQueueItems, recoverStalePhotoQueueItems, savePhotoQueueItem, updatePhotoQueueItem } from './photo-offline-queue.js';
export const PHOTO_BUCKET = 'job-photos';
export const SIGNED_PHOTO_URL_TTL_SECONDS = 60 * 60;
export const NAMEPLATE_PHOTO_FOLDER = 'nameplates';

const signedPhotoUrlCache = new Map();
const signedPhotoUrlInFlight = new Map();
const SIGNED_PHOTO_URL_CACHE_SAFETY_MS = 5 * 60 * 1000;
const SIGNED_PHOTO_URL_SESSION_KEY = 'wawis:signed-photo-url-cache:v1';
const SIGNED_PHOTO_URL_SESSION_MAX_ENTRIES = 250;
const LOCAL_UPLOAD_PREFIX = 'local-photo-upload-';
const activePhotoUploadPromises = new Map();
let persistedQueueResumePromise = null;
const PHOTO_UPLOAD_LEASE_MS = 3 * 60 * 1000;
const PHOTO_RETRY_MAX_DELAY_MS = 30 * 60 * 1000;

function getPhotoRetryDelayMs(retryCount) {
  const exponent = Math.max(0, Math.min(Number(retryCount || 1) - 1, 8));
  const base = Math.min(PHOTO_RETRY_MAX_DELAY_MS, 4000 * (2 ** exponent));
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

function photoQueueItemIsDue(item, nowMs = Date.now()) {
  const nextAttempt = Date.parse(item?.next_attempt_at || '');
  return !Number.isFinite(nextAttempt) || nextAttempt <= nowMs;
}

function isHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
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

function buildPhotoStoragePath(jobId, queuedPhoto) {
  const stableUploadId = sanitizeStorageSegment(
    queuedPhoto?.upload_key || queuedPhoto?.id || `${Date.now()}`,
    'upload',
  ).slice(0, 64);
  if (queuedPhoto?.photo_kind !== 'nameplate') {
    return `${jobId}/uploads/${stableUploadId}.jpg`;
  }
  const deviceIndex = Math.max(1, Number(queuedPhoto.device_index || 1));
  const unitRef = sanitizeStorageSegment(queuedPhoto.unit_ref, 'unit').toLowerCase();
  const serial = sanitizeStorageSegment(queuedPhoto.serial_number, 'bez-numeru');
  return `${jobId}/${NAMEPLATE_PHOTO_FOLDER}/device-${deviceIndex}_${unitRef}_${serial}_${stableUploadId}.jpg`;
}

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

export function invalidateSignedPhotoUrl({ storagePath, transform = null } = {}) {
  const cacheKey = getSignedPhotoCacheKey(storagePath, transform);
  if (!cacheKey) return false;

  signedPhotoUrlCache.delete(cacheKey);
  signedPhotoUrlInFlight.delete(cacheKey);

  const sessionCache = readSessionSignedPhotoCache();
  if (sessionCache[cacheKey]) {
    delete sessionCache[cacheKey];
    writeSessionSignedPhotoCache(sessionCache);
  }
  return true;
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

export async function getSignedPhotoUrl({
  storagePath,
  fallbackUrl = '',
  supabase,
  expiresIn = SIGNED_PHOTO_URL_TTL_SECONDS,
  transform = null,
  forceRefresh = false,
}) {
  const normalizedPath = String(storagePath || '').trim();
  if (normalizedPath && supabase?.storage?.from) {
    if (forceRefresh) {
      invalidateSignedPhotoUrl({ storagePath: normalizedPath, transform });
    }
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
      console.warn('Nie udało się wygenerować signed URL dla zdjęcia mobilnego:', error?.message || error || normalizedPath);
      return isHttpUrl(fallbackUrl) || String(fallbackUrl || '').startsWith('blob:') ? fallbackUrl : '';
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

  return isHttpUrl(fallbackUrl) || String(fallbackUrl || '').startsWith('blob:') ? fallbackUrl : '';
}

// Kompatybilność z dawną wersją 7.91: publiczne linki działają tylko awaryjnie.
// Dla prywatnego bucketu job-photos widok mobilny powinien używać signed URL.
export function getPublicPhotoUrl({ storagePath, fallbackUrl = '', supabase }) {
  if (storagePath && supabase) {
    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath);
    if (data?.publicUrl) return data.publicUrl;
  }
  return isHttpUrl(fallbackUrl) || String(fallbackUrl || '').startsWith('blob:') ? fallbackUrl : '';
}

export const MOBILE_PHOTO_MAX_DIMENSION_PX = 1800;
export const MOBILE_PHOTO_JPEG_QUALITY = 0.78;
export const MOBILE_PHOTO_SKIP_COMPRESSION_BELOW_BYTES = 220 * 1024;

function getImageDimensionsFromElement(img) {
  return {
    width: Number(img.naturalWidth || img.width || 0),
    height: Number(img.naturalHeight || img.height || 0),
  };
}

function getCompressedFileName(fileName = 'zdjecie.jpg') {
  const baseName = String(fileName || 'zdjecie').replace(/\.[^.]+$/, '') || 'zdjecie';
  return `${baseName}.jpg`;
}

function createCompressionResult({ file, sourceFile, originalWidth = 0, originalHeight = 0, compressed = false, skippedReason = '' }) {
  const originalSize = Number(sourceFile?.size || file?.size || 0);
  const uploadSize = Number(file?.size || 0);
  const savedBytes = Math.max(0, originalSize - uploadSize);
  const savedPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  return {
    file,
    originalSize,
    uploadSize,
    savedBytes,
    savedPercent,
    originalWidth,
    originalHeight,
    maxDimension: MOBILE_PHOTO_MAX_DIMENSION_PX,
    quality: MOBILE_PHOTO_JPEG_QUALITY,
    compressed,
    skippedReason,
  };
}

export async function preparePhotoForUpload(file) {
  if (!file) {
    throw new Error('Brak zdjęcia do wysłania.');
  }

  const mimeType = String(file.type || '').toLowerCase();
  if (mimeType && !mimeType.startsWith('image/')) {
    return createCompressionResult({ file, sourceFile: file, skippedReason: 'not-image' });
  }

  // Bardzo małych zdjęć nie ruszamy — ponowny zapis JPG potrafi je czasem powiększyć.
  if (Number(file.size || 0) > 0 && Number(file.size || 0) < MOBILE_PHOTO_SKIP_COMPRESSION_BELOW_BYTES) {
    return createCompressionResult({ file, sourceFile: file, skippedReason: 'small-file' });
  }

  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia do kompresji.'));
      image.src = objectUrl;
    });

    const { width, height } = getImageDimensionsFromElement(img);
    if (!width || !height) {
      return createCompressionResult({ file, sourceFile: file, skippedReason: 'missing-dimensions' });
    }

    const largestDimension = Math.max(width, height);
    const scale = Math.min(1, MOBILE_PHOTO_MAX_DIMENSION_PX / largestDimension);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return createCompressionResult({ file, sourceFile: file, originalWidth: width, originalHeight: height, skippedReason: 'canvas-context' });
    }

    // Białe tło zabezpiecza zdjęcia PNG/HEIC z przezroczystością po konwersji do JPG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Nie udało się skompresować zdjęcia.'))),
        'image/jpeg',
        MOBILE_PHOTO_JPEG_QUALITY,
      );
    });

    // Jeżeli konwersja nie daje zysku, zostawiamy oryginał — upload będzie mniejszy albo równy najlepszej wersji.
    if (blob.size >= file.size && scale >= 1) {
      return createCompressionResult({ file, sourceFile: file, originalWidth: width, originalHeight: height, skippedReason: 'not-smaller' });
    }

    const compressedFile = new File([blob], getCompressedFileName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    return createCompressionResult({
      file: compressedFile,
      sourceFile: file,
      originalWidth: width,
      originalHeight: height,
      compressed: true,
    });
  } catch (error) {
    console.warn('Mobilna kompresja zdjęcia pominięta — wysyłam oryginał.', error?.message || error);
    return createCompressionResult({ file, sourceFile: file, skippedReason: 'compression-error' });
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Sprzątanie tymczasowego URL — bez wpływu na upload.
      }
    }
  }
}

export async function prepareNameplatePhotoForUpload(file) {
  if (!file) {
    throw new Error('Brak zdjęcia tabliczki do wysłania.');
  }

  // Zdjęcie tabliczki zostało już wykadrowane i zapisane jako JPG wysokiej jakości
  // w NameplatePhotoCapture. Ponowna kompresja 0.78 obniżała czytelność drobnego druku.
  return createCompressionResult({
    file,
    sourceFile: file,
    skippedReason: 'nameplate-already-cropped',
  });
}

export async function compressImage(file) {
  const prepared = await preparePhotoForUpload(file);
  return prepared.file;
}

export function isLocalQueuedPhoto(photo) {
  return Boolean(photo?.id && String(photo.id).startsWith(LOCAL_UPLOAD_PREFIX));
}

export function isBlobPhotoUrl(value = '') {
  return String(value || '').startsWith('blob:');
}

export function hasDisplayablePhotoUrl(photo = {}) {
  return Boolean(photo?.thumbnail_image_url || photo?.preview_full_url || photo?.image_url || photo?.signed_url || photo?.original_image_url || photo?.local_preview_url);
}

export function hasRemotePhotoUrl(photo = {}) {
  return [photo?.thumbnail_image_url, photo?.preview_full_url, photo?.image_url, photo?.signed_url, photo?.original_image_url].some((value) => isHttpUrl(value));
}

function getPhotoUploadStatus(photo) {
  return String(photo?.upload_status || '').trim();
}

function createLocalPreviewUrl(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

function revokeLocalPreviewUrl(url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  if (!String(url).startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Bezpiecznie ignorujemy błąd przeglądarki — to tylko sprzątanie lokalnej miniatury.
  }
}

function isNetworkUploadError(error) {
  const rawMessage = String(error?.message || error || '').toLowerCase();
  return /failed to fetch|network|fetch|internet|offline|load failed|connection/i.test(rawMessage);
}

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function normalizeUploadError(error, fallback = 'Nie udało się wysłać zdjęcia.') {
  const rawMessage = String(error?.message || error || fallback).trim();
  if (!rawMessage) return fallback;
  if (/failed to fetch|network|fetch/i.test(rawMessage)) {
    return 'Problem z internetem. Zdjęcie zostało w kolejce — spróbuj ponownie.';
  }
  if (/row-level security|permission denied|violates row-level|policy/i.test(rawMessage)) {
    return 'Supabase zablokował zapis zdjęcia przez RLS. Odśwież aplikację i spróbuj ponownie. Jeśli błąd wróci, trzeba uruchomić SQL: mobile-photo-upload-rls-v8.32.sql.';
  }
  return rawMessage;
}

async function getAuthenticatedUploaderId({ supabase, profile }) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user?.id) return data.user.id;
  } catch {
    // Awaryjnie korzystamy z profilu, ale podstawowym źródłem dla RLS jest auth.uid().
  }
  return profile?.id || '';
}

function getUploaderName(profile) {
  return profile?.full_name || profile?.email || 'Pracownik';
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackHashBytes(bytes) {
  let hashA = 2166136261;
  let hashB = 2246822519;
  for (const byte of bytes) {
    hashA ^= byte;
    hashA = Math.imul(hashA, 16777619);
    hashB ^= byte + 0x9e3779b9;
    hashB = Math.imul(hashB, 3266489917);
  }
  return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
}

async function digestBytes(bytes) {
  if (globalThis.crypto?.subtle?.digest) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return fallbackHashBytes(new Uint8Array(bytes));
}

export async function getPhotoFileFingerprint(file) {
  if (!file) return '';
  try {
    const bytes = await file.arrayBuffer();
    return await digestBytes(bytes);
  } catch {
    const fallback = new TextEncoder().encode([
      file.name || 'zdjecie.jpg',
      file.type || 'image/jpeg',
      Number(file.size || 0),
      Number(file.lastModified || 0),
    ].join('|'));
    return digestBytes(fallback);
  }
}

function buildPhotoUnitKey({ jobId, metadata = {} }) {
  if (metadata.photo_kind !== 'nameplate') return '';
  return [
    String(jobId || ''),
    'nameplate',
    Math.max(1, Number(metadata.device_index || 1)),
    String(metadata.unit_ref || 'unit').toLowerCase(),
  ].join(':');
}

export async function createPhotoUploadIdentity({ file, jobId, metadata = {} }) {
  const fileFingerprint = await getPhotoFileFingerprint(file);
  const unitKey = buildPhotoUnitKey({ jobId, metadata });
  const identitySource = [
    String(jobId || ''),
    metadata.photo_kind || 'photo',
    Number(metadata.device_index || 0),
    String(metadata.unit_ref || ''),
    fileFingerprint,
  ].join('|');
  const uploadKey = await digestBytes(new TextEncoder().encode(identitySource));
  return {
    fileFingerprint,
    uploadKey,
    unitKey,
    localId: `${LOCAL_UPLOAD_PREFIX}${uploadKey}`,
  };
}

function mergePhotoIntoJob(job, photo) {
  if (!job || String(job.id) !== String(photo.job_id)) return job;
  const photos = Array.isArray(job.photos) ? job.photos : [];
  const withoutDuplicate = photos.filter((item) => String(item.id) !== String(photo.id));
  return {
    ...job,
    photos: [...withoutDuplicate, photo],
    detailsLoaded: true,
    detailsLoadedAt: new Date().toISOString(),
  };
}

function updatePhotoInJob(job, jobId, photoId, updater) {
  if (!job || String(job.id) !== String(jobId)) return job;
  const photos = Array.isArray(job.photos) ? job.photos : [];
  const nextPhotos = photos.map((photo) => {
    if (String(photo.id) !== String(photoId)) return photo;
    return typeof updater === 'function' ? updater(photo) : { ...photo, ...updater };
  });
  return {
    ...job,
    photos: nextPhotos,
    detailsLoaded: true,
    detailsLoadedAt: new Date().toISOString(),
  };
}

function replacePhotoInJob(job, jobId, localPhotoId, uploadedPhoto) {
  if (!job || String(job.id) !== String(jobId)) return job;
  const photos = Array.isArray(job.photos) ? job.photos : [];
  let replaced = false;
  const nextPhotos = photos.map((photo) => {
    if (String(photo.id) !== String(localPhotoId)) return photo;
    replaced = true;
    return uploadedPhoto;
  });
  const withoutDuplicate = nextPhotos.filter((photo, index, array) => (
    array.findIndex((item) => String(item.id) === String(photo.id)) === index
  ));
  return {
    ...job,
    photos: replaced ? withoutDuplicate : [...withoutDuplicate, uploadedPhoto],
    detailsLoaded: true,
    detailsLoadedAt: new Date().toISOString(),
  };
}

function removePhotoFromJob(job, photo) {
  if (!job || String(job.id) !== String(photo.job_id)) return job;
  const photos = Array.isArray(job.photos) ? job.photos : [];
  return {
    ...job,
    photos: photos.filter((item) => String(item.id) !== String(photo.id)),
    detailsLoaded: true,
    detailsLoadedAt: new Date().toISOString(),
  };
}

function applyPhotoUpdate({ jobId, photoId, setJobs, setSelectedJob, updater }) {
  setJobs?.((prev) => prev.map((job) => updatePhotoInJob(job, jobId, photoId, updater)));
  setSelectedJob?.((prev) => (prev && String(prev.id) === String(jobId) ? updatePhotoInJob(prev, jobId, photoId, updater) : prev));
}

function applyUploadedPhoto({ jobId, localPhotoId, uploadedPhoto, localPreviewUrl, setJobs, setSelectedJob }) {
  // Nie kasujemy lokalnego blob URL od razu, dopóki UI nie ma stabilnego signed URL.
  // Na iPhone/Safari signed URL potrafi dojść chwilę po INSERT, a zbyt szybkie
  // revokeObjectURL powodowało: miniatura pojawia się, po chwili znika, a wraca
  // dopiero po ponownym logowaniu/pełnym odświeżeniu danych.
  // Celowo nie wywołujemy tutaj revokeObjectURL(localPreviewUrl).
  // Ten sam blob URL może być jeszcze przez chwilę główną miniaturą po udanym uploadzie.
  // Pełne odświeżenie/synchronizacja karty zastąpi go signed URL-em z Supabase.
  setJobs?.((prev) => prev.map((job) => replacePhotoInJob(job, jobId, localPhotoId, uploadedPhoto)));
  setSelectedJob?.((prev) => (prev && String(prev.id) === String(jobId) ? replacePhotoInJob(prev, jobId, localPhotoId, uploadedPhoto) : prev));
}

function applyPhotoRemoval({ photo, setJobs, setSelectedJob }) {
  revokeLocalPreviewUrl(photo?.local_preview_url || photo?.image_url);
  setJobs?.((prev) => prev.map((job) => removePhotoFromJob(job, photo)));
  setSelectedJob?.((prev) => (prev && String(prev.id) === String(photo.job_id) ? removePhotoFromJob(prev, photo) : prev));
}

async function createQueuedPhoto({ file, jobId, profile, uploaderId, metadata = {} }) {
  const createdAt = new Date().toISOString();
  const localPreviewUrl = createLocalPreviewUrl(file);
  const identity = await createPhotoUploadIdentity({ file, jobId, metadata });
  const queuedPhoto = {
    id: identity.localId,
    job_id: jobId,
    image_url: localPreviewUrl,
    original_image_url: localPreviewUrl,
    signed_url: localPreviewUrl,
    storage_path: '',
    planned_storage_path: '',
    upload_key: identity.uploadKey,
    unit_key: identity.unitKey,
    file_fingerprint: identity.fileFingerprint,
    legacy_queue_item: false,
    uploaded_by: uploaderId || profile.id,
    created_at: createdAt,
    uploader_name: getUploaderName(profile),
    upload_status: 'local',
    upload_status_label: 'Zapisano na telefonie',
    upload_error: '',
    local_preview_url: localPreviewUrl,
    local_file_name: file.name || 'zdjęcie.jpg',
    __localFile: file,
    photo_kind: metadata.photo_kind || '',
    device_index: Number(metadata.device_index || 0),
    unit_ref: metadata.unit_ref || '',
    device_ref: metadata.device_ref || '',
    serial_number: metadata.serial_number || '',
    documentation_label: metadata.documentation_label || '',
  };
  queuedPhoto.planned_storage_path = buildPhotoStoragePath(jobId, queuedPhoto);
  queuedPhoto.storage_path = queuedPhoto.planned_storage_path;
  return queuedPhoto;
}

async function ensureQueuedPhotoIdentity(queuedPhoto) {
  if (!queuedPhoto?.__localFile) return queuedPhoto;
  if (queuedPhoto.upload_key && queuedPhoto.file_fingerprint && queuedPhoto.planned_storage_path) return queuedPhoto;
  const metadata = {
    photo_kind: queuedPhoto.photo_kind || '',
    device_index: Number(queuedPhoto.device_index || 0),
    unit_ref: queuedPhoto.unit_ref || '',
  };
  const identity = await createPhotoUploadIdentity({
    file: queuedPhoto.__localFile,
    jobId: queuedPhoto.job_id,
    metadata,
  });
  const wasLegacyQueueItem = !queuedPhoto.upload_key || !queuedPhoto.planned_storage_path;
  const normalized = {
    ...queuedPhoto,
    upload_key: queuedPhoto.upload_key || identity.uploadKey,
    unit_key: queuedPhoto.unit_key || identity.unitKey,
    file_fingerprint: queuedPhoto.file_fingerprint || identity.fileFingerprint,
    legacy_queue_item: Boolean(queuedPhoto.legacy_queue_item || wasLegacyQueueItem),
  };
  normalized.planned_storage_path = queuedPhoto.planned_storage_path || buildPhotoStoragePath(queuedPhoto.job_id, normalized);
  normalized.storage_path = normalized.planned_storage_path;
  await updatePhotoQueueItem(queuedPhoto.id, {
    upload_key: normalized.upload_key,
    unit_key: normalized.unit_key,
    file_fingerprint: normalized.file_fingerprint,
    planned_storage_path: normalized.planned_storage_path,
    legacy_queue_item: normalized.legacy_queue_item,
  });
  return normalized;
}

const PHOTO_RECONCILIATION_SELECT = 'id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref';

function isDuplicateStorageError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return /already exists|duplicate|409|conflict|unique/i.test(message);
}

async function findServerPhotoByStoragePath({ supabase, jobId, storagePath }) {
  if (!supabase || !jobId || !storagePath) return null;
  try {
    const { data, error } = await supabase
      .from('photos')
      .select(PHOTO_RECONCILIATION_SELECT)
      .eq('job_id', jobId)
      .eq('storage_path', storagePath)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn('Nie udało się sprawdzić, czy zdjęcie jest już w systemie.', error?.message || error);
    return null;
  }
}

async function findLegacyServerNameplate({ supabase, queuedPhoto }) {
  if (!supabase || queuedPhoto?.photo_kind !== 'nameplate') return null;
  const status = String(queuedPhoto.upload_status || '').toLowerCase();
  if (status !== 'error' && status !== 'uploading') return null;
  try {
    const { data, error } = await supabase
      .from('photos')
      .select(PHOTO_RECONCILIATION_SELECT)
      .eq('job_id', queuedPhoto.job_id);
    if (error) throw error;
    const queuedCreatedAt = Date.parse(queuedPhoto.created_at || '');
    const earliestMatchingTime = Number.isFinite(queuedCreatedAt) ? queuedCreatedAt - (10 * 60 * 1000) : Number.NEGATIVE_INFINITY;
    const candidates = (Array.isArray(data) ? data : []).filter((photo) => {
      const metadata = getNameplatePhotoMetadata(photo);
      const remoteCreatedAt = Date.parse(photo.created_at || '');
      const uploaderMatches = !queuedPhoto.uploaded_by || !photo.uploaded_by || String(photo.uploaded_by) === String(queuedPhoto.uploaded_by);
      return metadata.photo_kind === 'nameplate'
        && Number(metadata.device_index) === Number(queuedPhoto.device_index)
        && String(metadata.unit_ref) === String(queuedPhoto.unit_ref)
        && uploaderMatches
        && (!Number.isFinite(remoteCreatedAt) || remoteCreatedAt >= earliestMatchingTime);
    });
    return candidates.sort((left, right) => Date.parse(right.created_at || '') - Date.parse(left.created_at || ''))[0] || null;
  } catch (error) {
    console.warn('Nie udało się porównać starego lokalnego błędu tabliczki z serwerem.', error?.message || error);
    return null;
  }
}

async function createServerPhotoForUi({ supabase, supabaseUrl, serverPhoto, queuedPhoto, localPreviewUrl }) {
  const storagePath = getPhotoStoragePath({ photo: serverPhoto, supabaseUrl }) || serverPhoto.storage_path || '';
  const signedUrl = await getSignedPhotoUrl({
    storagePath,
    fallbackUrl: serverPhoto.image_url || localPreviewUrl || '',
    supabase,
  });
  return {
    ...serverPhoto,
    ...getNameplatePhotoMetadata({ ...queuedPhoto, ...serverPhoto, storage_path: storagePath }),
    storage_path: storagePath,
    original_image_url: serverPhoto.image_url || signedUrl || localPreviewUrl || '',
    signed_url: signedUrl || serverPhoto.image_url || localPreviewUrl || '',
    image_url: signedUrl || serverPhoto.image_url || localPreviewUrl || '',
    uploader_name: queuedPhoto.uploader_name || 'Pracownik',
    upload_status: 'uploaded',
    upload_status_label: 'Zapisano w systemie',
    upload_error: '',
  };
}

async function reconcileQueuedPhotoFromServer({
  supabase,
  supabaseUrl,
  queuedPhoto,
  serverPhoto,
  setJobs,
  setSelectedJob,
  onPhotoUploaded,
}) {
  const localPreviewUrl = queuedPhoto.local_preview_url || queuedPhoto.image_url || '';
  const photoForUi = await createServerPhotoForUi({ supabase, supabaseUrl, serverPhoto, queuedPhoto, localPreviewUrl });
  applyUploadedPhoto({
    jobId: queuedPhoto.job_id,
    localPhotoId: queuedPhoto.id,
    uploadedPhoto: photoForUi,
    localPreviewUrl,
    setJobs,
    setSelectedJob,
  });
  await deletePhotoQueueItem(queuedPhoto.id);
  try {
    onPhotoUploaded?.(photoForUi, queuedPhoto);
  } catch (callbackError) {
    console.warn('Nie udało się odświeżyć karty po uzgodnieniu zdjęcia z serwerem.', callbackError?.message || callbackError);
  }
  return photoForUi;
}

async function findExistingServerPhotoForQueuedPhoto({ supabase, queuedPhoto, allowLegacyNameplate = false }) {
  const storagePath = queuedPhoto.planned_storage_path || queuedPhoto.storage_path || '';
  const exactPhoto = await findServerPhotoByStoragePath({ supabase, jobId: queuedPhoto.job_id, storagePath });
  if (exactPhoto) return exactPhoto;
  if (allowLegacyNameplate) return findLegacyServerNameplate({ supabase, queuedPhoto });
  return null;
}

async function performQueuedPhotoUpload({
  supabase,
  profile,
  queuedPhoto,
  compressImageFn = preparePhotoForUpload,
  setJobs,
  setSelectedJob,
  supabaseUrl,
  onPhotoUploaded,
  onPhotoUploadError,
}) {
  if (!supabase || !profile || !queuedPhoto?.__localFile) return null;

  const allowLegacyNameplate = Boolean(queuedPhoto.legacy_queue_item || !queuedPhoto.upload_key || !queuedPhoto.planned_storage_path);
  queuedPhoto = await ensureQueuedPhotoIdentity(queuedPhoto);
  const jobId = queuedPhoto.job_id;
  const localPhotoId = queuedPhoto.id;
  const localPreviewUrl = queuedPhoto.local_preview_url || queuedPhoto.image_url;

  if (isBrowserOffline()) {
    const localPatch = {
      upload_status: 'local',
      upload_status_label: 'Zapisano na telefonie',
      upload_error: '',
    };
    applyPhotoUpdate({ jobId, photoId: localPhotoId, setJobs, setSelectedJob, updater: localPatch });
    await updatePhotoQueueItem(localPhotoId, localPatch);
    return null;
  }

  const existingServerPhoto = await findExistingServerPhotoForQueuedPhoto({
    supabase,
    queuedPhoto,
    allowLegacyNameplate,
  });
  if (existingServerPhoto) {
    return reconcileQueuedPhotoFromServer({
      supabase,
      supabaseUrl,
      queuedPhoto,
      serverPhoto: existingServerPhoto,
      setJobs,
      setSelectedJob,
      onPhotoUploaded,
    });
  }

  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });

  if (!uploaderId) {
    const sessionPatch = {
      upload_status: 'error',
      upload_status_label: 'Błąd wysyłania',
      upload_error: 'Sesja wygasła. Zaloguj się ponownie — zdjęcie pozostaje zapisane na telefonie.',
    };
    applyPhotoUpdate({
      jobId,
      photoId: localPhotoId,
      setJobs,
      setSelectedJob,
      updater: sessionPatch,
    });
    await updatePhotoQueueItem(localPhotoId, sessionPatch);
    onPhotoUploadError?.();
    return null;
  }

  const uploadingPatch = {
    upload_status: 'uploading',
    upload_status_label: 'Wysyłanie',
    upload_error: '',
    last_attempt_at: new Date().toISOString(),
    retry_count: Number(queuedPhoto.retry_count || 0) + 1,
    next_attempt_at: '',
    lease_until: new Date(Date.now() + PHOTO_UPLOAD_LEASE_MS).toISOString(),
  };
  applyPhotoUpdate({
    jobId,
    photoId: localPhotoId,
    setJobs,
    setSelectedJob,
    updater: uploadingPatch,
  });
  await updatePhotoQueueItem(localPhotoId, uploadingPatch);

  let storagePath = queuedPhoto.planned_storage_path || buildPhotoStoragePath(jobId, queuedPhoto);
  let storageExists = String(queuedPhoto.upload_stage || '') === 'storage_uploaded';
  try {
    let preparedResult;
    let uploadFile = queuedPhoto.__preparedFile || null;
    if (uploadFile) {
      preparedResult = {
        file: uploadFile,
        originalSize: Number(queuedPhoto.upload_original_size || queuedPhoto.__localFile?.size || 0),
        uploadSize: Number(queuedPhoto.upload_file_size || uploadFile.size || 0),
        savedPercent: Number(queuedPhoto.upload_saved_percent || 0),
        compressed: Boolean(queuedPhoto.upload_compressed),
      };
    } else {
      preparedResult = await compressImageFn(queuedPhoto.__localFile);
      uploadFile = preparedResult?.file || preparedResult;
    }

    if (!uploadFile) {
      throw new Error('Nie udało się przygotować zdjęcia do wysłania.');
    }

    const preparedPatch = {
      upload_stage: 'prepared',
      prepared_file: uploadFile,
      prepared_file_name: uploadFile.name || 'zdjecie-wysylka.jpg',
      prepared_file_type: uploadFile.type || 'image/jpeg',
      prepared_file_last_modified: uploadFile.lastModified || Date.now(),
      upload_original_size: preparedResult?.originalSize || queuedPhoto.__localFile?.size || 0,
      upload_file_size: preparedResult?.uploadSize || uploadFile.size || 0,
      upload_saved_percent: preparedResult?.savedPercent || 0,
      upload_compressed: Boolean(preparedResult?.compressed),
    };
    applyPhotoUpdate({
      jobId,
      photoId: localPhotoId,
      setJobs,
      setSelectedJob,
      updater: (photo) => ({
        ...photo,
        upload_status: 'uploading',
        upload_status_label: 'Wysyłanie',
        upload_error: '',
        upload_stage: 'prepared',
        upload_original_size: preparedPatch.upload_original_size,
        upload_file_size: preparedPatch.upload_file_size,
        upload_saved_percent: preparedPatch.upload_saved_percent,
        upload_compressed: preparedPatch.upload_compressed,
      }),
    });

    await updatePhotoQueueItem(localPhotoId, { planned_storage_path: storagePath, ...preparedPatch });

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type || 'image/jpeg' });
    if (uploadError && !isDuplicateStorageError(uploadError)) throw uploadError;
    storageExists = true;
    await updatePhotoQueueItem(localPhotoId, {
      upload_stage: 'storage_uploaded',
      lease_until: new Date(Date.now() + PHOTO_UPLOAD_LEASE_MS).toISOString(),
    });

    if (uploadError && isDuplicateStorageError(uploadError)) {
      const existingAfterStorageConflict = await findServerPhotoByStoragePath({ supabase, jobId, storagePath });
      if (existingAfterStorageConflict) {
        return reconcileQueuedPhotoFromServer({
          supabase,
          supabaseUrl,
          queuedPhoto,
          serverPhoto: existingAfterStorageConflict,
          setJobs,
          setSelectedJob,
          onPhotoUploaded,
        });
      }
    }

    const insertResult = await supabase
      .from('photos')
      .insert({
        job_id: jobId,
        image_url: '',
        storage_path: storagePath,
        uploaded_by: uploaderId,
        photo_kind: queuedPhoto.photo_kind || '',
        device_index: Number(queuedPhoto.device_index || 0),
        unit_ref: String(queuedPhoto.unit_ref || '').toLowerCase(),
      })
      .select('id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref')
      .single();

    if (insertResult.error) {
      if (isDuplicateStorageError(insertResult.error)) {
        const existingAfterInsertConflict = await findServerPhotoByStoragePath({ supabase, jobId, storagePath });
        if (existingAfterInsertConflict) {
          return reconcileQueuedPhotoFromServer({
            supabase,
            supabaseUrl,
            queuedPhoto,
            serverPhoto: existingAfterInsertConflict,
            setJobs,
            setSelectedJob,
            onPhotoUploaded,
          });
        }
      }
      // Plik zostaje pod stala sciezka. Kolejna proba ominie zakonczony etap
      // Storage i dopisze brakujacy rekord bazy, zamiast wysylac zdjecie od nowa.
      throw insertResult.error;
    }

    const insertedPhoto = insertResult.data || {
      id: `server-${storagePath}`,
      job_id: jobId,
      image_url: '',
      storage_path: storagePath,
      uploaded_by: uploaderId,
      created_at: new Date().toISOString(),
    };
    const finalStoragePath = getPhotoStoragePath({ photo: insertedPhoto, supabaseUrl }) || storagePath;
    const signedUrl = await getSignedPhotoUrl({ storagePath: finalStoragePath, fallbackUrl: insertedPhoto.image_url || localPreviewUrl, supabase });
    const photoForUi = {
      ...insertedPhoto,
      ...getNameplatePhotoMetadata({ ...queuedPhoto, ...insertedPhoto, storage_path: finalStoragePath }),
      storage_path: finalStoragePath,
      // Po udanym uploadzie zostawiamy na chwilę lokalną miniaturę jako główne źródło.
      // Cicha synchronizacja szczegółów zamieni ją na signed URL, ale UI nie znika,
      // jeśli signed URL/storage spóźni się o sekundę na iPhonie.
      original_image_url: insertedPhoto.image_url || localPreviewUrl,
      signed_url: signedUrl || localPreviewUrl,
      image_url: localPreviewUrl || signedUrl,
      uploader_name: getUploaderName(profile),
      upload_status: 'uploaded',
      upload_status_label: 'Zapisano w systemie',
      upload_error: '',
      upload_original_size: preparedResult?.originalSize || queuedPhoto.__localFile?.size || 0,
      upload_file_size: preparedResult?.uploadSize || uploadFile.size || 0,
      upload_saved_percent: preparedResult?.savedPercent || 0,
      upload_compressed: Boolean(preparedResult?.compressed),
    };

    applyUploadedPhoto({
      jobId,
      localPhotoId,
      uploadedPhoto: photoForUi,
      localPreviewUrl,
      setJobs,
      setSelectedJob,
    });
    await deletePhotoQueueItem(localPhotoId);

    try {
      onPhotoUploaded?.(photoForUi, queuedPhoto);
    } catch (callbackError) {
      console.warn('Mobilna kolejka zdjęć: nie udało się uruchomić cichej synchronizacji zdjęcia.', callbackError?.message || callbackError);
    }

    return photoForUi;
  } catch (error) {
    const waitingForInternet = isBrowserOffline() || isNetworkUploadError(error);
    const attemptCount = Number(uploadingPatch.retry_count || 1);
    const failurePatch = waitingForInternet
      ? {
        upload_status: 'local',
        upload_status_label: 'Zapisano na telefonie',
        upload_error: 'Zdjęcie czeka na połączenie z internetem.',
        next_attempt_at: new Date(Date.now() + getPhotoRetryDelayMs(attemptCount)).toISOString(),
        lease_until: '',
        upload_stage: storageExists ? 'storage_uploaded' : (queuedPhoto.upload_stage || 'prepared'),
      }
      : {
        upload_status: 'error',
        upload_status_label: 'Błąd wysyłania',
        upload_error: normalizeUploadError(error),
        next_attempt_at: '',
        lease_until: '',
        upload_stage: storageExists ? 'storage_uploaded' : (queuedPhoto.upload_stage || 'prepared'),
      };
    applyPhotoUpdate({
      jobId,
      photoId: localPhotoId,
      setJobs,
      setSelectedJob,
      updater: (photo) => ({ ...photo, ...failurePatch }),
    });
    await updatePhotoQueueItem(localPhotoId, failurePatch);
    console.warn('Mobilna kolejka zdjęć: upload zakończył się błędem.', error?.message || error);
    if (!waitingForInternet) onPhotoUploadError?.(error, queuedPhoto);
    return null;
  }
}

async function uploadQueuedPhoto(options = {}) {
  const queuedPhoto = options.queuedPhoto || {};
  const lockKey = String(queuedPhoto.upload_key || queuedPhoto.id || '').trim();
  if (!lockKey) return performQueuedPhotoUpload(options);
  if (activePhotoUploadPromises.has(lockKey)) {
    return activePhotoUploadPromises.get(lockKey);
  }
  const uploadPromise = performQueuedPhotoUpload(options)
    .finally(() => {
      if (activePhotoUploadPromises.get(lockKey) === uploadPromise) {
        activePhotoUploadPromises.delete(lockKey);
      }
    });
  activePhotoUploadPromises.set(lockKey, uploadPromise);
  return uploadPromise;
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

  if (isLocalQueuedPhoto(photo)) {
    if (getPhotoUploadStatus(photo) === 'uploading') {
      alert('Zdjęcie jest właśnie wysyłane. Poczekaj na status „Zapisano w systemie” albo „Błąd wysyłania”.');
      return false;
    }
    if (!skipConfirmation) {
      const confirmed = window.confirm('Usunąć to zdjęcie z kolejki?');
      if (!confirmed) return false;
    }
    if ([photo.image_url, photo.signed_url, photo.original_image_url].filter(Boolean).includes(previewImage)) {
      setPreviewImage(null);
    }
    applyPhotoRemoval({ photo, setJobs, setSelectedJob });
    await deletePhotoQueueItem(photo.id);
    return true;
  }

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
      signedPhotoUrlCache.delete(storagePath);
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
      alert('Supabase blokuje usunięcie zdjęcia. Trzeba odblokować DELETE dla tabeli photos albo storage job-photos.');
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
  compressImageFn = preparePhotoForUpload,
  setJobs,
  setSelectedJob,
  supabaseUrl,
  onPhotoUploaded,
  onPhotoUploadError,
}) {
  if (!supabase || !profile) return;
  const files = Array.from(event?.target?.files || []);
  if (event?.target) event.target.value = '';
  if (!files.length) return;

  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });
  if (!uploaderId) {
    alert('Sesja wygasła. Zaloguj się ponownie i dodaj zdjęcie jeszcze raz.');
    return;
  }

  const queuedCandidates = await Promise.all(files.map((file) => createQueuedPhoto({ file, jobId, profile, uploaderId })));
  const queuedPhotos = [...new Map(queuedCandidates.map((photo) => [String(photo.id), photo])).values()];
  queuedPhotos.forEach((photo) => {
    setJobs?.((prev) => prev.map((job) => mergePhotoIntoJob(job, photo)));
    setSelectedJob?.((prev) => (prev && String(prev.id) === String(jobId) ? mergePhotoIntoJob(prev, photo) : prev));
  });
  const persistenceResults = await Promise.all(queuedPhotos.map(async (photo) => ({
    photo,
    saved: await savePhotoQueueItem(photo),
  })));
  const persistedPhotos = persistenceResults.filter((item) => item.saved).map((item) => item.photo);
  const failedPhotos = persistenceResults.filter((item) => !item.saved).map((item) => item.photo);

  failedPhotos.forEach((photo) => {
    applyPhotoRemoval({ photo, setJobs, setSelectedJob });
  });

  if (failedPhotos.length) {
    const localSaveError = new Error(`${failedPhotos.length} ${failedPhotos.length === 1 ? 'zdjęcia nie udało się' : 'zdjęć nie udało się'} zapisać w pamięci telefonu.`);
    onPhotoUploadError?.(localSaveError);
  }

  if (!persistedPhotos.length) {
    return { queuedCount: 0, uploadedCount: 0, failedCount: failedPhotos.length };
  }

  if (isBrowserOffline()) return { queuedCount: persistedPhotos.length, uploadedCount: 0, failedCount: failedPhotos.length };

  // Kolejka działa w tle i nie blokuje karty montażu. Zdjęcia idą po kolei,
  // żeby na słabszym LTE telefon nie próbował wysłać kilku dużych plików naraz.
  void (async () => {
    for (const queuedPhoto of persistedPhotos) {
      await uploadQueuedPhoto({
        supabase,
        profile,
        queuedPhoto,
        compressImageFn,
        setJobs,
        setSelectedJob,
        supabaseUrl,
        onPhotoUploaded,
        onPhotoUploadError,
      });
    }
  })();
  return { queuedCount: persistedPhotos.length, uploadedCount: 0, failedCount: failedPhotos.length };
}

export async function uploadJobDocumentationPhotos({
  supabase,
  profile,
  jobId,
  documents = [],
  compressImageFn = prepareNameplatePhotoForUpload,
  setJobs,
  setSelectedJob,
  supabaseUrl,
  onPhotoUploaded,
  onPhotoUploadError,
  background = false,
}) {
  if (!supabase || !profile || !jobId) return { uploadedCount: 0, queuedCount: 0, failedCount: 0, photos: [] };
  const validDocuments = documents.filter((document) => document?.file);
  if (!validDocuments.length) return { uploadedCount: 0, queuedCount: 0, failedCount: 0, photos: [] };

  const uploaderId = await getAuthenticatedUploaderId({ supabase, profile });
  if (!uploaderId) {
    return { uploadedCount: 0, queuedCount: 0, failedCount: validDocuments.length, photos: [] };
  }

  const queuedCandidates = await Promise.all(validDocuments.map((document) => createQueuedPhoto({
    file: document.file,
    jobId,
    profile,
    uploaderId,
    metadata: {
      photo_kind: 'nameplate',
      device_index: Number(document.deviceIndex || 0) + 1,
      unit_ref: document.unitRef || 'unit',
      device_ref: document.deviceRef || '',
      serial_number: document.serialNumber || '',
      documentation_label: document.documentationLabel || '',
    },
  })));
  const queuedPhotos = [...new Map(queuedCandidates.map((photo) => [String(photo.id), photo])).values()];

  queuedPhotos.forEach((photo) => {
    setJobs?.((prev) => prev.map((job) => mergePhotoIntoJob(job, photo)));
    setSelectedJob?.((prev) => (prev && String(prev.id) === String(jobId) ? mergePhotoIntoJob(prev, photo) : prev));
  });

  const persisted = await Promise.all(queuedPhotos.map((photo) => savePhotoQueueItem(photo)));
  const failedToPersist = persisted.filter((saved) => !saved).length;
  if (failedToPersist) {
    return { uploadedCount: 0, queuedCount: queuedPhotos.length - failedToPersist, failedCount: failedToPersist, photos: [] };
  }

  if (isBrowserOffline()) {
    return { uploadedCount: 0, queuedCount: queuedPhotos.length, failedCount: 0, photos: [] };
  }

  if (background) {
    void (async () => {
      for (const queuedPhoto of queuedPhotos) {
        try {
          await uploadQueuedPhoto({
            supabase,
            profile,
            queuedPhoto,
            compressImageFn,
            setJobs,
            setSelectedJob,
            supabaseUrl,
            onPhotoUploaded,
            onPhotoUploadError,
          });
        } catch (error) {
          onPhotoUploadError?.(error);
        }
      }
    })();
    return { uploadedCount: 0, queuedCount: queuedPhotos.length, backgroundCount: queuedPhotos.length, failedCount: 0, photos: [] };
  }

  const uploadedPhotos = [];
  let waitingCount = 0;
  let failedCount = 0;
  for (const queuedPhoto of queuedPhotos) {
    const uploadedPhoto = await uploadQueuedPhoto({
      supabase,
      profile,
      queuedPhoto,
      compressImageFn,
      setJobs,
      setSelectedJob,
      supabaseUrl,
      onPhotoUploaded,
      onPhotoUploadError,
    });
    if (uploadedPhoto) uploadedPhotos.push(uploadedPhoto);
    else {
      const latestItems = await listPhotoQueueItems();
      const latest = latestItems.find((item) => String(item.id) === String(queuedPhoto.id));
      if (latest && String(latest.upload_status || '').toLowerCase() !== 'error') waitingCount += 1;
      else failedCount += 1;
    }
  }

  return {
    uploadedCount: uploadedPhotos.length,
    queuedCount: waitingCount,
    failedCount,
    photos: uploadedPhotos,
  };

}

export async function restorePersistedJobPhotos({
  supabase,
  supabaseUrl,
  profile,
  setJobs,
  setSelectedJob,
  onPhotoUploaded,
} = {}) {
  const profileId = String(profile?.id || '').trim();
  const records = (await listPhotoQueueItems()).filter((record) => !profileId || !record.uploaded_by || String(record.uploaded_by) === profileId);
  const hydratedPhotos = [];

  for (const record of records) {
    let photo = hydratePhotoQueueItem(record, createLocalPreviewUrl);
    if (!photo) continue;

    if (supabase && !isBrowserOffline()) {
      const allowLegacyNameplate = Boolean(record.legacy_queue_item || !record.upload_key || !record.planned_storage_path);
      photo = await ensureQueuedPhotoIdentity(photo);
      const serverPhoto = await findExistingServerPhotoForQueuedPhoto({
        supabase,
        queuedPhoto: photo,
        allowLegacyNameplate,
      });
      if (serverPhoto) {
        await reconcileQueuedPhotoFromServer({
          supabase,
          supabaseUrl,
          queuedPhoto: photo,
          serverPhoto,
          setJobs,
          setSelectedJob,
          onPhotoUploaded,
        });
        continue;
      }
    }

    hydratedPhotos.push(photo);
    setJobs?.((prev) => prev.map((job) => mergePhotoIntoJob(job, photo)));
    setSelectedJob?.((prev) => (prev && String(prev.id) === String(photo.job_id) ? mergePhotoIntoJob(prev, photo) : prev));
  }
  return hydratedPhotos;
}

async function runPersistedPhotoUploads({
  supabase,
  profile,
  setJobs,
  setSelectedJob,
  supabaseUrl,
  onPhotoUploaded,
  onPhotoUploadError,
  onQueueStart,
  onQueueIdle,
  includeErrors = false,
} = {}) {
  if (!supabase || !profile || isBrowserOffline()) return { processed: 0, uploaded: 0 };
  await recoverStalePhotoQueueItems();
  const profileId = String(profile?.id || '').trim();
  const records = (await listPhotoQueueItems()).filter((record) => (
    !profileId || !record.uploaded_by || String(record.uploaded_by) === profileId
  )).filter((record) => includeErrors || photoQueueItemIsDue(record));
  if (!records.length) {
    onQueueIdle?.();
    return { processed: 0, uploaded: 0 };
  }

  onQueueStart?.();
  let uploaded = 0;
  let processed = 0;
  let failed = 0;
  for (const queuedRecord of records) {
    if (isBrowserOffline()) break;
    const record = await claimPhotoQueueItem(queuedRecord.id, { leaseMs: PHOTO_UPLOAD_LEASE_MS, force: includeErrors });
    if (!record) continue;
    let queuedPhoto = hydratePhotoQueueItem(record, createLocalPreviewUrl);
    if (!queuedPhoto) continue;
    const allowLegacyNameplate = Boolean(record.legacy_queue_item || !record.upload_key || !record.planned_storage_path);
    queuedPhoto = await ensureQueuedPhotoIdentity(queuedPhoto);

    const serverPhoto = await findExistingServerPhotoForQueuedPhoto({
      supabase,
      queuedPhoto,
      allowLegacyNameplate,
    });
    if (serverPhoto) {
      await reconcileQueuedPhotoFromServer({
        supabase,
        supabaseUrl,
        queuedPhoto,
        serverPhoto,
        setJobs,
        setSelectedJob,
        onPhotoUploaded,
      });
      processed += 1;
      uploaded += 1;
      continue;
    }

    if (!includeErrors && String(record.upload_status || 'local').toLowerCase() === 'error') {
      continue;
    }

    setJobs?.((prev) => prev.map((job) => mergePhotoIntoJob(job, queuedPhoto)));
    setSelectedJob?.((prev) => (prev && String(prev.id) === String(queuedPhoto.job_id) ? mergePhotoIntoJob(prev, queuedPhoto) : prev));
    const compressImageFn = queuedPhoto.photo_kind === 'nameplate'
      ? prepareNameplatePhotoForUpload
      : preparePhotoForUpload;
    const result = await uploadQueuedPhoto({
      supabase,
      profile,
      queuedPhoto,
      compressImageFn,
      setJobs,
      setSelectedJob,
      supabaseUrl,
      onPhotoUploaded,
      onPhotoUploadError,
    });
    processed += 1;
    if (result) {
      uploaded += 1;
    } else {
      const latestItems = await listPhotoQueueItems();
      const latest = latestItems.find((item) => String(item.id) === String(record.id));
      if (String(latest?.upload_status || '').toLowerCase() === 'error') failed += 1;
    }
  }
  if (failed > 0) onPhotoUploadError?.(new Error(`Nie udało się wysłać ${failed} zdjęć z kolejki.`));
  else onQueueIdle?.();
  return { processed, uploaded, failed };
}

export function resumePersistedPhotoUploads(options = {}) {
  if (persistedQueueResumePromise) return persistedQueueResumePromise;
  persistedQueueResumePromise = runPersistedPhotoUploads(options)
    .finally(() => {
      persistedQueueResumePromise = null;
    });
  return persistedQueueResumePromise;
}

export async function retryAllPersistedPhotoUploads(options = {}) {
  if (persistedQueueResumePromise) {
    try {
      await persistedQueueResumePromise;
    } catch {
      // Nowa ręczna próba ma wystartować także po błędzie poprzedniej synchronizacji.
    }
  }
  return runPersistedPhotoUploads({ ...options, includeErrors: true });
}

export function retryQueuedJobPhoto({
  supabase,
  profile,
  photo,
  compressImageFn = preparePhotoForUpload,
  setJobs,
  setSelectedJob,
  supabaseUrl,
  onPhotoUploaded,
  onPhotoUploadError,
}) {
  if (!isLocalQueuedPhoto(photo)) return false;

  void (async () => {
    let queuedPhoto = photo;
    const records = await listPhotoQueueItems();
    const record = records.find((item) => String(item.id) === String(photo.id));
    if (record) queuedPhoto = hydratePhotoQueueItem(record, createLocalPreviewUrl);

    if (!queuedPhoto?.__localFile) {
      const missingFilePatch = {
        upload_status: 'error',
        upload_status_label: 'Błąd wysyłania',
        upload_error: 'Nie znaleziono lokalnego pliku. Dodaj zdjęcie ponownie.',
      };
      applyPhotoUpdate({
        jobId: photo.job_id,
        photoId: photo.id,
        setJobs,
        setSelectedJob,
        updater: missingFilePatch,
      });
      await updatePhotoQueueItem(photo.id, missingFilePatch);
      onPhotoUploadError?.(new Error('Brak lokalnego pliku zdjęcia do ponowienia.'), photo);
      return;
    }

    const effectiveCompressImageFn = queuedPhoto?.photo_kind === 'nameplate' && compressImageFn === preparePhotoForUpload
      ? prepareNameplatePhotoForUpload
      : compressImageFn;

    await uploadQueuedPhoto({
      supabase,
      profile,
      queuedPhoto,
      compressImageFn: effectiveCompressImageFn,
      setJobs,
      setSelectedJob,
      supabaseUrl,
      onPhotoUploaded,
      onPhotoUploadError,
    });
  })();
  return true;
}
