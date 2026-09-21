const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('src/App.jsx');
const realtime = read('src/hooks/useRealtimeRefresh.js');
const auth = read('src/modules/auth.js');
const fetch = read('src/modules/jobs-fetch.js');
const session = read('src/hooks/useAppSession.js');
const details = read('src/components/JobDetailsPanel.jsx');

const mobileApp = read('src/mobile791/App.jsx');
const mobileRealtime = read('src/mobile791/hooks/useRealtimeRefresh.js');
const mobileAuth = read('src/mobile791/modules/auth.js');
const mobileFetch = read('src/mobile791/modules/jobs-fetch.js');
const mobileSession = read('src/mobile791/hooks/useAppSession.js');
const mobileDetails = read('src/mobile791/components/JobDetailsPanel.jsx');

assert.match(realtime, /FALLBACK_POLLING_MS = 5 \* 60 \* 1000/, 'desktop: full fallback refresh should be at most once per 5 minutes');
assert.match(realtime, /reloadJobSummaryRef/, 'desktop: realtime must support one-job summary reload');
assert.match(realtime, /scheduleJobSummaryReload\(changedJobId\)/, 'desktop: jobs event must refresh only changed job');
assert.doesNotMatch(realtime, /SUBSCRIBED[\s\S]{0,160}scheduleRefresh/, 'desktop: subscribing must not immediately refresh the whole app');
assert.doesNotMatch(realtime, /table: "notifications"/, 'desktop: notifications must not create a global-refresh realtime subscription');
assert.doesNotMatch(realtime, /table: "job_access"/, 'desktop: admin desktop should not keep unnecessary job_access realtime subscription');
assert.match(realtime, /tableName === 'photos' \|\| tableName === 'comments'/, 'desktop: photos/comments stay job-scoped');

assert.match(fetch, /onJobsReady/, 'desktop: jobs-first callback must exist');
const refreshStart = fetch.indexOf('export async function refreshAppData');
const refreshSource = fetch.slice(refreshStart);
assert(refreshSource.indexOf('const jobsPromise = getJobsData') < refreshSource.indexOf('await Promise.all'), 'desktop: jobs query must start before waiting for secondary datasets');
assert.doesNotMatch(refreshSource, /getNameplateOverviewData\(/, 'desktop: global refresh must not scan all photos/nameplate verifications');
assert.match(fetch, /deferThumbnailSigning = false/, 'desktop: details loader must support deferred thumbnails');
assert.match(fetch, /signal = null/, 'desktop: details loader must support cancellation');

assert.match(app, /JOB_DETAILS_TIMEOUT_MS = 7000/, 'desktop: details request must have a bounded wait');
assert.match(app, /deferThumbnailSigning: true/, 'desktop: details must render before thumbnail signing');
assert.match(app, /void hydrateJobThumbnails\(/, 'desktop: thumbnail signing should happen in background');
assert.match(app, /jobsRef\.current\.find/, 'desktop: detail callback must use stable jobs ref');
assert.match(app, /profilesRef\.current/, 'desktop: detail callback must use stable profiles ref');
assert.doesNotMatch(app, /\}, \[jobs, profiles, supabase\]\);/, 'desktop: reloadJobDetails must not be recreated for every jobs/profile update');
assert.match(app, /selectedJob\.detailsLoaded \|\| selectedJob\.detailsLoadError/, 'desktop: failed details load must not auto-loop forever');
assert.match(app, /reloadJobSummary,\n\s+reloadJobDetails/, 'desktop: realtime receives one-job summary loader');

assert.match(details, /detailsLoadError/, 'desktop: local details error state must be rendered');
assert.match(details, /onRetryDetails/, 'desktop: local details retry must be functional');
assert.match(details, /detailsLoaded && installationPhotos\.length === 0/, 'desktop: empty photo state must only be shown after confirmed details load');
assert.match(details, /detailsLoaded && comments\.length === 0/, 'desktop: empty comments state must only be shown after confirmed details load');

