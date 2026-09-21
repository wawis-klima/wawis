const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const desktopModal = read('src', 'components', 'modals', 'JobFormModal.jsx');
const mobileModal = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
const wizard = read('src', 'mobile791', 'components', 'devices', 'MobileDeviceWizard.jsx');
const desktopStyles = read('src', 'styles.css');
const mobileStyles = read('src', 'mobile791', 'styles.css');
const e2e = read('tests', 'e2e', 'desktop-device-wizard-polish.spec.js');

assert.match(desktopModal, /desktopAdminDeviceWizardModal/);
assert.match(desktopModal, /submitLabel="Zapisz urządzenia"/);
assert.doesNotMatch(mobileModal, /submitLabel="Zapisz urządzenia"/);
assert.match(wizard, /submitLabel = 'Zapisz montaż'/);
assert.match(wizard, /busy \? 'Zapisuję…' : submitLabel/);

assert.match(desktopStyles, /v9\.35: wąski, neutralny kreator premium urządzeń administratora/);
assert.match(desktopStyles, /@media\(min-width:901px\)[\s\S]*\.mobileDeviceWizardModal\.desktopAdminDeviceWizardModal/);
assert.match(desktopStyles, /\.mobileDeviceWizardModal\.desktopAdminDeviceWizardModal\{[\s\S]*width:min\(540px,[\s\S]*border-radius:18px/);
assert.match(desktopStyles, /\.desktopAdminDeviceWizardModal \.mobileDeviceWizard\{[\s\S]*width:100%;[\s\S]*min-height:0;/);
assert.match(desktopStyles, /\.desktopAdminDeviceWizardModal \.mobileDeviceWizardBody\{[\s\S]*align-content:start;[\s\S]*grid-auto-rows:max-content;[\s\S]*width:100%;/);
assert.match(desktopStyles, /\.desktopAdminDeviceWizardModal \.mobileDeviceAddAnother\{[\s\S]*min-height:40px;/);
assert.match(desktopStyles, /\.desktopAdminDeviceWizardModal \.mobileDeviceOverviewOpen\{[\s\S]*min-height:78px;/);
assert.match(desktopStyles, /\.desktopAdminDeviceWizardModal \.mobileDeviceWizardFooter \.btn\{[\s\S]*background:#252d3a !important;[\s\S]*color:#fff !important;/);
assert.doesNotMatch(mobileStyles, /v9\.35: wąski, neutralny kreator premium/);

assert.match(e2e, /width\)\.toBeLessThan\(570\)/);
assert.match(e2e, /sideGutters\)\.toBeLessThan\(46\)/);
assert.match(e2e, /name: 'Zapisz urządzenia'/);
assert.match(e2e, /saveBackground\)\.toBe\('rgb\(37, 45, 58\)'\)/);

console.log('OK: desktopowy kreator urządzeń ma wąski, neutralny wygląd premium bez szerokich bocznych pasów.');
