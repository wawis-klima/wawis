import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const storageSource = fs.readFileSync(new URL('../src/mobile791/modules/job-protocol-storage.js', import.meta.url), 'utf8');
const printWidthMatch = storageSource.match(/const PRINT_IMAGE_WIDTH = (\d+);/);
const targetWidthPx = Number(printWidthMatch?.[1] || 0);
const phomemoDpi = 400;

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
  const viewport = page.getViewport({ scale: targetWidthPx / baseViewport.width });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));

  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    background: '#ffffff',
  }).promise;

  const png = canvas.toBuffer('image/png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(targetWidthPx, 3307);
  assert.equal(canvas.width, targetWidthPx);
  const physicalWidthMm = canvas.width / phomemoDpi * 25.4;
  const physicalHeightMm = canvas.height / phomemoDpi * 25.4;
  assert.ok(Math.abs(physicalWidthMm - 210) < 0.2, `Szerokość wydruku nie jest A4: ${physicalWidthMm.toFixed(2)} mm`);
  assert.ok(Math.abs(physicalHeightMm - 297) < 0.3, `Wysokość wydruku nie jest A4: ${physicalHeightMm.toFixed(2)} mm`);
  assert.match(storageSource, /if \(pages\.length === 1\)/, 'Jednostronicowy protokół powinien renderować się bez dodatkowego dużego canvasa.');
  assert.ok(png.length > 10_000);
  console.log(`PASS protocol PDF->PNG ${canvas.width}x${canvas.height}, ${png.length} B`);
} finally {
  await pdf.destroy();
}
