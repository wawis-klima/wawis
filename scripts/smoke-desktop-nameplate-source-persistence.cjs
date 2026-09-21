const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(path.join(root, 'src/components/desktop/DesktopNameplateOcrButton.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

assert(component.includes("const activeSourceUrlRef = useRef('');"), 'Missing stable source URL snapshot');
assert(component.includes('const photoIdentity = useMemo(() => String('), 'Missing stable photo identity');
assert(component.includes('}, [photoIdentity]);'), 'Workspace reset must depend on photo identity, not expiring signed URL');
assert(!component.includes("setPreviewUrl('');\n  }, [photoSourceUrl]);"), 'Expiring signed URL still clears the visible photo');
assert(component.includes('if (!open && photoSourceUrl) activeSourceUrlRef.current = photoSourceUrl;'), 'Latest signed URL is not refreshed safely while modal is closed');
assert(component.includes('activeSourceUrlRef.current = photoSourceUrl || activeSourceUrlRef.current;'), 'Opening the modal does not snapshot the active source URL');
assert(component.includes('let sourceUrl = activeSourceUrlRef.current || photoSourceUrl;'), 'Photo fetch does not use the stable source snapshot');

assert(component.includes('if (result.serialNumber) {'), 'Barcode serial must be committed directly from the trusted summary');
assert(component.includes('setSerialNumber(result.serialNumber);'), 'Trusted barcode serial is not written to the form');
assert(!component.includes('.filter((value) => value && value !== result.ean'), 'UI must not recreate a raw-detection serial fallback');
assert(component.includes('desktopNameplateOcrPreviewFallback'), 'Missing visible fallback when preview cannot render');
assert(styles.includes('.desktopNameplateOcrPreviewFallback{'), 'Missing preview fallback styling');

console.log('Smoke OK: signed URL refresh cannot clear nameplate photo or cancel serial/model assignment');
