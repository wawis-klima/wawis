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
import { reconcileNameplateSerial, resolveNameplateSerialWithVisualAi } from './nameplate-serial-verification.js';

const BARCODE_SCAN_TIMEOUT_MS = 95000;
const MODEL_OCR_TIMEOUT_MS = 60000;
const SERIAL_OCR_TIMEOUT_MS = 45000;
const CATALOG_LOOKUP_TIMEOUT_MS = 7000;
const AI_READ_TIMEOUT_MS = 60000;
const MOBILE_IMAGE_MAX_DIMENSION = 1800;

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

const NAMEPLATE_PRIMARY_KEYWORD_RE = /\b(?:ROTENSO|MODEL|EAN|REFRIGERANT|VOLTAGE|CAPACITY|COOLING|HEATING)\b/gi;
const NAMEPLATE_SECONDARY_KEYWORD_RE = /\b(?:INPUT|OUTPUT|INDOOR|OUTDOOR|UNIT|MADE\s+IN)\b/gi;
const NAMEPLATE_SERIAL_LABEL_RE = /(?:^|\b)(?:S\s*[/.-]?\s*N|SERIAL)\s*[:;=._-]?/i;
const NAMEPLATE_TECHNICAL_VALUE_RE = /\b(?:\d{2,3}\s*V|\d{2,3}\s*HZ|\d+(?:[.,]\d+)?\s*KW|\d{3,6}\s*BTU|R(?:32|410A|290))\b/i;
const NAMEPLATE_MODELISH_TOKEN_RE = /\b[A-Z]{1,8}[-_/]?\d{2,}[A-Z0-9._/-]*\b/i;

export function getMobileNameplateEvidence({
  barcodeInfo = {},
  serialTextResult = null,
  modelTextResult = null,
  exactModel = null,
  serialNumber = '',
} = {}) {
  const rawText = [
    serialTextResult?.rawText,
    modelTextResult?.rawText,
  ].filter(Boolean).join('\n').toUpperCase();

  const primaryMatches = rawText.match(NAMEPLATE_PRIMARY_KEYWORD_RE) || [];
  const secondaryMatches = rawText.match(NAMEPLATE_SECONDARY_KEYWORD_RE) || [];
  const primaryKeywords = new Set(primaryMatches.map((value) => value.replace(/\s+/g, '').toUpperCase()));
  const secondaryKeywords = new Set(secondaryMatches.map((value) => value.replace(/\s+/g, '').toUpperCase()));
  const digitCount = (rawText.match(/\d/g) || []).length;
  const lineCount = rawText.split(/\n+/).map((line) => line.trim()).filter(Boolean).length;
  const hasTechnicalValue = NAMEPLATE_TECHNICAL_VALUE_RE.test(rawText);
  const modelishTokens = rawText.match(new RegExp(NAMEPLATE_MODELISH_TOKEN_RE.source, 'gi')) || [];
  const hasSerialLabel = NAMEPLATE_SERIAL_LABEL_RE.test(rawText);

  const hasRawEan = Boolean(normalizeText(barcodeInfo?.ean));
  const trustedExactModel = Boolean(exactModel?.code || exactModel?.model);

  const barcodeSerial = normalizeSerial(barcodeInfo?.serialNumber);
  const barcodeSerialSource = String(barcodeInfo?.serialSource || '').toLowerCase();
  const trustedBarcodeSerial = Boolean(
    barcodeSerial
    && ['universal_barcode', 'native_barcode'].includes(barcodeSerialSource),
  );

  const focusedSerial = normalizeSerial(serialTextResult?.serialNumber);
  const focusedSerialVotes = Number(serialTextResult?.votes || 0);
  const focusedSerialConfidence = Number(serialTextResult?.confidence || 0);
  const trustedFocusedSerial = Boolean(
    focusedSerial
    && hasSerialLabel
    && focusedSerialVotes >= 2
    && focusedSerialConfidence >= 45,
  );

  // Długi numer seryjny często wygląda dla prostego regexu jak kod modelu.
  // Nie wolno więc używać tego samego ciągu jednocześnie jako SN i jako
  // "niezależnego" dowodu modelu.
  const knownSerialTokens = new Set(
    [barcodeSerial, focusedSerial, normalizeSerial(serialNumber)].filter(Boolean),
  );
  const hasModelishToken = modelishTokens.some((token) => (
    !knownSerialTokens.has(normalizeSerial(token))
  ));

  // Tekst musi zawierać co najmniej dwa niezależne ślady tabliczki albo
  // jeden charakterystyczny nagłówek wsparty wartością techniczną/kodem modelu.
  // Ogólne słowa typu UNIT / INPUT / OUTPUT nie wystarczają samodzielnie.
  const textSignature = Boolean(
    primaryKeywords.size >= 2
    || (primaryKeywords.size >= 1 && (hasTechnicalValue || hasModelishToken))
    || (
      primaryKeywords.size >= 1
      && secondaryKeywords.size >= 1
      && digitCount >= 6
      && lineCount >= 2
    ),
  );

  // Pojedynczy, przypadkowy "kod" lub halucynowany SN nie może już otwierać AI.
  // Numer seryjny musi pochodzić z zaufanego dekodera / wielokrotnego OCR
  // i mieć niezależny kontekst tabliczki.
  const hasIndependentSerialContext = Boolean(
    primaryKeywords.size >= 1
    || hasTechnicalValue
    || hasModelishToken,
  );
  const supportedSerialSignal = Boolean(
    (trustedBarcodeSerial || trustedFocusedSerial)
    && hasIndependentSerialContext,
  );

  // Sam poprawny EAN nie jest dowodem tabliczki — taki kod ma praktycznie każdy produkt,
  // w tym butelki, żywność i opakowania. EAN może pomóc tylko wtedy, gdy:
  // 1) został rozwiązany do dokładnego modelu z katalogu, albo
  // 2) na zdjęciu są niezależne cechy tabliczki.
  const supportedEanSignal = Boolean(
    hasRawEan
    && (trustedExactModel || textSignature || supportedSerialSignal),
  );

  const strongSignals = [];
  if (supportedEanSignal) strongSignals.push('ean_with_context');
  if (trustedExactModel) strongSignals.push('exact_model');
  if (textSignature) strongSignals.push('technical_text');
  if (supportedSerialSignal) strongSignals.push('supported_serial');

  let score = 0;
  if (trustedExactModel) score += 10;
  if (textSignature) score += 6;
  if (supportedSerialSignal) score += 4;
  if (supportedEanSignal) score += 3;
  score += Math.min(4, primaryKeywords.size * 2);
  if (hasTechnicalValue) score += 1;
  if (hasModelishToken) score += 1;

  return {
    hasEvidence: trustedExactModel || textSignature || supportedSerialSignal || supportedEanSignal,
    score,
    strongSignals,
    keywordCount: primaryKeywords.size,
    secondaryKeywordCount: secondaryKeywords.size,
    digitCount,
    lineCount,
    hasTechnicalValue,
    hasModelishToken,
    hasSerialLabel,
    hasRawEan,
    supportedEanSignal,
    trustedBarcodeSerial,
    trustedFocusedSerial,
    ignoredGenericSerial: Boolean(normalizeSerial(serialNumber) && !supportedSerialSignal),
    rawText,
  };
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

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
}

