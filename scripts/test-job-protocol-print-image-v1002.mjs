import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const source = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
const fontBytes = fs.readFileSync(new URL('../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', import.meta.url));
source.addFileToVFS('DejaVuSans.ttf', fontBytes.toString('base64'));
source.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
source.setFont('DejaVuSans', 'normal');
source.setFontSize(18);
source.text('WAWIS - test obrazu wydruku protokolu', 42, 56);
source.setFontSize(10);
source.text('Dokument pozostaje PDF, a do Phomemo trafia tymczasowy obraz PNG.', 42, 82);

const pdfBytes = new Uint8Array(source.output('arraybuffer'));
const pdf = await getDocument({ data: pdfBytes }).promise;

try {
  assert.equal(pdf.numPages, 1);
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 1800 / baseViewport.width });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));

  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    background: '#ffffff',
  }).promise;

  const png = canvas.toBuffer('image/png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(canvas.width, 1800);
  assert.ok(canvas.height > 2500);
  assert.ok(png.length > 10_000);
  console.log(`PASS protocol PDF->PNG ${canvas.width}x${canvas.height}, ${png.length} B`);
} finally {
  await pdf.destroy();
}
