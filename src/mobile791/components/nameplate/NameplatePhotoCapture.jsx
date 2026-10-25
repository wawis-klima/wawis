import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { analyzeNameplatePhotoQuality } from "../../modules/nameplate-quality.js";
import { readMobileNameplate } from "../../modules/nameplate-reader.js";
import { requiresNameplateSerialReview } from "../../modules/nameplate-serial-verification.js";
import { supabase } from "../../lib/supabase.js";
import "./nameplate-photo-capture.css";

const MIN_CROP_SIZE = 0.12;
const MAX_CROP_OUTPUT_PX = 2200;
const CROP_JPEG_QUALITY = 0.9;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInitialCrop(width, height) {
  const isLandscape = Number(width || 0) >= Number(height || 0);
  return isLandscape
    ? { x: 0.04, y: 0.16, width: 0.92, height: 0.68 }
    : { x: 0.06, y: 0.22, width: 0.88, height: 0.56 };
}

function getCroppedFileName(fileName = "tabliczka.jpg") {
  const baseName = String(fileName || "tabliczka").replace(/\.[^.]+$/, "") || "tabliczka";
  return `${baseName}-wykadrowane.jpg`;
}

async function createCroppedFile({ file, image, crop }) {
  const sourceWidth = Number(image?.naturalWidth || image?.width || 0);
  const sourceHeight = Number(image?.naturalHeight || image?.height || 0);
  if (!sourceWidth || !sourceHeight) throw new Error("Nie udało się odczytać rozmiaru zdjęcia.");

  const sourceX = Math.round(crop.x * sourceWidth);
  const sourceY = Math.round(crop.y * sourceHeight);
  const sourceCropWidth = Math.max(1, Math.round(crop.width * sourceWidth));
  const sourceCropHeight = Math.max(1, Math.round(crop.height * sourceHeight));
  const scale = Math.min(1, MAX_CROP_OUTPUT_PX / Math.max(sourceCropWidth, sourceCropHeight));
  const outputWidth = Math.max(1, Math.round(sourceCropWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceCropHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Telefon nie udostępnił modułu kadrowania zdjęcia.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceCropWidth,
    sourceCropHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Nie udało się zapisać wykadrowanego zdjęcia."))),
      "image/jpeg",
      CROP_JPEG_QUALITY,
    );
  });
  // Zwolnij bufor obrazu od razu po utworzeniu pliku. Na iOS Safari kilka
  // dużych canvasów pozostawionych do GC potrafi ubić całą kartę podczas OCR.
  canvas.width = 1;
  canvas.height = 1;

  return new File([blob], getCroppedFileName(file?.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 5.5 10 3h4l1.5 2.5H19A2.5 2.5 0 0 1 21.5 8v9A2.5 2.5 0 0 1 19 19.5H5A2.5 2.5 0 0 1 2.5 17V8A2.5 2.5 0 0 1 5 5.5h3.5Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4.5 18 5-5 3.5 3 2.5-2.5 4 4.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function CropEditor({ source, fieldLabel, onCancel, onRetake, onConfirm }) {
  const imageWrapRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [crop, setCrop] = useState(() => getInitialCrop(source.width, source.height));
  const [displayRect, setDisplayRect] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qualityResult, setQualityResult] = useState(null);
  const [qualityFile, setQualityFile] = useState(null);

  const updateDisplayRect = useCallback(() => {
    const wrap = imageWrapRef.current;
    const image = imageRef.current;
    if (!wrap || !image) return;
    const wrapBounds = wrap.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    if (!wrapBounds.width || !wrapBounds.height || !imageBounds.width || !imageBounds.height) return;
    setDisplayRect({
      left: imageBounds.left - wrapBounds.left,
      top: imageBounds.top - wrapBounds.top,
      width: imageBounds.width,
      height: imageBounds.height,
    });
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    updateDisplayRect();
    const image = imageRef.current;
    const wrap = imageWrapRef.current;
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(updateDisplayRect)
      : null;
    if (image) resizeObserver?.observe(image);
    if (wrap) resizeObserver?.observe(wrap);
    window.addEventListener("resize", updateDisplayRect);
    window.addEventListener("orientationchange", updateDisplayRect);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateDisplayRect);
      window.removeEventListener("orientationchange", updateDisplayRect);
    };
  }, [source.url, updateDisplayRect]);

  useEffect(() => {
    function onPointerMove(event) {
      const drag = dragRef.current;
      const image = imageRef.current;
      if (!drag || !image) return;
      event.preventDefault();

      const bounds = image.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dx = (event.clientX - drag.pointerX) / bounds.width;
      const dy = (event.clientY - drag.pointerY) / bounds.height;
      const start = drag.crop;
      let next = { ...start };

      if (drag.mode === "move") {
        next.x = clamp(start.x + dx, 0, 1 - start.width);
        next.y = clamp(start.y + dy, 0, 1 - start.height);
      } else {
        let left = start.x;
        let top = start.y;
        let right = start.x + start.width;
        let bottom = start.y + start.height;

        if (drag.mode.includes("w")) left = clamp(start.x + dx, 0, right - MIN_CROP_SIZE);
        if (drag.mode.includes("e")) right = clamp(start.x + start.width + dx, left + MIN_CROP_SIZE, 1);
        if (drag.mode.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN_CROP_SIZE);
        if (drag.mode.includes("s")) bottom = clamp(start.y + start.height + dy, top + MIN_CROP_SIZE, 1);

        next = { x: left, y: top, width: right - left, height: bottom - top };
      }
      setCrop(next);
      setQualityResult(null);
      setQualityFile(null);
    }

    function onPointerUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  function beginDrag(event, mode) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      crop,
    };
  }

  async function saveCrop() {
    if (saving || !imageRef.current) return;
    setSaving(true);
    setError("");
    setQualityResult(null);
    setQualityFile(null);
    try {
      const croppedFile = await createCroppedFile({ file: source.file, image: imageRef.current, crop });
      const sourceWidth = Number(imageRef.current.naturalWidth || imageRef.current.width || 0);
      const sourceHeight = Number(imageRef.current.naturalHeight || imageRef.current.height || 0);
      const quality = await analyzeNameplatePhotoQuality(croppedFile, {
        cropAreaRatio: crop.width * crop.height,
        sourceCropWidth: Math.round(crop.width * sourceWidth),
        sourceCropHeight: Math.round(crop.height * sourceHeight),
      });
      if (quality.ok) {
        onConfirm(croppedFile);
        return;
      }
      setQualityFile(croppedFile);
      setQualityResult(quality);
      setSaving(false);
    } catch (cropError) {
      setError(cropError?.message || "Nie udało się wykadrować zdjęcia.");
      setSaving(false);
    }
  }

  function confirmDespiteWarning() {
    if (!qualityFile) return;
    onConfirm(qualityFile);
  }

  function returnToCrop() {
    setQualityResult(null);
    setQualityFile(null);
    setSaving(false);
  }

  return (
    <div className="nameplateCropModal" role="dialog" aria-modal="true" aria-label={`Kadrowanie tabliczki: ${fieldLabel}`}>
      <div className="nameplateCropHeader">
        <div>
          <strong>Dopasuj kadr</strong>
          <span>{fieldLabel}</span>
        </div>
        <button type="button" className="nameplateCropClose" onClick={onCancel} aria-label="Anuluj kadrowanie"><CloseIcon /></button>
      </div>

      <div className="nameplateCropHelp">Przesuń ramkę i przeciągnij narożniki tak, aby została tylko tabliczka.</div>

      <div className="nameplateCropStage">
        <div ref={imageWrapRef} className="nameplateCropImageWrap">
          <img
            ref={imageRef}
            src={source.url}
            alt="Zdjęcie przygotowane do kadrowania"
            draggable="false"
            onLoad={updateDisplayRect}
          />
          <div
            className="nameplateCropBox"
            style={{
              left: `${(displayRect?.left || 0) + crop.x * (displayRect?.width || 0)}px`,
              top: `${(displayRect?.top || 0) + crop.y * (displayRect?.height || 0)}px`,
              width: `${crop.width * (displayRect?.width || 0)}px`,
              height: `${crop.height * (displayRect?.height || 0)}px`,
              visibility: displayRect ? "visible" : "hidden",
            }}
            onPointerDown={(event) => beginDrag(event, "move")}
          >
            <span className="nameplateCropGrid horizontal one" />
            <span className="nameplateCropGrid horizontal two" />
            <span className="nameplateCropGrid vertical one" />
            <span className="nameplateCropGrid vertical two" />
            {[
              ["nw", "topLeft"],
              ["ne", "topRight"],
              ["sw", "bottomLeft"],
              ["se", "bottomRight"],
            ].map(([mode, className]) => (
              <button
                key={mode}
                type="button"
                className={`nameplateCropHandle ${className}`}
                onPointerDown={(event) => beginDrag(event, mode)}
                aria-label={`Zmień kadr: ${mode}`}
              />
            ))}
          </div>
        </div>
      </div>

      {qualityResult?.warnings?.length ? (
        <div className="nameplateQualityWarning" role="alert">
          <div className="nameplateQualityWarningTitle">Sprawdź jakość tabliczki</div>
          <ul>
            {qualityResult.warnings.map((warning) => <li key={warning.code}>{warning.label}</li>)}
          </ul>
          <button type="button" className="nameplateQualityAdjustBtn" onClick={returnToCrop}>Popraw kadr</button>
        </div>
      ) : null}
      {error ? <div className="nameplateCropError">{error}</div> : null}

      <div className={`nameplateCropFooter${qualityResult ? " qualityReview" : ""}`}>
        <button type="button" className="btn secondary" disabled={saving} onClick={onRetake}>Ponów zdjęcie</button>
        {qualityResult ? (
          <button type="button" className="btn primary" disabled={!qualityFile} onClick={confirmDespiteWarning}>Zapisz mimo to</button>
        ) : (
          <button type="button" className="btn primary" disabled={saving} onClick={saveCrop}>{saving ? "Sprawdzam…" : "Zapisz kadr"}</button>
        )}
      </div>
    </div>
  );
}


