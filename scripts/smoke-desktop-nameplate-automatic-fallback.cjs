const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const L={0:'0001101',1:'0011001',2:'0010011',3:'0111101',4:'0100011',5:'0110001',6:'0101111',7:'0111011',8:'0110111',9:'0001011'};
const G={0:'0100111',1:'0110011',2:'0011011',3:'0100001',4:'0011101',5:'0111001',6:'0000101',7:'0010001',8:'0001001',9:'0010111'};
const R={0:'1110010',1:'1100110',2:'1101100',3:'1000010',4:'1011100',5:'1001110',6:'1010000',7:'1000100',8:'1001000',9:'1110100'};
const P={0:'LLLLLL',1:'LLGLGG',2:'LLGGLG',3:'LLGGGL',4:'LGLLGG',5:'LGGLLG',6:'LGGGLL',7:'LGLGLG',8:'LGLGGL',9:'LGGLGL'};
function encode(ean){const d=String(ean).split('').map(Number);return `101${d.slice(1,7).map((n,i)=>P[d[0]][i]==='L'?L[n]:G[n]).join('')}01010${d.slice(7).map(n=>R[n]).join('')}101`;}

(async () => {
  const barcode = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-barcode.js')).href);
  const bits = encode('5905567601132');
  assert.strictEqual(bits.length, 95);
  assert.strictEqual(barcode.decodeEan13BitString(bits)?.ean, '5905567601132');
  assert.strictEqual(barcode.decodeEan13BitString(`0${bits.slice(1)}`), null);

  const serialOnly = barcode.summarizeBarcodeResults([
    { value: '540V9839703A70010130182', format: 'code_128', source: 'universal_barcode', roleHint: 'serial' },
  ]);
  assert.strictEqual(serialOnly.ean, '');
  assert.strictEqual(serialOnly.serialNumber, '540V9839703A70010130182');

  const source = read('src/modules/desktop-nameplate-barcode.js');
  const component = read('src/components/desktop/DesktopNameplateOcrButton.jsx');
  assert(source.includes("source: 'local_ean13'"), 'Local EAN line decoder is missing');
  assert(source.includes("'universal_barcode'"), 'Universal barcode source is missing');
  assert(!source.includes('printed_ocr') && !source.includes('scanDesktopNameplateIdentifiers'), 'Barcode decoder must not guess text or serials with OCR');
  assert(component.includes('scanDesktopNameplateModelCode'), 'Blue scan must check the printed model locally after barcodes');
  assert(component.includes('Lokalny odczyt nadruku'), 'Focused model source is not shown to the user');

  console.log('Smoke OK: barcodes stay authoritative and blue scan adds model-only local recognition');
})().catch((error) => { console.error(error); process.exit(1); });
