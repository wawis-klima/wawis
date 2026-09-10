const ODOMETER_AI_TIMEOUT_MS = 60000;
const MAX_IMAGE_DIMENSION = 1800;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie udało się przygotować zdjęcia licznika.')); };
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Nie udało się skompresować zdjęcia licznika.'));
    }, 'image/jpeg', 0.86);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia licznika.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareOdometerPhoto(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Wybierz prawidłowe zdjęcie licznika.');
  }
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Przeglądarka nie udostępniła modułu obrazu.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas);
  const imageDataUrl = await blobToDataUrl(blob);
  if (imageDataUrl.length > 4_500_000) throw new Error('Zdjęcie jest zbyt duże. Zrób bliższe zdjęcie samego licznika.');
  return { blob, imageDataUrl, width: canvas.width, height: canvas.height };
}

export function normalizeOdometerAiResult(payload = {}) {
  const result = payload?.result || payload || {};
  const odometerKm = Number(result.odometer_km);
  const confidence = Math.max(0, Math.min(1, Number(result.confidence || 0)));
  const displayKind = String(result.display_kind || 'unknown');
  if (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > 5000000 || displayKind !== 'odometer') {
    throw new Error('AI nie rozpoznała głównego licznika ODO. Zrób wyraźniejsze zdjęcie całego wyświetlacza.');
  }
  return {
    odometerKm,
    confidence,
    visibleDigits: String(result.visible_digits || ''),
    notes: String(result.notes || ''),
  };
}

export async function readPreparedOdometerWithAi({ prepared, supabase }) {
  const sessionResult = await supabase?.auth?.getSession?.();
  const accessToken = sessionResult?.data?.session?.access_token || '';
  if (!accessToken) throw new Error('Sesja administratora wygasła. Zaloguj się ponownie.');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ODOMETER_AI_TIMEOUT_MS);
  try {
    const response = await fetch('/api/read-odometer-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ imageDataUrl: prepared.imageDataUrl }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Nie udało się odczytać licznika przez AI.');
    return { ...prepared, ...normalizeOdometerAiResult(payload) };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Odczyt licznika przekroczył limit czasu. Spróbuj ponownie.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readOdometerPhotoWithAi({ file, supabase }) {
  const prepared = await prepareOdometerPhoto(file);
  return readPreparedOdometerWithAi({ prepared, supabase });
}
