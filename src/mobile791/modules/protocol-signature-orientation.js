/**
 * Original customer signature stays unchanged in private Storage.
 * Only PDF-rendered bitmap receives an optional rotation.
 */
export function selectSignatureRotation(width, height, mode = "auto") {
  const w = Number(width), h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error("Nieprawidłowe wymiary obrazu podpisu.");
  }
  if (mode === "auto") return h > w * 1.2 ? 90 : 0;
  const value = Number(mode);
  if (![0, 90, 180, 270].includes(value)) throw new Error("Nieprawidłowy kąt obrotu podpisu.");
  return value;
}

export async function orientSignatureForPdf(dataUrl, mode = "auto") {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(dataUrl || ""))) {
    throw new Error("Nieprawidłowy obraz podpisu PNG.");
  }
  if (typeof Image !== "function" || typeof document === "undefined") {
    throw new Error("Przeglądarka nie obsługuje przygotowania podpisu do PDF.");
  }
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Nie udało się odczytać podpisu klienta."));
    img.src = dataUrl;
  });
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const angle = selectSignatureRotation(w, h, mode);
  if (!angle) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = angle === 90 || angle === 270 ? h : w;
  canvas.height = angle === 90 || angle === 270 ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nie udało się przygotować obrotu podpisu.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (angle === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (angle === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}
