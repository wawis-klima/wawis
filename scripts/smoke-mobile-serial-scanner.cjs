const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const formSource = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
const wizardSource = read('src', 'mobile791', 'components', 'devices', 'MobileDeviceWizard.jsx');
const wizardStyles = read('src', 'mobile791', 'components', 'devices', 'mobile-device-wizard.css');
const captureSource = read('src', 'mobile791', 'components', 'nameplate', 'NameplatePhotoCapture.jsx');
const captureStyles = read('src', 'mobile791', 'components', 'nameplate', 'nameplate-photo-capture.css');
const detailsSource = read('src', 'mobile791', 'components', 'JobDetailsPanel.jsx');
const actionsSource = read('src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const requirementsSource = read('src', 'mobile791', 'modules', 'nameplate-requirements.js');
const devicesSource = read('src', 'mobile791', 'modules', 'job-devices.js');
const photosSource = read('src', 'mobile791', 'modules', 'photos.js');
const jobsFormSource = read('src', 'mobile791', 'modules', 'jobs-form.js');
const rotensoCatalogSource = read('src', 'mobile791', 'modules', 'rotenso-models.js');
const e2eSource = read('tests', 'e2e', 'mobile-serial-scanner.spec.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(formSource, /import MobileDeviceWizard/);
assert.match(formSource, /onSetUnitDescriptor/);
assert.match(formSource, /onAddIndoorUnit/);
assert.match(formSource, /onAddDevice/);
assert.match(formSource, /closeJobModal\(\{ busy \}\)/);
assert.match(formSource, /submitLabel="Zapisz urządzenia i tabliczki"/);
assert.doesNotMatch(formSource, /SerialNumberScanner|scanSerialNumberFromImage|serial-number-ocr/);
assert.doesNotMatch(formSource, /Dodaj wszystkie wymagane zdjęcia tabliczek przed zapisaniem/);
assert.match(formSource, /saveJobDeviceSerialsRecord|saveEditedJob/);

assert.match(wizardSource, /Krok \{current\} z 4/);
assert.match(wizardSource, /Single/);
assert.match(wizardSource, /Multi/);
assert.match(wizardSource, /Wybierz markę/);
assert.match(wizardSource, /Wybierz model/);
assert.match(wizardSource, /Wybierz moc/);
assert.match(wizardSource, /Rotenso/);
assert.match(wizardSource, /getRotensoModelGroups/);
assert.match(wizardSource, /Szukaj modelu Rotenso/);
assert.match(wizardSource, /mobileDevicePickerGroup/);
assert.match(wizardSource, /Dodaj kolejne urządzenie/);
assert.match(wizardSource, /\+ Dodaj JW/);
assert.doesNotMatch(wizardSource, /Niepełny zestaw możesz zapisać/);
assert.doesNotMatch(wizardSource, /Zlecenia nie da się zakończyć bez tabliczki JZ i każdej JW/);
assert.match(wizardSource, /Wszystkie tabliczki dodane/);
assert.match(wizardSource, /tabliczek gotowe/);
assert.match(wizardSource, /getDevicePhotoCompletion/);
assert.match(wizardSource, /Dalej do podsumowania/);
assert.doesNotMatch(wizardSource, /<SelectionRow kind="power" label="Moc"/);
assert.match(wizardSource, /Najpierw zrób zdjęcie tabliczki/);
assert.match(wizardSource, /Uzupełni się po odczycie tabliczki/);
assert.match(wizardSource, /mobileDeviceWizardPhotoGroup[\s\S]*renderSelectorPanel\(\)/);
assert.match(wizardSource, /getSingleSplitModelFamilyMismatch/);
assert.match(wizardSource, /validateSinglePhotoModel/);
assert.match(rotensoCatalogSource, /Niezgodny zestaw Single/);
assert.match(captureSource, /compatibilityError/);
assert.match(captureSource, /validateModel/);
assert.doesNotMatch(wizardSource, />Zapisz urządzenie</);
assert.match(wizardStyles, /\.mobileDeviceWizard/);
assert.match(wizardStyles, /\.mobileDevicePickerSheet/);
assert.match(wizardStyles, /\.mobileDeviceOverviewCard/);
assert.match(wizardStyles, /\.mobileDevicePickerModelCatalog/);
assert.match(wizardStyles, /\.mobileDevicePickerSearch/);
assert.match(wizardStyles, /v11\.32 — bardziej kompaktowy kreator urządzeń/);
assert.match(wizardStyles, /\.mobileDeviceWizardHeader h2 \{[\s\S]*?font-size: 15px;[\s\S]*?white-space: nowrap;/);
assert.match(wizardStyles, /\.mobileDeviceTypeCard \{[\s\S]*?min-height: 72px;/);
assert.match(wizardStyles, /\.mobileDeviceTypeCard strong \{[\s\S]*?font-size: 13px;/);
assert.match(wizardStyles, /\.mobileDeviceWizardSelection \{[\s\S]*?min-height: 58px;/);
assert.match(wizardStyles, /\.mobileDeviceWizardSelectionText strong \{[\s\S]*?font-size: 13px;/);
assert.match(wizardStyles, /v11\.33 — kompaktowe podsumowanie urządzeń/);
assert.match(wizardStyles, /\.mobileDeviceOverviewOpen \{[\s\S]*?min-height: 76px;[\s\S]*?padding: 9px 11px;/);
assert.match(wizardStyles, /\.mobileDeviceAddAnother \{[\s\S]*?width: max-content;[\s\S]*?min-height: 36px;/);
assert.match(captureStyles, /v11\.33 — niższe przyciski zdjęcia/);
assert.match(captureStyles, /\.nameplateCapture\.compact \.nameplateCaptureCameraBtn,[\s\S]*?\.nameplateCapture\.compact \.nameplateCaptureGalleryBtn \{[\s\S]*?min-height: 34px;/);
assert.match(wizardStyles, /v11\.34 — rzeczywista kompaktowość/);
assert.match(wizardStyles, /\.mobileDeviceWizardBody \{[\s\S]*?align-content: start !important;[\s\S]*?grid-auto-rows: max-content !important;/);
assert.match(wizardStyles, /\.mobileDeviceAddAnother \{[\s\S]*?justify-self: center !important;[\s\S]*?width: max-content !important;[\s\S]*?min-height: 38px !important;/);

for (const modelName of ['Luve Pro Black', 'Mirai', 'Fresh', 'Roni', 'Versu Mirror', 'Versu Pure', 'Versu Cloth Stone', 'Versu Cloth Caramel', 'Luve Black', 'Luve', 'Revio', 'Imoto', 'Teta Mirror', 'Teta', 'Ukura', 'Elis', 'Elis Silver', 'Aneru', 'Tenji CC', 'Tenji CS', 'Nevo', 'Jato', 'Hiro N', 'Hiro S', 'Hiro HP']) {
  assert.match(rotensoCatalogSource, new RegExp(modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(rotensoCatalogSource, /'15,2 kW'/);
assert.match(rotensoCatalogSource, /'12,3 kW'/);

assert.match(captureSource, /capture="environment"/);
assert.match(captureSource, /nameplateCameraInput/);
assert.match(captureSource, /nameplateGalleryInput/);
assert.match(captureSource, /compact = false/);
assert.match(captureSource, /aria-expanded/);
assert.match(captureSource, /Dopasuj kadr/);
assert.match(captureSource, /Zapisz kadr/);
assert.match(captureSource, /Ponów zdjęcie/);
assert.match(captureSource, /createCroppedFile/);
assert.match(captureSource, /canvas\.toBlob/);
assert.match(captureSource, /context\.drawImage/);
assert.match(captureSource, /MAX_CROP_OUTPUT_PX/);
assert.match(captureSource, /nameplateCropHandle/);
assert.doesNotMatch(captureSource, /Tesseract|zxing|scanSerialNumberFromImage|getUserMedia/);
assert.match(captureStyles, /\.nameplateCaptureSummary/);
assert.match(captureStyles, /\.nameplateCapture\.compact/);
assert.match(captureStyles, /\.nameplateCapturePreview/);
assert.match(captureStyles, /\.nameplateCropModal/);
assert.match(captureStyles, /\.nameplateCropBox/);
assert.match(captureStyles, /\.nameplateCropHandle/);

assert.match(detailsSource, /getJobNameplateCompletion/);
assert.match(detailsSource, /nameplateCompletion\.isComplete/);
assert.match(detailsSource, /Nie można zakończyć zlecenia/);
assert.match(detailsSource, /Dodaj brakujące tabliczki/);
assert.match(detailsSource, /DeviceUnitDocumentationRow/);
assert.match(detailsSource, /role="button"/);
assert.match(detailsSource, /onClick=\{handleAction\}/);
assert.match(detailsSource, /Otwórz tabliczkę znamionową/);
assert.match(detailsSource, /Brakuje \${missingCount}/);
assert.doesNotMatch(detailsSource, /jobDeviceLegacySerialDisplay/);
assert.match(actionsSource, /loadJobNameplatePhotosData/);
assert.match(actionsSource, /Nie udało się potwierdzić zdjęć tabliczek na serwerze/);
assert.match(actionsSource, /locallyConfirmedOnServer/);
assert.match(actionsSource, /Dodaj wymagane zdjęcia tabliczek znamionowych/);
assert.match(actionsSource, /Urządzenia i tabliczki zostały zapisane/);
assert.match(requirementsSource, /export function getRequiredNameplateUnits/);
assert.match(requirementsSource, /export function getJobNameplateCompletion/);
assert.match(jobsFormSource, /existing_nameplate_photos/);
assert.match(jobsFormSource, /device_model: deviceFields\.device_model/);

assert.match(devicesSource, /export function getDeviceIndoorUnits/);
assert.match(devicesSource, /setStructuredIndoorValue/);
assert.match(devicesSource, /inferJobDevicesFromNameplatePhotos/);
assert.match(photosSource, /NAMEPLATE_PHOTO_FOLDER/);
assert.match(photosSource, /device-\$\{deviceIndex\}_\$\{unitRef\}/);
assert.match(photosSource, /photo_kind: 'nameplate'/);

assert.equal(packageJson.dependencies?.['tesseract.js'], undefined);
assert.equal(packageJson.dependencies?.['@tesseract.js-data/eng'], undefined);
assert.equal(packageJson.dependencies?.['@zxing/browser'], undefined);
assert.equal(packageJson.dependencies?.['@zxing/library'], undefined);

assert.match(e2eSource, /devices\['iPhone 14'\]/);
assert.match(e2eSource, /mobileDeviceWizard/);
assert.match(e2eSource, /nameplateGalleryInput/);
assert.match(e2eSource, /Nie można zakończyć zlecenia/);
assert.match(e2eSource, /toBeDisabled/);
assert.match(e2eSource, /toBeEnabled/);

(async () => {
  const devices = await import(pathToFileURL(path.join(root, 'src', 'mobile791', 'modules', 'job-devices.js')).href);
  const requirements = await import(pathToFileURL(path.join(root, 'src', 'mobile791', 'modules', 'nameplate-requirements.js')).href);
  const rotensoCatalog = await import(pathToFileURL(path.join(root, 'src', 'mobile791', 'modules', 'rotenso-models.js')).href);

  const indoorModelNames = rotensoCatalog.getRotensoModelNames({ deviceType: devices.DEVICE_TYPE_SINGLE, unitRef: 'jz' });
  assert.ok(indoorModelNames.length >= 24);
  assert.ok(indoorModelNames.includes('Luve Pro Black'));
  assert.ok(indoorModelNames.includes('Tenji CS'));
  assert.ok(indoorModelNames.includes('Jato'));
  assert.deepEqual(rotensoCatalog.getRotensoPowerOptions('Teta Mirror'), ['2,6 kW', '3,5 kW', '5,1 kW', '6,9 kW']);
  assert.deepEqual(rotensoCatalog.getRotensoPowerOptions('Hiro N', { deviceType: devices.DEVICE_TYPE_MULTI, unitRef: 'jz' }), ['4,1 kW', '5,1 kW', '7,5 kW', '9,4 kW', '11,8 kW']);
  assert.deepEqual(rotensoCatalog.getRotensoModelNames({ deviceType: devices.DEVICE_TYPE_MULTI, unitRef: 'jz' }), ['Hiro N', 'Hiro S', 'Hiro HP']);
  assert.equal(rotensoCatalog.getRotensoModelFamilyFromValue('Rotenso Imoto 3,5 kW I35Xi R14'), 'Imoto');
  assert.equal(rotensoCatalog.getRotensoModelFamilyFromValue('Rotenso Ukura 3,5 kW U35Xo R17'), 'Ukura');
  assert.equal(rotensoCatalog.getSingleSplitModelFamilyMismatch({
    outdoorModel: 'Rotenso Imoto 3,5 kW I35Xo R14',
    indoorModel: 'Rotenso Ukura 3,5 kW U35Xi R17',
  })?.message.includes('Niezgodny zestaw Single'), true);
  assert.equal(rotensoCatalog.getSingleSplitModelFamilyMismatch({
    outdoorModel: 'Rotenso Imoto 3,5 kW I35Xo R14',
    indoorModel: 'Rotenso Imoto 3,5 kW I35Xi R15',
  }), null);

  const draft = devices.normalizeJobDevices({
    devices: [{
      device_type: devices.DEVICE_TYPE_MULTI,
      indoor_models: ['Rotenso Ukura 2,6 kW', 'Rotenso Ukura 3,5 kW'],
      indoor_serial_numbers: ['', 'SN-JW2'],
      outdoor_model: 'Rotenso Hiro 5,2 kW',
      outdoor_serial_number: 'SN-JZ',
    }],
  }, { keepEmptyRow: true, keepEmptyIndoor: true });

  const serialized = devices.serializeJobDevicesToFields({ devices: draft });
  assert.deepEqual(serialized.devices[0].indoor_models, ['Rotenso Ukura 2,6 kW', 'Rotenso Ukura 3,5 kW']);
  assert.deepEqual(serialized.devices[0].indoor_serial_numbers, ['', 'SN-JW2']);
  assert.equal(serialized.device_model, 'JW1: Rotenso Ukura 2,6 kW | JW2: Rotenso Ukura 3,5 kW | JZ: Rotenso Hiro 5,2 kW');
  assert.equal(serialized.device_serial_number, 'JW2: SN-JW2 | JZ: SN-JZ');

  const photoOnlyRows = devices.getJobDeviceRows({
    photos: [
      { storage_path: 'job-1/nameplates/device-1_jz_bez-numeru_1.jpg' },
      { storage_path: 'job-1/nameplates/device-1_jw-1_bez-numeru_2.jpg' },
      { storage_path: 'job-1/nameplates/device-1_jw-2_bez-numeru_3.jpg' },
    ],
  });
  assert.equal(photoOnlyRows.length, 1);
  assert.equal(devices.getDeviceType(photoOnlyRows[0]), devices.DEVICE_TYPE_MULTI);
  assert.equal(devices.getDeviceIndoorUnits(photoOnlyRows[0], { keepEmpty: true }).length, 2);

  const multiRequirements = requirements.getRequiredNameplateUnits({ devices: draft });
  assert.equal(multiRequirements.length, 3);
  assert.deepEqual(multiRequirements.map((item) => item.unitRef), ['jz', 'jw-1', 'jw-2']);

  const completeJob = {
    devices: draft,
    photos: [
      { storage_path: 'job-1/nameplates/device-1_jz_bez-numeru_a.jpg', image_url: 'blob:jz' },
      { storage_path: 'job-1/nameplates/device-1_jw-1_bez-numeru_b.jpg', image_url: 'blob:jw1' },
      { storage_path: 'job-1/nameplates/device-1_jw-2_bez-numeru_c.jpg', image_url: 'blob:jw2' },
    ],
  };
  const completion = requirements.getJobNameplateCompletion(completeJob);
  assert.equal(completion.isComplete, true);
  assert.equal(completion.readyCount, 3);

  console.log('Mobile device wizard smoke OK: Single/Multi, full Rotenso catalog with contextual powers, manual nameplate crop, multiple devices, required nameplates before completion');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
