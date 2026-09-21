const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const desktopHook = read('src', 'hooks', 'usePhotoPreview.js');
const mobileHook = read('src', 'mobile791', 'hooks', 'usePhotoPreview.js');
const desktopDetails = read('src', 'components', 'JobDetailsPanel.jsx');
const mobileDetails = read('src', 'mobile791', 'components', 'JobDetailsPanel.jsx');

assert.match(desktopHook, /function openPreview\(photoOrUrl, index = 0, galleryPhotos = null\)/, 'desktop: podgląd musi przyjmować konkretną galerię i obiekt zdjęcia');
assert.match(mobileHook, /function openPreview\(photoOrUrl, index = 0, galleryPhotos = null\)/, 'mobile: podgląd musi przyjmować konkretną galerię i obiekt zdjęcia');
for (const [label, source] of [['desktop', desktopHook], ['mobile', mobileHook]]) {
  assert.match(source, /const \[previewPhotos, setPreviewPhotos\] = useState\(\[\]\)/, `${label}: podgląd musi zapamiętywać aktywną galerię`);
  assert.match(source, /const gallery = previewPhotos\.length \? previewPhotos : getPreviewGallery\(selectedJob\?\.photos\)/, `${label}: strzałki muszą korzystać z aktywnej galerii`);
  assert.doesNotMatch(source, /selectedJob\.photos\[nextIndex\]/, `${label}: strzałki nie mogą wracać do pełnej listy zdjęć`);
}

assert.match(desktopDetails, /const installationPhotos = photos\.filter\(\(photo\) => !isNameplatePhoto\(photo\)\)/);
assert.match(desktopDetails, /const nameplatePhotos = photos\.filter\(\(photo\) => isNameplatePhoto\(photo\)\)/);
assert.match(desktopDetails, /openPreview\(photo, 0, nameplatePhotos\)/);
assert.match(desktopDetails, /openPreview\(photo, photoIndex, installationPhotos\)/);

assert.match(mobileDetails, /openPreview\(photo, photoIndex, previewPhotos\)/);
assert.match(mobileDetails, /previewPhotos=\{nameplatePhotos\}/);
assert.match(mobileDetails, /openPreview\(photo, index, regularPhotos\)/);
assert.match(mobileDetails, /photo\.thumbnail_image_url \|\| photo\.local_preview_url \|\| photo\.image_url \|\| photo\.signed_url \|\| photo\.original_image_url/);

console.log('OK: zdjęcia montażu i tabliczki znamionowe mają oddzielne galerie strzałek na desktopie i mobile.');
