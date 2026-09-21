import {
  resolveRotensoModelFromEan,
  resolveRotensoNameplateModelExact,
} from './desktop-nameplate-model-dictionary.js';
const UNIVERSAL_BARCODE_LOAD_TIMEOUT_MS = 12000;
const UNIVERSAL_BARCODE_READER_URL = 'https://fastly.jsdelivr.net/npm/barcode-detector@3.2.1/dist/iife/ponyfill.min.js';
const UNIVERSAL_BARCODE_SCRIPT_ID = 'wawis-universal-barcode-reader';
const BARCODE_DESKEW_ANGLES = Object.freeze([-18, -15, -12, -9, -6, -3, 3, 6, 9, 12, 15, 18]);
let universalBarcodeReaderPromise = null;

const EAN_L_PATTERNS = Object.freeze({
  '0001101': '0', '0011001': '1', '0010011': '2', '0111101': '3', '0100011': '4',
  '0110001': '5', '0101111': '6', '0111011': '7', '0110111': '8', '0001011': '9',
});
const EAN_G_PATTERNS = Object.freeze({
  '0100111': '0', '0110011': '1', '0011011': '2', '0100001': '3', '0011101': '4',
  '0111001': '5', '0000101': '6', '0010001': '7', '0001001': '8', '0010111': '9',
});
const EAN_R_PATTERNS = Object.freeze({
  '1110010': '0', '1100110': '1', '1101100': '2', '1000010': '3', '1011100': '4',
  '1001110': '5', '1010000': '6', '1000100': '7', '1001000': '8', '1110100': '9',
});
const EAN_FIRST_DIGIT_PARITY = Object.freeze({
  LLLLLL: '0', LLGLGG: '1', LLGGLG: '2', LLGGGL: '3', LGLLGG: '4',
  LGGLLG: '5', LGGGLL: '6', LGLGLG: '7', LGLGGL: '8', LGGLGL: '9',
});

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function normalizeValue(value = '') {
  return String(value || '').trim().replace(/\s+/g, '');
}

function ean13IsValid(value = '') {
  const digits = normalizeValue(value);
  if (!/^\d{13}$/.test(digits)) return false;
  const sum = digits.slice(0, 12).split('').reduce((total, char, index) => (
    total + Number(char) * (index % 2 === 0 ? 1 : 3)
  ), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

function plausibleSerial(value = '') {
  const token = normalizeValue(value).toUpperCase().replace(/[^A-Z0-9._/-]/g, '');
  if (token.length < 10 || token.length > 40) return false;
  if (!/[0-9]/.test(token)) return false;
  if (/^\d{13}$/.test(token)) return false;
  if (resolveRotensoNameplateModelExact(token)) return false;
  if (/^(?:R32|R410A|R290|REFRIGERANT|MADEINCHINA|MADEINPRC)$/i.test(token)) return false;
  return true;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie udało się przygotować zdjęcia do odczytu kodów.')); };
    image.src = url;
  });
}

