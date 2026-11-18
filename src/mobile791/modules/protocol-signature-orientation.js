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

/**
 * 14.44: kierunek pisania z ruchu palca. Gdy pracownik obraca telefon (bokiem albo do góry nogami),
 * ekran z blokadą orientacji się nie obraca i klient pisze wzdłuż innej osi płótna. Sam kształt
 * podpisu nie wystarcza (zawijas potrafi zrobić z pionowego podpisu szeroki), dlatego liczymy,
 * w którą stronę przesuwa się pismo: przemieszczenie każdego pociągnięcia + przesunięcie między
 * początkiem pierwszego i ostatniego pociągnięcia.
 *
 * Zwraca kąt dla orientSignatureForPdf (0, 90, 180, 270) albo null, gdy kierunek jest niepewny
 * (wtedy zostaje dotychczasowy tryb „auto”).
 */
export function detectSignatureWritingAngle(strokes) {
  const list = (Array.isArray(strokes) ? strokes : [])
    .map((stroke) => (Array.isArray(stroke) ? stroke : [])
      .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)))
    .filter((stroke) => stroke.length > 0);
  if (!list.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of list) for (const p of stroke) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  if (!(size > 0)) return null;
  let vx = 0, vy = 0;
  for (const stroke of list) {
    vx += stroke[stroke.length - 1].x - stroke[0].x;
    vy += stroke[stroke.length - 1].y - stroke[0].y;
  }
  if (list.length > 1) {
    vx += list[list.length - 1][0].x - list[0][0].x;
    vy += list[list.length - 1][0].y - list[0][0].y;
  }
  const ax = Math.abs(vx), ay = Math.abs(vy);
  const major = Math.max(ax, ay), minor = Math.min(ax, ay);
  if (major < size * 0.3 || major < minor * 1.5) return null;
  if (ax >= ay) {
    if (vx > 0) return 0;
    // Do góry nogami tylko przy bardzo wyraźnym kierunku — błędny obrót o 180° jest najgorszy.
    return major >= size * 0.5 && major >= minor * 2.5 ? 180 : null;
  }
  return vy > 0 ? 270 : 90;
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
    // 13.79: Safari potrafi nie wywołać onload — podgląd utknął na „Przygotowuję…”. Limit czasu + decode().
    const timer = setTimeout(() => reject(new Error("Odczyt podpisu trwał zbyt długo.")), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("Nie udało się odczytać podpisu klienta.")); };
    img.src = dataUrl;
    if (typeof img.decode === "function") {
      img.decode().then(() => { clearTimeout(timer); resolve(img); }).catch(() => {});
    }
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
