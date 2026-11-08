// WAWIS 14.39 — dopisanie podpisu instalatora do JUŻ ZAPISANEGO protokołu montażu (decyzja właściciela 08.11.2026).
// Metoda: aktualizacja przyrostowa PDF (incremental update) — oryginalne bajty pliku zostają nienaruszone, na końcu
// dochodzi tylko: obraz podpisu (+ maska przezroczystości), mały strumień rysujący go w polu „Pieczątka i podpis
// instalatora”, nowa wersja słownika strony/zasobów i tablica xref. Pozycja pola odczytywana z tekstu PDF (pdf.js),
// więc działa niezależnie od długości protokołu. Każdy wynik sprawdzany ponownie pdf.js (liczba stron, +1 obraz,
// tekst pola). Cokolwiek nietypowego → wyjątek, plik pozostaje bez zmian.

const LABEL = 'Pieczątka i podpis instalatora';
const LABEL_FONT_SIZE = 7.3; // jak w job-protocol-pdf.js
const LINE_ABOVE_BASELINE = 17; // linia podpisu: y + 112, opis: y + 129
const MAX_W = 236;
const MAX_H = 64;

const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]); return s; };
const fromLatin1 = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);

async function loadPdfJs() {
  const [{ getDocument, GlobalWorkerOptions, OPS }, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  return { getDocument, OPS };
}

/** Pole podpisu instalatora: strona, odwołanie do obiektu strony, środek, dół obrazu, skala (układ PDF, od dołu). */
export async function findInstallerSignatureBox(bytes) {
  const { getDocument, OPS } = await loadPdfJs();
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  try {
    for (let pageNumber = pdf.numPages; pageNumber >= 1; pageNumber -= 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const item = text.items.find((entry) => String(entry.str || '').trim() === LABEL);
      if (!item) continue;
      const [a, b, , , e, f] = item.transform;
      const scale = Math.hypot(a, b) / LABEL_FONT_SIZE;
      if (!(scale > 0.5 && scale < 1.5)) throw new Error('nietypowa skala pola podpisu');
      const ops = await page.getOperatorList();
      const images = ops.fnArray.filter((fn) => fn === OPS.paintImageXObject).length;
      return {
        numPages: pdf.numPages, pageNumber, pageRef: page.ref, images,
        centerX: e + (item.width || 0) / 2,
        bottomY: f + (LINE_ABOVE_BASELINE + 4) * scale,
        scale,
      };
    }
    throw new Error('nie znaleziono pola „Pieczątka i podpis instalatora”');
  } finally {
    await pdf.destroy();
  }
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** PNG (data URL) → RGB + alfa (zlib) przez canvas. */
async function decodePng(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const rgb = new Uint8Array(bitmap.width * bitmap.height * 3);
  const alpha = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    rgb[p * 3] = data[i]; rgb[p * 3 + 1] = data[i + 1]; rgb[p * 3 + 2] = data[i + 2]; alpha[p] = data[i + 3];
  }
  if (!alpha.some((value) => value > 0)) throw new Error('pusty wzór podpisu');
  return { width: bitmap.width, height: bitmap.height, rgb: await deflate(rgb), alpha: await deflate(alpha) };
}

function parseXref(text) {
  const start = Number((text.match(/startxref\s+(\d+)\s+%%EOF\s*$/) || [])[1]);
  if (!Number.isFinite(start) || text.slice(start, start + 4) !== 'xref') throw new Error('nieobsługiwana struktura PDF (xref)');
  const offsets = new Map();
  let pos = start + 4;
  const sub = /\s*(\d+) (\d+)\s*\r?\n/y;
  for (;;) {
    sub.lastIndex = pos;
    const head = sub.exec(text);
    if (!head) break;
    let first = Number(head[1]); const count = Number(head[2]);
    pos = sub.lastIndex;
    for (let i = 0; i < count; i += 1, first += 1) {
      const entry = text.slice(pos, pos + 20);
      const m = entry.match(/^(\d{10}) (\d{5}) ([nf])/);
      if (!m) throw new Error('uszkodzona tablica xref');
      if (m[3] === 'n') offsets.set(first, Number(m[1]));
      pos += 20;
    }
  }
  const trailerAt = text.indexOf('trailer', pos);
  const trailer = text.slice(trailerAt, text.lastIndexOf('startxref'));
  const size = Number((trailer.match(/\/Size (\d+)/) || [])[1]);
  const root = (trailer.match(/\/Root (\d+ \d+ R)/) || [])[1];
  if (!size || !root) throw new Error('uszkodzony trailer PDF');
  return {
    start, offsets, size, root,
    info: (trailer.match(/\/Info (\d+ \d+ R)/) || [])[1] || '',
    id: (trailer.match(/\/ID\s*(\[[^\]]*\])/) || [])[1] || '',
  };
}

function readObject(text, offsets, num) {
  const at = offsets.get(num);
  if (at == null) throw new Error(`brak obiektu ${num}`);
  const head = text.slice(at).match(/^(\d+) (\d+) obj\s*/);
  if (!head || Number(head[1]) !== num) throw new Error(`nieoczekiwany obiekt ${num}`);
  const body = text.slice(at + head[0].length, text.indexOf('endobj', at)).trim();
  if (!body.startsWith('<<') || body.includes('stream')) throw new Error(`obiekt ${num} nie jest słownikiem`);
  return body;
}