const EAN_LIKE_RE = /^\d{8}$|^\d{12,14}$/;

function pickSerialLikeToken(text = '', usable = (value) => value) {
  const tokens = String(text || '').toUpperCase().match(/[A-Z0-9][A-Z0-9-]{9,29}/g) || [];
  const candidates = tokens
    .map((token) => token.replace(/-/g, ''))
    .filter((token) => token.length >= 10 && token.length <= 30)
    .filter((token) => /[A-Z]/.test(token) && (token.match(/\d/g) || []).length >= 6)
    .filter((token) => !/(?:EAN|KW|BTU|HZ|REFRIGERANT|MODEL)/.test(token))
    .map((token) => usable(token))
    .filter(Boolean);
  return candidates.sort((left, right) => right.length - left.length)[0] || '';
}

// WAWIS 13.69: gdy AI jest niedostępne (brak internetu albo błąd AI), pole nie zostaje
// całkiem puste — podajemy kandydata z lokalnego czytnika. To NIE jest potwierdzenie:
// formularz wymaga sprawdzenia SN znak po znaku. Nigdy nie podstawiamy EAN.
export function getNameplateLocalFallbackCandidates({
  serialCheck = {},
  serialTextResult = null,
  modelTextResult = null,
  barcodeInfo = {},
  modelValue = '',
  allowUnsupportedOcr = false,
} = {}) {
  const ean = normalizeSerial(barcodeInfo?.ean).replace(/\s+/g, '');
  const usable = (value) => {
    const candidate = normalizeSerial(value).replace(/\s+/g, '');
    if (!candidate || candidate.length < 6) return '';
    if (ean && candidate === ean) return '';
    if (EAN_LIKE_RE.test(candidate)) return '';
    return candidate;
  };

  let serialNumber = '';
  let serialSource = '';
  const status = serialCheck?.status;
  if (status === 'conflict') {
    serialNumber = usable(serialCheck.barcodeSerial);
    serialSource = serialNumber ? 'barcode' : '';
    if (!serialNumber) {
      serialNumber = usable(serialCheck.ocrSerial);
      serialSource = serialNumber ? 'ocr' : '';
    }
  } else if (status === 'missing' && allowUnsupportedOcr) {
    // Pojedynczy przebieg OCR — tylko gdy na zdjęciu był napis S/N / SERIAL.
    const rawText = String(serialTextResult?.rawText || '');
    if (NAMEPLATE_SERIAL_LABEL_RE.test(rawText)) {
      serialNumber = usable(serialTextResult?.serialNumber);
      serialSource = serialNumber ? 'ocr_single' : '';
    }
    if (!serialNumber) {
      // Napis S/N bywa nieczytelny dla OCR, choć sam numer jest odczytany. Bez internetu
      // podajemy najdłuższy ciąg wyglądający jak numer seryjny (litery + ≥6 cyfr, 10–30 znaków),
      // z pominięciem EAN, kodów modelu i wartości technicznych — wyłącznie do sprawdzenia.
      serialNumber = pickSerialLikeToken([rawText, modelTextResult?.rawText].filter(Boolean).join('\n'), usable);
      serialSource = serialNumber ? 'ocr_token' : '';
    }
  }

  let fallbackModelValue = '';
  if (!normalizeText(modelValue) && modelTextResult?.exactModel && !modelTextResult?.reliable) {
    fallbackModelValue = resultFromExactModel(modelTextResult.exactModel).modelValue;
  }

  return { serialNumber, serialSource, modelValue: fallbackModelValue };
}

