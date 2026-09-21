const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'src', 'mobile791', 'styles.css'), 'utf8');
const modal = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx'), 'utf8');

const guardMarker = styles.lastIndexOf('/* v9.82 — protokół jest całkowicie odłączony od ogólnej klasy .modal.');
const lastLegacyGenericModalRule = styles.lastIndexOf('.photoModal,\n.modal{');
const isolatedStyles = styles.slice(guardMarker);

assert.ok(guardMarker > lastLegacyGenericModalRule, 'Ochrona protokołu musi występować po starych ogólnych regułach .modal.');
assert.match(modal, /contentClassName="protocolTestModal protocolDialogV982"/);
assert.doesNotMatch(modal, /contentClassName="[^"]*\bmodal\b/, 'Protokół nie może używać ogólnej klasy modal.');
assert.match(modal, /WERSJA TESTOWA · \{APP_VERSION\}/);
assert.match(isolatedStyles, /\.protocolTestModal\.protocolDialogV982\{[\s\S]*?display:block !important;/);
assert.match(isolatedStyles, /background:#fff !important;/);
assert.match(isolatedStyles, /overflow-y:auto !important;/);
assert.match(isolatedStyles, /-webkit-text-size-adjust:100% !important;/);
assert.match(isolatedStyles, /\.protocolTestSignatureCanvas\{[\s\S]*?height:170px !important;/);
assert.doesNotMatch(isolatedStyles, /\.modal\.protocolTestModal/, 'Końcowe style nie mogą zależeć od klasy modal.');

console.log('OK: protokół jest odizolowany od starych globalnych stylów modali zdjęć.');