function NameplateVerificationReview({
  verification,
  fieldLabel,
  onModelChange,
  onSerialChange,
  onSerialReviewedChange,
  onConfirm,
  onRetake,
  onManual,
  onCancel,
  compatibilityError = "",
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!verification?.file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(verification.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [verification?.file]);

  if (!verification) return null;

  const progressValue = Math.max(0, Math.min(100, Number(verification.progress?.progress || 0)));
  // The OCR/image mismatch is a hard error. A warning about different Single
  // model families is advisory: the installer can confirm the actual nameplate.
  const readingMismatch = verification.reading?.mismatch?.message || "";
  const compatibilityWarning = compatibilityError || "";
  const noNameplateEvidence = Boolean(verification.reading?.noNameplateEvidence);
  const modelReady = Boolean(String(verification.modelValue || "").trim());
  const serialReady = Boolean(String(verification.serialNumber || "").trim());
  const serialCheck = verification.reading?.serialCheck || null;
  const needsSerialReview = requiresNameplateSerialReview(verification);
  const canConfirm = !verification.busy && !readingMismatch && !noNameplateEvidence
    && modelReady && serialReady && (!needsSerialReview || verification.serialReviewed);
  const offlineReading = Boolean(verification.reading?.aiUnavailable && verification.reading?.offline);
  const methodLabel = noNameplateEvidence
    ? (verification.reading?.aiAttempted ? "AI nie potwierdziła tabliczki" : "Nie wykryto tabliczki")
    : offlineReading && verification.reading?.method !== "manual"
      ? "Odczyt lokalny — bez internetu"
      : verification.reading?.method === "ai"
      ? "Odczyt lokalny + AI"
      : verification.reading?.method === "manual"
        ? "Weryfikacja ręczna"
        : verification.reading
          ? "Odczyt lokalny"
          : "Weryfikacja ręczna";

  const normalizedFieldLabel = String(fieldLabel || "").toLowerCase();
  const isOutdoorUnit = normalizedFieldLabel.includes("zewnętrzn") || /\bjz\b/i.test(String(fieldLabel || ""));
  const isIndoorUnit = normalizedFieldLabel.includes("wewnętrzn") || /\bjw\b/i.test(String(fieldLabel || ""));
  const targetLabel = isOutdoorUnit
    ? "Zdjęcie tabliczki JZ — jednostka zewnętrzna"
    : isIndoorUnit
      ? "Zdjęcie tabliczki JW — jednostka wewnętrzna"
      : `Zdjęcie tabliczki — ${fieldLabel}`;

  return (
    <div className="nameplateVerifyModal" role="dialog" aria-modal="true" aria-label={`Potwierdzenie tabliczki: ${fieldLabel}`}>
      <div className="nameplateVerifyHeader">
        <div>
          <strong>Sprawdź tabliczkę</strong>
          <span className="nameplateVerifyTarget">{targetLabel}</span>
        </div>
        {!verification.busy ? (
          <button type="button" className="nameplateCropClose" onClick={onCancel} aria-label="Anuluj potwierdzanie"><CloseIcon /></button>
        ) : null}
      </div>

      <div className="nameplateVerifyBody">
        {previewUrl ? <img className="nameplateVerifyImage" src={previewUrl} alt={`Tabliczka do potwierdzenia: ${fieldLabel}`} /> : null}

        {verification.busy ? (
          <div className="nameplateVerifyProgress" aria-live="polite">
            <div className="nameplateVerifyProgressTrack"><span style={{ width: `${progressValue}%` }} /></div>
            <strong>{verification.progress?.label || "Odczytuję tabliczkę…"}</strong>
            <small>{verification.progress?.method === "ai" ? "Lokalny odczyt był niepełny — sprawdzam przez AI." : "Najpierw używam lokalnego, darmowego czytnika."}</small>
          </div>
        ) : (
          <>
            <div className="nameplateVerifyMethod">{methodLabel}</div>
            {noNameplateEvidence ? (
              <div className="nameplateVerifyMismatch" role="alert">
                {verification.reading?.aiAttempted
                  ? "AI sprawdziła zdjęcie, ale nie potwierdziła dokładnego modelu urządzenia i numeru seryjnego. Zrób zdjęcie tabliczki ponownie."
                  : "Nie wykryto tabliczki znamionowej ani żadnych jej charakterystycznych danych. AI nie zostało uruchomione. Zrób zdjęcie tabliczki ponownie."}
              </div>
            ) : null}
            {verification.reading?.aiAttempted && verification.reading?.aiError ? (
              <div className="nameplateVerifyWarning">AI nie uzupełniła wyniku: {verification.reading.aiError}. Sprawdź dane ręcznie.</div>
            ) : null}
            {offlineReading && verification.reading?.method !== "manual" ? (
              <div className="nameplateVerifyWarning" role="status" data-testid="nameplate-offline-reader">
                <strong>Brak internetu — AI nie sprawdziła tabliczki.</strong>{" "}
                {verification.prefilledFromReader || verification.serialNumber || verification.modelValue
                  ? "Wpisano to, co odczytał czytnik telefonu. Porównaj z tabliczką znak po znaku i popraw, jeśli trzeba."
                  : "Czytnik telefonu nie odczytał danych — przepisz model i numer seryjny z tabliczki."}
                {verification.reading?.weakNameplateEvidence ? " Czytnik nie jest pewny, że to tabliczka znamionowa — sprawdź zdjęcie." : ""}
              </div>
            ) : verification.prefilledFromReader && verification.reading?.method !== "manual" ? (
              <div className="nameplateVerifyWarning" role="status" data-testid="nameplate-offline-reader">
                AI niedostępna — wpisano odczyt czytnika telefonu. Porównaj z tabliczką znak po znaku.
              </div>
            ) : null}
            {readingMismatch ? <div className="nameplateVerifyMismatch" role="alert">{readingMismatch}</div> : null}
            {serialCheck?.status === "ai_resolved" ? (
              <div className="nameplateVerifyReady" role="status">
                <strong>AI rozstrzygnęła odczyt numeru SN.</strong>
                <div>Numer: <code>{serialCheck.serialNumber}</code></div>
                AI niezależnie odczytała nadruk i potwierdziła jeden z lokalnych wyników.
                {serialCheck.barcodeSerial && serialCheck.ocrSerial && serialCheck.barcodeSerial !== serialCheck.ocrSerial
                  ? " Drugi odczyt lokalny był niezgodny." : ""}
              </div>
            ) : serialCheck?.status === "conflict" ? (
              <div className="nameplateVerifyMismatch" role="alert">
                <strong>{verification.reading?.aiUnavailable && !verification.reading?.aiResult
                  ? "Niezgodny numer seryjny — bez AI nie da się rozstrzygnąć"
                  : "Niezgodny numer seryjny — AI nie rozstrzygnęła odczytu"}</strong>
                {serialCheck.barcodeSerial ? <div>Kod kreskowy: <code>{serialCheck.barcodeSerial}</code></div> : null}
                {serialCheck.ocrSerial ? <div>OCR nadruku SN: <code>{serialCheck.ocrSerial}</code></div> : null}
                {serialCheck.aiSerial ? <div>Odczyt AI: <code>{serialCheck.aiSerial}</code></div> : null}
                {verification.prefilledSerialSource === "barcode"
                  ? "W polu wpisano numer z kodu kreskowego. Porównaj go z nadrukiem SN na zdjęciu i popraw, jeśli trzeba."
                  : verification.prefilledSerialSource === "ocr"
                    ? "W polu wpisano numer z nadruku SN. Porównaj go z tabliczką i popraw, jeśli trzeba."
                    : "Sprawdź nadruk SN na zdjęciu, wpisz właściwy numer i potwierdź ręcznie."}
              </div>
            ) : needsSerialReview ? (
              <div className="nameplateVerifyWarning" role="status">
                {verification.reading?.aiUnavailable && !verification.reading?.aiResult
                  ? "Numer nie został potwierdzony dwoma czytnikami."
                  : "AI nie potwierdziła numeru z wystarczającą pewnością."}
                {" "}Sprawdź go znak po znaku z nadrukiem SN na zdjęciu.
              </div>
            ) : (
              <div className="nameplateVerifyReady" role="status">
                Numer seryjny potwierdzony: Code 128 i nadruk SN dały ten sam wynik.
              </div>
            )}
            {compatibilityWarning ? (
              <div className="nameplateVerifyWarning" role="alert">
                {compatibilityWarning} Możesz zapisać faktyczny zestaw po sprawdzeniu danych z obu tabliczek.
                Zgodność techniczną jednostek trzeba potwierdzić osobno.
              </div>
            ) : null}
          </>
        )}

        <label className="nameplateVerifyField">
          <span>Model</span>
          <input
            className="input"
            value={verification.modelValue}
            onChange={(event) => onModelChange(event.target.value)}
            placeholder="Przepisz model z tabliczki"
            autoComplete="off"
            disabled={noNameplateEvidence}
          />
        </label>
        <label className="nameplateVerifyField">
          <span>Numer seryjny</span>
          <input
            className="input"
            value={verification.serialNumber}
            onChange={(event) => onSerialChange(event.target.value.toUpperCase())}
            placeholder="Przepisz numer seryjny"
            autoComplete="off"
            disabled={noNameplateEvidence}
          />
        </label>
        {!verification.busy && !noNameplateEvidence && needsSerialReview ? (
          <label className="nameplateSerialReviewCheck">
            <input
              type="checkbox"
              checked={Boolean(verification.serialReviewed)}
              onChange={(event) => onSerialReviewedChange(event.target.checked)}
            />
            <span>Sprawdziłem numer SN znak po znaku z nadrukiem na zdjęciu.</span>
          </label>
        ) : null}
        {!verification.busy ? (
          noNameplateEvidence ? (
            <div className="nameplateVerifyHint">To zdjęcie nie może zostać zaakceptowane jako tabliczka. Zrób nowe zdjęcie urządzenia z widoczną tabliczką znamionową.</div>
          ) : !modelReady || !serialReady ? (
            <div className="nameplateVerifyHint">Przed potwierdzeniem uzupełnij model i numer seryjny dokładnie tak, jak na zdjęciu.</div>
          ) : (
            <div className="nameplateVerifyReady">Porównaj dane ze zdjęciem i potwierdź.</div>
          )
        ) : (
          <div className="nameplateVerifyHint">Możesz od razu poprawić model lub numer seryjny — ręczna edycja zatrzyma automatyczny odczyt.</div>
        )}
      </div>

      <div className="nameplateVerifyFooter">
        <button
          type="button"
          className="btn secondary nameplateVerifyManualBtn"
          onClick={noNameplateEvidence ? onRetake : (verification.busy || !modelReady || !serialReady ? onManual : onRetake)}
        >
          {noNameplateEvidence ? "Zrób zdjęcie ponownie" : (verification.busy || !modelReady || !serialReady ? "Wpisz ręcznie" : "Zrób zdjęcie ponownie")}
        </button>
        <button type="button" className="btn primary" disabled={!canConfirm} onClick={onConfirm}>
          {compatibilityWarning && !readingMismatch ? "Potwierdź mimo ostrzeżenia" : "Potwierdź"}
        </button>
      </div>
    </div>
  );
}

export default function NameplatePhotoCapture({
  fieldLabel,
  file = null,
  existingPhotoUrl = "",
  existingPhotoPresent = false,
  onSelect,
  onRemove,
  compact = false,
  jobId = "",
  unitRef = "",
  currentModel = "",
  currentSerial = "",
  verified = false,
  validateModel = null,
}) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cropSourceUrlRef = useRef("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [verification, setVerification] = useState(null);

  useEffect(() => {
    if (!file) {
      setLocalPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => {
    setShowPreview(false);
  }, [file, existingPhotoUrl]);

  useEffect(() => () => {
    if (cropSourceUrlRef.current) URL.revokeObjectURL(cropSourceUrlRef.current);
  }, []);

  function clearCropSource() {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = "";
    }
    setCropSource(null);
  }

  function openCropEditor(selectedFile, sourceKind) {
    if (!selectedFile) return;
    clearCropSource();
    const url = URL.createObjectURL(selectedFile);
    cropSourceUrlRef.current = url;
    const image = new Image();
    image.onload = () => {
      setCropSource({
        file: selectedFile,
        sourceKind,
        url,
        width: Number(image.naturalWidth || image.width || 0),
        height: Number(image.naturalHeight || image.height || 0),
      });
    };
    image.onerror = () => {
      clearCropSource();
      window.alert("Nie udało się otworzyć zdjęcia do kadrowania. Zrób zdjęcie ponownie.");
    };
    image.src = url;
  }

  function handleFile(event, sourceKind) {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (selectedFile) openCropEditor(selectedFile, sourceKind);
  }

  async function handleCropConfirm(croppedFile) {
    clearCropSource();
    const initialVerification = {
      file: croppedFile,
      busy: true,
      progress: { progress: 2, label: "Przygotowuję odczyt…", method: "local" },
      reading: null,
      modelValue: "",
      serialNumber: "",
      serialReviewed: false,
      serialManuallyChanged: false,
    };
    setVerification(initialVerification);

    try {
      const reading = await readMobileNameplate({
        file: croppedFile,
        supabase,
        jobId,
        targetUnit: unitRef,
        onProgress: (progress) => {
          setVerification((current) => current?.file === croppedFile && !current.manualOverride ? { ...current, progress } : current);
        },
      });
      setVerification((current) => {
        if (current?.file !== croppedFile || current.manualOverride) return current;
        // Do not prefill either competing serial as if it were correct — unless AI is
        // unavailable (13.69): then the local reader's candidate is shown for mandatory review.
        const baseSerial = reading.serialCheck?.status === 'conflict'
          ? '' : String(reading.serialNumber || current.serialNumber || "").trim().toUpperCase();
        const baseModel = String(reading.modelValue || current.modelValue || "").trim();
        const candidates = reading.aiUnavailable ? (reading.localCandidates || {}) : {};
        const serialFromCandidate = !baseSerial && candidates.serialNumber ? String(candidates.serialNumber).toUpperCase() : "";
        const modelFromCandidate = !baseModel && candidates.modelValue ? String(candidates.modelValue).trim() : "";
        return {
          ...current,
          busy: false,
          progress: { progress: 100, label: "Odczyt zakończony", method: reading.method || "local" },
          reading,
          modelValue: baseModel || modelFromCandidate,
          serialNumber: baseSerial || serialFromCandidate,
          prefilledFromReader: Boolean(serialFromCandidate || modelFromCandidate),
          prefilledSerialSource: serialFromCandidate ? (candidates.serialSource || "") : "",
          serialReviewed: false,
          serialManuallyChanged: false,
        };
      });
    } catch (readError) {
      setVerification((current) => current?.file === croppedFile && !current.manualOverride ? {
        ...current,
        busy: false,
        reading: {
          method: "manual",
          aiAttempted: false,
          aiError: readError?.message || "Automatyczny odczyt nie zwrócił wyniku.",
          mismatch: null,
        },
      } : current);
    }
  }

  function switchVerificationToManual() {
    setVerification((current) => current ? {
      ...current,
      busy: false,
      manualOverride: true,
      serialManuallyChanged: true,
      serialReviewed: false,
      progress: { progress: 0, label: "Weryfikacja ręczna", method: "manual" },
      reading: {
        ...current.reading,
        method: "manual",
        aiAttempted: false,
        aiError: "",
        mismatch: null,
      },
    } : current);
  }

  function confirmVerification() {
    if (!verification?.file || verification.busy || verification.reading?.mismatch || verification.reading?.noNameplateEvidence
      || (requiresNameplateSerialReview(verification) && !verification.serialReviewed)) return;
    const modelValue = String(verification.modelValue || "").replace(/\s+/g, " ").trim();
    const serialNumber = String(verification.serialNumber || "").replace(/\s+/g, "").trim().toUpperCase();
    if (!modelValue || !serialNumber) return;
    const checkedAt = new Date().toISOString();
    onSelect?.(verification.file, {
      verified: true,
      modelValue,
      serialNumber,
      verificationMethod: verification.reading?.method || "manual",
      ocrStatus: "approved",
      ocrCheckedAt: checkedAt,
    });
    setVerification(null);
  }

  function retakeVerificationPhoto() {
    setVerification(null);
    cameraInputRef.current?.click();
  }

  function handleRetake() {
    const sourceKind = cropSource?.sourceKind || "camera";
    const input = sourceKind === "gallery" ? galleryInputRef.current : cameraInputRef.current;
    clearCropSource();
    // Kliknięcie pozostaje bezpośrednio w geście użytkownika, co jest ważne dla Safari na iPhonie.
    input?.click();
  }

  const compatibilityError = verification && !verification.busy && typeof validateModel === "function"
    ? String(validateModel({
      modelValue: String(verification.modelValue || "").trim(),
      reading: verification.reading || null,
      unitRef,
    }) || "")
    : "";

  const previewUrl = localPreviewUrl || existingPhotoUrl;
  const hasPhoto = Boolean(file || existingPhotoPresent || existingPhotoUrl);
  const statusLabel = compact
    ? (verified ? "Potwierdzona" : file ? "Nowe zdjęcie" : hasPhoto ? "Zapisana" : "Brak")
    : (verified ? "Tabliczka potwierdzona" : file ? "Nowe zdjęcie" : hasPhoto ? "Zdjęcie zapisane" : "Brak zdjęcia");

  return (
    <>
      <div className={`nameplateCapture${hasPhoto ? " hasPhoto" : ""}${compact ? " compact" : ""}`}>
        <button
          type="button"
          className="nameplateCaptureSummary"
          onClick={() => (previewUrl ? setShowPreview((current) => !current) : !hasPhoto ? cameraInputRef.current?.click() : null)}
          aria-expanded={showPreview}
        >
          <span className="nameplateCaptureSummaryText">
            <strong>Tabliczka znamionowa</strong>
            <span>{fieldLabel}</span>
          </span>
          <span className={`nameplateCaptureStatus${hasPhoto ? " ready" : " missing"}`}>{statusLabel}</span>
        </button>

        {showPreview && previewUrl ? (
          <div className="nameplateCapturePreview">
            <img src={previewUrl} alt={`Podgląd tabliczki: ${fieldLabel}`} />
          </div>
        ) : null}

        <div className="nameplateCaptureActions">
          <button type="button" className="btn nameplateCaptureBtn nameplateCaptureCameraBtn" onClick={() => cameraInputRef.current?.click()}>
            <CameraIcon />
            <span>{hasPhoto ? "Zrób nowe" : "Zrób zdjęcie"}</span>
          </button>
          <button type="button" className="btn secondary nameplateCaptureBtn nameplateCaptureGalleryBtn" onClick={() => galleryInputRef.current?.click()}>
            <GalleryIcon />
            <span>Galeria</span>
          </button>
          {!compact && previewUrl ? (
            <button type="button" className="btn secondary nameplateCaptureBtn" onClick={() => setShowPreview((current) => !current)}>
              {showPreview ? "Ukryj zdjęcie" : "Pokaż zdjęcie"}
            </button>
          ) : null}
          {file ? (
            <button type="button" className="fieldClearBtn nameplateCaptureRemoveBtn" onClick={() => onRemove?.()}>
              Usuń nowe zdjęcie
            </button>
          ) : null}
        </div>

        <input
          ref={cameraInputRef}
          className="nameplateCameraInput"
          hidden
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFile(event, "camera")}
          tabIndex="-1"
          aria-label={`Zrób zdjęcie tabliczki: ${fieldLabel}`}
        />
        <input
          ref={galleryInputRef}
          className="nameplateGalleryInput"
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => handleFile(event, "gallery")}
          tabIndex="-1"
          aria-label={`Wybierz zdjęcie tabliczki z galerii: ${fieldLabel}`}
        />
      </div>

      {verification && typeof document !== "undefined" ? createPortal(
        <NameplateVerificationReview
          verification={verification}
          fieldLabel={fieldLabel}
          onModelChange={(modelValue) => setVerification((current) => current ? {
            ...current,
            modelValue,
            busy: false,
            manualOverride: true,
            progress: { progress: 0, label: "Weryfikacja ręczna", method: "manual" },
            reading: { ...current.reading, method: "manual", aiAttempted: false, aiError: "", mismatch: null },
          } : current)}
          onSerialChange={(serialNumber) => setVerification((current) => current ? {
            ...current,
            serialNumber,
            busy: false,
            manualOverride: true,
            serialManuallyChanged: true,
            serialReviewed: false,
            progress: { progress: 0, label: "Weryfikacja ręczna", method: "manual" },
            reading: { ...current.reading, method: "manual", aiAttempted: false, aiError: "", mismatch: null },
          } : current)}
          onSerialReviewedChange={(serialReviewed) => setVerification((current) => current ? {
            ...current,
            serialReviewed: Boolean(serialReviewed),
          } : current)}
          onConfirm={confirmVerification}
          onRetake={retakeVerificationPhoto}
          onManual={switchVerificationToManual}
          onCancel={() => setVerification(null)}
          compatibilityError={compatibilityError}
        />,
        document.body,
      ) : null}

      {cropSource && typeof document !== "undefined" ? createPortal(
        <CropEditor
          source={cropSource}
          fieldLabel={fieldLabel}
          onCancel={clearCropSource}
          onRetake={handleRetake}
          onConfirm={handleCropConfirm}
        />,
        document.body,
      ) : null}
    </>
  );
}