function createCanvas(image, { scale = 1, grayscale = false, contrast = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const longest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const effectiveScale = Math.max(scale, longest < 1800 ? 1800 / Math.max(1, longest) : 1);
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * effectiveScale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * effectiveScale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter = `${grayscale ? 'grayscale(1)' : ''} contrast(${contrast})`;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropCanvas(source, x, y, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rotateCanvas(source, degrees = 0) {
  const angle = Number(degrees) || 0;
  const radians = angle * (Math.PI / 180);
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = source.width;
  const height = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((width * cos) + (height * sin)));
  canvas.height = Math.max(1, Math.ceil((height * cos) + (width * sin)));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.drawImage(source, -width / 2, -height / 2);
  return canvas;
}

function buildDeskewAngleVariants(base, gray, angle) {
  const angleLabel = `${angle > 0 ? '+' : ''}${angle}°`;
  return [
    {
      name: `automatyczne prostowanie ${angleLabel}`,
      canvas: rotateCanvas(base, angle),
      roleHint: 'any',
    },
    {
      name: `automatyczne prostowanie ${angleLabel} — kontrast`,
      canvas: rotateCanvas(gray, angle),
      roleHint: 'any',
    },
  ];
}

function buildVariants(image) {
  const base = createCanvas(image, { contrast: 1.08 });
  const gray = createCanvas(image, { grayscale: true, contrast: 1.55 });
  const variants = [
    { name: 'całe zdjęcie', canvas: base, roleHint: 'any' },
    { name: 'całe zdjęcie — kontrast', canvas: gray, roleHint: 'any' },
  ];
  // Tabliczki różnych producentów nie mają identycznego układu. Zamiast jednego
  // sztywnego kadru skanujemy zachodzące na siebie poziome pasy. Dzięki temu
  // czytnik kresek może znaleźć osobno górny PC/EAN oraz dolny Code 128/SN.
  const regions = [
    ['górny pas kodu', .02, .08, .96, .44, 'ean'],
    ['górny środek', .02, .20, .96, .42, 'ean'],
    ['środkowy pas', .02, .30, .96, .42, 'any'],
    ['dolny środek', .02, .40, .96, .44, 'serial'],
    ['dolny pas kodu SN', .02, .50, .96, .42, 'serial'],
    ['góra szeroko', 0, 0, 1, .64, 'ean'],
    ['dół szeroko', 0, .34, 1, .66, 'serial'],
  ];
  for (const [name, rx, ry, rw, rh, roleHint] of regions) {
    variants.push({
      name,
      roleHint,
      canvas: cropCanvas(base, base.width * rx, base.height * ry, base.width * rw, base.height * rh),
    });
    variants.push({
      name: `${name} — kontrast`,
      roleHint,
      canvas: cropCanvas(gray, gray.width * rx, gray.height * ry, gray.width * rw, gray.height * rh),
    });
  }
  return variants;
}

function loadUniversalBarcodeDetector() {
  const ready = globalThis.BarcodeDetectionAPI?.BarcodeDetector;
  if (ready) return Promise.resolve(ready);
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (universalBarcodeReaderPromise) return universalBarcodeReaderPromise;

  universalBarcodeReaderPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(UNIVERSAL_BARCODE_SCRIPT_ID);
    const finish = () => {
      const Detector = globalThis.BarcodeDetectionAPI?.BarcodeDetector;
      if (Detector) resolve(Detector);
      else reject(new Error('Uniwersalny lokalny czytnik kodów nie uruchomił się.'));
    };
    if (existing) {
      if (globalThis.BarcodeDetectionAPI?.BarcodeDetector) finish();
      else {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => reject(new Error('Nie udało się załadować uniwersalnego czytnika kodów.')), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = UNIVERSAL_BARCODE_SCRIPT_ID;
    script.src = UNIVERSAL_BARCODE_READER_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Nie udało się załadować uniwersalnego czytnika kodów.')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    universalBarcodeReaderPromise = null;
    throw error;
  });
  return universalBarcodeReaderPromise;
}

async function detectWithBarcodeDetector(variants, DetectorClass, source) {
  if (!DetectorClass) return [];
  let formats = ['ean_13', 'code_128', 'code_39'];
  try {
    const supported = await DetectorClass.getSupportedFormats?.();
    if (Array.isArray(supported) && supported.length) formats = formats.filter((item) => supported.includes(item));
  } catch (_) { /* use defaults */ }
  if (!formats.length) return [];
  const detector = new DetectorClass({ formats });
  const found = [];
  for (const variant of variants) {
    try {
      const detections = await detector.detect(variant.canvas);
      for (const detection of detections || []) {
        found.push({
          value: normalizeValue(detection.rawValue),
          format: String(detection.format || '').toLowerCase(),
          source,
          variant: variant.name,
          roleHint: variant.roleHint || 'any',
        });
      }
    } catch (_) { /* try next image variant */ }
  }
  return found;
}

async function detectUniversal(variants) {
  const Detector = await withTimeout(
    loadUniversalBarcodeDetector(),
    UNIVERSAL_BARCODE_LOAD_TIMEOUT_MS,
    'Uniwersalny czytnik kodów nie załadował się w ciągu 12 sekund.',
  );
  return detectWithBarcodeDetector(variants, Detector, 'universal_barcode');
}

async function detectNative(variants) {
  if (!('BarcodeDetector' in globalThis)) return [];
  return detectWithBarcodeDetector(variants, globalThis.BarcodeDetector, 'native_barcode');
}

async function createBarcodeDetector(DetectorClass) {
  if (!DetectorClass) return null;
  let formats = ['ean_13', 'code_128', 'code_39'];
  try {
    const supported = await DetectorClass.getSupportedFormats?.();
    if (Array.isArray(supported) && supported.length) formats = formats.filter((item) => supported.includes(item));
  } catch (_) { /* use defaults */ }
  if (!formats.length) return null;
  return new DetectorClass({ formats });
}

async function detectDeskewWithBarcodeDetector(image, DetectorClass, source) {
  const detector = await createBarcodeDetector(DetectorClass);
  if (!detector) return [];
  const base = createCanvas(image, { contrast: 1.12 });
  const gray = createCanvas(image, { grayscale: true, contrast: 1.72 });
  const found = [];

  for (const angle of BARCODE_DESKEW_ANGLES) {
    const variants = buildDeskewAngleVariants(base, gray, angle);
    for (const variant of variants) {
      try {
        const detections = await detector.detect(variant.canvas);
        for (const detection of detections || []) {
          found.push({
            value: normalizeValue(detection.rawValue),
            format: String(detection.format || '').toLowerCase(),
            source,
            variant: variant.name,
            roleHint: variant.roleHint || 'any',
          });
        }
      } catch (_) { /* try next angle */ }
    }
    const summary = summarizeBarcodeResults(found);
    if (summary.ean && summary.serialNumber) break;
  }

  return found;
}

async function detectUniversalDeskew(image) {
  const Detector = await withTimeout(
    loadUniversalBarcodeDetector(),
    UNIVERSAL_BARCODE_LOAD_TIMEOUT_MS,
    'Uniwersalny czytnik kodów nie załadował się w ciągu 12 sekund.',
  );
  return detectDeskewWithBarcodeDetector(image, Detector, 'universal_barcode');
}

async function detectNativeDeskew(image) {
  if (!('BarcodeDetector' in globalThis)) return [];
  return detectDeskewWithBarcodeDetector(image, globalThis.BarcodeDetector, 'native_barcode');
}

function hammingDistance(left = '', right = '') {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function closestDigitPattern(bits, maps, maxDistance = 1) {
  let best = null;
  for (const [parity, map] of maps) {
    for (const [pattern, digit] of Object.entries(map)) {
      const distance = hammingDistance(bits, pattern);
      if (!best || distance < best.distance) best = { digit, parity, distance };
    }
  }
  return best && best.distance <= maxDistance ? best : null;
}

export function decodeEan13BitString(bitString = '') {
  const bits = String(bitString || '').replace(/[^01]/g, '');
  if (bits.length !== 95) return null;
  if (hammingDistance(bits.slice(0, 3), '101') > 0) return null;
  if (hammingDistance(bits.slice(45, 50), '01010') > 0) return null;
  if (hammingDistance(bits.slice(92, 95), '101') > 0) return null;

  let leftDigits = '';
  let parity = '';
  let totalDistance = 0;
  for (let index = 0; index < 6; index += 1) {
    const segment = bits.slice(3 + (index * 7), 10 + (index * 7));
    const decoded = closestDigitPattern(segment, [['L', EAN_L_PATTERNS], ['G', EAN_G_PATTERNS]], 1);
    if (!decoded) return null;
    leftDigits += decoded.digit;
    parity += decoded.parity;
    totalDistance += decoded.distance;
  }
  const firstDigit = EAN_FIRST_DIGIT_PARITY[parity];
  if (!firstDigit) return null;

  let rightDigits = '';
  for (let index = 0; index < 6; index += 1) {
    const segment = bits.slice(50 + (index * 7), 57 + (index * 7));
    const decoded = closestDigitPattern(segment, [['R', EAN_R_PATTERNS]], 1);
    if (!decoded) return null;
    rightDigits += decoded.digit;
    totalDistance += decoded.distance;
  }
  const ean = `${firstDigit}${leftDigits}${rightDigits}`;
  if (!ean13IsValid(ean)) return null;
  return { ean, distance: totalDistance };
}

function otsuThreshold(values = []) {
  const histogram = new Array(256).fill(0);
  for (const value of values) histogram[Math.max(0, Math.min(255, Math.round(value)))] += 1;
  const total = values.length || 1;
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let sumBackground = 0;
  let backgroundWeight = 0;
  let bestVariance = -1;
  let bestThreshold = 128;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    sumBackground += threshold * histogram[threshold];
    const backgroundMean = sumBackground / backgroundWeight;
    const foregroundMean = (sum - sumBackground) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * ((backgroundMean - foregroundMean) ** 2);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }
  return bestThreshold;
}

function rowLuminance(canvas, y) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const data = context.getImageData(0, Math.max(0, Math.min(canvas.height - 1, y)), canvas.width, 1).data;
  const values = new Array(canvas.width);
  for (let x = 0; x < canvas.width; x += 1) {
    const offset = x * 4;
    values[x] = (data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114);
  }
  return values;
}

function smoothRow(values, radius = 1) {
  if (radius <= 0) return values;
  const output = new Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    let total = 0;
    let count = 0;
    for (let cursor = Math.max(0, index - radius); cursor <= Math.min(values.length - 1, index + radius); cursor += 1) {
      total += values[cursor];
      count += 1;
    }
    output[index] = total / Math.max(1, count);
  }
  return output;
}

