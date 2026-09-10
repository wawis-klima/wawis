const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
  assert(!fs.existsSync(path.join(root, 'src/modules/desktop-nameplate-ocr.js')), 'Legacy broad desktop OCR module must remain removed');
  assert(fs.existsSync(path.join(root, 'src/modules/desktop-nameplate-model-ocr.js')), 'Focused model-only OCR module is missing');
  assert(fs.existsSync(path.join(root, 'public/ocr/eng.traineddata.gz')), 'Bundled local model OCR assets are missing');

  const component = read('src/components/desktop/DesktopNameplateOcrButton.jsx');
  const cards = read('src/components/desktop/DesktopJobDeviceCards.jsx');
  const barcode = read('src/modules/desktop-nameplate-barcode.js');
  assert(component.includes('Odczytaj kody'), 'Barcode action is missing');
  assert(component.includes('Odczytaj przez AI'), 'AI action is missing');
  assert(component.includes('Zatwierdź i zapisz'), 'Save action is missing');
  assert(!component.includes('Odczytaj nadruk OCR'), 'Legacy local OCR action returned');
  assert(!component.includes('runLocalOcrRead'), 'Legacy local OCR handler returned');
  assert(!component.includes('desktop-nameplate-ocr.js'), 'Reader component still imports legacy OCR module');
  assert(component.includes('desktop-nameplate-model-ocr.js'), 'Blue scan does not import focused model recognition');
  assert(component.includes("fieldSources?.model?.type === 'ai'") && component.includes("fieldQualities?.model?.level !== 'high'"), 'Unverified AI model is not blocked before save');
  assert(cards.includes('DesktopNameplateOcrButton'), 'Desktop device cards do not expose nameplate reader');
  assert(!barcode.includes('printed_ocr') && !barcode.includes('scanDesktopNameplateIdentifiers'), 'Barcode module must not OCR arbitrary text or serials');

  const mobileSources = [
    read('src/mobile791/components/JobDetailsPanel.jsx'),
    read('src/mobile791/components/modals/JobFormModal.jsx'),
    read('src/mobile791/components/devices/MobileDeviceWizard.jsx'),
  ].join('\n');
  assert(!mobileSources.includes('DesktopNameplateOcrButton'), 'Desktop reader leaked into mobile components');
  assert(!mobileSources.includes('Odczytaj przez AI'), 'Desktop AI action leaked into mobile UI');

  const saveModule = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-ocr-save.js')).href);
  const updates = [];
  const photoUpdates = [];
  const supabase = {
    from(table) {
      if (table === 'jobs') {
        return { update(payload) { updates.push(payload); return { eq: async () => ({ error: null }) }; } };
      }
      if (table === 'photos') {
        return {
          update(payload) {
            photoUpdates.push(payload);
            return { eq() { return { eq() { return { select() { return { async maybeSingle() { return { data: { id: 'photo-1', ...payload }, error: null }; } }; } }; } }; } };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name) {
      throw new Error(`Unexpected RPC during nameplate save: ${name}`);
    },
  };

  const result = await saveModule.saveDesktopNameplateOcrResult({
    supabase,
    job: {
      id: 'job-1',
      device_model: 'JZ: Rotenso Hiro 5,2 kW | JW1: Rotenso Ukura 2,6 kW | JW2: Rotenso Ukura 3,5 kW',
      device_serial_number: 'JZ: OUT-1 | JW1: IN-1',
    },
    photo: { id: 'photo-1', job_id: 'job-1', storage_path: 'job-1/nameplates/device-1_jw-2_test.jpg' },
    modelValue: 'Rotenso Ukura 3,5 kW',
    serialNumber: 'IN-2',
    saveModel: true,
    saveSerial: true,
  });
  assert.strictEqual(updates.length, 1, 'Nameplate save should update job once');
  assert.strictEqual(photoUpdates.length, 1, 'Nameplate save should approve photo once');
  assert.strictEqual(result.photoOcrStatus?.ocr_status, 'approved', 'Historical approval status must remain compatible');
  assert(result.device_model.includes('JW2: Rotenso Ukura 3,5 kW'));
  assert(result.device_serial_number.includes('JW2: IN-2'));

  console.log('Smoke OK: desktop reader uses barcode + focused model OCR + optional AI and keeps compatible persistence');
})().catch((error) => { console.error(error); process.exit(1); });
