const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
  const barcode = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-barcode.js')).href);
  const ai = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-ai.js')).href);

  const hardBarcode = barcode.summarizeBarcodeResults([
    { value: '5905567600791', format: 'ean_13', source: 'universal_barcode', roleHint: 'ean' },
    { value: '540S25420034B110171916', format: 'code_128', source: 'universal_barcode', roleHint: 'serial' },
  ]);
  assert.strictEqual(hardBarcode.ean, '5905567600791');
  assert.strictEqual(hardBarcode.serialNumber, '540S25420034B110171916');
  assert.strictEqual(hardBarcode.rotensoModel?.code, 'I35Xi R14');

  const alternateLabel = ai.normalizeNameplateAiResult({ result: {
    manufacturer: 'Rotenso', model_code: 'R35Xi R18', model_family: '', power_kw: '',
    serial_number: '', ean: '', unit_type: 'indoor', raw_text: 'R35Xi R18', uncertain_characters: [], notes: '',
    confidence: { manufacturer: .95, model: .96, power: .7, serial_number: 0, ean: 0 },
  } }, { serialNumber: '140201BFT7N28261B000931' });
  assert.strictEqual(alternateLabel.exactModel?.code, 'R35Xi R18');
  assert.strictEqual(alternateLabel.modelConfirmedByCatalog, true);
  assert.strictEqual(alternateLabel.manufacturer, 'Rotenso');
  assert(/Roni 3,5 kW/.test(alternateLabel.model));
  assert.strictEqual(alternateLabel.serialNumber, '140201BFT7N28261B000931');
  assert.strictEqual(alternateLabel.fieldQualities.model.level, 'high');
  assert.strictEqual(alternateLabel.fieldSources.serialNumber.type, 'barcode');

  const elisOutdoorFromRawText = ai.normalizeNameplateAiResult({ result: {
    manufacturer: '', model_code: '', model_family: '', power_kw: '',
    serial_number: '', ean: '', unit_type: 'unknown',
    raw_text: 'EO50Xo R17\nM024119504090\n140202A8RBW16253M000007',
    uncertain_characters: [], notes: '',
    confidence: { manufacturer: 0, model: .91, power: 0, serial_number: 0, ean: 0 },
  } }, { serialNumber: '140202A8RBW16253M000007' });
  assert.strictEqual(elisOutdoorFromRawText.exactModel?.code, 'EO50Xo R17');
  assert.strictEqual(elisOutdoorFromRawText.exactModel?.unitType, 'outdoor');
  assert.strictEqual(elisOutdoorFromRawText.manufacturer, 'Rotenso');
  assert.strictEqual(elisOutdoorFromRawText.model, 'Elis 5,0 kW (EO50Xo R17)');
  assert.strictEqual(elisOutdoorFromRawText.power, '5,0 kW');
  assert.strictEqual(elisOutdoorFromRawText.serialNumber, '140202A8RBW16253M000007');
  assert.strictEqual(elisOutdoorFromRawText.modelConfirmedByCatalog, true);

  const unknown = ai.normalizeNameplateAiResult({ result: {
    manufacturer: 'Rotenso', model_code: 'XYZ35ABC', model_family: '', power_kw: '3,5 kW',
    serial_number: 'ABC1234567890', ean: '', unit_type: 'unknown', raw_text: 'XYZ35ABC', uncertain_characters: [], notes: '',
    confidence: { manufacturer: .8, model: .8, power: .7, serial_number: .7, ean: 0 },
  } });
  assert.strictEqual(unknown.modelConfirmedByCatalog, false);
  assert.strictEqual(unknown.fieldQualities.model.level, 'medium');
  assert(/nie znaleziono dokładnego odpowiednika/i.test(unknown.fieldQualities.model.warning));

  const contradictoryAi = ai.normalizeNameplateAiResult({ result: {
    manufacturer: 'Rotenso', model_code: 'I35Xi R14', model_family: 'Imoto', power_kw: '3,5',
    serial_number: 'WRONG', ean: '', unit_type: 'indoor', raw_text: '', uncertain_characters: [], notes: '',
    confidence: { manufacturer: 1, model: 1, power: 1, serial_number: 1, ean: 0 },
  } }, { ean: '5905567600807', serialNumber: '540U1053005A4210170214' });
  assert.strictEqual(contradictoryAi.exactModel?.code, 'I35Xo R14', 'Hard EAN must win over contradictory AI model');
  assert.strictEqual(contradictoryAi.serialNumber, '540U1053005A4210170214', 'Hard barcode SN must win over AI text');

  const component = read('src/components/desktop/DesktopNameplateOcrButton.jsx');
  const endpoint = read('api/read-nameplate-ai.js');
  assert(component.includes('readDesktopNameplateWithAi'));
  assert(component.includes('modelConfirmedByCatalog'));
  assert(component.includes('Odczytaj kody') && component.includes('Odczytaj przez AI'));
  assert(!component.includes('Odczytaj nadruk OCR'));
  assert(!component.includes('OPENAI_API_KEY'), 'OpenAI key leaked into client');
  assert(endpoint.includes('process.env.OPENAI_API_KEY'));
  assert(endpoint.includes('store: false'));
  assert(endpoint.includes('barcodeDetections'));
  assert(endpoint.includes('Nigdy nie twórz EAN-u z numeru seryjnego'));
  assert(endpoint.includes('Nie mieszaj numeru seryjnego, EAN-u i kodu modelu'));
  assert(endpoint.includes('EO50Xo R17'));

  console.log('Smoke OK: hard barcodes win, AI reads print, and Rotenso models require exact catalog confirmation');
})().catch((error) => { console.error(error); process.exit(1); });
