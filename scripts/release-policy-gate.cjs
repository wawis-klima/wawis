const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const DRIVE_RELEASE_FOLDER_ID = '1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S';
const DRIVE_RELEASE_FOLDER_PATH = 'Aplikacja/Wersje';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d{2})$/);
  assert(match, `Nieprawidłowy numer wersji: ${value || 'brak'}`);
  return [Number(match[1]), Number(match[2])];
}

function gteVersion(a, b) {
  const [aMajor, aMinor] = parseVersion(a);
  const [bMajor, bMinor] = parseVersion(b);
  return aMajor > bMajor || (aMajor === bMajor && aMinor >= bMinor);
}

function extractSourceVersion(source) {
  const match = source.match(/APP_VERSION\s*=\s*['"]([0-9]+\.[0-9]{2})['"]/);
  return String(match?.[1] || '').trim();
}

function extractReadmeCurrent(readme) {
  const match = readme.match(/## Aktualna wersja\s*-\s*([0-9]+\.[0-9]{2})/m);
  return String(match?.[1] || '').trim();
}

function extractReadmeLastFix(readme) {
  const match = readme.match(/## Ostatnia poprawka\s*- wersja\s*`?([0-9]+\.[0-9]{2})`?/m);
  return String(match?.[1] || '').trim();
}

function extractReadmeLastFixBody(readme) {
  const match = readme.match(/## Ostatnia poprawka\s*- wersja\s*`?[0-9]+\.[0-9]{2}`?\s*[—-]\s*(.+)/m);
  return String(match?.[1] || '').trim();
}

function getChangelogSection(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^## ${escaped}\\r?\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm');
  return String(changelog.match(regex)?.[1] || '').trim();
}

function validDiagnosticCheck(entry) {
  return Boolean(
    entry &&
    entry.checked === true &&
    entry.last_24h === true &&
    typeof entry.checked_at === 'string' &&
    entry.checked_at.trim() &&
    entry.result === 'GO'
  );
}

function validDriveBackup(entry, appVersion) {
  const expectedName = `klima-app-v${appVersion}.zip`;
  return Boolean(
    entry &&
    entry.required === true &&
    entry.folder_id === DRIVE_RELEASE_FOLDER_ID &&
    entry.folder_path === DRIVE_RELEASE_FOLDER_PATH &&
    entry.file_name === expectedName &&
    typeof entry.file_id === 'string' &&
    entry.file_id.trim() &&
    Number(entry.size_bytes) > 0 &&
    entry.uploaded === true &&
    typeof entry.uploaded_at === 'string' &&
    entry.uploaded_at.trim() &&
    entry.verified === true
  );
}

function main() {
  const postMode = process.argv.includes('--post');
  const appVersion = String(readJson('app-version.json').version || '').trim();
  const packageVersion = String(readJson('package.json').version || '').trim();
  const srcVersion = extractSourceVersion(read('src/version.js'));
  const mobileVersion = extractSourceVersion(read('src/mobile791/version.js'));
  const rules = read('WAWIS-RULES.md');
  const checklist = read('RELEASE-CHECKLIST.md');
  const runRelease = read('scripts/run-release.cjs');
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');
  const gate = readJson('RELEASE-GATE.json');
  const vercel = readJson('vercel.json');
  const workflow = read('.github/workflows/release-policy-gate.yml');

  assert(appVersion === packageVersion, `NO-GO: app-version.json=${appVersion}, package.json=${packageVersion}`);
  assert(appVersion === srcVersion, `NO-GO: src/version.js=${srcVersion || 'brak'}, oczekiwano ${appVersion}`);
  assert(appVersion === mobileVersion, `NO-GO: mobile version=${mobileVersion || 'brak'}, oczekiwano ${appVersion}`);
  assert(String(gate.version || '').trim() === appVersion, `NO-GO: RELEASE-GATE.json dotyczy ${gate.version || 'brak'}, a aplikacja ma ${appVersion}`);

  assert(rules.includes('Diagnostyka jest obowiązkową częścią wydania'), 'NO-GO: WAWIS-RULES.md nie zawiera obowiązkowej diagnostyki');
  assert(rules.includes('GO / NO-GO'), 'NO-GO: WAWIS-RULES.md nie zawiera bramki GO/NO-GO');
  assert(rules.includes('POST-DEPLOY DIAGNOSTICS'), 'NO-GO: WAWIS-RULES.md nie zawiera kontroli po wdrożeniu');
  assert(rules.includes('Aplikacja/Wersje'), 'NO-GO: WAWIS-RULES.md nie zawiera obowiązkowej kopii ZIP na Google Drive');
  assert(checklist.includes('test:smoke:diagnostic-report'), 'NO-GO: RELEASE-CHECKLIST.md nie pilnuje raportu diagnostycznego');
  assert(runRelease.includes('test:smoke:diagnostics-clarity'), 'NO-GO: runner wydania nie uruchamia kontroli czytelności diagnostyki');
  assert(String(vercel.buildCommand || '').includes('node scripts/release-policy-gate.cjs'), 'NO-GO: Vercel build nie uruchamia release-policy-gate');
  assert(workflow.includes('node scripts/release-policy-gate.cjs'), 'NO-GO: GitHub Actions nie uruchamia release-policy-gate');

  const driveBackup = gate.drive_backup || {};
  assert(driveBackup.required === true, 'NO-GO: RELEASE-GATE.json nie wymaga kopii ZIP na Google Drive');
  assert(driveBackup.folder_id === DRIVE_RELEASE_FOLDER_ID, 'NO-GO: nieprawidłowy folder Google Drive dla kopii wydania');
  assert(driveBackup.folder_path === DRIVE_RELEASE_FOLDER_PATH, 'NO-GO: nieprawidłowa ścieżka Google Drive dla kopii wydania');

  const enforceFrom = String(gate.policy_enforced_from || '10.60').trim();
  if (gteVersion(appVersion, enforceFrom)) {
    assert(['mobile', 'desktop', 'full'].includes(gate.scope), `NO-GO: zakres wydania musi być mobile/desktop/full, jest ${gate.scope || 'brak'}`);
    assert(validDiagnosticCheck(gate.baseline_diagnostics), 'NO-GO: brak potwierdzonej diagnostyki 24h przed rozpoczęciem zmian');
    assert(validDiagnosticCheck(gate.predeploy_diagnostics), 'NO-GO: brak potwierdzonej diagnostyki 24h przed wdrożeniem');

    const readmeCurrent = extractReadmeCurrent(readme);
    const readmeLastFix = extractReadmeLastFix(readme);
    const lastFixBody = extractReadmeLastFixBody(readme);
    const changelogSection = getChangelogSection(changelog, appVersion);

    assert(readmeCurrent === appVersion, `NO-GO: README Aktualna wersja=${readmeCurrent || 'brak'}, oczekiwano ${appVersion}`);
    assert(readmeLastFix === appVersion, `NO-GO: README Ostatnia poprawka=${readmeLastFix || 'brak'}, oczekiwano ${appVersion}`);
    assert(lastFixBody && !/uzupełnij opis/i.test(lastFixBody), 'NO-GO: README nadal ma placeholder opisu aktualnej poprawki');
    assert(changelogSection, `NO-GO: brak sekcji ${appVersion} w CHANGELOG.md`);
    assert(!/uzupełnij opis/i.test(changelogSection), 'NO-GO: CHANGELOG nadal ma placeholder opisu aktualnej wersji');
  }

  if (postMode && gteVersion(appVersion, enforceFrom)) {
    const post = gate.postdeploy_diagnostics || {};
    assert(validDiagnosticCheck(post), 'NO-GO: brak potwierdzonej diagnostyki 24h po wdrożeniu');
    assert(post.production_version_verified === true, 'NO-GO: nie potwierdzono numeru wersji na produkcji');
    assert(post.service_worker_verified === true, 'NO-GO: nie potwierdzono Service Workera/cache na produkcji');
    assert(validDriveBackup(driveBackup, appVersion), `NO-GO: brak zweryfikowanej paczki klima-app-v${appVersion}.zip w Google Drive Aplikacja/Wersje`);
  }

  console.log(`WAWIS RELEASE GATE: GO — ${appVersion}${postMode ? ' (post-deploy)' : ' (pre-deploy)'}`);
}

try {
  main();
} catch (error) {
  console.error(`WAWIS RELEASE GATE: NO-GO — ${error.message}`);
  process.exit(1);
}
