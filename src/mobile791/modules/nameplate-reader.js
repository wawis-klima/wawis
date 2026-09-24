import { buildDeviceModelValue } from '../../modules/desktop-nameplate-reader-utils.js';
import {
  getNameplateTargetMismatch,
  scanDesktopNameplateBarcodes,
} from '../../modules/desktop-nameplate-barcode.js';
import { readDesktopNameplateWithAi } from '../../modules/desktop-nameplate-ai.js';
import {
  scanDesktopNameplateModelCode,
  scanDesktopNameplateSerialText,
} from '../../modules/desktop-nameplate-model-ocr.js';
import { lookupNameplateProductByEan } from '../../modules/nameplate-product-catalog.js';

const BARCODE_SCAN_TIMEOUT_MS = 95000;
const MODEL_OCR_TIMEOUT_MS = 60000;
const SERIAL_OCR_TIMEOUT_MS = 45000;
const CATALOG_LOOKUP_TIMEOUT_MS = 7000;
const AI_READ_TIMEOUT_MS = 60000;

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSerial(value = '') {
  return normalizeText(value).toUpperCase();
}

function getTargetLabel(unitRef = '') {
  const normalized = String(unitRef || '').toLowerCase();
  if (normalized === 'jz') return 'JZ';
  if (normalized.startsWith('jw-')) return `JW${Number(normalized.split('-')[1] || 1)}`;
  return normalized.toUpperCase() || 'tabliczka';
}

function buildResolvedModelValue({ manufacturer = '', model = '', power = '' } = {}) {
  const normalizedModel = normalizeText(model);
  const normalizedPower = normalizeText(power);
  const combinedModel = `${normalizedModel}${normalizedPower && !normalizedModel.includes(normalizedPower) ? ` ${normalizedPower}` : ''}`.trim();
  return buildDeviceModelValue(normalizeText(manufacturer), combinedModel);
}

function resultFromExactModel(exactModel = null) {
  if (!exactModel) {
    return {
      manufacturer: '',
      model: '',
      power: '',
      modelValue: '',
    };
  }
  const power = exactModel.capacityKw ? `${exactModel.capacityKw} kW` : '';
  const manufacturer = exactModel.manufacturer || 'Rotenso';
  const model = exactModel.model || exactModel.code || '';
  return {
    manufacturer,
    model,
    power,
    modelValue: buildResolvedModelValue({ manufacturer, model, power }),
  };
}

export function isMobileNameplateReadingComplete(reading = {}) {
  return Boolean(
    normalizeText(reading.modelValue)
    && normalizeSerial(reading.serialNumber)
    && !reading.mismatch,
  );
}

