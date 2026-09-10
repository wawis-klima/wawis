import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppModal from '../modals/AppModal.jsx';
import {
  buildDeviceModelValue,
  fetchDesktopNameplateFile,
} from '../../modules/desktop-nameplate-reader-utils.js';
import { getDesktopNameplateTarget, saveDesktopNameplateOcrResult } from '../../modules/desktop-nameplate-ocr-save.js';
import { getPhotoStoragePath, getSignedPhotoUrl } from '../../modules/photos.js';
import {
  getNameplateTargetMismatch,
  scanDesktopNameplateBarcodes,
} from '../../modules/desktop-nameplate-barcode.js';
import { readDesktopNameplateWithAi } from '../../modules/desktop-nameplate-ai.js';
import {
  cancelDesktopNameplateModelOcr,
  scanDesktopNameplateModelCode,
  scanDesktopNameplateSerialText,
} from '../../modules/desktop-nameplate-model-ocr.js';
import {
  downloadBuiltInRotensoCatalogCsv,
  downloadNameplateCatalogCsvTemplate,
  getBuiltInRotensoCatalogStats,
  importNameplateCatalogRows,
  lookupBuiltInRotensoProductByEan,
  lookupNameplateProductByEan,
  parseNameplateCatalogFile,
  saveConfirmedNameplateProduct,
} from '../../modules/nameplate-product-catalog.js';

const DEFAULT_CROP = { left: 4, top: 4, width: 92, height: 92 };
const MIN_CROP_SIZE = 7;
const SOURCE_LOAD_TIMEOUT_MS = 15000;
const BARCODE_SCAN_TIMEOUT_MS = 95000;
const MODEL_OCR_TIMEOUT_MS = 60000;
const SERIAL_OCR_TIMEOUT_MS = 45000;
const CATALOG_LOOKUP_TIMEOUT_MS = 7000;
const AI_READ_TIMEOUT_MS = 60000;
const BUILT_IN_ROTENSO_CATALOG = getBuiltInRotensoCatalogStats();

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function confidenceClass(level = '') {
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

function manualFieldQuality(value = '') {
  if (!String(value || '').trim()) {
    return {
      score: 0,
      level: 'low',
      label: 'Brak odczytu',
      warning: 'Pole jest puste. Wpisz wartość ręcznie albo pozostaw je wyłączone przy zapisie.',
    };
  }
  return {
    score: null,
    level: 'medium',
    label: 'Warto sprawdzić',
    warning: 'Pole zostało zmienione ręcznie. Porównaj je ze zdjęciem przed zatwierdzeniem.',
  };
}

function FieldConfidenceBadge({ quality }) {
  if (!quality) return null;
  const scoreText = Number.isFinite(Number(quality.score)) && quality.score !== null
    ? ` ${Math.round(Number(quality.score))}%`
    : '';
  return (
    <span
      className={`desktopNameplateOcrFieldConfidence ${confidenceClass(quality.level)}`}
      title={quality.warning || quality.label}
    >
      <i aria-hidden="true" />
      {quality.label}{scoreText}
    </span>
  );
}

function FieldSourceBadge({ source }) {
  if (!source?.label) return null;
  return (
    <div className={`desktopNameplateFieldSource source-${source.type || 'unknown'}`}>
      <span>Źródło</span>
      <strong>{source.label}</strong>
    </div>
  );
}

function confirmedQuality(message) {
  return { score: 100, level: 'high', label: 'Potwierdzone', warning: message };
}

function serialTextReviewQuality(result = {}) {
  const votes = Number(result?.votes || 0);
  const ocrConfidence = Number(result?.confidence || 0);
  const score = Math.max(48, Math.min(78, Math.round((votes >= 2 ? 66 : 52) + (Math.max(0, Math.min(100, ocrConfidence)) * 0.12))));
  return {
    score,
    level: 'medium',
    label: 'Do sprawdzenia',
    warning: 'Numer seryjny odczytano z nadruku po oznaczeniu SN, a nie bezpośrednio z kodu kreskowego. Porównaj go znak po znaku ze zdjęciem przed zapisem.',
  };
}

function normalizeSerial(value = '') {
  return String(value || '').trim().toUpperCase();
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Nie udało się wczytać obrazu do kadrowania.'));
    };
    image.src = objectUrl;
  });
}

function normalizeRotation(rotation = 0) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

function getRotationCanvasSize(width, height, rotation) {
  const normalized = normalizeRotation(rotation);
  if (normalized === 90 || normalized === 270) return { width: height, height: width };
  return { width, height };
}

function drawRotatedImage(sourceImage, { rotation = 0, contrastEnabled = false } = {}) {
  const normalizedRotation = normalizeRotation(rotation);
  const rotatedSize = getRotationCanvasSize(sourceImage.width, sourceImage.height, normalizedRotation);
  const canvas = document.createElement('canvas');
  canvas.width = rotatedSize.width;
  canvas.height = rotatedSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Przeglądarka nie udostępniła modułu przetwarzania zdjęcia.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  context.filter = contrastEnabled ? 'contrast(1.24) saturate(1.04) brightness(1.05)' : 'none';
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.drawImage(sourceImage, -sourceImage.width / 2, -sourceImage.height / 2);
  context.restore();
  return canvas;
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.98) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Nie udało się przygotować obrazu.'));
    }, type, quality);
  });
}

async function buildWorkspacePreview(originalFile, options) {
  const sourceImage = await loadImageFromBlob(originalFile);
  const canvas = drawRotatedImage(sourceImage, options);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.96);
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
  };
}

