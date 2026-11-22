const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const layout = read('src', 'mobile791', 'components', 'jobs', 'MobileJobsLayout.jsx');
const css = read('src', 'mobile791', 'styles.css');
const jobsPanel = read('src', 'mobile791', 'components', 'JobsPanel.jsx');
const runtimeCss = read('src', 'mobile791', 'v1048-runtime-fix.css');
const indexHtml = read('index.html');

// 14.84 (decyzja właściciela 22.11.2026): przycisk „Synchronizuj dane” zastąpiony przełącznikiem motywu ciemnego.
// Ręczna synchronizacja zostaje w Diagnostyce („Synchronizuj teraz”, „Odśwież dane”).
const diagnostics = read('src', 'mobile791', 'components', 'diagnostics', 'MobileDiagnosticsPanel.jsx');
assert.match(layout, /className="mobileActionBtn wawisOneLineAction wawisThemeToggle"/, 'Mobile header must have the dark theme toggle in place of sync.');
assert.match(layout, /onClick=\{handleToggleTheme\}/, 'Theme toggle must switch the theme.');
assert.doesNotMatch(layout, /handleManualReload|title="Synchronizuj dane"/, 'Sync button replaced by the theme toggle.');
assert.match(diagnostics, /data-testid="diagnostics-sync-now"/, 'Manual sync must remain available in Diagnostics.');
assert.match(diagnostics, /'Odśwież dane'/, 'Manual data refresh must remain available in Diagnostics.');
assert.doesNotMatch(layout, /window\.location\.reload\(\)/, 'Theme switch must not hard reload the page.');
assert.match(layout, /className="wawisUserInitialsBadge"/, 'Mobile user control must be an initials badge.');
assert.match(layout, /\{getProfileInitials\(profile\)\}/, 'Initials badge must be derived from the logged-in profile.');
assert.match(layout, /onClick=\{logout\}/, 'Initials badge must call logout.');
assert.doesNotMatch(layout, /onClick=\{toggleAssignedJobsOnly\}/, 'Worker user badge must not switch job scope; it must logout.');
assert.doesNotMatch(layout, /IconLogout/, 'Worker toolbar must not waste space on a standalone logout icon.');
assert.match(layout, /wawisOneLinePushSlot[\s\S]*?wawisOneLineFilterButton[\s\S]*?wawisUserInitialsBadge/, 'PUSH, filter and initials must share the same one-line toolbar.');

assert.match(indexHtml, /viewport-fit=cover/, 'Viewport must expose iPhone safe-area insets.');
assert.match(indexHtml, /minimum-scale=1\.0/, 'Mobile viewport must not zoom out below 100%.');
assert.match(indexHtml, /maximum-scale=1\.0/, 'Mobile viewport must not zoom in above 100%.');
assert.match(indexHtml, /user-scalable=no/, 'Mobile viewport must disable manual pinch zoom.');
assert.match(css, /html,body,#root\{[\s\S]*?touch-action:pan-x pan-y;/, 'Mobile root must allow scrolling but block pinch zoom gestures.');
assert.match(css, /env\(safe-area-inset-top\)/, 'Mobile page must respect the iPhone top safe area.');
assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\) !important;/, 'Admin module switcher must use four equal mobile columns.');
assert.match(runtimeCss, /mobileHeaderV2\.wawisCompactHeader\{[\s\S]*?padding:7px!important;/, 'Mobile header frame must keep symmetric inner padding.');
assert.match(runtimeCss, /wawisOneLineToolbar\{[\s\S]*?display:grid!important;[\s\S]*?grid-template-columns:40px 40px 40px 54px 40px 40px!important;/, 'Mobile toolbar must use six deterministic columns instead of flex space distribution.');
assert.match(runtimeCss, /wawisOneLineToolbar\{[\s\S]*?box-sizing:border-box!important;[\s\S]*?padding-inline:2\.5px!important;/, 'Mobile toolbar must keep the reduced, equal 2.5 px edge inset on both sides.');
assert.match(runtimeCss, /wawisOneLineVersion\{[\s\S]*?width:40px!important;[\s\S]*?min-width:40px!important;[\s\S]*?max-width:40px!important;/, 'Version slot must use the same compact width as standard toolbar actions.');
assert.match(runtimeCss, /wawisOneLinePushSlot,[\s\S]*?width:54px!important;/, 'Compact PUSH width is missing.');
assert.match(runtimeCss, /wawisUserInitialsBadge/, 'Initials badge styling is missing.');
assert.match(css, /-webkit-text-size-adjust:100%/, 'Mobile UI must prevent Safari text auto-enlargement from breaking the toolbar.');

console.log('Mobile admin header smoke OK: fixed 100% viewport, safe-area, deterministic grid, 2.5 px equal edge spacing, user logout and dark theme toggle (sync in Diagnostics)');