function addXObject(resources, name, ref) {
  if (/\/XObject\s*<</.test(resources)) return resources.replace(/\/XObject\s*<</, `/XObject <<\n/${name} ${ref}\n`);
  if (/\/XObject\s+\d+ \d+ R/.test(resources)) throw new Error('nieobsługiwane zasoby (XObject jako odwołanie)');
  const end = resources.lastIndexOf('>>');
  return `${resources.slice(0, end)}/XObject <<\n/${name} ${ref}\n>>\n${resources.slice(end)}`;
}

const fmt = (n) => Number(n.toFixed(3)).toString();

/**
 * Dokleja obraz podpisu (PNG data URL) w polu instalatora. Zwraca nowe bajty PDF (oryginał + dopisek).
 * box — wynik findInstallerSignatureBox.
 */
export async function stampInstallerSignature(bytes, { box, png }) {
  const text = latin1(bytes);
  if (!text.startsWith('%PDF-')) throw new Error('to nie jest plik PDF');
  const xref = parseXref(text);
  const pageNum = box?.pageRef?.num;
  if (!pageNum) throw new Error('brak odwołania do strony');
  let page = readObject(text, xref.offsets, pageNum);
  const image = await decodePng(png);

  const fit = Math.min(MAX_W / image.width, MAX_H / image.height);
  const w = image.width * fit * box.scale;
  const h = image.height * fit * box.scale;
  const x = box.centerX - w / 2;
  const y = box.bottomY;

  const maskNum = xref.size; const imageNum = maskNum + 1; const contentNum = maskNum + 2;
  const name = `WawisInst${imageNum}`;
  const objects = [];
  const draw = `q\n${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(y)} cm\n/${name} Do\nQ\n`;

  // Zasoby: wspólny obiekt (jsPDF) → nowa wersja tego obiektu; słownik w stronie → zmiana w stronie.
  const resRef = page.match(/\/Resources\s+(\d+) (\d+) R/);
  if (resRef) {
    const resNum = Number(resRef[1]);
    objects.push([resNum, addXObject(readObject(text, xref.offsets, resNum), name, `${imageNum} 0 R`)]);
  } else {
    const inline = page.match(/\/Resources\s*(<<[\s\S]*?>>)\s*\/(?:MediaBox|Contents|Parent|Type)/);
    if (!inline) throw new Error('nieobsługiwane zasoby strony');
    page = page.replace(inline[1], addXObject(inline[1], name, `${imageNum} 0 R`));
  }
  const contents = page.match(/\/Contents\s*(\d+ \d+ R|\[[^\]]*\])/);
  if (!contents) throw new Error('strona bez treści');
  const list = contents[1].startsWith('[') ? contents[1].slice(1, -1).trim() : contents[1];
  page = page.replace(contents[0], `/Contents [${list} ${contentNum} 0 R]`);
  objects.push([pageNum, page]);

  const parts = [];
  const offsets = [];
  let cursor = bytes.length;
  const push = (chunk) => { const b = typeof chunk === 'string' ? fromLatin1(chunk) : chunk; parts.push(b); cursor += b.length; };
  push('\n');
  const writeStream = (num, dict, data) => {
    offsets.push([num, cursor]);
    push(`${num} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`); push(data); push('\nendstream\nendobj\n');
  };
  writeStream(maskNum, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, image.alpha);
  writeStream(imageNum, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${maskNum} 0 R`, image.rgb);
  writeStream(contentNum, '', fromLatin1(draw));
  objects.forEach(([num, body]) => { offsets.push([num, cursor]); push(`${num} 0 obj\n${body}\nendobj\n`); });

  const xrefAt = cursor;
  let table = 'xref\n';
  offsets.sort((p, q) => p[0] - q[0]).forEach(([num, at]) => { table += `${num} 1\n${String(at).padStart(10, '0')} 00000 n \n`; });
  table += `trailer\n<< /Size ${contentNum + 1} /Root ${xref.root}${xref.info ? ` /Info ${xref.info}` : ''}${xref.id ? ` /ID ${xref.id}` : ''} /Prev ${xref.start} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(table);

  const out = new Uint8Array(cursor);
  out.set(bytes, 0);
  let at = bytes.length;
  parts.forEach((part) => { out.set(part, at); at += part.length; });
  return out;
}

/** Kontrola po dopisaniu: te same strony, +1 obraz na stronie pola, pole nadal czytelne. */
export async function verifyStamped(stampedBytes, before) {
  const after = await findInstallerSignatureBox(stampedBytes);
  if (after.numPages !== before.numPages) throw new Error('zmieniła się liczba stron');
  if (after.pageNumber !== before.pageNumber) throw new Error('zmieniła się strona pola podpisu');
  if (after.images !== before.images + 1) throw new Error('podpis nie został poprawnie dodany');
  return true;
}

/** Całość: bajty → bajty z podpisem (sprawdzone). */
export async function addInstallerSignatureToPdf(bytes, png) {
  const box = await findInstallerSignatureBox(bytes);
  const stamped = await stampInstallerSignature(bytes, { box, png });
  await verifyStamped(stamped, box);
  return stamped;
}