function buildRuns(binary = []) {
  const runs = [];
  if (!binary.length) return runs;
  let value = binary[0];
  let start = 0;
  for (let index = 1; index <= binary.length; index += 1) {
    if (index === binary.length || binary[index] !== value) {
      runs.push({ value, start, length: index - start, end: index });
      value = binary[index];
      start = index;
    }
  }
  return runs;
}

function sampleModules(binary, start, moduleWidth) {
  let bits = '';
  for (let moduleIndex = 0; moduleIndex < 95; moduleIndex += 1) {
    const center = Math.round(start + ((moduleIndex + 0.5) * moduleWidth));
    if (center < 0 || center >= binary.length) return '';
    bits += binary[center] ? '1' : '0';
  }
  return bits;
}

function decodeEanFromBinaryRow(binary = []) {
  const runs = buildRuns(binary);
  let best = null;
  for (let index = 0; index <= runs.length - 3; index += 1) {
    const trio = runs.slice(index, index + 3);
    if (trio[0].value !== 1 || trio[1].value !== 0 || trio[2].value !== 1) continue;
    const minWidth = Math.min(...trio.map((run) => run.length));
    const maxWidth = Math.max(...trio.map((run) => run.length));
    if (minWidth < 1 || maxWidth / minWidth > 2.15) continue;
    const baseModule = trio.reduce((total, run) => total + run.length, 0) / 3;
    if ((baseModule * 95) > binary.length * 1.05) continue;
    for (const scale of [0.94, 0.97, 1, 1.03, 1.06]) {
      const moduleWidth = baseModule * scale;
      for (const shift of [-0.35, -0.15, 0, 0.15, 0.35]) {
        const start = trio[0].start + (shift * moduleWidth);
        const decoded = decodeEan13BitString(sampleModules(binary, start, moduleWidth));
        if (!decoded) continue;
        const candidate = { ...decoded, start, moduleWidth };
        if (!best || candidate.distance < best.distance) best = candidate;
        if (candidate.distance === 0) return candidate;
      }
    }
  }
  return best;
}