assert.match(auth, /Promise\.race\(\[\s*supabase\.auth\.signOut/, 'desktop: logout must not wait indefinitely for slow Auth');
assert.match(auth, /SIGNED_OUT_VERIFY_DELAY_MS = 1500/, 'desktop: unexpected SIGNED_OUT must be verified');
assert.match(auth, /SIGNED_OUT_TRANSIENT_RETRY_MS = 30000/, 'desktop: transient Auth failure should retry slowly');
assert.match(session, /AUTH_RESTORE_RETRY_MS = 30000/, 'desktop: auth restore retries must not hammer the server');
assert.match(session, /applyJobsFirst/, 'desktop: fresh jobs must be committed independently of secondary datasets');



assert.match(mobileRealtime, /FALLBACK_POLLING_MS = 5 \* 60 \* 1000/, 'mobile: full fallback refresh should be at most once per 5 minutes');
assert.match(mobileRealtime, /reloadJobSummaryRef/, 'mobile: realtime must support one-job summary reload');
assert.doesNotMatch(mobileRealtime, /SUBSCRIBED[\s\S]{0,160}scheduleRefresh/, 'mobile: subscribing must not immediately refresh the whole app');
assert.match(mobileRealtime, /tableName === 'photos' \|\| tableName === 'comments'/, 'mobile: photos/comments stay job-scoped');

assert.match(mobileFetch, /onJobsReady/, 'mobile: jobs-first callback must exist');
const mobileRefreshStart = mobileFetch.indexOf('export async function refreshAppData');
const mobileRefreshSource = mobileFetch.slice(mobileRefreshStart);
assert(mobileRefreshSource.indexOf('const jobsPromise = getJobsData') < mobileRefreshSource.indexOf('await Promise.all'), 'mobile: jobs query must start before waiting for secondary datasets');
assert.match(mobileFetch, /deferThumbnailSigning = false/, 'mobile: details loader must support deferred thumbnails');
assert.match(mobileFetch, /signal = null/, 'mobile: details loader must support cancellation');
assert.match(mobileFetch, /detailsLoadError/, 'mobile: details load error must survive list refreshes');

assert.match(mobileApp, /JOB_DETAILS_TIMEOUT_MS = 7000/, 'mobile: details request must have a bounded wait');
assert.match(mobileApp, /deferThumbnailSigning: true/, 'mobile: details must render before thumbnail signing');
assert.match(mobileApp, /void hydrateJobThumbnails\(/, 'mobile: thumbnail signing should happen in background');
assert.match(mobileApp, /jobsRef\.current\.find/, 'mobile: detail callback must use stable jobs ref');
assert.match(mobileApp, /profilesRef\.current/, 'mobile: detail callback must use stable profiles ref');
assert.match(mobileApp, /selectedJob\.detailsLoaded \|\| selectedJob\.detailsLoadError/, 'mobile: failed details load must not auto-loop forever');
assert.match(mobileApp, /options\.background && targetJob\.detailsLoaded/, 'mobile: failed background refresh must preserve already loaded details');
assert.match(app, /options\.background && targetJob\.detailsLoaded/, 'desktop: failed background refresh must preserve already loaded details');

assert.match(mobileDetails, /detailsLoadError/, 'mobile: local details error state must be rendered');
assert.match(mobileDetails, /onRetryDetails/, 'mobile: local details retry must be functional');
assert.match(mobileDetails, /detailsLoaded && regularPhotos\.length === 0/, 'mobile: empty photo state must only be shown after confirmed details load');
assert.match(mobileDetails, /detailsLoaded && comments\.length === 0/, 'mobile: empty comments state must only be shown after confirmed details load');
assert.match(mobileDetails, /loading="lazy" decoding="async"/, 'mobile: thumbnails must load lazily');

assert.match(mobileAuth, /Promise\.race\(\[\s*supabase\.auth\.signOut/, 'mobile: logout must not wait indefinitely for slow Auth');
assert.match(mobileSession, /AUTH_RESTORE_RETRY_MS = 30000/, 'mobile: auth restore retries must not hammer the server');
assert.match(mobileSession, /applyJobsFirst/, 'mobile: fresh jobs must be committed independently of secondary datasets');

console.log('Desktop + mobile resilience smoke OK: v9.75 isolates jobs/details, bounds waits and avoids realtime/auth refresh storms');
