const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const card = read('src', 'components', 'desktop', 'DesktopJobProtocolCard.jsx');
const details = read('src', 'components', 'JobDetailsPanel.jsx');
const storage = read('src', 'mobile791', 'modules', 'job-protocol-storage.js');
const styles = read('src', 'styles.css');

assert.match(details, /isAdmin && isCompletedJob \? <DesktopJobProtocolCard/);
assert.match(card, /data-desktop-protocol="9\.96"/);
assert.match(card, /loadJobProtocolRecord/);
assert.match(card, /getStoredJobProtocolBlob/);
assert.match(card, /printStoredJobProtocol/);
assert.match(card, /sendJobProtocolEmail/);
assert.match(card, /"Podgląd PDF"/);
assert.match(card, /"Drukuj"/);
assert.match(card, /"Wyślij klientowi"/);
assert.match(card, /JOB_PROTOCOL_EMAIL_SENDER/);
assert.match(card, /<iframe src=\{previewUrl\}/);
assert.match(storage, /export async function getStoredJobProtocolBlob/);
assert.match(storage, /export async function printStoredJobProtocol/);
assert.match(styles, /\.desktopJobProtocolPreviewModal\{/);

console.log('Desktop saved protocol smoke OK');
