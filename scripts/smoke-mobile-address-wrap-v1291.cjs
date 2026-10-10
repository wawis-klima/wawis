const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const jsx = read('src/mobile791/components/JobDetailsPanel.jsx');
const imports = read('src/mobile791/v1092-inline-width.css');
const css = read('src/mobile791/v1291-mobile-address-wrap.css');
const e2e = read('tests/e2e/mobile-v1104-contact-autofit.spec.js');

assert.match(imports, /@import '\.\/v1291-mobile-address-wrap\.css';/);
assert.match(jsx, /className="addressLink"/);
assert.doesNotMatch(jsx, /addressAutoFitRef|className="addressLink autoFitSingleLineText"/);
assert.match(jsx, /title="Kliknij, aby otworzyć adres w Google Maps"/);
assert.match(css, /contactAddressInfoItem\\.contactInfoItem|contactInfoItem\\.contactAddressInfoItem/);
for (const rule of [
  'grid-template-columns: 78px minmax(0, 1fr) !important;',
  'grid-template-rows: auto !important;',
  'justify-content: flex-end !important;',
  'text-align: right !important;',
  'max-height: none !important;',
  'height: auto !important;',
  'white-space: normal !important;',
  'text-overflow: clip !important;',
  'overflow-wrap: anywhere !important;',
  'overflow: visible !important;',
  'font-size: 13.5px !important;',
]) assert.ok(css.includes(rule), 'Brak ochrony: ' + rule);
assert.doesNotMatch(css, /contactEmailInfoItem|contactPhoneInfoItem|jobDateInfoItem/);
assert.match(e2e, /zawija długi adres po prawej od etykiety/);
assert.match(e2e, /Aleja Generała Władysława Sikorskiego 112a/);
assert.match(e2e, /toHaveCSS\('white-space', 'normal'\)/);
assert.match(e2e, /contactPhoneInfoItem/);
assert.match(e2e, /jobDateInfoItemV995/);
console.log('OK 12.93: mobile address right aligned + wrap + map link + isolation + E2E regression.');

require('node:child_process').execFileSync(process.execPath, ['scripts/smoke-mobile-customer-card-name-v1292.cjs'], { cwd: root, stdio: 'inherit' });