function detectLocalEan13(variants) {
  const detections = [];
  for (const variant of variants) {
    const rowRatios = [0.24, 0.31, 0.38, 0.45, 0.52, 0.59, 0.66, 0.73, 0.80];
    for (const ratio of rowRatios) {
      const luminance = smoothRow(rowLuminance(variant.canvas, Math.round(variant.canvas.height * ratio)), 1);
      const otsu = otsuThreshold(luminance);
      const min = Math.min(...luminance);
      const max = Math.max(...luminance);
      const midpoint = (min + max) / 2;
      const thresholds = [...new Set([otsu, midpoint, otsu - 14, otsu + 14].map((value) => Math.max(20, Math.min(235, Math.round(value)))) )];
      for (const threshold of thresholds) {
        const binary = luminance.map((value) => value < threshold ? 1 : 0);
        const decoded = decodeEanFromBinaryRow(binary);
        if (decoded?.ean) {
          detections.push({
            value: decoded.ean,
            format: 'ean_13',
            source: 'local_ean13',
            variant: `${variant.name}, linia ${Math.round(ratio * 100)}%`,
          });
          break;
        }
      }
      if (detections.length) break;
    }
    if (detections.length) break;
  }
  return detections;
}

function detectLocalEan13Deskew(image) {
  const base = createCanvas(image, { contrast: 1.12 });
  const gray = createCanvas(image, { grayscale: true, contrast: 1.72 });
  for (const angle of BARCODE_DESKEW_ANGLES) {
    const detections = detectLocalEan13(buildDeskewAngleVariants(base, gray, angle));
    if (detections.length) return detections;
  }
  return [];
}

function uniqueDetections(items = []) {
  const map = new Map();
  for (const item of items) {
    const value = normalizeValue(item.value);
    if (!value) continue;
    const key = `${value}|${item.format || ''}`;
    if (!map.has(key)) map.set(key, { ...item, value });
  }
  return [...map.values()];
}

