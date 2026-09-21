const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('src/mobile791/App.jsx');
const fetch = read('src/mobile791/modules/jobs-fetch.js');
const realtime = read('src/mobile791/hooks/useRealtimeRefresh.js');
const session = read('src/mobile791/hooks/useAppSession.js');
const auth = read('src/mobile791/modules/auth.js');
const actions = read('src/mobile791/hooks/useSelectedJobActions.js');

assert.match(fetch, /export async function loadJobSummaryData/, 'mobile must expose a one-job summary loader');
assert.match(fetch, /\.eq\('id', targetId\)/, 'one-job summary loader must query only the changed job id');
assert.match(fetch, /\.eq\('job_id', targetId\)/, 'one-job summary loader must query access only for that job');
assert.match(app, /const jobSummaryRequestsRef = useRef\(new Map\(\)\)/, 'one-job summary requests must deduplicate in flight');
assert.match(app, /const reloadJobSummary = React\.useCallback/, 'mobile App must merge a single changed job into local state');
assert.match(app, /reloadJobSummary,\n\s*reloadJobDetails,/, 'realtime must receive both summary and details loaders');
assert.match(realtime, /scheduleJobSummaryReload\(changedJobId\)/, 'jobs realtime must refresh one changed job');
assert.match(realtime, /tableName === 'photos' \|\| tableName === 'comments'/, 'photo/comment realtime must stay details-only');
assert.match(realtime, /FALLBACK_POLLING_MS = 5 \* 60 \* 1000/, 'global fallback must be five minutes');
assert.match(realtime, /RESUME_GLOBAL_REFRESH_MIN_AGE_MS = 2 \* 60 \* 1000/, 'focus must not immediately refresh the whole list');
assert.match(session, /const refreshPayloadInFlightRef = useRef\(new Map\(\)\)/, 'all full refresh callers must share an in-flight payload dedupe');
assert.match(session, /const AUTH_RESTORE_RETRY_MS = 30000;/, 'transient session restore retry must not hammer the server every five seconds');
assert.match(auth, /refreshAll\(user, \{ silent: true, preserveJobDetails: true \}\)/, 'automatic session restore must not show a red transient banner over cached data');
assert.doesNotMatch(actions, /\[1200, 5000, 12000, 20000\]\.forEach/, 'old post-upload four-retry chain must be gone');
assert.match(actions, /photoDetailsSyncTimersRef/, 'post-upload fallback must be debounced per job');

console.log('Mobile refresh isolation v9.71 smoke OK');
