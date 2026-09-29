import React, { useCallback, useEffect, useRef, useState } from "react";
import AppModal from "./AppModal.jsx";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SCALE_STEP = 0.5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPointerDistance(points) {
  if (!points || points.length < 2) return 0;
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
}

export default function PreviewModal({ previewImage, setPreviewImage, previewNext, previewPrev }) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointersRef = useRef(new Map());
  const pinchRef = useRef({ distance: 0, scale: MIN_SCALE });
  const panRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });
  const suppressNavigationRef = useRef(false);

  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    pinchRef.current = { distance: 0, scale: MIN_SCALE };
    suppressNavigationRef.current = false;
  }, []);

  useEffect(() => {
    resetZoom();
  }, [previewImage, resetZoom]);

  const setSafeScale = useCallback((nextScale) => {
    const value = clamp(Number(nextScale) || MIN_SCALE, MIN_SCALE, MAX_SCALE);
    setScale(value);
    if (value <= MIN_SCALE) setOffset({ x: 0, y: 0 });
  }, []);

  function beginPan(pointer) {
    panRef.current = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  }

  function handlePointerDown(event) {
    if (!previewImage) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Safari/PWA może odrzucić capture podczas bardzo szybkiego drugiego dotknięcia.
    }

    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);

    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      beginPan(point);
      return;
    }

    if (points.length === 2) {
      pinchRef.current = {
        distance: getPointerDistance(points),
        scale,
      };
      suppressNavigationRef.current = true;
    }
  }

  function handlePointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      event.preventDefault();
      const startDistance = pinchRef.current.distance || getPointerDistance(points);
      const currentDistance = getPointerDistance(points);
      if (!startDistance || !currentDistance) return;

      const nextScale = clamp(
        pinchRef.current.scale * (currentDistance / startDistance),
        MIN_SCALE,
        MAX_SCALE,
      );
      suppressNavigationRef.current = true;
      setScale(nextScale);
      if (nextScale <= MIN_SCALE) setOffset({ x: 0, y: 0 });
      return;
    }

    if (points.length === 1 && scale > MIN_SCALE) {
      event.preventDefault();
      const dx = event.clientX - panRef.current.pointerX;
      const dy = event.clientY - panRef.current.pointerY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) suppressNavigationRef.current = true;

      const rect = event.currentTarget.getBoundingClientRect();
      const maxX = Math.max(0, (rect.width * (scale - 1)) / 2);
      const maxY = Math.max(0, (rect.height * (scale - 1)) / 2);
      setOffset({
        x: clamp(panRef.current.offsetX + dx, -maxX, maxX),
        y: clamp(panRef.current.offsetY + dy, -maxY, maxY),
      });
    }
  }

  function handlePointerEnd(event) {
    pointersRef.current.delete(event.pointerId);
    const points = [...pointersRef.current.values()];

    if (points.length === 1) {
      beginPan(points[0]);
    } else if (points.length === 0) {
      pinchRef.current = { distance: 0, scale };
      window.setTimeout(() => {
        suppressNavigationRef.current = false;
      }, 180);
    }
  }

  function runNavigation(action) {
    if (scale > MIN_SCALE || suppressNavigationRef.current) return;
    action?.();
  }

  function handleDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    suppressNavigationRef.current = true;
    if (scale > MIN_SCALE) {
      resetZoom();
      return;
    }
    setSafeScale(DOUBLE_TAP_SCALE);
    window.setTimeout(() => {
      suppressNavigationRef.current = false;
    }, 180);
  }

  const zoomPercent = Math.round(scale * 100);
  const isZoomed = scale > MIN_SCALE + 0.01;

  return (
    <AppModal
      open={Boolean(previewImage)}
      onClose={() => setPreviewImage(null)}
      overlayClassName="previewOverlay"
      contentClassName="cleanPreviewModal previewModalSurface mobilePhotoPreviewModal"
      lockPagePosition
    >
      <div
        className={`previewImageWrap mobilePhotoZoomViewport${isZoomed ? " isZoomed" : ""}`}
        tabIndex="0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && !isZoomed) previewNext();
          if (e.key === "ArrowLeft" && !isZoomed) previewPrev();
          if (e.key === "Escape") setPreviewImage(null);
          if (e.key === "+" || e.key === "=") setSafeScale(scale + SCALE_STEP);
          if (e.key === "-") setSafeScale(scale - SCALE_STEP);
        }}
      >
        <div
          className="previewClickZone left"
          onClick={() => runNavigation(previewPrev)}
          aria-hidden="true"
        />
        {previewImage ? (
          <img
            src={previewImage}
            className="fullPreview mobilePhotoZoomImage"
            alt="Podgląd zdjęcia"
            draggable="false"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            }}
          />
        ) : null}
        <div
          className="previewClickZone right"
          onClick={() => runNavigation(previewNext)}
          aria-hidden="true"
        />

        <div
          className="mobilePhotoZoomControls"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="mobilePhotoZoomBtn"
            onClick={() => setSafeScale(scale - SCALE_STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label="Pomniejsz zdjęcie"
          >
            −
          </button>
          <button
            type="button"
            className="mobilePhotoZoomReadout"
            onClick={resetZoom}
            aria-label="Przywróć rozmiar 100 procent"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="mobilePhotoZoomBtn"
            onClick={() => setSafeScale(scale + SCALE_STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label="Powiększ zdjęcie"
          >
            +
          </button>
        </div>

        <div className="mobilePhotoZoomHint" aria-hidden="true">
          {isZoomed ? "Przeciągnij zdjęcie • uszczypnij, aby zmienić zoom" : "Uszczypnij lub stuknij 2×, aby powiększyć"}
        </div>
      </div>
    </AppModal>
  );
}