async function buildProcessedReaderFile(originalFile, {
  rotation = 0,
  contrastEnabled = false,
  crop = null,
} = {}) {
  const sourceImage = await loadImageFromBlob(originalFile);
  const baseCanvas = drawRotatedImage(sourceImage, { rotation, contrastEnabled });
  const safeCrop = crop && crop.width > 1 && crop.height > 1 ? crop : {
    x: 0,
    y: 0,
    width: baseCanvas.width,
    height: baseCanvas.height,
  };

  const cropWidth = Math.max(1, Math.min(baseCanvas.width - safeCrop.x, Math.round(safeCrop.width)));
  const cropHeight = Math.max(1, Math.min(baseCanvas.height - safeCrop.y, Math.round(safeCrop.height)));
  const longest = Math.max(cropWidth, cropHeight);
  const scale = Math.min(5, Math.max(1, 3200 / longest));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, Math.round(cropWidth * scale));
  cropCanvas.height = Math.max(1, Math.round(cropHeight * scale));
  const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cropContext) throw new Error('Przeglądarka nie udostępniła modułu kadrowania.');
  cropContext.imageSmoothingEnabled = true;
  cropContext.imageSmoothingQuality = 'high';
  cropContext.drawImage(
    baseCanvas,
    Math.max(0, Math.round(safeCrop.x)),
    Math.max(0, Math.round(safeCrop.y)),
    cropWidth,
    cropHeight,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );

  const blob = await canvasToBlob(cropCanvas, 'image/png', 1);
  return new File([blob], originalFile.name || 'tabliczka-odczyt.png', { type: 'image/png' });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateDraggedCrop(startCrop, mode, dx, dy) {
  let { left, top, width, height } = startCrop;
  const right = left + width;
  const bottom = top + height;

  if (mode === 'move') {
    left = clamp(left + dx, 0, 100 - width);
    top = clamp(top + dy, 0, 100 - height);
    return { left, top, width, height };
  }

  if (mode.includes('w')) {
    const nextLeft = clamp(left + dx, 0, right - MIN_CROP_SIZE);
    width = right - nextLeft;
    left = nextLeft;
  }
  if (mode.includes('e')) {
    width = clamp(width + dx, MIN_CROP_SIZE, 100 - left);
  }
  if (mode.includes('n')) {
    const nextTop = clamp(top + dy, 0, bottom - MIN_CROP_SIZE);
    height = bottom - nextTop;
    top = nextTop;
  }
  if (mode.includes('s')) {
    height = clamp(height + dy, MIN_CROP_SIZE, 100 - top);
  }
  return { left, top, width, height };
}

