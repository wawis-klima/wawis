const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const capture = read('src', 'mobile791', 'components', 'nameplate', 'NameplatePhotoCapture.jsx');
const captureCss = read('src', 'mobile791', 'components', 'nameplate', 'nameplate-photo-capture.css');
const mobileCss = read('src', 'mobile791', 'styles.css');
const desktopCss = read('src', 'styles.css');
const desktopDetails = read('src', 'components', 'JobDetailsPanel.jsx');
const desktopDeviceCards = read('src', 'components', 'desktop', 'DesktopJobDeviceCards.jsx');
const mobilePhotos = read('src', 'mobile791', 'modules', 'photos.js');

for (const css of [mobileCss, desktopCss]) {
  assert.doesNotMatch(css, /\.photoModal img,\s*\n\.modal img,\s*\nimg\s*\{/,
    'Globalny selektor img nie może zmieniać rozmiaru obrazu kadrowania');
  assert.match(css, /previewImageWrap[\s\S]*fullPreview[\s\S]*object-fit:\s*contain\s*!important/,
    'Pełny podgląd musi pokazywać całe zdjęcie');
}

assert.match(capture, /imageWrapRef/);
assert.match(capture, /displayRect/);
assert.match(capture, /imageBounds\.left - wrapBounds\.left/);
assert.match(capture, /crop\.x \* \(displayRect\?\.width/);
assert.match(capture, /ResizeObserver/);
assert.match(captureCss, /nameplateCropImageWrap > img[\s\S]*width:\s*auto\s*!important/);
assert.match(captureCss, /nameplateCapturePreview img[\s\S]*object-fit:\s*contain\s*!important/);

assert.match(desktopDetails, /isNameplatePhoto/);
assert.match(desktopDetails, /installationPhotos[\s\S]*!isNameplatePhoto/, 'Tabliczki nie powinny być dublowane w galerii zdjęć montażu');
assert.match(desktopDeviceCards, /desktopDeviceNameplateOpen/);
assert.match(desktopDeviceCards, /Otwórz/);
assert.match(desktopCss, /desktopDeviceNameplateOpen[\s\S]*background:\s*#eff6ff/);

assert.match(mobilePhotos, /export async function prepareNameplatePhotoForUpload/);
assert.match(mobilePhotos, /skippedReason:\s*'nameplate-already-cropped'/,
  'Wykadrowana tabliczka nie może być ponownie kompresowana z jakością zwykłego zdjęcia');
assert.match(mobilePhotos, /uploadJobDocumentationPhotos[\s\S]*compressImageFn = prepareNameplatePhotoForUpload/,
  'Upload tabliczki powinien zachować jakość wykadrowanego pliku');

console.log('Nameplate rendering smoke OK: crop overlay matches rendered image, previews use contain, desktop nameplates open from their JZ/JW row, upload preserves cropped-label quality');
