const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const smokeAuthRefreshSource = fs.readFileSync(path.join(root, 'scripts', 'smoke-auth-refresh.cjs'), 'utf8');
const smokeVersionUiSource = fs.readFileSync(path.join(root, 'scripts', 'smoke-version-ui.cjs'), 'utf8');

assert.ok(
  smokeAuthRefreshSource.includes(`/document\\.addEventListener\\(["\\']visibilitychange["\\']/`),
  'smoke-auth-refresh musi być odporny na pojedyncze i podwójne cudzysłowy przy visibilitychange'
);

assert.ok(
  !smokeAuthRefreshSource.includes(`/document\\.addEventListener\\("visibilitychange"/`),
  'smoke-auth-refresh nie może już zakładać tylko podwójnych cudzysłowów przy visibilitychange'
);

assert.ok(
  !smokeAuthRefreshSource.includes(`/document\\.addEventListener\\('visibilitychange'/`),
  'smoke-auth-refresh nie może już zakładać tylko pojedynczych cudzysłowów przy visibilitychange'
);

assert.ok(
  smokeAuthRefreshSource.includes(`/searchParams\\.get\\(["\\']jobId["\\']\\)/`),
  'smoke-auth-refresh musi być odporny na oba style cudzysłowów przy searchParams.get("jobId")'
);

assert.ok(
  smokeVersionUiSource.includes(`from\\s+["']\\.\\.\\/version["'];`),
  'smoke-version-ui powinien dalej używać quote-agnostic regexu dla importu APP_VERSION'
);

console.log('Smoke regex compatibility OK');
process.exit(0);
