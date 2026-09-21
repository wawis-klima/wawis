const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mobileCssPath = path.join(root, 'src/mobile791/v1100-mobile-details-compact.css');
const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  mainSource.includes("await import('./mobile791/v1100-mobile-details-compact.css')"),
  'Production mobile bootstrap must load the compact details stylesheet',
);
assert(
  mainSource.indexOf('v1100-mobile-details-compact.css') > mainSource.indexOf('v1092-inline-width.css'),
  'Compact details stylesheet must load after the mobile width guards',
);
assert(
  mobileCss.includes('.mobileInlineJobDetails .emailLink')
    && mobileCss.includes('white-space: nowrap !important;'),
  'Email, phone and address values must remain on one line',
);
assert(
  mobileCss.includes('.jobDeviceDocumentationToggle > .jobDeviceDocumentationType')
    && mobileCss.includes('flex-wrap: nowrap !important;'),
  'Device name and Single-split badge must remain in one row',
);
assert(
  mobileCss.includes('min-height: 44px !important;'),
  'Compact rows must preserve usable touch targets',
);
assert(
  mobileCss.includes('.mobileInlineJobDetails .textarea')
    && mobileCss.includes('min-height: 72px !important;'),
  'Empty comment field must use the compact height',
);

console.log('Smoke OK: mobile job details are compact without wrapping key rows');
