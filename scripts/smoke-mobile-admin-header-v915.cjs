const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const layout = read('src', 'mobile791', 'components', 'jobs', 'MobileJobsLayout.jsx');
const css = read('src', 'mobile791', 'styles.css');
const jobsPanel = read('src', 'mobile791', 'components', 'JobsPanel.jsx');
const indexHtml = read('index.html');

assert.match(layout, /async function handleManualReload\(\)/, 'Mobile header must have an explicit sync handler.');
assert.match(layout, /await retryAllPhotoUploads\?\.\(\)/, 'Refresh icon must first flush persistent offline queues.');
assert.match(layout, /await refreshAll\?\.\(sessionUser, \{ preserveJobDetails: true \}\)/, 'Refresh icon must safely refresh data without destroying local details.');
assert.doesNotMatch(layout, /window\.location\.reload\(\)/, 'Offline-safe synchronization must not hard reload the page.');
assert.match(layout, /title="Synchronizuj dane"/, 'Refresh action must be labelled as data synchronization.');
assert.match(layout, /className="wawisUserInitialsBadge"/, 'Mobile user control must be an initials badge.');
assert.match(layout, /\{getProfileInitials\(profile\)\}/, 'Initials badge must be derived from the logged-in profile.');
assert.match(layout, /onClick=\{logout\}/, 'Initials badge must call logout.');
assert.doesNotMatch(layout, /onClick=\{toggleAssignedJobsOnly\}/, 'Worker user badge must not switch job scope; it must logout.');
assert.doesNotMatch(layout, /IconLogout/, 'Worker toolbar must not waste space on a standalone logout icon.');
assert.match(layout, /wawisOneLinePushSlot[\s\S]*?wawisOneLineFilterButton[\s\S]*?wawisUserInitialsBadge/, 'PUSH, filter and initials must share the same one-line toolbar.');

assert.match(indexHtml, /viewport-fit=cover/, 'Viewport must expose iPhone safe-area insets.');
assert.match(css, /env\(safe-area-inset-top\)/, 'Mobile page must respect the iPhone top safe area.');
assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\) !important;/, 'Admin module switcher must use four equal mobile columns.');
assert.match(jobsPanel, /wawisOneLineToolbar\{display:flex !important;[^}]*flex-wrap:nowrap !important;/, 'Mobile toolbar must stay in one flex row.');
assert.match(jobsPanel, /wawisOneLinePushSlot,[\s\S]*?width:54px !important;/, 'Compact PUSH width is missing.');
assert.match(jobsPanel, /wawisUserInitialsBadge/, 'Initials badge styling is missing.');
assert.match(css, /-webkit-text-size-adjust:100%/, 'Mobile UI must prevent Safari text auto-enlargement from breaking the toolbar.');

console.log('Mobile admin header smoke OK: safe-area, aligned toolbar, user logout and offline-safe sync');
