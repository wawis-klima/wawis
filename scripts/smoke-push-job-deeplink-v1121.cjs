const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

for (const appPath of ['src/App.jsx', 'src/mobile791/App.jsx']) {
  const source = read(appPath);
  assert.match(source, /const requestedJobId = getRequestedJobIdFromLocation\(window\.location\.href\)/);
  assert.match(source, /const requestedJob = jobs\.find\(\(job\) => String\(job\.id\) === String\(requestedJobId\)\)/);
  assert.match(source, /openJobInJobsModule\(requestedJob\);/);
  assert.match(source, /cleanUrl\.searchParams\.delete\("jobId"\)/);
  assert.match(source, /window\.history\.replaceState\(window\.history\.state, "", cleanHref\)/);

  assert.match(source, /function openJobInJobsModule\(jobLike, options = \{\}\)/);
  assert.match(source, /setQuery\(''\);/);
  assert.match(source, /setShowAssignedJobsOnly\(false\);/);
  assert.match(source, /setDesktopStatusFilter\(normalizeStatus\(resolvedJob\.status \|\| 'Nowe'\)\);/);
  assert.match(source, /setSelectedJob\(resolvedJob\);/);
  assert.match(source, /setPendingOpenJobId\(String\(resolvedJob\.id\)\);/);
  assert.match(source, /handleDesktopNavigation\('jobs', 'orders'\);/);
}

const worker = read('public/push-sw.js');
assert.match(worker, /const targetUrl = event\.notification\?\.data\?\.url \|\| "\/";/);
assert.match(worker, /await existingClient\.navigate\(targetUrl\);/);
assert.match(worker, /await clients\.openWindow\(targetUrl\);/);

const edge = read('supabase/functions/send-assignment-push/index.ts');
assert.match(edge, /url: targetUrl \|\| \(job\?\.id \? `\/\?jobId=\$\{encodeURIComponent\(job\.id\)\}` : "\/"\)/);

console.log('OK: push deeplink otwiera właściwy montaż i ustawia jego status/listę.');