function isTrustedEanDetection(item = {}) {
  const format = String(item.format || '').toLowerCase();
  return format === 'ean_13' && ean13IsValid(item.value);
}

function serialDetectionScore(item = {}) {
  const source = String(item.source || '').toLowerCase();
  const format = String(item.format || '').toLowerCase();
  const variant = String(item.variant || '').toLowerCase();
  const value = normalizeValue(item.value).toUpperCase();
  if (!plausibleSerial(value)) return Number.NEGATIVE_INFINITY;

  // Numer seryjny może pochodzić wyłącznie z realnego kodu kreskowego.
  // Tekst rozpoznany z obrazu nie bierze udziału w tej funkcji.
  if (!['code_128', 'code_39'].includes(format)) return Number.NEGATIVE_INFINITY;
  if (!['universal_barcode', 'native_barcode'].includes(source)) return Number.NEGATIVE_INFINITY;

  let score = source === 'universal_barcode' ? 320 : 300;
  if (format === 'code_128') score += 120;
  else if (format === 'code_39') score += 80;
  if (item.roleHint === 'serial' || /dolny|sn|serial/.test(variant)) score += 55;
  if (item.roleHint === 'ean' || /pc\s*\/?\s*ean|g[oó]rny/.test(variant)) score -= 35;
  if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score += 35;
  if (value.length >= 16 && value.length <= 32) score += 25;
  return score;
}

