const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const spec = read('tests/e2e/release-visual-checks.spec.js');
const verifier = read('scripts/verify-visual-artifacts.cjs');
const releaseRunner = read('scripts/run-release.cjs');

assert(spec.includes('desktop-release-visual.png'), 'Brak obowiązkowego screenshota desktopowego.');
assert(spec.includes('mobile-release-visual.png'), 'Brak obowiązkowego screenshota mobilnego.');
assert(spec.includes('horizontalOverflow'), 'Test wyglądu nie sprawdza poziomego przepełnienia.');
assert(spec.includes('times new roman'), 'Test wyglądu nie wykrywa braku głównego CSS.');
assert(spec.includes('extremeText'), 'Test wyglądu nie kontroluje skrajnych rozmiarów tekstu.');
assert(verifier.includes('readPngSize'), 'Brak kontroli poprawności i wymiarów PNG.');
assert(releaseRunner.includes('test:e2e:desktop'), 'Desktopowy release nie uruchamia kontroli wyglądu.');
assert(releaseRunner.includes('test:smoke:visual-artifacts:desktop'), 'Desktopowy release nie wymaga screenshota.');
assert(releaseRunner.includes('test:e2e:mobile'), 'Mobilny release nie uruchamia kontroli wyglądu.');
assert(releaseRunner.includes('test:smoke:visual-artifacts:mobile'), 'Mobilny release nie wymaga screenshota.');

console.log('OK: release runner blokuje brak rzeczywistych screenshotów, przepełnienie, brak CSS i skrajne rozmiary tekstu.');