export async function readMobileNameplate({
  file,
  supabase,
  jobId = '',
  targetUnit = '',
  onProgress,
} = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Brak prawidłowego zdjęcia tabliczki.');
  }

  onProgress?.({ progress: 4, label: 'Uruchamiam lokalny odczyt tabliczki…', method: 'local' });
  let barcodeInfo = { detections: [], values: [], ean: '', serialNumber: '', rotensoModel: null };
  let barcodeError = '';
  try {
    barcodeInfo = await withTimeout(
      scanDesktopNameplateBarcodes(file, {
        onProgress: (state) => onProgress?.({ ...state, method: 'local' }),
      }),
      BARCODE_SCAN_TIMEOUT_MS,
      'Lokalny odczyt kodów trwał zbyt długo.',
    );
  } catch (error) {
    barcodeError = error?.message || 'Lokalny czytnik kodów nie zwrócił wyniku.';
  }

  let exactModel = barcodeInfo.rotensoModel || null;
  let serialNumber = normalizeSerial(barcodeInfo.serialNumber);
  let serialTextResult = null;
  let modelTextResult = null;

  if (!serialNumber) {
    try {
      serialTextResult = await withTimeout(
        scanDesktopNameplateSerialText(file, {
          onProgress: (state) => onProgress?.({ ...state, method: 'local' }),
        }),
        SERIAL_OCR_TIMEOUT_MS,
        'Lokalny odczyt numeru seryjnego trwał zbyt długo.',
      );
      serialNumber = normalizeSerial(serialTextResult?.serialNumber);
    } catch (error) {
      serialTextResult = { serialNumber: '', error: error?.message || 'Nie odczytano numeru seryjnego lokalnie.' };
    }
  }

  if (!exactModel) {
    try {
      modelTextResult = await withTimeout(
        scanDesktopNameplateModelCode(file, {
          onProgress: (state) => onProgress?.({ ...state, method: 'local' }),
        }),
        MODEL_OCR_TIMEOUT_MS,
        'Lokalny odczyt modelu trwał zbyt długo.',
      );
      if (modelTextResult?.reliable && modelTextResult?.exactModel) {
        exactModel = modelTextResult.exactModel;
      }
    } catch (error) {
      modelTextResult = { reliable: false, error: error?.message || 'Nie odczytano modelu lokalnie.' };
    }
  }

  if (barcodeInfo.ean) {
    try {
      const catalog = await withTimeout(
        lookupNameplateProductByEan({ supabase, ean: barcodeInfo.ean }),
        CATALOG_LOOKUP_TIMEOUT_MS,
        'Katalog EAN nie odpowiedział.',
      );
      if (catalog?.resolution) exactModel = catalog.resolution;
    } catch (error) {
      // Brak odpowiedzi katalogu nie przekreśla lokalnego wyniku czytnika.
    }
  }

  const localModel = resultFromExactModel(exactModel);
  const localMismatch = getNameplateTargetMismatch(targetUnit, exactModel);
  const localReading = {
    method: 'local',
    ...localModel,
    serialNumber,
    exactModel,
    mismatch: localMismatch,
    barcodeInfo: { ...barcodeInfo, rotensoModel: exactModel },
    serialTextResult,
    modelTextResult,
    aiAttempted: false,
    aiError: '',
    barcodeError,
  };

  if (isMobileNameplateReadingComplete(localReading) || localMismatch) {
    onProgress?.({
      progress: 100,
      label: localMismatch ? 'Odczyt zakończony — sprawdź zgodność jednostki' : 'Tabliczka odczytana lokalnie',
      method: 'local',
    });
    return localReading;
  }

  onProgress?.({ progress: 8, label: 'Lokalny odczyt jest niepełny — uruchamiam AI…', method: 'ai' });
  try {
    const aiResult = await withTimeout(
      readDesktopNameplateWithAi({
        file,
        supabase,
        barcodeInfo: { ...barcodeInfo, rotensoModel: exactModel },
        targetUnit: getTargetLabel(targetUnit),
        jobId,
        onProgress: (state) => onProgress?.({ ...state, method: 'ai' }),
      }),
      AI_READ_TIMEOUT_MS,
      'Analiza AI nie odpowiedziała w ciągu 60 sekund.',
    );

    const finalExactModel = aiResult.exactModel || exactModel || null;
    const exactModelFields = resultFromExactModel(finalExactModel);
    const manufacturer = aiResult.manufacturer || exactModelFields.manufacturer;
    const model = aiResult.model || exactModelFields.model;
    const power = aiResult.power || exactModelFields.power;
    const modelValue = buildResolvedModelValue({ manufacturer, model, power }) || localModel.modelValue;
    const finalSerial = normalizeSerial(aiResult.serialNumber || serialNumber);
    const mismatch = getNameplateTargetMismatch(targetUnit, finalExactModel);

    return {
      method: 'ai',
      manufacturer,
      model,
      power,
      modelValue,
      serialNumber: finalSerial,
      exactModel: finalExactModel,
      mismatch,
      barcodeInfo: { ...barcodeInfo, rotensoModel: finalExactModel },
      serialTextResult,
      modelTextResult,
      aiAttempted: true,
      aiError: '',
      barcodeError,
      aiResult,
    };
  } catch (error) {
    return {
      ...localReading,
      aiAttempted: true,
      aiError: error?.message || 'Nie udało się odczytać tabliczki przez AI.',
    };
  }
}