export function summarizeBarcodeResults(detections = []) {
  const unique = uniqueDetections(detections);
  const eanDetection = unique
    .filter((item) => isTrustedEanDetection(item))
    .sort((left, right) => {
      const sourceScore = (item) => item.source === 'universal_barcode' ? 3 : item.source === 'native_barcode' ? 2 : item.source === 'local_ean13' ? 1 : 0;
      return sourceScore(right) - sourceScore(left);
    })[0] || null;
  const ean = eanDetection?.value || '';
  const serialDetection = unique
    .filter((item) => normalizeValue(item.value) !== ean)
    .map((item) => ({ item, score: serialDetectionScore(item) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score || right.item.value.length - left.item.value.length)[0]?.item || null;
  const serialNumber = serialDetection?.value?.toUpperCase() || '';
  const rotensoModel = ean ? resolveRotensoModelFromEan(ean) : null;
  const exactCodeDetection = unique
    .map((item) => ({ item, model: resolveRotensoNameplateModelExact(item.value) }))
    .find(({ model }) => Boolean(model)) || null;
  const exactCode = exactCodeDetection?.model || null;
  return {
    detections: unique,
    values: unique.map((item) => item.value),
    ean,
    serialNumber,
    rotensoModel: rotensoModel || exactCode,
    modelSource: rotensoModel ? 'ean' : exactCode ? 'exact_code' : '',
    serialSource: serialDetection?.source || '',
    eanSource: eanDetection?.source || '',
  };
}

export function inferNameplateUnitType(model = null) {
  const code = String(model?.code || model?.modelCode || model?.model_code || '').replace(/\s+/g, '');
  if (/X(?:O|0)(?:R\d+)?$/i.test(code) || /XM[2-5](?:R\d+)?$/i.test(code)) return 'outdoor';
  if (/X(?:I|1)(?:R\d+)?$/i.test(code)) return 'indoor';
  const explicit = String(model?.unitType || model?.unit_type || '').toLowerCase();
  return ['indoor', 'outdoor'].includes(explicit) ? explicit : '';
}

export function getNameplateTargetMismatch(targetUnitRef = '', model = null) {
  const normalizedTarget = String(targetUnitRef || '').toLowerCase();
  const expectedType = normalizedTarget === 'jz'
    ? 'outdoor'
    : normalizedTarget.startsWith('jw-')
      ? 'indoor'
      : '';
  const detectedType = inferNameplateUnitType(model);
  if (!expectedType || !detectedType || expectedType === detectedType) return null;
  const expectedLabel = expectedType === 'outdoor' ? 'jednostki zewnętrznej JZ' : 'jednostki wewnętrznej JW';
  const detectedLabel = detectedType === 'outdoor' ? 'jednostkę zewnętrzną' : 'jednostkę wewnętrzną';
  return {
    expectedType,
    detectedType,
    message: `Odczytano ${model?.code || 'kod modelu'} — ${detectedLabel}, ale otwarta jest tabliczka ${expectedLabel}. Otwórz właściwą tabliczkę albo zastąp błędnie przypisane zdjęcie.`,
  };
}

export async function scanDesktopNameplateBarcodes(file, { onProgress } = {}) {
  onProgress?.({ progress: 6, label: 'Przygotowanie czytników kodów…' });
  const image = await loadImage(file);
  const variants = buildVariants(image);
  const diagnostics = [];

  onProgress?.({ progress: 18, label: 'Odczyt EAN-13 i Code 128…' });
  let universalResults = [];
  try {
    universalResults = await detectUniversal(variants);
    diagnostics.push(universalResults.length
      ? `Uniwersalny dekoder kodów: ${universalResults.length} wyników.`
      : 'Uniwersalny dekoder nie rozpoznał kodu.');
  } catch (error) {
    diagnostics.push(`Uniwersalny dekoder niedostępny: ${error?.message || 'błąd uruchomienia'}`);
  }

  let all = [...universalResults];
  let summary = summarizeBarcodeResults(all);

  if (!summary.ean || !summary.serialNumber) {
    onProgress?.({ progress: 48, label: 'Sprawdzanie czytnika przeglądarki…' });
    const nativeResults = await detectNative(variants);
    diagnostics.push(nativeResults.length
      ? `Czytnik przeglądarki: ${nativeResults.length} wyników.`
      : ('BarcodeDetector' in globalThis
        ? 'Czytnik przeglądarki nie rozpoznał dodatkowego kodu.'
        : 'Ta przeglądarka nie udostępnia natywnego BarcodeDetector.'));
    all = all.concat(nativeResults);
    summary = summarizeBarcodeResults(all);
  }

  if (!summary.ean) {
    onProgress?.({ progress: 64, label: 'Dodatkowy odczyt EAN-13…' });
    const localEanResults = detectLocalEan13(variants);
    all = all.concat(localEanResults);
    diagnostics.push(localEanResults.length
      ? 'Dodatkowy czytnik EAN-13 rozpoznał kod.'
      : 'Dodatkowy czytnik EAN-13 nie rozpoznał kodu.');
    summary = summarizeBarcodeResults(all);
  }

  if (!summary.ean || !summary.serialNumber) {
    onProgress?.({ progress: 76, label: 'Automatyczne prostowanie zdjęcia…' });
    let deskewUniversalResults = [];
    try {
      deskewUniversalResults = await detectUniversalDeskew(image);
      all = all.concat(deskewUniversalResults);
      diagnostics.push(deskewUniversalResults.length
        ? `Automatyczne prostowanie + uniwersalny dekoder: ${deskewUniversalResults.length} wyników.`
        : 'Automatyczne prostowanie nie dało wyniku w uniwersalnym dekoderze.');
      summary = summarizeBarcodeResults(all);
    } catch (error) {
      diagnostics.push(`Automatyczne prostowanie — uniwersalny dekoder niedostępny: ${error?.message || 'błąd uruchomienia'}`);
    }

    if ((!summary.ean || !summary.serialNumber) && 'BarcodeDetector' in globalThis) {
      onProgress?.({ progress: 86, label: 'Prostowanie + czytnik przeglądarki…' });
      const deskewNativeResults = await detectNativeDeskew(image);
      all = all.concat(deskewNativeResults);
      diagnostics.push(deskewNativeResults.length
        ? `Automatyczne prostowanie + czytnik przeglądarki: ${deskewNativeResults.length} wyników.`
        : 'Automatyczne prostowanie nie dało dodatkowego wyniku w czytniku przeglądarki.');
      summary = summarizeBarcodeResults(all);
    }

    if (!summary.ean) {
      onProgress?.({ progress: 93, label: 'Prostowanie + lokalny EAN-13…' });
      const deskewLocalEanResults = detectLocalEan13Deskew(image);
      all = all.concat(deskewLocalEanResults);
      diagnostics.push(deskewLocalEanResults.length
        ? 'Automatyczne prostowanie + lokalny czytnik EAN-13 rozpoznał kod.'
        : 'Automatyczne prostowanie + lokalny czytnik EAN-13 nie rozpoznał kodu.');
      summary = summarizeBarcodeResults(all);
    }
  }

  onProgress?.({ progress: 100, label: 'Kody sprawdzone' });
  return {
    ...summary,
    diagnostics,
    readerMode: 'barcode_only',
  };
}

export { ean13IsValid, plausibleSerial };
