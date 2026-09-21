import {
  resolveRotensoCatalogModelCode,
  resolveRotensoNameplateModel,
  resolveRotensoNameplateModelExact,
} from './desktop-nameplate-model-dictionary.js';

const OCR_WORKER_PATH = '/ocr/worker.min.js';
const OCR_CORE_PATH = '/ocr/core';
const OCR_LANGUAGE_PATH = '/ocr';
const OCR_LIBRARY_PATH = '/ocr/tesseract.min.js';
const OCR_LIBRARY_SCRIPT_ID = 'wawis-focused-model-ocr';
const OCR_STARTUP_ERROR = 'Nie udało się uruchomić lokalnego odczytu kodu modelu. Odśwież stronę i spróbuj ponownie.';

let workerPromise = null;
let libraryPromise = null;
let progressListener = null;
let progressTask = 'model';

function mapProgress(message = {}) {
  const progress = Math.max(0, Math.min(1, Number(message.progress || 0)));
  const status = String(message.status || '');
  const serialMode = progressTask === 'serial';
  if (status.includes('loading tesseract core')) return { progress: 52 + Math.round(progress * 8), label: serialMode ? 'Uruchamianie lokalnego odczytu numeru seryjnego…' : 'Uruchamianie lokalnego odczytu modelu…' };
  if (status.includes('loading language')) return { progress: 60 + Math.round(progress * 8), label: 'Ładowanie lokalnego słownika znaków…' };
  if (status.includes('initializing')) return { progress: 68 + Math.round(progress * 7), label: serialMode ? 'Przygotowanie odczytu pola SN…' : 'Przygotowanie odczytu nadruku…' };
  if (status.includes('recognizing text')) return { progress: 75 + Math.round(progress * 18), label: serialMode ? 'Odczytywanie numeru po oznaczeniu SN…' : 'Odczytywanie kodu modelu z nadruku…' };
  return { progress: 52 + Math.round(progress * 40), label: serialMode ? 'Lokalny odczyt numeru seryjnego…' : 'Lokalny odczyt modelu…' };
}

