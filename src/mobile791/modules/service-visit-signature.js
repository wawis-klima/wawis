export function getSignatureInkBounds(pixels, width, height) {
  if (!pixels || width <= 0 || height <= 0) return null;
  let left = width, top = height, right = -1, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (pixels[offset + 3] < 64 || (pixels[offset] >= 245 && pixels[offset + 1] >= 245 && pixels[offset + 2] >= 245)) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
  }
  return count >= 20 && right - left >= 8 && bottom - top >= 4 ? { left, top, right, bottom } : null;
}

export function captureServiceSignature(canvas) {
  if (!canvas || !canvas.width || !canvas.height) throw new Error('Brak pola podpisu.');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Nie można odczytać podpisu.');
  const { width, height } = canvas;
  const bounds = getSignatureInkBounds(context.getImageData(0, 0, width, height).data, width, height);
  if (!bounds) throw new Error('Podpis nie jest widoczny. Podpisz się ponownie.');
  const pad = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  const x = Math.max(0, bounds.left - pad), y = Math.max(0, bounds.top - pad);
  const w = Math.min(width, bounds.right + pad + 1) - x;
  const h = Math.min(height, bounds.bottom + pad + 1) - y;
  const result = document.createElement('canvas');
  result.width = w; result.height = h;
  const out = result.getContext('2d');
  out.fillStyle = '#fff'; out.fillRect(0, 0, w, h);
  out.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return result.toDataURL('image/png');
}
