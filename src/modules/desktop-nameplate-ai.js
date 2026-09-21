import {
  resolveRotensoModelFromEan,
  resolveRotensoNameplateModelExact,
} from './desktop-nameplate-model-dictionary.js';

function clean(value = '') {
  return String(value || '').trim();
}

function cleanSerial(value = '') {
  return clean(value).toUpperCase().replace(/[^A-Z0-9._/-]/g, '');
}

function aiQuality(value, labelName = 'wyniku') {
  const score = Math.max(0, Math.min(1, Number(value || 0)));
  if (!score) {
    return {
      score: 0,
      level: 'low',
      label: 'Brak odczytu',
      warning: `AI nie odczytała ${labelName}. Wpisz wartość ręcznie albo popraw kadr.`,
    };
  }
  return {
    score: Math.min(79, Math.max(40, Math.round(score * 100))),
    level: 'medium',
    label: 'Wymaga sprawdzenia',
    warning: `Wartość została przepisana przez AI. Porównaj ${labelName} znak po znaku ze zdjęciem.`,
  };
}

function confirmedQuality(message) {
  return { score: 100, level: 'high', label: 'Potwierdzone', warning: message };
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie udało się przygotować kadru do analizy AI.')); };
    image.src = url;
  });
}

async function fileToDataUrl(file) {
  const image = await loadImage(file);
  const maxDimension = 2400;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Przeglądarka nie udostępniła modułu obrazu.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.96);
}

function fieldSource(type, label, value = '') {
  return { type, label, value };
}

