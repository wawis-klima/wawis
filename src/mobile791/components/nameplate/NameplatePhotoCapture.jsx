import React, { useCallback, useEffect, useRef, useState } from "react";
import { analyzeNameplatePhotoQuality } from "../../modules/nameplate-quality.js";
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

export default function NameplatePhotoCapture({
  fieldLabel,
  file = null,
  existingPhotoUrl = "",
  onSelect,
  onRemove,
  compact = false,
}) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cropSourceUrlRef = useRef("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [cropSource, setCropSource] = useState(null);

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

  function handleCropConfirm(croppedFile) {
    clearCropSource();
    onSelect?.(croppedFile);
  }

  function handleRetake() {
    const sourceKind = cropSource?.sourceKind || "camera";
    const input = sourceKind === "gallery" ? galleryInputRef.current : cameraInputRef.current;
    clearCropSource();
    // Kliknięcie pozostaje bezpośrednio w geście użytkownika, co jest ważne dla Safari na iPhonie.
    input?.click();
  }

  const previewUrl = localPreviewUrl || existingPhotoUrl;
  const hasPhoto = Boolean(file || existingPhotoUrl);
  const statusLabel = compact
    ? (file ? "Nowe zdjęcie" : existingPhotoUrl ? "Zapisana" : "Brak")
    : (file ? "Nowe zdjęcie" : existingPhotoUrl ? "Zdjęcie zapisane" : "Brak zdjęcia");

  return (
    <>
      <div className={`nameplateCapture${hasPhoto ? " hasPhoto" : ""}${compact ? " compact" : ""}`}>
        <button
          type="button"
          className="nameplateCaptureSummary"
          onClick={() => (previewUrl ? setShowPreview((current) => !current) : cameraInputRef.current?.click())}
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

      {cropSource ? (
        <CropEditor
          source={cropSource}
          fieldLabel={fieldLabel}
          onCancel={clearCropSource}
          onRetake={handleRetake}
          onConfirm={handleCropConfirm}
        />
      ) : null}
    </>
  );
}
