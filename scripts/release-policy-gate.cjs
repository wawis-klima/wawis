const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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
  return String(changelog.match(new RegExp(`^## ${escaped}\\r?\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm'))?.[1] || '').trim();
}


function readEvidence(args) {
  const index = args.indexOf('--evidence');
  const value = index >= 0 ? args[index + 1] : '';
  assert(value, 'NO-GO: --post wymaga --evidence <plik.json>');
  const evidencePath = path.resolve(root, value);
  assert(fs.existsSync(evidencePath), `NO-GO: brak pliku dowodowego ${value}`);
  return JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
}

function verifyEvidence(evidence, appVersion) {
  assert(String(evidence.version || '') === appVersion, `NO-GO: dowód post-deploy dotyczy ${evidence.version || 'brak'}, oczekiwano ${appVersion}`);
  assert(typeof evidence.checked_at === 'string' && evidence.checked_at.trim(), 'NO-GO: dowód post-deploy nie ma czasu kontroli');
  assert(typeof evidence.production_url === 'string' && /^https:\/\//.test(evidence.production_url), 'NO-GO: dowód post-deploy nie ma produkcyjnego URL');
  assert(evidence.production?.version_verified === true, 'NO-GO: produkcyjny app-version.json nie potwierdza wersji');
  assert(evidence.production?.service_worker_verified === true, 'NO-GO: produkcyjny Service Worker nie potwierdza cache wersji');
  assert(evidence.production?.app_version === appVersion, 'NO-GO: produkcyjny numer wersji różni się od release');
  assert(evidence.production?.service_worker_cache === `wawis-app-shell-v${appVersion}`, 'NO-GO: produkcyjny cache Service Workera ma złą wersję');
}

function main() {
  const args = process.argv.slice(2);
  const deployMode = args.includes('--deploy');
  const postMode = args.includes('--post');

  const appVersion = String(readJson('app-version.json').version || '').trim();
  const publicAppVersion = String(readJson('public/app-version.json').version || '').trim();
  const packageVersion = String(readJson('package.json').version || '').trim();
  const srcVersion = extractSourceVersion(read('src/version.js'));
  const mobileVersion = extractSourceVersion(read('src/mobile791/version.js'));
  const gate = readJson('RELEASE-GATE.json');
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');
  const rules = read('WAWIS-RULES.md');
  const checklist = read('RELEASE-CHECKLIST.md');
  const vercel = readJson('vercel.json');

  assert(appVersion === publicAppVersion, `NO-GO: public/app-version.json=${publicAppVersion || 'brak'}, oczekiwano ${appVersion}`);
  assert(appVersion === packageVersion, `NO-GO: package.json=${packageVersion}, oczekiwano ${appVersion}`);
  assert(appVersion === srcVersion, `NO-GO: src/version.js=${srcVersion || 'brak'}, oczekiwano ${appVersion}`);
  assert(appVersion === mobileVersion, `NO-GO: mobile version=${mobileVersion || 'brak'}, oczekiwano ${appVersion}`);
  assert(String(gate.version || '').trim() === appVersion, `NO-GO: RELEASE-GATE.json=${gate.version || 'brak'}, oczekiwano ${appVersion}`);
  assert(['mobile', 'desktop', 'full'].includes(gate.scope), `NO-GO: nieprawidłowy zakres ${gate.scope || 'brak'}`);
  assert(String(gate.release_branch || '') === `release/v${appVersion}`, `NO-GO: release_branch musi być release/v${appVersion}`);

  assert(rules.includes('GAŁĄŹ RELEASE'), 'NO-GO: WAWIS-RULES.md nie wymaga gałęzi release');
  assert(rules.includes('zielony deployment Vercela'), 'NO-GO: WAWIS-RULES.md nie wymaga zielonego deploymentu Vercela');
  assert(checklist.includes('WAWIS final release checks'), 'NO-GO: checklista nie wskazuje jednego finalnego workflow');
  assert(String(vercel.buildCommand || '').includes('release-policy-gate.cjs --deploy'), 'NO-GO: Vercel nie wymaga deploy gate');

  const readmeCurrent = extractReadmeCurrent(readme);
  const readmeLastFix = extractReadmeLastFix(readme);
  const lastFixBody = extractReadmeLastFixBody(readme);
  const changelogSection = getChangelogSection(changelog, appVersion);
  assert(readmeCurrent === appVersion, `NO-GO: README Aktualna wersja=${readmeCurrent || 'brak'}, oczekiwano ${appVersion}`);
  assert(readmeLastFix === appVersion, `NO-GO: README Ostatnia poprawka=${readmeLastFix || 'brak'}, oczekiwano ${appVersion}`);
  assert(lastFixBody && !/uzupełnij opis/i.test(lastFixBody), 'NO-GO: README ma placeholder aktualnej poprawki');
  assert(changelogSection && !/uzupełnij opis/i.test(changelogSection), 'NO-GO: CHANGELOG ma brak/placeholder aktualnej wersji');

  if (deployMode || postMode) {
    assert(gate.main_protection?.ready_for_main === true, 'NO-GO: release nie jest oznaczony jako gotowy do main');
    assert(String(gate.main_protection?.source_branch || '') === `release/v${appVersion}`, 'NO-GO: źródło wdrożenia nie jest właściwą gałęzią release');
    assert(typeof gate.main_protection?.final_release_run_id === 'string' && gate.main_protection.final_release_run_id.trim(), 'NO-GO: brak ID zielonego finalnego release run');
  }

  if (postMode) {
    verifyEvidence(readEvidence(args), appVersion);
  }

  const mode = postMode ? 'post-deploy' : deployMode ? 'deploy' : 'pre-release';
  console.log(`WAWIS RELEASE GATE: GO — ${appVersion} (${mode})`);
  if (gate.baseline_diagnostics || gate.predeploy_diagnostics || gate.postdeploy_diagnostics) {
    console.log('Diagnostyka jest informacyjna i nie bierze udziału w GO/NO-GO wydania.');
  }
}

try {
  main();
} catch (error) {
  console.error(`WAWIS RELEASE GATE: NO-GO — ${error.message}`);
  process.exit(1);
}
