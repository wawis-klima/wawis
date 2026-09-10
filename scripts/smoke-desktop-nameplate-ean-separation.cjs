const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
  const barcode = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-barcode.js')).href);
  const catalog = await import(pathToFileURL(path.join(root, 'src/modules/nameplate-product-catalog.js')).href);
  const data = await import(pathToFileURL(path.join(root, 'src/data/rotenso-ean-catalog-v9.02.js')).href);

  const result = barcode.summarizeBarcodeResults([
    { value: '5905567600791', format: 'ean_13', source: 'universal_barcode', roleHint: 'ean' },
    { value: '540S25420034B110171916', format: 'code_128', source: 'universal_barcode', roleHint: 'serial' },
  ]);
  assert.strictEqual(result.ean, '5905567600791');
  assert.strictEqual(result.serialNumber, '540S25420034B110171916');
  assert.strictEqual(result.rotensoModel?.code, 'I35Xi R14');

  const numericCode128 = barcode.summarizeBarcodeResults([
    { value: '4200348110171', format: 'code_128', source: 'native_barcode', roleHint: 'serial' },
  ]);
  assert.strictEqual(numericCode128.ean, '', 'Code128 content must never become EAN merely because it is 13 digits');

  const outdoor = catalog.lookupBuiltInRotensoProductByEan('5905567600807').resolution;
  assert.strictEqual(outdoor.code, 'I35Xo R14');
  assert.strictEqual(outdoor.unitType, 'outdoor');
  assert.strictEqual(barcode.getNameplateTargetMismatch('jz', outdoor), null);
  assert.strictEqual(barcode.getNameplateTargetMismatch('jw-1', outdoor)?.detectedType, 'outdoor');

  for (const entry of data.ROTENSO_EAN_CATALOG) {
    const resolution = catalog.catalogEntryToResolution(entry);
    const expectedRef = entry.unit_type === 'outdoor' ? 'jz' : 'jw-1';
    assert.strictEqual(barcode.getNameplateTargetMismatch(expectedRef, resolution), null, `${entry.ean} ${entry.model_code} mismatch`);
  }

  const component = read('src/components/desktop/DesktopNameplateOcrButton.jsx');
  assert(component.includes("target.unitRef === 'jz' ? 'outdoor' : 'indoor'"));
  assert(!component.includes("target.unitRef === 'JZ' ? 'outdoor' : 'indoor'"));
  console.log('Smoke OK: EAN and SN stay separate and all Rotenso catalog entries preserve JW/JZ');
})().catch((error) => { console.error(error); process.exit(1); });