export default function DesktopNameplateOcrButton({
  photo,
  job,
  supabase,
  disabled = false,
  onSaved,
  compact = false,
}) {
  const target = useMemo(() => getDesktopNameplateTarget(photo), [photo]);
  const imageBoxRef = useRef(null);
  const dragRef = useRef(null);
  const previewUrlRef = useRef('');
  const catalogFileInputRef = useRef(null);
  const operationRef = useRef(0);
  const activeSourceUrlRef = useRef('');
  const photoSourceUrl = useMemo(() => String(photo?.image_url || photo?.signed_url || photo?.preview_full_url || ''), [photo]);
  const photoIdentity = useMemo(() => String(
    photo?.id
    || photo?.storage_path
    || photo?.path
    || `${target?.deviceIndex || 0}:${target?.unitRef || 'unknown'}`,
  ), [photo?.id, photo?.storage_path, photo?.path, target?.deviceIndex, target?.unitRef]);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, label: '' });
  const [error, setError] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [power, setPower] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [quality, setQuality] = useState(null);
  const [fieldQualities, setFieldQualities] = useState(null);
  const [fieldSources, setFieldSources] = useState({});
  const [barcodeInfo, setBarcodeInfo] = useState({ detections: [], values: [], ean: '', serialNumber: '' });
  const [readMode, setReadMode] = useState('');
  const [rawText, setRawText] = useState('');
  const [saveModel, setSaveModel] = useState(true);
  const [saveSerial, setSaveSerial] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [contrastEnabled, setContrastEnabled] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [cropPercent, setCropPercent] = useState(DEFAULT_CROP);
  const [catalogProduct, setCatalogProduct] = useState(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState('');
  const [catalogImportPreview, setCatalogImportPreview] = useState(null);

  useEffect(() => () => {
    operationRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    // Resetujemy obszar roboczy wyłącznie po przejściu do innego rekordu zdjęcia.
    // Podpisany URL Supabase może odświeżyć się podczas odczytu tego samego zdjęcia;
    // nie wolno wtedy kasować źródła, podglądu ani anulować trwającej operacji.
    operationRef.current += 1;
    activeSourceUrlRef.current = photoSourceUrl;
    setBusy(false);
    setSourceLoading(false);
    setSourceFile(null);
    setImageNaturalSize({ width: 0, height: 0 });
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setPreviewUrl('');
  }, [photoIdentity]);

  useEffect(() => {
    // Gdy modal jest zamknięty, zapamiętujemy najnowszy podpisany URL. W czasie
    // otwartego odczytu zachowujemy snapshot, aby odświeżenie tokenu nie zrywało obrazu.
    if (!open && photoSourceUrl) activeSourceUrlRef.current = photoSourceUrl;
  }, [photoSourceUrl, open]);

  useEffect(() => {
    if (!sourceFile || !open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const preview = await buildWorkspacePreview(sourceFile, { rotation, contrastEnabled });
        if (cancelled) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const nextUrl = URL.createObjectURL(preview.blob);
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
        setImageNaturalSize({ width: preview.width, height: preview.height });
      } catch (previewError) {
        if (!cancelled) setError(previewError?.message || 'Nie udało się przygotować podglądu zdjęcia.');
      }
    })();
    return () => { cancelled = true; };
  }, [sourceFile, rotation, contrastEnabled, open]);

  if (!target) return null;

  function resetResult() {
    setProgress({ progress: 0, label: '' });
    setError('');
    setManufacturer('');
    setModel('');
    setPower('');
    setSerialNumber('');
    setQuality(null);
    setFieldQualities(null);
    setFieldSources({});
    setBarcodeInfo({ detections: [], values: [], ean: '', serialNumber: '' });
    setReadMode('');
    setRawText('');
    setCatalogProduct(null);
    setCatalogMessage('');
    setCatalogImportPreview(null);
    setSaveModel(true);
    setSaveSerial(true);
  }

  function resetWorkspace() {
    setZoom(1);
    setRotation(0);
    setContrastEnabled(false);
    setCropPercent(DEFAULT_CROP);
  }

  function getPixelCrop() {
    if (!imageNaturalSize.width || !imageNaturalSize.height) return null;
    return {
      x: (cropPercent.left / 100) * imageNaturalSize.width,
      y: (cropPercent.top / 100) * imageNaturalSize.height,
      width: (cropPercent.width / 100) * imageNaturalSize.width,
      height: (cropPercent.height / 100) * imageNaturalSize.height,
    };
  }

  async function ensureSourceFile() {
    if (sourceFile) return sourceFile;
    let sourceUrl = activeSourceUrlRef.current || photoSourceUrl;
    if (!sourceUrl) {
      const storagePath = getPhotoStoragePath({ photo });
      sourceUrl = await getSignedPhotoUrl({
        storagePath,
        fallbackUrl: photo?.original_image_url || '',
        supabase,
      });
      if (sourceUrl) activeSourceUrlRef.current = sourceUrl;
    }
    if (!sourceUrl) throw new Error('Brak adresu zdjęcia tabliczki. Zamknij okno i odśwież szczegóły montażu.');
    const file = await fetchDesktopNameplateFile(
      sourceUrl,
      `tabliczka-${target.deviceIndex}-${target.unitRef}.jpg`,
    );
    setSourceFile(file);
    const probe = await loadImageFromBlob(file);
    setImageNaturalSize({ width: probe.width, height: probe.height });
    return file;
  }

  async function getProcessedFile() {
    const file = await ensureSourceFile();
    return buildProcessedReaderFile(file, {
      rotation,
      contrastEnabled,
      crop: getPixelCrop(),
    });
  }

  async function runBarcodeScan() {
    if (busy || saving || sourceLoading) return;
    const operationId = ++operationRef.current;
    setBusy(true);
    setReadMode('barcode');
    setError('');
    setProgress({ progress: 0, label: '' });
    try {
      const processedFile = await withTimeout(
        getProcessedFile(),
        SOURCE_LOAD_TIMEOUT_MS,
        'Przygotowanie zdjęcia trwało zbyt długo. Zamknij okno i spróbuj ponownie.',
      );
      const result = await withTimeout(
        scanDesktopNameplateBarcodes(processedFile, {
          onProgress: (state) => {
            if (operationRef.current === operationId) setProgress(state);
          },
        }),
        BARCODE_SCAN_TIMEOUT_MS,
        'Odczyt kodów nie zakończył pracy w ciągu 95 sekund. Popraw kadr albo użyj AI.',
      );
      if (operationRef.current !== operationId) return;
      let exactModel = result.rotensoModel || null;
      let printedModelResult = null;
      let serialTextResult = null;
      let catalogMatch = null;
      const sources = {};
      const qualities = {};

      if (!result.serialNumber) {
        try {
          serialTextResult = await withTimeout(
            scanDesktopNameplateSerialText(processedFile, {
              onProgress: (state) => {
                if (operationRef.current === operationId) setProgress(state);
              },
            }),
            SERIAL_OCR_TIMEOUT_MS,
            'Lokalny odczyt numeru seryjnego nie zakończył pracy w ciągu 45 sekund.',
          );
          if (operationRef.current !== operationId) return;
        } catch (serialOcrError) {
          serialTextResult = {
            serialNumber: '',
            rawText: '',
            error: serialOcrError?.message || 'Nie udało się lokalnie odczytać numeru po oznaczeniu SN.',
          };
        }
      }

      if (!exactModel) {
        try {
          printedModelResult = await withTimeout(
            scanDesktopNameplateModelCode(processedFile, {
              onProgress: (state) => {
                if (operationRef.current === operationId) setProgress(state);
              },
            }),
            MODEL_OCR_TIMEOUT_MS,
            'Lokalny odczyt modelu nie zakończył pracy w ciągu 60 sekund.',
          );
          if (operationRef.current !== operationId) return;
          if (printedModelResult.reliable && printedModelResult.exactModel) {
            exactModel = printedModelResult.exactModel;
          }
        } catch (modelOcrError) {
          printedModelResult = {
            reliable: false,
            rawText: '',
            error: modelOcrError?.message || 'Nie udało się lokalnie odczytać kodu modelu.',
          };
        }
      }
      setBarcodeInfo({ ...result, rotensoModel: exactModel });

      if (result.serialNumber) {
        setSerialNumber(result.serialNumber);
        const serialBarcodeLabel = result.serialSource === 'universal_barcode'
          ? 'Uniwersalny lokalny dekoder Code 128 (ZXing)'
          : 'Code 128 / kod kreskowy';
        sources.serialNumber = { type: 'barcode', label: serialBarcodeLabel };
        qualities.serialNumber = confirmedQuality('Numer seryjny odczytany bezpośrednio z kodu kreskowego.');
      } else if (serialTextResult?.serialNumber) {
        setSerialNumber(serialTextResult.serialNumber);
        sources.serialNumber = { type: 'ocr', label: 'Lokalny odczyt nadruku po oznaczeniu SN' };
        qualities.serialNumber = serialTextReviewQuality(serialTextResult);
      }

      if (result.ean) {
        const builtInLookup = lookupBuiltInRotensoProductByEan(result.ean);
        if (builtInLookup.entry && builtInLookup.resolution) {
          catalogMatch = builtInLookup.entry;
          exactModel = builtInLookup.resolution;
          setCatalogProduct(builtInLookup.entry);
          setCatalogMessage(`EAN ${result.ean} znaleziony we wbudowanym katalogu Rotenso ${BUILT_IN_ROTENSO_CATALOG.version}.`);
        }
        try {
          setProgress({ progress: 82, label: builtInLookup.entry ? 'Synchronizacja z katalogiem Wawis…' : 'Sprawdzanie katalogu EAN…' });
          const catalogLookup = await withTimeout(
            lookupNameplateProductByEan({ supabase, ean: result.ean }),
            CATALOG_LOOKUP_TIMEOUT_MS,
            'Katalog EAN nie odpowiedział w ciągu 7 sekund.',
          );
          if (operationRef.current !== operationId) return;
          if (catalogLookup.entry && catalogLookup.resolution) {
            catalogMatch = catalogLookup.entry;
            exactModel = catalogLookup.resolution;
            setCatalogProduct(catalogLookup.entry);
            setCatalogMessage(catalogLookup.builtIn
              ? `EAN ${result.ean} znaleziony we wbudowanym katalogu Rotenso ${BUILT_IN_ROTENSO_CATALOG.version}.`
              : `EAN ${result.ean} znaleziony w centralnym katalogu Wawis.`);
          } else if (catalogLookup.unavailable) {
            setCatalogMessage(`Centralny katalog nie odpowiedział. Wbudowany katalog Rotenso zawiera ${BUILT_IN_ROTENSO_CATALOG.count} potwierdzonych pozycji.`);
          } else if (!builtInLookup.entry) {
            setCatalogProduct(null);
          }
        } catch (catalogError) {
          console.warn('Nie udało się sprawdzić katalogu EAN.', catalogError);
          setCatalogMessage(builtInLookup.entry
            ? `EAN ${result.ean} rozpoznany przez wbudowany katalog Rotenso. Centralna synchronizacja nie odpowiedziała.`
            : 'Katalog EAN nie odpowiedział. Odczyt kodów działa nadal.');
        }
      }

      const mismatch = getNameplateTargetMismatch(target.unitRef, exactModel);
      if (exactModel && !mismatch) {
        setManufacturer(exactModel.manufacturer || 'Rotenso');
        setModel(exactModel.model || '');
        setPower(exactModel.capacityKw ? `${exactModel.capacityKw} kW` : '');
        const label = catalogMatch
          ? `Katalog Wawis · EAN ${result.ean}`
          : result.ean
            ? `EAN ${result.ean} · katalog Rotenso`
            : printedModelResult?.reliable
              ? `Lokalny odczyt nadruku ${exactModel.code} · słownik Rotenso`
              : `Dokładny kod ${exactModel.code}`;
        const sourceType = catalogMatch ? 'catalog' : printedModelResult?.reliable ? 'ocr' : 'barcode';
        sources.manufacturer = { type: sourceType, label };
        sources.model = { type: sourceType, label };
        sources.power = { type: sourceType, label };
        qualities.manufacturer = confirmedQuality('Marka potwierdzona przez dokładny kod produktu.');
        qualities.model = confirmedQuality('Model dopasowany bez zgadywania do dokładnego kodu z katalogu.');
        qualities.power = confirmedQuality('Moc wynika z dokładnie dopasowanego modelu.');
      }

      setFieldSources((current) => ({ ...current, ...sources }));
      setFieldQualities((current) => ({ ...(current || {}), ...qualities }));

      const rawSections = [
        result.detections?.length
          ? `Odczytane kody:\n${result.detections.map((item) => `${item.format || 'kod'} · ${item.source || 'czytnik'}: ${item.value}`).join('\n')}`
          : '',
        serialTextResult?.serialNumber
          ? `Lokalny odczyt numeru seryjnego z nadruku SN:\n${serialTextResult.serialNumber}\nWynik wymaga porównania ze zdjęciem przed zapisem.${serialTextResult.rawText ? `\n\nSurowy odczyt pola SN:\n${serialTextResult.rawText}` : ''}`
          : serialTextResult?.error
            ? `Lokalny odczyt numeru seryjnego: ${serialTextResult.error}`
            : serialTextResult?.rawText
              ? `Nie znaleziono pewnego numeru po oznaczeniu SN. Surowy odczyt:\n${serialTextResult.rawText}`
              : '',
        printedModelResult?.reliable
          ? `Lokalny odczyt nadruku modelu:\n${printedModelResult.rawText || printedModelResult.modelCode}\nPotwierdzony model: ${printedModelResult.modelCode}`
          : printedModelResult?.rawText
            ? `Niepotwierdzony lokalny odczyt nadruku:\n${printedModelResult.rawText}`
            : printedModelResult?.error
              ? `Lokalny odczyt modelu: ${printedModelResult.error}`
              : '',
        result.diagnostics?.length ? `Diagnostyka czytników:\n• ${result.diagnostics.join('\n• ')}` : '',
      ].filter(Boolean);
      setRawText(rawSections.length ? rawSections.join('\n\n') : 'Nie odczytano żadnego kodu kreskowego.');

      const resolvedSerialNumber = result.serialNumber || serialTextResult?.serialNumber || '';
      if (mismatch) {
        setError(mismatch.message);
      } else if (result.ean && !exactModel) {
        setError(`EAN ${result.ean} odczytano poprawnie, ale nie ma go w katalogu. Użyj „Odczytaj przez AI” do odczytu nadrukowanego modelu albo wpisz dane ręcznie.`);
      } else if (!result.ean && resolvedSerialNumber && exactModel && printedModelResult?.reliable) {
        setCatalogMessage(`Kod ${exactModel.code} odczytano lokalnie z nadruku i potwierdzono w słowniku Rotenso.`);
      } else if (!result.ean && result.serialNumber && !exactModel) {
        setCatalogMessage('Numer seryjny odczytano z kodu kreskowego. Ta etykieta nie podała modelu przez EAN — kliknij „Odczytaj przez AI”, aby odczytać markę, model i moc z nadruku.');
      } else if (!result.ean && serialTextResult?.serialNumber && !exactModel) {
        setCatalogMessage('Numer seryjny odczytano lokalnie z nadruku po oznaczeniu SN i oznaczono do sprawdzenia. Model nadal możesz odczytać przez AI albo wpisać ręcznie.');
      } else if (!result.ean && !resolvedSerialNumber && !exactModel) {
        setError('Nie odczytano pewnego EAN-u ani numeru seryjnego. Popraw kadr albo użyj „Odczytaj przez AI”.');
      }
    } catch (barcodeError) {
      if (operationRef.current === operationId) {
        setError(barcodeError?.message || 'Nie udało się odczytać kodów kreskowych.');
      }
    } finally {
      if (operationRef.current === operationId) {
        setBusy(false);
        setReadMode('');
      }
    }
  }

  async function runAiRead() {
    if (busy || saving || sourceLoading) return;
    const operationId = ++operationRef.current;
    setBusy(true);
    setReadMode('ai');
    setError('');
    setProgress({ progress: 0, label: '' });
    try {
      const processedFile = await withTimeout(
        getProcessedFile(),
        SOURCE_LOAD_TIMEOUT_MS,
        'Przygotowanie zdjęcia trwało zbyt długo. Zamknij okno i spróbuj ponownie.',
      );
      const result = await withTimeout(readDesktopNameplateWithAi({
        file: processedFile,
        supabase,
        barcodeInfo,
        targetUnit: target.unitLabel,
        onProgress: (state) => {
          if (operationRef.current === operationId) setProgress(state);
        },
      }), AI_READ_TIMEOUT_MS, 'Analiza AI nie odpowiedziała w ciągu 60 sekund. Spróbuj ponownie.');
      if (operationRef.current !== operationId) return;
      const mismatch = getNameplateTargetMismatch(target.unitRef, result.exactModel);
      setManufacturer(result.manufacturer || '');
      setModel(result.model || '');
      setPower(result.power || '');
      setSerialNumber(result.serialNumber || '');
      setFieldQualities(result.fieldQualities || null);
      setFieldSources(result.fieldSources || {});
      setRawText(result.rawText || '');
      setQuality(null);
      if (mismatch) {
        setError(mismatch.message);
      } else if (!result.manufacturer && !result.model && !result.serialNumber) {
        setError('Analiza AI nie odczytała pewnych danych. Popraw kadr albo wpisz dane ręcznie.');
      } else if (result.model && !result.modelConfirmedByCatalog) {
        setError('AI odczytała model, ale nie udało się potwierdzić go dokładnie w katalogu Rotenso. Sprawdź model ręcznie przed zapisem.');
      } else if (result.modelConfirmedByCatalog && !barcodeInfo?.ean) {
        setCatalogMessage(`Model odczytany przez AI i potwierdzony w katalogu Rotenso ${BUILT_IN_ROTENSO_CATALOG.version}.`);
      }
    } catch (aiError) {
      if (operationRef.current === operationId) {
        setError(aiError?.message || 'Nie udało się odczytać tabliczki przez AI.');
      }
    } finally {
      if (operationRef.current === operationId) {
        setBusy(false);
        setReadMode('');
      }
    }
  }

  async function openAndPrepare() {
    const operationId = ++operationRef.current;
    activeSourceUrlRef.current = photoSourceUrl || activeSourceUrlRef.current;
    setOpen(true);
    setBusy(false);
    setReadMode('');
    resetWorkspace();
    resetResult();
    setSourceLoading(true);
    try {
      await withTimeout(
        ensureSourceFile(),
        SOURCE_LOAD_TIMEOUT_MS,
        'Pobieranie zdjęcia tabliczki trwało zbyt długo. Zamknij okno i spróbuj ponownie.',
      );
    } catch (loadError) {
      if (operationRef.current === operationId) {
        setError(loadError?.message || 'Nie udało się wczytać zdjęcia tabliczki.');
      }
    } finally {
      if (operationRef.current === operationId) setSourceLoading(false);
    }
  }

  function closeOcrModal() {
    if (saving) return;
    operationRef.current += 1;
    if (busy && readMode === 'barcode') void cancelDesktopNameplateModelOcr();
    setBusy(false);
    setReadMode('');
    setProgress({ progress: 0, label: '' });
    setOpen(false);
  }

  function updateField(fieldName, value, setter) {
    setter(value);
    setFieldQualities((current) => ({
      ...(current || {}),
      [fieldName]: manualFieldQuality(value),
    }));
    setFieldSources((current) => ({
      ...(current || {}),
      [fieldName]: { type: 'manual', label: 'Wartość wpisana ręcznie' },
    }));
  }

  function startCropDrag(mode, event) {
    event.preventDefault();
    event.stopPropagation();
    const box = imageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pointerId = event.pointerId;
    const pointerTarget = event.currentTarget;
    pointerTarget?.setPointerCapture?.(pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startCrop = { ...cropPercent };
    dragRef.current = { mode, startX, startY, startCrop, pointerId };
    setDragging(true);

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const activeBox = imageBoxRef.current;
      if (!activeBox) return;
      const activeRect = activeBox.getBoundingClientRect();
      if (!activeRect.width || !activeRect.height) return;
      const dx = ((moveEvent.clientX - startX) / activeRect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / activeRect.height) * 100;
      setCropPercent(calculateDraggedCrop(startCrop, mode, dx, dy));
    };

    const finishDrag = (finishEvent) => {
      if (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== pointerId) return;
      pointerTarget?.releasePointerCapture?.(pointerId);
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  }

  function rotateWorkspace() {
    setRotation((value) => (value + 90) % 360);
    setCropPercent(DEFAULT_CROP);
    setZoom(1);
  }

  async function handleCatalogFileChange(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setCatalogBusy(true);
    setCatalogMessage('Analizowanie pliku katalogu…');
    try {
      const analysis = await parseNameplateCatalogFile(file);
      setCatalogImportPreview({ ...analysis, fileName: file.name || 'katalog' });
      setCatalogMessage(`Plik ${file.name}: poprawne ${analysis.validRows.length}, błędne ${analysis.invalidRows.length}. Import nastąpi dopiero po potwierdzeniu.`);
    } catch (catalogError) {
      setCatalogImportPreview(null);
      setCatalogMessage(catalogError?.message || 'Nie udało się odczytać katalogu.');
    } finally {
      setCatalogBusy(false);
    }
  }

  async function confirmCatalogImport() {
    if (!catalogImportPreview?.validRows?.length) return;
    setCatalogBusy(true);
    setCatalogMessage('Importowanie katalogu do Supabase…');
    try {
      const result = await importNameplateCatalogRows({ supabase, rows: catalogImportPreview.validRows });
      const imported = Number(result?.imported || 0);
      const invalid = Number(result?.invalid || 0) + Number(catalogImportPreview.invalidRows?.length || 0);
      setCatalogMessage(`Import zakończony. Zapisano ${imported} pozycji${invalid ? `, pominięto ${invalid}` : ''}.`);
      setCatalogImportPreview(null);
    } catch (catalogError) {
      setCatalogMessage(catalogError?.message || 'Nie udało się zaimportować katalogu.');
    } finally {
      setCatalogBusy(false);
    }
  }

  async function saveResult() {
    const combinedModel = `${model}${power && !String(model).includes(power) ? ` ${power}` : ''}`.trim();
    const modelValue = buildDeviceModelValue(manufacturer, combinedModel);
    const normalizedSerial = normalizeSerial(serialNumber);
    if (saveModel && !modelValue) {
      setError('Wpisz producenta lub model albo wyłącz zapis modelu.');
      return;
    }
    if (saveSerial && !normalizedSerial) {
      setError('Wpisz numer seryjny albo wyłącz zapis numeru.');
      return;
    }
    if (!saveModel && !saveSerial) {
      setError('Wybierz model lub numer seryjny do zapisania.');
      return;
    }
    if (saveModel && fieldSources?.model?.type === 'ai' && fieldQualities?.model?.level !== 'high') {
      setError('Model odczytany przez AI nie jest dokładnie potwierdzony w katalogu Rotenso. Popraw model ręcznie albo wyłącz jego zapis.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await saveDesktopNameplateOcrResult({
        supabase,
        job,
        photo,
        modelValue,
        serialNumber: normalizedSerial,
        saveModel,
        saveSerial,
      });

      if (barcodeInfo?.ean && saveModel && manufacturer && combinedModel) {
        try {
          await saveConfirmedNameplateProduct({
            supabase,
            ean: barcodeInfo.ean,
            manufacturer,
            family: catalogProduct?.family || '',
            modelCode: catalogProduct?.model_code || '',
            modelName: combinedModel,
            capacityKw: power,
            unitType: target.unitRef === 'jz' ? 'outdoor' : 'indoor',
            revision: catalogProduct?.revision || '',
            sourceReference: `Zatwierdzone przez administratora w montażu ${job?.id || ''}`.trim(),
          });
        } catch (catalogSaveError) {
          console.warn('Dane urządzenia zapisano, ale nie udało się zaktualizować katalogu EAN.', catalogSaveError);
        }
      }

      await onSaved?.(saved);
      setOpen(false);
    } catch (saveError) {
      const message = String(saveError?.message || 'Nie udało się zapisać danych tabliczki.');
      if (/devices_serial_number_key|duplicate key/i.test(message)) {
        setError('Ten numer seryjny jest już zapisany przy innym urządzeniu. Sprawdź odczyt znak po znaku.');
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  const modelValue = buildDeviceModelValue(manufacturer, model);
  const progressValue = Math.max(0, Math.min(100, Number(progress.progress || 0)));
  const imageBoxStyle = { transform: `scale(${zoom})` };
  const cropOverlayStyle = {
    left: `${cropPercent.left}%`,
    top: `${cropPercent.top}%`,
    width: `${cropPercent.width}%`,
    height: `${cropPercent.height}%`,
  };

  return (
    <>
      <button
        type="button"
        className={`btn desktopNameplateOcrLaunch${compact ? ' compact' : ''}`}
        disabled={disabled}
        onClick={openAndPrepare}
        title={`Odczytaj dane ze zdjęcia ${target.unitLabel}`}
      >
        Odczytaj tabliczkę
      </button>

      <AppModal
        open={open}
        onClose={closeOcrModal}
        overlayClassName="desktopNameplateOcrOverlay polished"
        contentClassName="card modal desktopNameplateOcrModal desktopNameplateOcrWorkspaceModal polished"
        closeOnOverlay={!saving}
        closeOnEscape={!saving}
      >
        <button
          type="button"
          className="desktopNameplateOcrFloatingClose"
          disabled={saving}
          onClick={closeOcrModal}
          aria-label="Zamknij okno odczytu tabliczki"
          title="Zamknij"
        >
          ×
        </button>

        <div className="desktopNameplateOcrWorkspaceBody polished">
          <section className="desktopNameplateOcrPhotoWorkspace polished">
            <div className="desktopNameplateOcrToolbar polished">
              <div className="desktopNameplateOcrTargetPill">{target.unitLabel}</div>
              <button type="button" className="btn secondary" disabled={busy || saving} onClick={rotateWorkspace}>Obróć</button>
              <button type="button" className="btn secondary" disabled={busy || saving} onClick={() => setZoom((value) => Math.min(2.4, Number((value + 0.2).toFixed(2))))}>Powiększ</button>
              <button type="button" className="btn secondary" disabled={busy || saving || zoom <= 1} onClick={() => setZoom((value) => Math.max(1, Number((value - 0.2).toFixed(2))))}>Pomniejsz</button>
              <button type="button" className={`btn secondary${contrastEnabled ? ' active' : ''}`} disabled={busy || saving} onClick={() => setContrastEnabled((value) => !value)}>Popraw kontrast</button>
              <button type="button" className="btn secondary" disabled={busy || saving} onClick={resetWorkspace}>Reset</button>
              <button type="button" className="btn primary desktopNameplateOcrToolbarRead" disabled={busy || saving || sourceLoading || !sourceFile} onClick={runBarcodeScan}>{busy && readMode === 'barcode' ? 'Odczytywanie…' : 'Odczytaj kody'}</button>
              <button type="button" className="btn desktopNameplateAiButton" disabled={busy || saving || sourceLoading || !sourceFile} onClick={runAiRead}>{busy && readMode === 'ai' ? 'Analiza AI…' : 'Odczytaj przez AI'}</button>
              <div className="desktopNameplateOcrZoomReadout">{Math.round(zoom * 100)}%</div>
            </div>

            <div className={`desktopNameplateOcrPhotoStage polished${dragging ? ' dragging' : ''}`}>
              <div className="desktopNameplateOcrPhotoScroller polished">
                <div ref={imageBoxRef} className="desktopNameplateOcrImageBox polished" style={imageBoxStyle}>
                  {previewUrl ? (
                    <img className="desktopNameplateOcrWorkspaceImage" src={previewUrl} alt={`Tabliczka ${target.unitLabel}`} />
                  ) : (
                    <div className="desktopNameplateOcrPreviewFallback" role="status">
                      {sourceLoading ? 'Wczytywanie zdjęcia…' : 'Podgląd zdjęcia jest niedostępny. Zamknij okno i otwórz tabliczkę ponownie.'}
                    </div>
                  )}
                  <div
                    className="desktopNameplateOcrCropOverlay mouse"
                    style={cropOverlayStyle}
                    onPointerDown={(event) => startCropDrag('move', event)}
                    role="presentation"
                  >
                    <span className="desktopNameplateOcrCropLabel">Przesuń ramkę lub złap uchwyt</span>
                    {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        className={`desktopNameplateOcrCropHandle handle-${handle}`}
                        aria-label={`Uchwyt kadrowania ${handle}`}
                        onPointerDown={(event) => startCropDrag(handle, event)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="desktopNameplateOcrCropInstruction">
              <strong>Kadrowanie myszką</strong>
              <span>Przeciągnij niebieską ramkę, a jej narożniki lub boki złap myszką, aby objąć całą tabliczkę. Potem wybierz „Odczytaj kody” albo „Odczytaj przez AI”.</span>
            </div>

            {sourceLoading ? (
              <div className="desktopNameplateOcrProgress" aria-live="polite">
                <div className="desktopNameplateOcrProgressTrack"><span style={{ width: '35%' }} /></div>
                <strong>Wczytywanie zdjęcia tabliczki…</strong>
              </div>
            ) : null}

            {busy ? (
              <div className="desktopNameplateOcrProgress" aria-live="polite">
                <div className="desktopNameplateOcrProgressTrack"><span style={{ width: `${progressValue}%` }} /></div>
                <strong>{progress.label || 'Analiza…'} {progressValue}%</strong>
              </div>
            ) : null}
          </section>

          <section className="desktopNameplateOcrDataWorkspace polished">
            <div className="desktopNameplateOcrDataScroll">
            <div className="desktopNameplateOcrPanelTitle small">Dane tabliczki</div>
            <div className="desktopNameplateOcrNotice">
              „Odczytaj kody” czyta EAN-13 i Code 128, a następnie lokalnie sprawdza nadrukowany kod modelu Rotenso — bez użycia AI. „Odczytaj przez AI” pozostaje opcjonalną metodą dla innych lub nietypowych tabliczek. Każdy lokalnie odczytany model musi dokładnie pasować do słownika przed uzupełnieniem marki i mocy.
            </div>

            <div className="desktopNameplateCatalogTools">
              <input
                ref={catalogFileInputRef}
                type="file"
                accept=".csv,.xlsx"
                hidden
                onChange={handleCatalogFileChange}
              />
              <div className="desktopNameplateCatalogToolsHeader">
                <strong>Katalog EAN</strong>
                <span>Wbudowane: {BUILT_IN_ROTENSO_CATALOG.count} pozycji Rotenso · katalog wspólny po wdrożeniu SQL.</span>
              </div>
              <div className="desktopNameplateCatalogToolsActions">
                <button type="button" className="btn secondary" disabled={busy || saving || catalogBusy} onClick={() => catalogFileInputRef.current?.click()}>
                  {catalogBusy ? 'Przetwarzanie…' : 'Wybierz CSV/XLSX'}
                </button>
                <button type="button" className="btn secondary" disabled={busy || saving || catalogBusy} onClick={downloadNameplateCatalogCsvTemplate}>Pobierz wzór CSV</button>
                <button type="button" className="btn secondary" disabled={busy || saving || catalogBusy} onClick={downloadBuiltInRotensoCatalogCsv}>Pobierz katalog Rotenso</button>
                {catalogImportPreview?.validRows?.length ? (
                  <button type="button" className="btn primary" disabled={busy || saving || catalogBusy} onClick={confirmCatalogImport}>
                    Importuj {catalogImportPreview.validRows.length} pozycji
                  </button>
                ) : null}
                {catalogImportPreview ? (
                  <button type="button" className="btn secondary" disabled={catalogBusy} onClick={() => { setCatalogImportPreview(null); setCatalogMessage('Import anulowany.'); }}>Anuluj import</button>
                ) : null}
              </div>
              {catalogMessage ? <div className="desktopNameplateCatalogMessage">{catalogMessage}</div> : null}
              {catalogImportPreview?.invalidRows?.length ? (
                <div className="desktopNameplateCatalogInvalid">
                  Pierwszy błąd: wiersz {catalogImportPreview.invalidRows[0].rowNumber} — {catalogImportPreview.invalidRows[0].errors.join(', ')}.
                </div>
              ) : null}
            </div>

            {quality ? (
              <div className={`desktopNameplateOcrConfidence ${confidenceClass(quality.level)}`}>
                <strong>Ocena całego odczytu: {quality.label}</strong>
                <span>{quality.score}%</span>
                {quality.warning ? <p>{quality.warning}</p> : null}
              </div>
            ) : null}

            <label className={`field desktopNameplateOcrField ${confidenceClass(fieldQualities?.manufacturer?.level)}`}>
              <span className="desktopNameplateOcrFieldHeader"><b>Marka</b><FieldConfidenceBadge quality={fieldQualities?.manufacturer} /></span>
              <input className="input" value={manufacturer} onChange={(event) => updateField('manufacturer', event.target.value, setManufacturer)} placeholder="np. Rotenso" />
              {fieldQualities?.manufacturer?.warning ? <small>{fieldQualities.manufacturer.warning}</small> : null}
              <FieldSourceBadge source={fieldSources?.manufacturer} />
            </label>

            <label className={`field desktopNameplateOcrField ${confidenceClass(fieldQualities?.model?.level)}`}>
              <span className="desktopNameplateOcrFieldHeader"><b>Model</b><FieldConfidenceBadge quality={fieldQualities?.model} /></span>
              <input className="input" value={model} onChange={(event) => updateField('model', event.target.value, setModel)} placeholder="np. Teta 5,2 kW" />
              {modelValue ? <small>Zapis: {modelValue}</small> : null}
              {fieldQualities?.model?.warning ? <small>{fieldQualities.model.warning}</small> : null}
              <FieldSourceBadge source={fieldSources?.model} />
            </label>

            <label className={`field desktopNameplateOcrField ${confidenceClass(fieldQualities?.power?.level)}`}>
              <span className="desktopNameplateOcrFieldHeader"><b>Moc</b><FieldConfidenceBadge quality={fieldQualities?.power} /></span>
              <input className="input" value={power} onChange={(event) => updateField('power', event.target.value, setPower)} placeholder="np. 5,0 kW" />
              {fieldQualities?.power?.warning ? <small>{fieldQualities.power.warning}</small> : null}
              <FieldSourceBadge source={fieldSources?.power} />
            </label>

            <label className={`field desktopNameplateOcrField ${confidenceClass(fieldQualities?.serialNumber?.level)}`}>
              <span className="desktopNameplateOcrFieldHeader"><b>Numer seryjny</b><FieldConfidenceBadge quality={fieldQualities?.serialNumber} /></span>
              <input className="input desktopNameplateOcrSerial" value={serialNumber} onChange={(event) => updateField('serialNumber', event.target.value.toUpperCase(), setSerialNumber)} placeholder="Wpisz lub popraw numer" />
              {fieldQualities?.serialNumber?.warning ? <small>{fieldQualities.serialNumber.warning}</small> : null}
              <FieldSourceBadge source={fieldSources?.serialNumber} />
            </label>

            {barcodeInfo?.detections?.length ? (
              <div className="desktopNameplateBarcodeEvidence">
                <strong>Odczytane kody</strong>
                {barcodeInfo.detections.map((item, index) => (
                  <span key={`${item.value}-${index}`}><b>{item.format || 'kod'}:</b> {item.value}</span>
                ))}
              </div>
            ) : null}

            <label className="field desktopNameplateOcrField desktopNameplateOcrRawField">
              <span className="desktopNameplateOcrFieldHeader"><b>Surowy wynik / informacje z odczytu</b></span>
              <textarea className="input desktopNameplateOcrRawTextarea" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="Tutaj pojawią się odczytane kody albo informacje z analizy AI" rows={7} />
            </label>

            <div className="desktopNameplateOcrSaveOptions">
              <label><input type="checkbox" checked={saveModel} onChange={(event) => setSaveModel(event.target.checked)} /> Zapisz model dla {target.unitLabel}</label>
              <label><input type="checkbox" checked={saveSerial} onChange={(event) => setSaveSerial(event.target.checked)} /> Zapisz numer seryjny dla {target.unitLabel}</label>
            </div>

            {error ? <div className="desktopNameplateOcrError" role="alert">{error}</div> : null}
            </div>

            <div className="desktopNameplateOcrWorkspaceActions polished">
              <button type="button" className="btn secondary" disabled={busy || saving} onClick={runBarcodeScan}>{busy && readMode === 'barcode' ? 'Odczytywanie…' : 'Odczytaj kody'}</button>
              <button type="button" className="btn desktopNameplateAiButton" disabled={busy || saving} onClick={runAiRead}>{busy && readMode === 'ai' ? 'Analiza AI…' : 'Odczytaj przez AI'}</button>
              <button type="button" className="btn primary" disabled={busy || saving} onClick={saveResult}>{saving ? 'Zapisywanie…' : 'Zatwierdź i zapisz'}</button>
            </div>
          </section>
        </div>
      </AppModal>
    </>
  );
}
