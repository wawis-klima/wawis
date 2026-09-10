const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const mobileLayoutPath = 'src/components/jobs/MobileJobsLayout.jsx';
const desktopLayoutPath = 'src/components/jobs/DesktopJobsLayout.jsx';
const jobsPanelPath = 'src/components/JobsPanel.jsx';
const appPath = 'src/App.jsx';
const appLayoutPath = 'src/components/layout/AppAuthenticatedLayout.jsx';
const stylesPath = 'src/styles.css';

const mobileLayoutSource = readProjectFile(mobileLayoutPath);
const desktopLayoutSource = readProjectFile(desktopLayoutPath);
const jobsPanelSource = readProjectFile(jobsPanelPath);
const appSource = readProjectFile(appPath);
const appLayoutSource = readProjectFile(appLayoutPath);
const stylesSource = readProjectFile(stylesPath);

// Guard desktop-only releases: the current mobile jobs layout must stay byte-for-byte stable.
// When we intentionally work on mobile, this hash must be updated together with the mobile change description.
const expectedMobileLayoutHash = 'a68127d2796c2708e7191865035c9c0938fe75e5fe2242da98e0e28fffe00f15';
assert.equal(
  sha256(mobileLayoutSource),
  expectedMobileLayoutHash,
  `${mobileLayoutPath} changed during a desktop-only release. Review the mobile view before releasing.`
);

// Desktop and mobile layouts must remain split, so desktop work does not silently leak into mobile JSX.
assert.match(jobsPanelSource, /const MobileJobsLayout\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/jobs\/MobileJobsLayout\.jsx"\)\)/);
assert.match(jobsPanelSource, /const DesktopJobsLayout\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/jobs\/DesktopJobsLayout\.jsx"\)\)/);
assert.match(jobsPanelSource, /isMobile\s*\?\s*<MobileJobsLayout \{\.\.\.props\} \/>\s*:\s*<DesktopJobsLayout \{\.\.\.props\} \/>/);
assert.doesNotMatch(desktopLayoutSource, /MobileJobsLayout|mobileHeaderV2|mobileJobCard|mobileFilterBox|mobileUserBox/);

// Keep the known mobile CSS hooks present; desktop-only work must not remove the mobile entry points.
assert.match(stylesSource, /\.mobileHeaderV2\s*\{/);
assert.match(stylesSource, /\.mobileHeaderTop\s*\{/);
assert.match(stylesSource, /\.mobileHeaderBottom\s*\{/);
assert.match(stylesSource, /\.mobileFilterBox\s*,\s*\n\.mobileUserBox\s*\{/);
assert.match(stylesSource, /\.mobileActionBtn\s*\{/);

// Role/device policy for the maintained desktop release:
// - worker: phone only, blocked on desktop/tablet-like devices,
// - administrator: allowed on both desktop shell and mobile layout.
assert.match(appSource, /function EmployeeMobileOnlyBlock/);
assert.match(appSource, /const isWorker\s*=\s*profile\?\.role\s*===\s*["']Pracownik["']/);
assert.match(appSource, /const shouldBlockWorkerDesktop\s*=\s*isWorker\s*&&\s*\(!isMobile\s*\|\|\s*!isProbablyPhoneDevice\)/);
assert.match(appSource, /if \(shouldBlockWorkerDesktop\)\s*\{\s*return <EmployeeMobileOnlyBlock profile=\{profile\} logout=\{logout\} \/>;\s*\}/);
assert.match(appLayoutSource, /if \(!isMobile\s*&&\s*isAdmin\)\s*\{/);
assert.match(appLayoutSource, /\{isAdmin\s*&&\s*isMobile\s*\?\s*\(/);
assert.doesNotMatch(appLayoutSource, /!isAdmin\s*&&\s*!isMobile/);

console.log('Desktop-only mobile guard smoke OK');
process.exit(0);
