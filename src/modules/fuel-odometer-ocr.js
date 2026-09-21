const OCR_WORKER_PATH = '/ocr/worker.min.js';
const OCR_CORE_PATH = '/ocr/core';
const OCR_LANGUAGE_PATH = '/ocr';
const OCR_LIBRARY_PATH = '/ocr/tesseract.min.js';
const OCR_LIBRARY_SCRIPT_ID = 'wawis-fuel-odometer-ocr';
const OCR_TIMEOUT_MS = 30000;

let libraryPromise = null;
let workerPromise = null;
let progressListener = null;

function loadOcrLibrary() {
  if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const finish = () => globalThis.Tesseract?.createWorker
      ? resolve(globalThis.Tesseract)
      : reject(new Error('Nie udało się uruchomić lokalnego OCR.'));
    const existing = document.getElementById(OCR_LIBRARY_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('Nie udało się uruchomić lokalnego OCR.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = OCR_LIBRARY_SCRIPT_ID;
    script.src = OCR_LIBRARY_PATH;
    script.async = true;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Nie udało się uruchomić lokalnego OCR.')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}

async function getWorker(onProgress) {
  progressListener = onProgress;
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await loadOcrLibrary();
      return createWorker('eng', 1, {
        workerPath: OCR_WORKER_PATH,
        corePath: OCR_CORE_PATH,
        langPath: OCR_LANGUAGE_PATH,
        logger: (message) => {
          if (!String(message?.status || '').includes('recognizing')) return;
          progressListener?.({
            stage: 'ocr',
            label: `Lokalny OCR analizuje licznik… ${Math.round(Number(message.progress || 0) * 100)}%`,
          });
        },
      });
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function loadImage(imageDataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nie udało się otworzyć zdjęcia dla lokalnego OCR.'));
    image.src = imageDataUrl;
  });
}

function preparePass(image, { crop = 0, threshold = 0, contrast = 2 } = {}) {
  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  const sx = Math.round(sourceWidth * crop);
  const sy = Math.round(sourceHeight * crop);
  const sw = Math.max(1, sourceWidth - (sx * 2));
  const sh = Math.max(1, sourceHeight - (sy * 2));
  const scale = Math.min(4, Math.max(1, 2400 / Math.max(sw, sh)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Przeglądarka nie udostępniła obróbki zdjęcia.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter = threshold ? 'none' : `grayscale(1) contrast(${contrast}) brightness(1.08)`;
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  if (threshold) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = (pixels.data[index] * .299) + (pixels.data[index + 1] * .587) + (pixels.data[index + 2] * .114);
      const value = gray >= threshold ? 255 : 0;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

function normalizeDigits(value = '') {
  const compact = String(value).trim().replace(/\s+/g, '').replace(/O/gi, '0').replace(/[Il|]/g, '1');
  const whole = compact.split(/[,.]/)[0].replace(/\D/g, '');
  if (!/^\d{3,7}$/.test(whole)) return null;
  const kilometers = Number(whole);
  return Number.isInteger(kilometers) && kilometers <= 5000000 ? kilometers : null;
}

export function extractLabeledOdometer(rawText = '') {
  const lines = String(rawText || '').toUpperCase().replace(/\r/g, '\n').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/\b(?:ODO(?:METER)?|TOTAL)\b/.test(line) || /\bTRIP\b/.test(line)) continue;
    const afterLabel = line.match(/\b(?:ODO(?:METER)?|TOTAL)\b\s*[:=\-]?\s*([0-9OIL|][0-9OIL|\s.,]{2,10})/i);
    const beforeLabel = line.match(/([0-9OIL|][0-9OIL|\s.,]{2,10})\s*(?:KM\s*)?\b(?:ODO(?:METER)?|TOTAL)\b/i);
    const kilometers = normalizeDigits(afterLabel?.[1] || beforeLabel?.[1] || '');
    if (kilometers !== null) return kilometers;
  }
  return null;
}

export function selectOdometerOcrConsensus(results = []) {
  const votes = new Map();
  for (const result of results) {
    const odometerKm = extractLabeledOdometer(result?.text);
    if (odometerKm === null) continue;
    const current = votes.get(odometerKm) || { odometerKm, count: 0, maxConfidence: 0 };
    current.count += 1;
    current.maxConfidence = Math.max(current.maxConfidence, Number(result?.confidence || 0));
    votes.set(odometerKm, current);
  }
  const winner = [...votes.values()].sort((a, b) => b.count - a.count || b.maxConfidence - a.maxConfidence)[0] || null;
  const reliable = Boolean(winner && ((winner.count >= 2 && winner.maxConfidence >= 55) || winner.maxConfidence >= 88));
  return {
    reliable,
    odometerKm: reliable ? winner.odometerKm : null,
    confidence: reliable ? Math.min(.95, Math.max(.65, winner.maxConfidence / 100)) : 0,
    votes: winner?.count || 0,
  };
}

async function terminateOcrWorker() {
  const active = workerPromise;
  workerPromise = null;
  if (!active) return;
  try { (await active)?.terminate?.(); } catch { /* fallback do OpenAI nie może zostać zablokowany */ }
}

export async function readOdometerLocally(imageDataUrl, { onProgress } = {}) {
  const operation = (async () => {
    onProgress?.({ stage: 'ocr', label: 'Najpierw sprawdzam licznik lokalnie na telefonie…' });
    const image = await loadImage(imageDataUrl);
    const passes = [
      { image: preparePass(image, { crop: .04, contrast: 2.2 }), psm: '11' },
      { image: preparePass(image, { crop: .10, threshold: 145 }), psm: '6' },
      { image: preparePass(image, { crop: .10, threshold: 185 }), psm: '11' },
    ];
    const worker = await getWorker(onProgress);
    const results = [];
    for (const pass of passes) {
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm,
        tessedit_char_whitelist: '0123456789ODOMETRTAIKM:.- ',
        preserve_interword_spaces: '1',
      });
      const recognized = await worker.recognize(pass.image);
      results.push({ text: recognized?.data?.text || '', confidence: recognized?.data?.confidence || 0 });
      const consensus = selectOdometerOcrConsensus(results);
      if (consensus.reliable && consensus.votes >= 2) return { ...consensus, rawText: results.map((item) => item.text).join('\n') };
    }
    return { ...selectOdometerOcrConsensus(results), rawText: results.map((item) => item.text).join('\n') };
  })();

  let timeoutId;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Lokalny OCR przekroczył limit czasu.')), OCR_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    await terminateOcrWorker();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
