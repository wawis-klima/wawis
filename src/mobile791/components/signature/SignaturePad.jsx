import React, { useEffect, useRef } from 'react';

// WAWIS 14.33 — pole podpisu palcem (wspólne). Styl (.leakSignPad, .leakSignCanvas) ładuje src/main.jsx
// (leak-test-sign.css) — CSS importowany w komponentach telefonu nie dociera po buildzie (14.30).

export function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d3a8a';
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event) {
    event.preventDefault();
    try { canvasRef.current.setPointerCapture?.(event.pointerId); } catch { /* syntetyczne zdarzenie — bez przechwycenia */ }
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = point(event);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
  }
  function move(event) {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(event);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    if (!hasInk.current) { hasInk.current = true; onChange?.(true); }
  }
  function end() { drawing.current = false; }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false; onChange?.(false);
  }

  return (
    <div className="leakSignPad">
      <canvas ref={canvasRef} className="leakSignCanvas" data-testid="leak-sign-canvas" aria-label="Pole podpisu"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} />
      <button type="button" className="btn leakSignClear" onClick={clear}>Wyczyść</button>
    </div>
  );
}

export function exportSignaturePng(root) {
  const canvas = root?.querySelector('canvas.leakSignCanvas');
  return canvas ? canvas.toDataURL('image/png') : null;
}

