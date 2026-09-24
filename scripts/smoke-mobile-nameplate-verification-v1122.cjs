const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const reader = read('src/mobile791/modules/nameplate-reader.js');
const capture = read('src/mobile791/components/nameplate/NameplatePhotoCapture.jsx');
const wizard = read('src/mobile791/components/devices/MobileDeviceWizard.jsx');
const form = read('src/mobile791/components/modals/JobFormModal.jsx');
const photos = read('src/mobile791/modules/photos.js');
const jobsFetch = read('src/mobile791/modules/jobs-fetch.js');
const actions = read('src/mobile791/hooks/useSelectedJobActions.js');
const desktopAi = read('src/modules/desktop-nameplate-ai.js');
const aiApi = read('api/read-nameplate-ai.js');

assert(reader.includes("scanDesktopNameplateBarcodes"), 'Mobile must reuse the desktop barcode reader');
assert(reader.includes("scanDesktopNameplateModelCode"), 'Mobile must reuse focused local model OCR');
assert(reader.includes("scanDesktopNameplateSerialText"), 'Mobile must reuse focused local serial OCR');
assert(reader.includes("readDesktopNameplateWithAi"), 'Mobile must reuse the existing AI fallback');
assert(reader.indexOf("isMobileNameplateReadingComplete(localReading)") < reader.indexOf("readDesktopNameplateWithAi({"),
  'AI must only run after the local result is evaluated');
assert(reader.includes("barcodeError"), 'A local barcode failure must still allow AI fallback');

assert(capture.includes("readMobileNameplate({"), 'Crop confirmation must launch automatic nameplate reading');
assert(capture.includes('ocrStatus: "approved"'), 'Installer confirmation must mark the nameplate approved');
assert(capture.includes('onSelect?.(verification.file'), 'The photo must be attached only after verification');
assert(capture.includes("verification.reading?.mismatch"), 'JW/JZ mismatch must block confirmation');

assert(wizard.includes("jobId={jobId}"), 'Wizard must pass the job context to verification');
assert(wizard.includes("currentSerial={activeDevice ? getUnitSerial"), 'Wizard must show the current serial as a manual fallback');

assert(form.includes("verificationMethod"), 'Verified reading metadata must stay with the pending nameplate');
assert(form.includes("outdoor_serial_number: serialNumber"), 'Verified JZ serial must update device data');
assert(form.includes("indoor_serial_numbers: indoorSerials"), 'Verified JW serial must update device data');

assert(photos.includes("ocr_status: queuedPhoto.ocr_status || null"), 'Photo INSERT must persist OCR approval');
assert(photos.includes("ocr_checked_at: queuedPhoto.ocr_checked_at || null"), 'Photo INSERT must persist approval timestamp');
assert(jobsFetch.includes("ocr_status, ocr_checked_at"), 'Mobile reads must load verification status');
assert(actions.includes("String(serverPhoto.ocr_status || '').toLowerCase() === 'approved'"),
  'Save flow must confirm the approval reached the server');

assert(desktopAi.includes("jobId = ''"), 'Shared AI client must support optional job context without breaking desktop');
assert(aiApi.includes("'pracownik'"), 'Authenticated workers must be allowed to use the fallback endpoint');
assert(aiApi.includes("verifyNameplateJobAccess"), 'Worker AI use must be scoped to an accessible job');
assert(aiApi.includes("select=id,status"), 'Worker job access must be verified through the user-scoped Supabase REST query');

console.log('Smoke OK: mobile nameplates use local desktop reader -> AI fallback -> installer approval -> persisted OCR status');