export function normalizeNameplateAiResult(payload = {}, barcodeInfo = {}) {
  const result = payload?.result || payload || {};
  const exactBarcodeEan = clean(barcodeInfo.ean).replace(/\D/g, '');
  const aiEan = clean(result.ean).replace(/\D/g, '');
  const exactFromBarcode = exactBarcodeEan ? resolveRotensoModelFromEan(exactBarcodeEan) : null;
  const exactFromAiEan = !exactFromBarcode && /^\d{13}$/.test(aiEan) ? resolveRotensoModelFromEan(aiEan) : null;
  const aiTextEvidence = [
    result.model_code,
    result.model_family,
    result.raw_text,
    result.notes,
  ].map(clean).filter(Boolean).join('\n');
  const exactCodeFromAi = resolveRotensoNameplateModelExact(aiTextEvidence);
  const exactModel = exactFromBarcode || exactFromAiEan || exactCodeFromAi || null;

  const rawAiModel = exactCodeFromAi?.code
    || [clean(result.model_family), clean(result.model_code)].filter(Boolean).join(' ').trim();
  const manufacturer = exactModel?.manufacturer || clean(result.manufacturer);
  const model = exactModel?.model || rawAiModel;
  const power = exactModel?.capacityKw ? `${exactModel.capacityKw} kW` : clean(result.power_kw);
  const serialNumber = cleanSerial(barcodeInfo.serialNumber || result.serial_number);
  const confidence = result.confidence || {};

  const modelConfirmedByCatalog = Boolean(exactModel);
  const modelConfirmationReason = exactFromBarcode
    ? 'dokładnie odczytany EAN'
    : exactFromAiEan
      ? 'EAN odczytany przez AI i znaleziony w katalogu'
      : exactCodeFromAi
        ? `kod modelu ${exactCodeFromAi.code} odczytany z transkrypcji AI i znaleziony w słowniku Rotenso`
        : '';

  const fieldQualities = {
    manufacturer: modelConfirmedByCatalog
      ? confirmedQuality(`Marka wynika z modelu potwierdzonego przez ${modelConfirmationReason}.`)
      : aiQuality(confidence.manufacturer, 'markę'),
    model: modelConfirmedByCatalog
      ? confirmedQuality(`Model potwierdzony przez ${modelConfirmationReason}.`)
      : {
        ...aiQuality(confidence.model, 'model'),
        warning: rawAiModel
          ? 'AI odczytała model, ale nie znaleziono dokładnego odpowiednika w katalogu Rotenso. Sprawdź go ręcznie przed zapisem.'
          : 'AI nie odczytała modelu. Wpisz go ręcznie.',
      },
    power: modelConfirmedByCatalog
      ? confirmedQuality('Moc wynika z dokładnie potwierdzonego modelu w katalogu.')
      : aiQuality(confidence.power, 'moc'),
    serialNumber: barcodeInfo.serialNumber
      ? confirmedQuality('Numer seryjny odczytano bezpośrednio z kodu kreskowego.')
      : aiQuality(confidence.serial_number, 'numer seryjny'),
  };

  const catalogLabel = exactFromBarcode
    ? `EAN ${exactBarcodeEan} · katalog Rotenso`
    : exactFromAiEan
      ? `AI: EAN ${aiEan} · katalog Rotenso`
      : exactCodeFromAi
      ? `AI: ${exactCodeFromAi.code} · słownik Rotenso`
        : 'Analiza AI obrazu';

  const fieldSources = {
    manufacturer: modelConfirmedByCatalog
      ? fieldSource(exactFromBarcode ? 'barcode' : 'ai', catalogLabel)
      : fieldSource('ai', 'Analiza AI obrazu'),
    model: modelConfirmedByCatalog
      ? fieldSource(exactFromBarcode ? 'barcode' : 'ai', catalogLabel, exactModel?.code || result.model_code || '')
      : fieldSource('ai', 'Analiza AI obrazu — niepotwierdzony model', result.model_code || ''),
    power: modelConfirmedByCatalog
      ? fieldSource(exactFromBarcode ? 'barcode' : 'ai', catalogLabel)
      : fieldSource('ai', 'Analiza AI obrazu'),
    serialNumber: barcodeInfo.serialNumber
      ? fieldSource('barcode', 'Code 128 / kod kreskowy — potwierdzone', barcodeInfo.serialNumber)
      : fieldSource('ai', 'Analiza AI obrazu'),
  };

  const notes = [
    exactBarcodeEan ? `EAN (czytnik kodów): ${exactBarcodeEan}` : aiEan ? `EAN (AI): ${aiEan}` : '',
    exactCodeFromAi ? `Kod modelu potwierdzony w katalogu: ${exactCodeFromAi.code}` : '',
    rawAiModel && !modelConfirmedByCatalog ? `Model odczytany przez AI, ale niepotwierdzony w katalogu: ${rawAiModel}` : '',
    clean(result.raw_text),
    clean(result.notes),
    Array.isArray(result.uncertain_characters) && result.uncertain_characters.length
      ? `Niepewne znaki: ${result.uncertain_characters.join(', ')}`
      : '',
  ].filter(Boolean).join('\n');

  return {
    manufacturer,
    model,
    power,
    serialNumber,
    ean: exactBarcodeEan || aiEan,
    rawText: notes,
    uncertainCharacters: Array.isArray(result.uncertain_characters) ? result.uncertain_characters : [],
    fieldQualities,
    fieldSources,
    exactModel,
    modelConfirmedByCatalog,
    aiResult: result,
  };
}

export async function readDesktopNameplateWithAi({ file, supabase, barcodeInfo = {}, targetUnit = '', onProgress } = {}) {
  if (!file) throw new Error('Brakuje wykadrowanego zdjęcia tabliczki.');
  onProgress?.({ progress: 10, label: 'Przygotowanie kadru do AI…' });
  const imageDataUrl = await fileToDataUrl(file);
  const sessionResult = await supabase?.auth?.getSession?.();
  const accessToken = sessionResult?.data?.session?.access_token || '';
  if (!accessToken) throw new Error('Sesja administratora wygasła. Zaloguj się ponownie.');
  onProgress?.({ progress: 35, label: 'Analiza zdjęcia przez AI…' });
  const response = await fetch('/api/read-nameplate-ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      imageDataUrl,
      barcodeValues: barcodeInfo.values || barcodeInfo.detections?.map((item) => item.value) || [],
      barcodeDetections: (barcodeInfo.detections || []).map((item) => ({
        value: item.value || '',
        format: item.format || '',
        source: item.source || '',
        roleHint: item.roleHint || '',
      })),
      targetUnit,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Nie udało się odczytać tabliczki przez AI.');
  onProgress?.({ progress: 100, label: 'Analiza AI zakończona' });
  return normalizeNameplateAiResult(payload, barcodeInfo);
}
