const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const jobsFetch = read('src/mobile791/modules/jobs-fetch.js');
const session = read('src/mobile791/hooks/useAppSession.js');
const auth = read('src/mobile791/modules/auth.js');
const layout = read('src/mobile791/components/jobs/MobileJobsLayout.jsx');
const worker = read('public/push-sw.js');
const version = JSON.parse(read('app-version.json')).version;

const refreshSection = jobsFetch.slice(jobsFetch.indexOf('export async function refreshAppData'));
const jobsPromiseIndex = refreshSection.indexOf('const jobsPromise = getJobsData({ supabase });');
const profilePromiseIndex = refreshSection.indexOf('const profilePromise = getCurrentProfile');
const jobsAwaitIndex = refreshSection.indexOf('await jobsPromise');
const ancillaryAwaitIndex = refreshSection.indexOf('await Promise.all([');
assert(jobsPromiseIndex >= 0, 'mobile: jobs request must start immediately');
assert(profilePromiseIndex > jobsPromiseIndex, 'mobile: ancillary profile request may start in parallel after jobs request');
assert(jobsAwaitIndex > profilePromiseIndex, 'mobile: jobs are awaited after all independent requests have been started');
assert(ancillaryAwaitIndex > jobsAwaitIndex, 'mobile: jobs must be applied before waiting for ancillary data');
assert.match(jobsFetch, /onJobsReady\(provisionalJobs\)/, 'mobile: provisional fresh jobs must be exposed immediately');
assert.match(jobsFetch, /existingProfile = null/, 'mobile: current profile must have a cached fallback');
assert.match(jobsFetch, /getAccessData\(\{ supabase, existingJobs \}\)/, 'mobile: job_access must have a cached fallback');

assert.match(session, /existingProfile: profileRef\.current/, 'mobile: refresh must provide cached profile');
assert.match(session, /onJobsReady: \(freshJobs\) => applyJobsFirst/, 'mobile: refresh must apply jobs-first callback');
assert.match(session, /coreJobsApplied = true/, 'mobile: core jobs success must be tracked');
assert.match(session, /applyOfflineOperationsToJobs\(freshJobs/, 'mobile: jobs-first refresh must preserve pending offline operations');
assert.match(session, /transient && coreJobsApplied/, 'mobile: ancillary timeout after jobs must be partial success');
assert.match(session, /hasUsableJobs/, 'mobile: transient failure must preserve existing visible jobs');
assert.match(session, /refreshSessionError && isTransientSupabaseError\(refreshSessionError\)/, 'mobile: transient auth refresh failure must not become session-expired');

const refreshIndex = layout.indexOf('await refreshAll?.(sessionUser, { preserveJobDetails: true });');
const queueIndex = layout.indexOf('void retryAllPhotoUploads?.();');
assert(refreshIndex >= 0 && queueIndex > refreshIndex, 'mobile: manual refresh must fetch jobs before retrying photo queue');

assert.match(auth, /SIGNED_OUT_TRANSIENT_RETRY_MS = 30000/, 'mobile: unexpected SIGNED_OUT transient verification should back off 30 s');
assert.match(auth, /verifyUnexpectedSignedOut/, 'mobile: unexpected SIGNED_OUT must be verified');
assert.match(auth, /sessionError && isTransientSupabaseError\(sessionError\)/, 'mobile: transient getSession error must preserve local state');
assert.match(auth, /refreshError && isTransientSupabaseError\(refreshError\)/, 'mobile: transient refreshSession error must preserve local state');
assert.doesNotMatch(auth, /else if \(event === 'SIGNED_OUT'\) \{[\s\S]{0,240}applyLoggedOutState\(\);/, 'mobile: SIGNED_OUT must not immediately clear app state');

assert(worker.includes(`wawis-app-shell-v${version}`), 'service worker cache must match release version');
console.log(`Smoke OK: mobile v${version} refreshes jobs first and survives transient Auth/profile timeouts without fake logout`);
