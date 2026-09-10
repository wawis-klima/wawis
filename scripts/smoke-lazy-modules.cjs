const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const jobsPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobsPanel.jsx'), 'utf8');
const contractorsPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'contractors', 'ContractorsPanel.jsx'), 'utf8');
const devicesPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'devices', 'DevicesPanel.jsx'), 'utf8');
const moduleSwitcherSource = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'ModuleSwitcher.jsx'), 'utf8');
const authenticatedLayoutSource = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'AppAuthenticatedLayout.jsx'), 'utf8');

assert.match(appSource, /const SmsPanel = lazy\(\(\) => import\("\.\/components\/sms\/SmsPanel\.jsx"\)\);/);
assert.match(appSource, /const ContractorsPanel = lazy\(\(\) => import\("\.\/components\/contractors\/ContractorsPanel\.jsx"\)\);/);
assert.match(appSource, /const DevicesPanel = lazy\(\(\) => import\("\.\/components\/devices\/DevicesPanel\.jsx"\)\);/);
assert.match(appSource, /const CalendarPanel = lazy\(\(\) => import\("\.\/components\/calendar\/CalendarPanel\.jsx"\)\);/);
assert.match(appSource, /const Centrum360Panel = lazy\(\(\) => import\("\.\/components\/dashboard\/Centrum360Panel\.jsx"\)\);/);
assert.match(appSource, /const DiagnosticsPanel = lazy\(\(\) => import\("\.\/components\/diagnostics\/DiagnosticsPanel\.jsx"\)\);/);
assert.doesNotMatch(appSource, /import SmsPanel from "\.\/components\/sms\/SmsPanel\.jsx";/);
assert.doesNotMatch(appSource, /import ContractorsPanel from "\.\/components\/contractors\/ContractorsPanel\.jsx";/);
assert.doesNotMatch(appSource, /import DevicesPanel from "\.\/components\/devices\/DevicesPanel\.jsx";/);
assert.doesNotMatch(appSource, /import CalendarPanel from "\.\/components\/calendar\/CalendarPanel\.jsx";/);
assert.match(appSource, /<Suspense fallback=\{adminModuleFallback\}>/);
assert.match(appSource, /activeModule === "contractors"/);
assert.match(appSource, /activeModule === "devices"/);
assert.match(appSource, /activeModule === "calendar"/);
assert.match(appSource, /<SmsPanel/);
assert.match(authenticatedLayoutSource, /\["center360", "sms", "contractors", "devices", "calendar", "diagnostics"\]\.includes\(activeModule\)/);

assert.match(jobsPanelSource, /const MobileJobsLayout = lazy\(\(\) => import\("\.\/jobs\/MobileJobsLayout\.jsx"\)\);/);
assert.match(jobsPanelSource, /const DesktopJobsLayout = lazy\(\(\) => import\("\.\/jobs\/DesktopJobsLayout\.jsx"\)\);/);
assert.match(jobsPanelSource, /<Suspense fallback=\{jobsLayoutFallback\}>/);
assert.match(jobsPanelSource, /Trwa ładowanie widoku montaży/);

assert.match(moduleSwitcherSource, /module\.id === "devices" && !isAdmin \? null/);
assert.match(moduleSwitcherSource, /!\["sms", "contractors"\]\.includes\(module\.id\) \|\| isAdmin/);

assert.match(contractorsPanelSource, /await loadContractorsXlsxImportModule\(\)/);
assert.match(contractorsPanelSource, /await loadContractorsXlsxExportModule\(\)/);
assert.doesNotMatch(contractorsPanelSource, /import \{ parseXlsxContractorsFile \}/);
assert.doesNotMatch(contractorsPanelSource, /import \{ exportContractorsToXlsx, triggerBlobDownload \}/);

assert.match(devicesPanelSource, /await loadDevicesXlsxImportModule\(\)/);
assert.doesNotMatch(devicesPanelSource, /import \{ parseXlsxDevicesFile \}/);

console.log('Lazy loading smoke OK');
process.exit(0);