function loadOcrLibrary() {
  if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
  if (libraryPromise) return libraryPromise;

  libraryPromise = new Promise((resolve, reject) => {
    const finish = () => globalThis.Tesseract?.createWorker
      ? resolve(globalThis.Tesseract)
      : reject(new Error(OCR_STARTUP_ERROR));
    const fail = () => reject(new Error(OCR_STARTUP_ERROR));
    const existingScript = document.getElementById(OCR_LIBRARY_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener('load', finish, { once: true });
      existingScript.addEventListener('error', fail, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = OCR_LIBRARY_SCRIPT_ID;
    script.src = OCR_LIBRARY_PATH;
    script.async = true;
    script.dataset.ocrRuntime = 'focused-model-only';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => { script.remove(); fail(); }, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}

async function getWorker(onProgress, task = 'model') {
  progressListener = onProgress;
  progressTask = task;
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await loadOcrLibrary();
      const worker = await createWorker('eng', 1, {
        workerPath: OCR_WORKER_PATH,
        corePath: OCR_CORE_PATH,
        langPath: OCR_LANGUAGE_PATH,
        logger: (message) => progressListener?.(mapProgress(message)),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: '11',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_/ ',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw new Error(error?.message || OCR_STARTUP_ERROR);
    });
  }
  return workerPromise;
}

export async function cancelDesktopNameplateModelOcr() {
  const activeWorker = workerPromise;
  workerPromise = null;
  progressListener = null;
  if (!activeWorker) return;
  try {
    const worker = await Promise.race([
      activeWorker,
      new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    await worker?.terminate?.();
  } catch {
    // Zamknięcie okna ma wyłącznie przerwać trwającą analizę.
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Nie udało się otworzyć zdjęcia tabliczki.')); };
    image.src = objectUrl;
  });
}

function prepareRegion(image, {
  xRatio = 0,
  yRatio = 0,
  widthRatio = 1,
  heightRatio = 1,
  threshold = 0,
} = {}) {
  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) throw new Error('Zdjęcie tabliczki ma nieprawidłowy rozmiar.');
  const sx = Math.max(0, Math.round(sourceWidth * xRatio));
  const sy = Math.max(0, Math.round(sourceHeight * yRatio));
  const sw = Math.max(1, Math.min(sourceWidth - sx, Math.round(sourceWidth * widthRatio)));
  const sh = Math.max(1, Math.min(sourceHeight - sy, Math.round(sourceHeight * heightRatio)));
  const scale = Math.min(6, Math.max(1, 3000 / Math.max(sw, sh)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Przeglądarka nie udostępniła przetwarzania zdjęcia.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter = threshold ? 'none' : 'grayscale(1) contrast(1.9) brightness(1.08)';
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (threshold) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = (pixels.data[index] * 0.299) + (pixels.data[index + 1] * 0.587) + (pixels.data[index + 2] * 0.114);
      const value = gray >= threshold ? 255 : 0;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

export function resolveFocusedRotensoModelText(rawText = '') {
  const normalizedText = String(rawText || '').replace(/[_|]+/g, ' ');
  return resolveRotensoCatalogModelCode(normalizedText)
    || resolveRotensoNameplateModelExact(normalizedText)
    || resolveRotensoNameplateModel(normalizedText)
    || null;
}

function getFocusedModelConsensusKey(model = null) {
  const compactCode = String(model?.code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/R[0-9]{1,2}$/i, '');
  return compactCode || [model?.family, model?.capacityKw, model?.unitType].filter(Boolean).join('|');
}

export function selectFocusedModelConsensus(passTexts = [], passConfidences = []) {
  const votes = new Map();
  const candidates = [];
  passTexts.forEach((text, passIndex) => {
    const model = resolveFocusedRotensoModelText(text);
    if (!model?.code) return;
    const key = getFocusedModelConsensusKey(model);
    if (!votes.has(key)) votes.set(key, { model, passIndexes: new Set(), maxConfidence: 0 });
    const vote = votes.get(key);
    vote.passIndexes.add(passIndex);
    vote.maxConfidence = Math.max(vote.maxConfidence, Number(passConfidences[passIndex] || 0));
    if (
      (!vote.model.revision && model.revision)
      || (!vote.model.revisionObserved && model.revisionObserved)
    ) vote.model = model;
    if (!candidates.some((candidate) => candidate.code === model.code)) candidates.push(model);
  });
  const winner = [...votes.values()].sort((left, right) => (
    right.passIndexes.size - left.passIndexes.size
    || right.maxConfidence - left.maxConfidence
    || String(right.model.code).length - String(left.model.code).length
  ))[0] || null;
  const reliable = Boolean(winner && (
    winner.passIndexes.size >= 2
    || winner.maxConfidence >= 68
    || winner.model.catalogVerified
  ));
  return {
    model: reliable ? winner.model : null,
    reliable,
    votes: winner?.passIndexes?.size || 0,
    maxConfidence: winner?.maxConfidence || 0,
    candidates,
  };
}


function normalizeFocusedSerialCandidate(value = '') {
  return String(value || '')
    .toUpperCase()
    .replace(/[\s|]+/g, '')
    .replace(/^[^A-Z0-9]+|[^A-Z0-9._/-]+$/g, '')
    .replace(/[^A-Z0-9._/-]/g, '');
}

function plausibleFocusedSerial(value = '') {
  const token = normalizeFocusedSerialCandidate(value);
  if (token.length < 10 || token.length > 40) return false;
  if (!/[0-9]/.test(token)) return false;
  if (/^\d{13}$/.test(token)) return false;
  if (resolveRotensoNameplateModelExact(token)) return false;
  if (/^(?:R32|R410A|R290|REFRIGERANT|MADEINCHINA|MADEINPRC)$/i.test(token)) return false;
  return true;
}

export function extractSerialNumberFromOcrText(rawText = '') {
  const lines = String(rawText || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];

  for (const originalLine of lines) {
    const line = originalLine.toUpperCase().replace(/[|]/g, 'I');
    const markerMatch = line.match(/(?:^|\b)(?:S\s*N|5\s*N|S\s*M)\s*[:;=._-]*\s*(.*)$/i);
    if (!markerMatch) continue;
    const tail = String(markerMatch[1] || '')
      .split(/\b(?:MADE|CHINA|PRC|REFRIGERANT|MODEL|PC\s*\/?\s*EAN|EAN)\b/i)[0]
      .trim();
    if (!tail) continue;

    const tokenMatches = tail.match(/[A-Z0-9][A-Z0-9 ._/-]{8,45}/g) || [];
    for (const tokenMatch of tokenMatches) {
      const candidate = normalizeFocusedSerialCandidate(tokenMatch);
      if (!plausibleFocusedSerial(candidate)) continue;
      candidates.push(candidate);
    }
  }

  if (!candidates.length) return '';
  return candidates
    .map((value) => ({
      value,
      score: (/[A-Z]/.test(value) && /[0-9]/.test(value) ? 40 : 0)
        + (value.length >= 16 && value.length <= 32 ? 25 : 0)
        + Math.min(20, value.length),
    }))
    .sort((left, right) => right.score - left.score || right.value.length - left.value.length)[0].value;
}

export async function scanDesktopNameplateSerialText(file, { onProgress } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Brak prawidłowego zdjęcia tabliczki.');
  onProgress?.({ progress: 50, label: 'Kod seryjny nie został odczytany z kresek — sprawdzam nadruk SN…' });
  const image = await loadImage(file);
  const passes = [
    { image: prepareRegion(image, { yRatio: 0.34, heightRatio: 0.64, threshold: 150 }), psm: '11', label: 'Szukam oznaczenia SN w dolnej części etykiety…' },
    { image: prepareRegion(image, { yRatio: 0.26, heightRatio: 0.72 }), psm: '11', label: 'Porównuję numer seryjny na szerszym kadrze…' },
    { image: prepareRegion(image, { yRatio: 0.42, heightRatio: 0.56, threshold: 185 }), psm: '6', label: 'Potwierdzam ciąg znaków po SN…' },
  ];
  const worker = await getWorker(onProgress, 'serial');
  const votes = new Map();
  const texts = [];
  const confidences = [];

  for (let index = 0; index < passes.length; index += 1) {
    const pass = passes[index];
    onProgress?.({ progress: 76 + (index * 6), label: pass.label });
    await worker.setParameters({
      tessedit_pageseg_mode: pass.psm,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:-_/. ',
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(pass.image);
    const text = String(result?.data?.text || '');
    const confidence = Number(result?.data?.confidence || 0);
    texts.push(text);
    confidences.push(confidence);
    const candidate = extractSerialNumberFromOcrText(text);
    if (candidate) {
      const current = votes.get(candidate) || { count: 0, maxConfidence: 0 };
      current.count += 1;
      current.maxConfidence = Math.max(current.maxConfidence, confidence);
      votes.set(candidate, current);
    }
  }

  const winner = [...votes.entries()]
    .map(([serialNumber, meta]) => ({ serialNumber, ...meta }))
    .sort((left, right) => right.count - left.count || right.maxConfidence - left.maxConfidence || right.serialNumber.length - left.serialNumber.length)[0] || null;

  onProgress?.({
    progress: 98,
    label: winner?.serialNumber
      ? `Odczytano numer po SN: ${winner.serialNumber} — sprawdź przed zapisem`
      : 'Nie znaleziono pewnego ciągu po oznaczeniu SN',
  });

  return {
    serialNumber: winner?.serialNumber || '',
    votes: winner?.count || 0,
    confidence: winner?.maxConfidence || 0,
    rawText: texts.filter(Boolean).join('\n'),
    source: 'focused_serial_ocr',
  };
}

export async function scanDesktopNameplateModelCode(file, { onProgress } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Brak prawidłowego zdjęcia tabliczki.');
  onProgress?.({ progress: 50, label: 'Kody kreskowe odczytane — szukam nadrukowanego modelu…' });
  const image = await loadImage(file);
  const passes = [
    { image: prepareRegion(image, { widthRatio: 0.50, heightRatio: 0.46, threshold: 140 }), psm: '11', label: 'Odczytuję kod modelu z lewej części etykiety…' },
    { image: prepareRegion(image, { widthRatio: 0.72, heightRatio: 0.55 }), psm: '11', label: 'Porównuję nadruk z pełnym katalogiem modeli…' },
    { image: prepareRegion(image, { heightRatio: 0.56 }), psm: '11', label: 'Szukam modelu w górnej części tabliczki…' },
    { image: prepareRegion(image, { heightRatio: 0.70, threshold: 185 }), psm: '11', label: 'Potwierdzam kod modelu drugim przebiegiem…' },
  ];
  const worker = await getWorker(onProgress);
  const texts = [];
  const confidences = [];
  let consensus = { model: null, reliable: false, votes: 0, maxConfidence: 0, candidates: [] };

  for (let index = 0; index < passes.length; index += 1) {
    const pass = passes[index];
    onProgress?.({ progress: 76 + (index * 5), label: pass.label });
    await worker.setParameters({
      tessedit_pageseg_mode: pass.psm,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_/ ',
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(pass.image);
    texts.push(String(result?.data?.text || ''));
    confidences.push(Number(result?.data?.confidence || 0));
    consensus = selectFocusedModelConsensus(texts, confidences);
    if (consensus.reliable && consensus.votes >= 2) break;
  }

  onProgress?.({
    progress: 96,
    label: consensus.reliable
      ? `Model ${consensus.model.code} potwierdzony w słowniku Rotenso`
      : 'Nie uzyskano pewnego kodu modelu z nadruku',
  });
  return {
    exactModel: consensus.model,
    modelCode: consensus.model?.code || '',
    reliable: consensus.reliable,
    consensusVotes: consensus.votes,
    confidence: consensus.maxConfidence,
    candidates: consensus.candidates,
    rawText: texts.filter(Boolean).join('\n'),
    source: 'focused_model_ocr',
  };
}
