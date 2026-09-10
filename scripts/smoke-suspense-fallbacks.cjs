const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const jobsPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobsPanel.jsx'), 'utf8');

assert.match(appSource, /const SmsPanel = lazy\(\(\) => import\("\.\/components\/sms\/SmsPanel\.jsx"\)\);/);
assert.match(appSource, /const ContractorsPanel = lazy\(\(\) => import\("\.\/components\/contractors\/ContractorsPanel\.jsx"\)\);/);
assert.match(appSource, /const DevicesPanel = lazy\(\(\) => import\("\.\/components\/devices\/DevicesPanel\.jsx"\)\);/);
assert.match(appSource, /const CalendarPanel = lazy\(\(\) => import\("\.\/components\/calendar\/CalendarPanel\.jsx"\)\);/);
assert.match(appSource, /const JobDetailsPanel = lazy\(\(\) => import\("\.\/components\/JobDetailsPanel\.jsx"\)\);/);
assert.match(appSource, /const JobFormModal = lazy\(\(\) => import\("\.\/components\/modals\/JobFormModal\.jsx"\)\);/);
assert.match(appSource, /const adminModuleFallback = \(/);
assert.match(appSource, /Trwa ładowanie modułu administratora\.\.\./);
assert.match(appSource, /<Suspense fallback=\{adminModuleFallback\}>/);
assert.match(appSource, /const jobDetailsFallback = \(/);
assert.match(appSource, /Trwa ładowanie szczegółów montażu\.\.\./);
assert.match(appSource, /const jobFormModalFallback = \(/);
assert.match(appSource, /Trwa ładowanie formularza montażu\.\.\./);
assert.match(appSource, /detailsPanel=\{activeModule === "jobs" && selectedJob \? \(/);
assert.match(appSource, /<Suspense fallback=\{jobDetailsFallback\}>/);
assert.match(appSource, /<JobDetailsPanel/);
assert.match(appSource, /<Suspense fallback=\{showModal \? jobFormModalFallback : null\}>/);
assert.match(appSource, /<JobFormModal/);

assert.match(jobsPanelSource, /const jobsLayoutFallback = \(/);
assert.match(jobsPanelSource, /Trwa ładowanie widoku montaży\.\.\./);
assert.match(jobsPanelSource, /<Suspense fallback=\{jobsLayoutFallback\}>/);
assert.match(jobsPanelSource, /isMobile \? <MobileJobsLayout \{\.\.\.props\} \/> : <DesktopJobsLayout \{\.\.\.props\} \/>/);

console.log('Suspense fallback smoke OK');
process.exit(0);
