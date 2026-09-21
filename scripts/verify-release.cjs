const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requireZip = process.argv.includes('--require-zip');
const allowNoBuild = process.argv.includes('--allow-no-build');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractSourceVersion(source) {
  return String(source.match(/APP_VERSION\s*=\s*['"]([0-9]+\.[0-9]{2})['"]/)?.[1] || '').trim();
}

function extractReadmeCurrent(readme) {
  return String(readme.match(/## Aktualna wersja\s*-\s*([0-9]+\.[0-9]{2})/m)?.[1] || '').trim();
}

function extractReadmeLastFix(readme) {
  return String(readme.match(/## Ostatnia poprawka\s*- wersja\s*`?([0-9]+\.[0-9]{2})`?/m)?.[1] || '').trim();
}

function extractReadmeLastFixBody(readme) {
  return String(readme.match(/## Ostatnia poprawka\s*- wersja\s*`?[0-9]+\.[0-9]{2}`?\s*[—-]\s*(.+)/m)?.[1] || '').trim();
}

function getChangelogSection(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^## ${escaped}\\r?\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm');
  return String(changelog.match(regex)?.[1] || '').trim();
}

function extractReleaseResultVersion(source) {
  return String(source.match(/## Wersja\s*-\s*([0-9]+\.[0-9]{2})/m)?.[1] || '').trim();
}

function verifyDist() {
  const distPath = path.join(root, 'dist');
  if (!fs.existsSync(distPath)) {
    assert(allowNoBuild, 'Brak katalogu dist po buildzie');
    return;
  }
  assert(fs.statSync(distPath).isDirectory(), 'dist istnieje, ale nie jest katalogiem');
  assert(fs.existsSync(path.join(distPath, 'index.html')), 'Brak dist/index.html');
  const assetsPath = path.join(distPath, 'assets');
  assert(fs.existsSync(assetsPath) && fs.statSync(assetsPath).isDirectory(), 'Brak dist/assets');
  assert(fs.readdirSync(assetsPath).length > 0, 'dist/assets jest pusty');
}

const appVersion = String(readJson('app-version.json').version || '').trim();
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const packageVersion = String(packageJson.version || '').trim();
const lockVersion = String(packageLock.version || '').trim();
const lockRootVersion = String(packageLock.packages?.['']?.version || '').trim();
const srcVersion = extractSourceVersion(read('src/version.js'));
const mobileVersion = extractSourceVersion(read('src/mobile791/version.js'));
const readme = read('README.md');
const changelog = read('CHANGELOG.md');
const releaseResult = read('RELEASE-RESULT.md');
const gate = readJson('RELEASE-GATE.json');

assert(appVersion, 'Brak wersji w app-version.json');
assert(packageVersion === appVersion, `package.json=${packageVersion}, oczekiwano ${appVersion}`);
assert(lockVersion === appVersion, `package-lock.json=${lockVersion}, oczekiwano ${appVersion}`);
assert(lockRootVersion === appVersion, `package-lock root=${lockRootVersion}, oczekiwano ${appVersion}`);
assert(srcVersion === appVersion, `src/version.js=${srcVersion || 'brak'}, oczekiwano ${appVersion}`);
assert(mobileVersion === appVersion, `src/mobile791/version.js=${mobileVersion || 'brak'}, oczekiwano ${appVersion}`);

const readmeCurrent = extractReadmeCurrent(readme);
const readmeLastFix = extractReadmeLastFix(readme);
const lastFixBody = extractReadmeLastFixBody(readme);
const changelogSection = getChangelogSection(changelog, appVersion);
assert(readmeCurrent === appVersion, `README Aktualna wersja=${readmeCurrent || 'brak'}, oczekiwano ${appVersion}`);
assert(readmeLastFix === appVersion, `README Ostatnia poprawka=${readmeLastFix || 'brak'}, oczekiwano ${appVersion}`);
assert(lastFixBody && !/uzupełnij opis/i.test(lastFixBody), 'README ma placeholder aktualnej poprawki');
assert(changelogSection, `Brak sekcji ${appVersion} w CHANGELOG.md`);
assert(!/uzupełnij opis/i.test(changelogSection), 'CHANGELOG ma placeholder aktualnej wersji');

const releaseResultVersion = extractReleaseResultVersion(releaseResult);
assert(releaseResultVersion === appVersion, `RELEASE-RESULT.md=${releaseResultVersion || 'brak'}, oczekiwano ${appVersion}`);
assert(String(gate.version || '').trim() === appVersion, `RELEASE-GATE.json=${gate.version || 'brak'}, oczekiwano ${appVersion}`);
assert(['mobile', 'desktop', 'full'].includes(gate.scope), `Nieprawidłowy zakres RELEASE-GATE: ${gate.scope || 'brak'}`);

// Diagnostyka jest informacyjna. Jej wynik nie jest częścią GO/NO-GO release.
// Twarda weryfikacja pozostaje na spójności wersji, testach, buildzie, ZIP-ie,
// backupie oraz live-checku app-version + Service Workera.
verifyDist();

if (requireZip) {
  const zipPath = path.join(root, 'releases', `klima-app-v${appVersion}.zip`);
  assert(fs.existsSync(zipPath), `Brak finalnego ZIP: releases/klima-app-v${appVersion}.zip`);
  assert(fs.statSync(zipPath).size > 0, `Finalny ZIP jest pusty: releases/klima-app-v${appVersion}.zip`);
}

console.log(`WAWIS verify-release GO — ${appVersion}${requireZip ? ' + ZIP' : ''}`);
