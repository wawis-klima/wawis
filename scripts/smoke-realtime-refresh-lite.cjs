const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const desktopSource = fs.readFileSync(path.join(root, 'src', 'hooks', 'useRealtimeRefresh.js'), 'utf8');
const mobileSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'hooks', 'useRealtimeRefresh.js'), 'utf8');

assert.match(desktopSource, /const FALLBACK_POLLING_MS = 5 \* 60 \* 1000;/, 'desktop: global fallback should be reduced to once per 5 minutes');
assert.match(mobileSource, /const FALLBACK_POLLING_MS = 5 \* 60 \* 1000;/, 'mobile: global fallback should be reduced to once per 5 minutes');

for (const [label, source] of [['desktop', desktopSource], ['mobile', mobileSource]]) {
  assert.match(source, /const REFRESH_DEBOUNCE_MS = 1200;/, `${label}: realtime refresh should remain debounced`);
  assert.match(source, /reloadJobDetailsRef\.current\?\.\(targetJobId, \{ force: true, background: true \}\)/, `${label}: details reload should be forced in the background`);
  assert.match(source, /table: "photos"/, `${label}: photos realtime subscription must remain active`);
  assert.doesNotMatch(source, /DETAILS_RETRY_DELAYS_MS/, `${label}: 1.2\/5\/12\/20 s details retries must be removed`);
  assert.doesNotMatch(source, /scheduleSelectedDetailsRetries/, `${label}: retry scheduler must be removed`);
  assert.match(source, /const DETAILS_DEBOUNCE_MS = 250;/, `${label}: one short debounce should coalesce duplicate realtime events`);
  assert.match(source, /tableName === 'photos' \|\| tableName === 'comments'/, `${label}: photo/comment details reload must be separated from global refresh`);
  assert.match(source, /scheduleSelectedDetailsReload\(changedJobId\);[\s\S]*return;/, `${label}: selected photo/comment event should reload details without waiting for refreshAll`);
  assert.doesNotMatch(source, /SELECTED_DETAILS_POLLING_MS/, `${label}: selected job details must not poll every 10 seconds`);
}


assert.match(desktopSource, /reloadJobSummaryRef/, 'desktop: realtime should have a per-job summary loader');
assert.match(desktopSource, /scheduleJobSummaryReload\(changedJobId\)/, 'desktop: changed job should refresh only its summary');
assert.match(desktopSource, /RESUME_GLOBAL_REFRESH_MIN_AGE_MS = 2 \* 60 \* 1000/, 'desktop: short focus/visibility changes must not refresh the whole list');
assert.doesNotMatch(desktopSource, /SUBSCRIBED[\s\S]{0,120}scheduleRefresh/, 'desktop: realtime subscribe must not trigger a duplicate startup refresh');

assert.match(mobileSource, /reloadJobSummaryRef/, 'mobile: realtime should have a per-job summary loader');
assert.match(mobileSource, /tableName === 'jobs' \|\| tableName === 'job_access'/, 'mobile: jobs/access events should use one-job refresh');
assert.match(mobileSource, /scheduleJobSummaryReload\(changedJobId\)/, 'mobile: changed job should refresh only its summary');
assert.match(mobileSource, /RESUME_GLOBAL_REFRESH_MIN_AGE_MS = 2 \* 60 \* 1000/, 'mobile: short focus/visibility changes must not refresh the whole list');
assert.doesNotMatch(mobileSource, /SUBSCRIBED[\s\S]{0,120}scheduleRefresh/, 'mobile: realtime subscribe must not trigger a duplicate startup refresh');

console.log('Realtime refresh lite smoke OK: desktop and mobile use job-scoped realtime and rare global fallback');
process.exit(0);