function withLocalFallback(reading, { offline = false } = {}) {
  const candidates = getNameplateLocalFallbackCandidates({
    serialCheck: reading.serialCheck,
    serialTextResult: reading.serialTextResult,
    modelTextResult: reading.modelTextResult,
    barcodeInfo: reading.barcodeInfo,
    modelValue: reading.modelValue,
    allowUnsupportedOcr: offline,
  });
  return { ...reading, aiUnavailable: true, offline, localCandidates: candidates };
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
        maxDimension: MOBILE_IMAGE_MAX_DIMENSION,
      }),
      BARCODE_SCAN_TIMEOUT_MS,
      'Lokalny odczyt kodów trwał zbyt długo.',
    );
  } catch (error) {
    barcodeError = error?.message || 'Lokalny czytnik kodów nie zwrócił wyniku.';
  }

  let exactModel = barcodeInfo.rotensoModel || null;
  let serialTextResult = null;
  let modelTextResult = null;

  // Always read the printed SN independently, even if Code 128 decoded a
  // plausible serial. A barcode alone must not masquerade as a verified SN.
  try {
    serialTextResult = await withTimeout(
      scanDesktopNameplateSerialText(file, {
        onProgress: (state) => onProgress?.({ ...state, method: 'local' }),
        maxDimension: MOBILE_IMAGE_MAX_DIMENSION,
      }),
      SERIAL_OCR_TIMEOUT_MS,
      'Weryfikacja nadruku SN trwała zbyt długo.',
    );
  } catch (error) {
    serialTextResult = { serialNumber: '', error: error?.message || 'Nie odczytano nadruku SN lokalnie.' };
  }
  const serialCheck = reconcileNameplateSerial({
    barcodeSerial: barcodeInfo.serialNumber,
    ocrSerial: serialTextResult?.serialNumber,
    ocrVotes: serialTextResult?.votes,
    ocrConfidence: serialTextResult?.confidence,
    ocrRawText: serialTextResult?.rawText,
  });
  const serialNumber = serialCheck.serialNumber;

  if (!exactModel) {
    try {
      modelTextResult = await withTimeout(
        scanDesktopNameplateModelCode(file, {
          onProgress: (state) => onProgress?.({ ...state, method: 'local' }),
          maxDimension: MOBILE_IMAGE_MAX_DIMENSION,
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
    serialCheck,
    exactModel,
    mismatch: localMismatch,
    barcodeInfo: { ...barcodeInfo, rotensoModel: exactModel },
    serialTextResult,
    modelTextResult,
    aiAttempted: false,
    aiError: '',
    barcodeError,
  };

  const evidence = getMobileNameplateEvidence({
    barcodeInfo,
    serialTextResult,
    modelTextResult,
    exactModel,
    serialNumber,
  });
  localReading.evidence = evidence;

  if (serialCheck.status === 'confirmed' && (isMobileNameplateReadingComplete(localReading) || localMismatch)) {
    onProgress?.({
      progress: 100,
      label: localMismatch ? 'Odczyt zakończony — sprawdź zgodność jednostki' : 'Tabliczka odczytana lokalnie',
      method: 'local',
    });
    return localReading;
  }

  const weakEvidenceFallback = !evidence.hasEvidence && Boolean(
    evidence.keywordCount >= 1
    || evidence.hasTechnicalValue
    || evidence.hasModelishToken
    || (evidence.hasSerialLabel && evidence.digitCount >= 6)
  );

  if (!evidence.hasEvidence && !weakEvidenceFallback) {
    onProgress?.({
      progress: 100,
      label: 'Nie wykryto tabliczki znamionowej — zrób zdjęcie ponownie',
      method: 'local',
    });
    return {
      ...localReading,
      noNameplateEvidence: true,
      aiSkipped: true,
      aiSkipReason: 'no_nameplate_evidence',
    };
  }

  const needsSerialAi = serialCheck.status !== 'confirmed';

  // WAWIS 13.69: bez internetu nie czekamy 60 s na AI — od razu zwracamy odczyt czytnika
  // z kandydatami do sprawdzenia. Zapis i tak wymaga internetu (13.66), a „Zamknij okno”
  // zachowuje wpisane dane (13.68).
  if (isBrowserOffline()) {
    onProgress?.({ progress: 100, label: 'Brak internetu — wpisano odczyt czytnika, sprawdź z tabliczką', method: 'local' });
    return withLocalFallback({
      ...localReading,
      aiAttempted: false,
      aiSkipped: true,
      aiSkipReason: 'offline',
      aiError: '',
      weakNameplateEvidence: weakEvidenceFallback,
    }, { offline: true });
  }

  onProgress?.({
    progress: 8,
    label: needsSerialAi
      ? 'Numer SN nie został zgodnie odczytany — weryfikuję nadruk przez AI…'
      : weakEvidenceFallback
        ? 'Wykryto słabe ślady tabliczki — sprawdzam bezpiecznie przez AI…'
        : 'Wykryto ślady tabliczki, ale odczyt jest niepełny — uruchamiam AI…',
    method: 'ai',
  });
  try {
    const aiResult = await withTimeout(
      readDesktopNameplateWithAi({
        file,
        supabase,
        barcodeInfo: { ...barcodeInfo, rotensoModel: exactModel },
        visualSerialOnly: needsSerialAi,
        targetUnit: getTargetLabel(targetUnit),
        jobId,
        onProgress: (state) => onProgress?.({ ...state, method: 'ai' }),
      }),
      AI_READ_TIMEOUT_MS,
      'Analiza AI nie odpowiedziała w ciągu 60 sekund.',
    );

    // A blind AI serial read must not overwrite a locally confirmed model.
    const finalExactModel = exactModel || aiResult.exactModel || null;
    const exactModelFields = resultFromExactModel(finalExactModel);
    const manufacturer = exactModelFields.manufacturer || aiResult.manufacturer;
    const model = exactModelFields.model || aiResult.model;
    const power = exactModelFields.power || aiResult.power;
    const modelValue = buildResolvedModelValue({ manufacturer, model, power }) || localModel.modelValue;
    const finalSerialCheck = needsSerialAi
      ? resolveNameplateSerialWithVisualAi(serialCheck, aiResult)
      : serialCheck;
    const finalSerial = finalSerialCheck.serialNumber;
    const mismatch = getNameplateTargetMismatch(targetUnit, finalExactModel);
    const aiTrustedModel = Boolean(
      aiResult?.modelConfirmedByCatalog
      || aiResult?.modelBaseRecognized
    );

    if (weakEvidenceFallback && (!aiTrustedModel || !finalSerial)) {
      return {
        ...localReading,
        method: 'ai',
        aiAttempted: true,
        aiError: '',
        aiResult,
        noNameplateEvidence: true,
        aiSkipped: false,
        aiSkipReason: 'ai_unconfirmed_nameplate',
      };
    }

    return {
      method: 'ai',
      manufacturer,
      model,
      power,
      modelValue,
      serialNumber: finalSerial,
      serialCheck: finalSerialCheck,
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
    if (weakEvidenceFallback) {
      return {
        ...localReading,
        aiAttempted: true,
        aiError: error?.message || 'Nie udało się odczytać tabliczki przez AI.',
        noNameplateEvidence: true,
        aiSkipped: false,
        aiSkipReason: 'ai_failed_low_evidence',
      };
    }
    return withLocalFallback({
      ...localReading,
      aiAttempted: true,
      aiError: error?.message || 'Nie udało się odczytać tabliczki przez AI.',
    }, { offline: isBrowserOffline() });
  }
}
