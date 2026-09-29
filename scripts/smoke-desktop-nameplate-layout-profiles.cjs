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
  assert.strictEqual(exact?.model, 'Roni 3,4 kW (R35Xi R18)');
  assert.strictEqual(exact?.capacityKw, '3,4');
  assert.strictEqual(exact?.catalogVerified, true);
  assert.strictEqual(exact?.revisionCatalogKnown, true);
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

  const futureRoni = dictionary.resolveRotensoCatalogModelCode('R35Xi R19');
  assert.strictEqual(futureRoni?.code, 'R35Xi R19');
  assert.strictEqual(futureRoni?.family, 'Roni');
  assert.strictEqual(futureRoni?.revision, 'R19');
  assert.strictEqual(futureRoni?.ean, '', 'Nie wolno przypisywać EAN-u starszej rewizji do R19');
  assert.strictEqual(futureRoni?.catalogVerified, false);
  assert.strictEqual(futureRoni?.baseModelVerified, true);
  assert.strictEqual(futureRoni?.revisionCatalogKnown, false);
  assert.strictEqual(futureRoni?.capacityKw, '', 'R35 zmienił moc między rewizjami, więc nowej rewizji nie wolno zgadywać');

  const stableFutureRoni = dictionary.resolveRotensoCatalogModelCode('R26Xi R19');
  assert.strictEqual(stableFutureRoni?.code, 'R26Xi R19');
  assert.strictEqual(stableFutureRoni?.capacityKw, '2,6', 'Stała moc we wszystkich znanych rewizjach może być zachowana');
  assert.strictEqual(stableFutureRoni?.ean, '');

  const futureAi = ai.normalizeNameplateAiResult({ result: {
    manufacturer: 'Rotenso', model_code: 'R35Xi R19', model_family: 'Roni', power_kw: '3,4',
    serial_number: 'RONIR190001234567', ean: '', unit_type: 'indoor',
    raw_text: 'ROTENSO R35Xi R19 3.4 kW', uncertain_characters: [], notes: '',
    confidence: { manufacturer: .98, model: .98, power: .95, serial_number: .9, ean: 0 },
  } });
  assert.strictEqual(futureAi.exactModel?.code, 'R35Xi R19');
  assert.strictEqual(futureAi.modelConfirmedByCatalog, false);
  assert.strictEqual(futureAi.modelBaseRecognized, true);
  assert.strictEqual(futureAi.newRevisionRecognized, true);
  assert.strictEqual(futureAi.exactModel?.ean, '');
  assert.strictEqual(futureAi.power, '3,4', 'Dla nowej rewizji moc ma pochodzić z odczytu tabliczki, nie ze starego katalogu');

  const fuzzyZero = modelOcr.resolveFocusedRotensoModelText('R5OXi R19');
  assert.strictEqual(fuzzyZero?.code, 'R50Xi R19');
  assert.strictEqual(fuzzyZero?.ocrCorrected, true);
  const fuzzyZeroOnePass = modelOcr.selectFocusedModelConsensus(['R5OXi R19'], [99]);
  assert.strictEqual(fuzzyZeroOnePass.reliable, false, 'Jedna korekta O→0 nie może automatycznie potwierdzić modelu');
  const fuzzyZeroTwoPasses = modelOcr.selectFocusedModelConsensus(['R5OXi R19', 'R5OXi R19'], [90, 91]);
  assert.strictEqual(fuzzyZeroTwoPasses.reliable, true);
  assert.strictEqual(fuzzyZeroTwoPasses.model?.code, 'R50Xi R19');

  const fuzzyUnitMarker = modelOcr.resolveFocusedRotensoModelText('R35X0 R19');
  assert.strictEqual(fuzzyUnitMarker?.code, 'R35Xo R19');
  assert.strictEqual(fuzzyUnitMarker?.ocrCorrected, true);
  assert.strictEqual(modelOcr.selectFocusedModelConsensus(['R35X0 R19'], [99]).reliable, false, 'X0/Xo wymaga konsensusu');
  assert.strictEqual(modelOcr.selectFocusedModelConsensus(['R35X0 R19', 'R35X0 R19'], [92, 94]).model?.code, 'R35Xo R19');

  const strictZeroMustNotMasquerade = dictionary.resolveRotensoNameplateModelExact('R35X0 R19');
  assert.strictEqual(strictZeroMustNotMasquerade, null, 'Ścisły parser nie może zamienić cyfry 0 na literę o');

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
  const catalogBaseCodes = [...new Set(catalogCodes.map((modelCode) => modelCode.replace(/\s+R[0-9]{1,2}$/i, '')))];
  for (const modelCode of catalogCodes) {
    const exactCatalogMatch = dictionary.resolveRotensoCatalogModelCode(modelCode);
    assert.strictEqual(exactCatalogMatch?.code, modelCode, `Exact catalog lookup failed for ${modelCode}`);

    const typicalOcrVariant = modelCode
      .replace(/0/g, 'O')
      .replace(/5/g, 'S')
      .replace(/Xi/i, 'X1');
    const ocrCatalogMatch = dictionary.resolveRotensoCatalogModelCode(typicalOcrVariant);
    assert.strictEqual(ocrCatalogMatch?.code, modelCode, `OCR catalog lookup failed for ${modelCode}`);
    assert.strictEqual(ocrCatalogMatch?.ocrCorrected, true, `OCR correction must be explicitly marked for ${modelCode}`);
  }

  for (const baseCode of catalogBaseCodes) {
    const futureCode = `${baseCode} R99`;
    const futureMatch = dictionary.resolveRotensoCatalogModelCode(futureCode);
    assert.strictEqual(futureMatch?.code, futureCode, `Future revision must be preserved for ${baseCode}`);
    assert.strictEqual(futureMatch?.revision, 'R99', `Future revision token must not be replaced for ${baseCode}`);
    assert.strictEqual(futureMatch?.ean, '', `Future revision must never inherit an older EAN for ${baseCode}`);
    assert.strictEqual(futureMatch?.catalogVerified, false, `Future revision cannot pretend to be an exact catalog row for ${baseCode}`);
    assert.strictEqual(futureMatch?.baseModelVerified, true, `Known base model must remain recognized for ${baseCode}`);
  }

  console.log(`Smoke OK: both label layouts, all ${catalogCodes.length} catalog model codes and ${catalogBaseCodes.length} synthetic future revisions work without borrowing an older EAN`);
})().catch((error) => { console.error(error); process.exit(1); });
