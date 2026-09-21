const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'src', 'mobile791', 'styles.css'), 'utf8');
const modal = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx'), 'utf8');

const guardMarker = styles.lastIndexOf('/* v9.81 — protokół musi pozostać zwykłym przewijanym formularzem.');
const lastLegacyGenericModalRule = styles.lastIndexOf('.photoModal,\n.modal{');

assert.ok(guardMarker > lastLegacyGenericModalRule, 'Ochrona protokołu musi występować po starych ogólnych regułach .modal.');
assert.match(styles.slice(guardMarker), /\.modal\.protocolTestModal\{[\s\S]*?display:block !important;/);
assert.match(styles.slice(guardMarker), /background:#fff !important;/);
assert.match(styles.slice(guardMarker), /overflow-y:auto !important;/);
assert.match(styles.slice(guardMarker), /-webkit-text-size-adjust:100% !important;/);
assert.match(styles.slice(guardMarker), /\.protocolTestSignatureCanvas\{[\s\S]*?height:170px !important;/);
assert.match(modal, /contentClassName="card modal protocolTestModal"/);
assert.match(modal, /overlayClassName="protocolTestOverlay"/);

console.log('OK: protokół ma własny układ odporny na stare globalne style modali zdjęć.');
