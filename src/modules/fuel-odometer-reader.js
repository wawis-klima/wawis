import { prepareOdometerPhoto, readPreparedOdometerWithAi } from './fuel-odometer-ai.js';
import { readOdometerLocally } from './fuel-odometer-ocr.js';

export async function readOdometerPhoto({ file, supabase, onProgress = () => {} }) {
  const prepared = await prepareOdometerPhoto(file);
  try {
    const local = await readOdometerLocally(prepared.imageDataUrl, { onProgress });
    if (local.reliable && Number.isInteger(local.odometerKm)) {
      onProgress({ stage: 'completed', label: 'Lokalny OCR pewnie odczytał licznik.' });
      return { ...prepared, ...local, source: 'local_ocr', fallbackReason: '' };
    }
    onProgress({ stage: 'openai', label: 'Lokalny OCR nie jest pewny — sprawdzam zdjęcie przez AI…' });
  } catch (error) {
    onProgress({ stage: 'openai', label: 'Lokalny OCR nie zakończył odczytu — sprawdzam zdjęcie przez AI…' });
  }

  const ai = await readPreparedOdometerWithAi({ prepared, supabase });
  return { ...ai, source: 'openai', fallbackReason: 'local_ocr_uncertain' };
}
