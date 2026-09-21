const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');

(async () => {
  const dictionary = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-model-dictionary.js')).href);
  const catalog = await import(pathToFileURL(path.join(root, 'src/data/rotenso-ean-catalog-v9.02.js')).href);
  const barcode = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-barcode.js')).href);
  const ai = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-ai.js')).href);
  const modelOcr = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-model-ocr.js')).href);

  const exact = dictionary.resolveRotensoCatalogModelCode('R35Xi R18');
  assert.strictEqual(exact?.code, 'R35Xi R18');
  assert.strictEqual(exact?.model, 'Roni 3,5 kW (R35Xi R18)');
  assert.strictEqual(exact?.unitType, 'indoor');
  assert.strictEqual(exact?.ean, '5905567609084');

  const serial = '140201BFT7N28261B000931';
  const barcodeOnly = barcode.summarizeBarcodeResults([
    { value: serial, format: 'code_128', source: 'universal_barcode', variant: 'całe zdjęcie', roleHint: 'any' },
  ]);
  assert.strictEqual(barcodeOnly.ean, '');
  assert.strictEqual(barcodeOnly.serialNumber, serial);
  assert.strictEqual(barcodeOnly.rotensoModel, null);

  const combined = ai.normalizeNameplateAiResult({ result: {
    manufacturer: 'Rotenso', model_code: 'R35Xi R18', model_family: '', power_kw: '', serial_number: '', ean: '', unit_type: 'indoor',
    raw_text: 'R35Xi R18', uncertain_characters: [], notes: '', confidence: { manufacturer: .9, model: .95, power: .7, serial_number: 0, ean: 0 },
  } }, barcodeOnly);
  assert.strictEqual(combined.exactModel?.code, 'R35Xi R18');
  assert.strictEqual(combined.modelConfirmedByCatalog, true);
  assert.strictEqual(combined.serialNumber, serial);
  assert.strictEqual(combined.fieldQualities.model.level, 'high');

  const photographedElis = modelOcr.resolveFocusedRotensoModelText('EOSOXo R17');
  assert.strictEqual(photographedElis?.manufacturer, 'Rotenso');
  assert.strictEqual(photographedElis?.family, 'Elis Silver');
  assert.strictEqual(photographedElis?.code, 'EO50Xo R17');
  assert.strictEqual(photographedElis?.capacityKw, '5,0');
  assert.strictEqual(photographedElis?.unitType, 'outdoor');
  assert.strictEqual(modelOcr.resolveFocusedRotensoModelText('EOSOXo_R17')?.code, 'EO50Xo R17');
  const consensus = modelOcr.selectFocusedModelConsensus(
    ['EOSOXo', 'EO5OXo R17'],
    [61, 64],
  );
  assert.strictEqual(consensus.reliable, true);
  assert.strictEqual(consensus.votes, 2);
  assert.strictEqual(consensus.model?.model, 'Elis Silver 5,0 kW (EO50Xo R17)');

  const photographedElisSilver = modelOcr.resolveFocusedRotensoModelText('ES5 0X1 R17');
  assert.strictEqual(photographedElisSilver?.manufacturer, 'Rotenso');
  assert.strictEqual(photographedElisSilver?.family, 'Elis Silver');
  assert.strictEqual(photographedElisSilver?.code, 'ES50Xi R17');
  assert.strictEqual(photographedElisSilver?.capacityKw, '5,0');
  assert.strictEqual(photographedElisSilver?.unitType, 'indoor');
  assert.strictEqual(photographedElisSilver?.ean, '5905567614293');
  assert.strictEqual(modelOcr.resolveFocusedRotensoModelText('ESSOXi_R17')?.code, 'ES50Xi R17');

  const catalogCodes = [...new Set(catalog.ROTENSO_EAN_CATALOG.map((entry) => entry.model_code))];
  for (const modelCode of catalogCodes) {
    const exactCatalogMatch = dictionary.resolveRotensoCatalogModelCode(modelCode);
    assert.strictEqual(exactCatalogMatch?.code, modelCode, `Exact catalog lookup failed for ${modelCode}`);

    const typicalOcrVariant = modelCode
      .replace(/0/g, 'O')
      .replace(/5/g, 'S')
      .replace(/Xi/i, 'X1');
    const ocrCatalogMatch = dictionary.resolveRotensoCatalogModelCode(typicalOcrVariant);
    assert.strictEqual(ocrCatalogMatch?.code, modelCode, `OCR catalog lookup failed for ${modelCode}`);
  }

  console.log(`Smoke OK: both label layouts and all ${catalogCodes.length} catalog model codes work with local OCR matching`);
})().catch((error) => { console.error(error); process.exit(1); });
