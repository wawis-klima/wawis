const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const versionDesktop = read('src/version.js');
const versionMobile = read('src/mobile791/version.js');
const currentVersion = JSON.parse(read('app-version.json')).version;
assert(versionDesktop.includes(`APP_VERSION = '${currentVersion}'`), `Desktop version must be ${currentVersion}`);
assert(versionMobile.includes(`APP_VERSION = '${currentVersion}'`), `Mobile version must be ${currentVersion}`);

const desktopApp = read('src/App.jsx');
const desktopHook = read('src/hooks/useSelectedJobActions.js');
const desktopModal = read('src/components/modals/JobFormModal.jsx');
const desktopDetails = read('src/components/JobDetailsPanel.jsx');
const desktopFormModule = read('src/modules/jobs-form.js');
const desktopPhotos = read('src/modules/photos.js');
const mobileDetails = read('src/mobile791/components/JobDetailsPanel.jsx');

assert(desktopApp.includes('serialOnlyMode'), 'Desktop app must carry serialOnlyMode');
assert(desktopApp.includes('openSerialNumbersJob={openSerialNumbersJob}'), 'Desktop details must receive device/nameplate action');
assert(desktopHook.includes('function openSerialNumbersJob(job)'), 'Desktop must expose dedicated device/nameplate editor');
assert(desktopHook.includes('saveJobDeviceSerialsRecord'), 'Desktop serial-only flow must save device fields only');
assert(desktopHook.includes('uploadJobDocumentationPhotos'), 'Desktop serial-only flow must upload nameplates');
assert(desktopModal.includes('MobileDeviceWizard'), 'Desktop must reuse the proven device wizard');
assert(desktopModal.includes('pending_nameplate_photos'), 'Desktop form must carry pending nameplate photos');
assert(desktopModal.includes('existingPhotos={existingNameplatePhotos}'), 'Desktop wizard must preserve existing nameplates');
assert(desktopDetails.includes('Dodaj / edytuj urządzenia i tabliczki'), 'Desktop details need a clear device action');
assert(desktopFormModule.includes('existing_nameplate_photos: getExistingNameplatePhotos(job)'), 'Desktop edit form must load existing nameplates');
assert(desktopPhotos.includes('NAMEPLATE_PHOTO_FOLDER'), 'Desktop uploads must store nameplates in nameplates folder');
assert(desktopPhotos.includes('uploadJobDocumentationPhotos'), 'Desktop must provide nameplate uploader');

assert(mobileDetails.includes("{isAdmin ? 'Urządzenia' : 'Tabliczki'}"), 'Mobile admin must get an Urządzenia action');
assert(mobileDetails.includes('onClick={() => openSerialNumbersJob(selectedJob)}'), 'Mobile admin action must open the existing wizard');
assert(!mobileDetails.includes('canEditSelectedJob && !isAdmin'), 'Mobile device action must no longer exclude admin');

console.log(`Smoke OK: v${currentVersion} preserves admin device/nameplate entry on desktop and mobile`);
