export function buildDeviceModelValue(manufacturer = '', model = '') {
  const cleanManufacturer = String(manufacturer || '').trim();
  const cleanModel = String(model || '').trim();
  if (!cleanManufacturer) return cleanModel;
  if (!cleanModel) return cleanManufacturer;
  const normalize = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (normalize(cleanModel).startsWith(normalize(cleanManufacturer))) return cleanModel;
  return `${cleanManufacturer} ${cleanModel}`;
}

export async function fetchDesktopNameplateFile(imageUrl, filename = 'tabliczka.jpg', { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(imageUrl || ''), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Nie udało się pobrać zdjęcia tabliczki (${response.status}).`);
    const blob = await response.blob();
    if (!String(blob.type || '').startsWith('image/')) throw new Error('Pobrany plik nie jest zdjęciem.');
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Pobieranie zdjęcia tabliczki trwało zbyt długo. Zamknij okno i spróbuj ponownie.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
