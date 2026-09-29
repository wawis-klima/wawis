import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const mobilePreview = read('src', 'mobile791', 'components', 'modals', 'PreviewModal.jsx');
const mobileStyles = read('src', 'mobile791', 'styles.css');
const desktopPreview = read('src', 'components', 'modals', 'PreviewModal.jsx');

assert.match(mobilePreview, /MAX_SCALE = 4/);
assert.match(mobilePreview, /DOUBLE_TAP_SCALE = 2\.5/);
assert.match(mobilePreview, /matchMedia\("\(max-width: 700px\)"\)/);
assert.match(mobilePreview, /if \(!mobileZoomEnabled\)/);
assert.match(mobilePreview, /onPointerDown=\{handlePointerDown\}/);
assert.match(mobilePreview, /onPointerMove=\{handlePointerMove\}/);
assert.match(mobilePreview, /onDoubleClick=\{handleDoubleClick\}/);
assert.match(mobilePreview, /mobilePhotoZoomControls/);
assert.match(mobilePreview, /Pomniejsz zdjęcie/);
assert.match(mobilePreview, /Powiększ zdjęcie/);
assert.match(mobilePreview, /Przeciągnij zdjęcie/);
assert.match(mobilePreview, /scale\(\$\{scale\}\)/);

assert.match(mobileStyles, /@media\(max-width:700px\)\{[\s\S]*\.mobilePhotoZoomViewport\{/);
assert.match(mobileStyles, /touch-action:none !important/);
assert.match(mobileStyles, /\.mobilePhotoZoomViewport\.isZoomed \.previewClickZone/);
assert.match(mobileStyles, /\.mobilePhotoZoomControls\{/);
assert.match(mobileStyles, /\.mobilePhotoZoomImage\{/);

assert.doesNotMatch(desktopPreview, /mobilePhotoZoom/);
assert.doesNotMatch(desktopPreview, /MAX_SCALE = 4/);
assert.match(mobilePreview, /contentClassName="cleanPreviewModal previewModalSurface"[\s\S]*className="previewImageWrap"[\s\S]*onClick=\{previewPrev\}/);

console.log('11.80 mobile photo pinch zoom smoke OK; desktop preview unchanged');
