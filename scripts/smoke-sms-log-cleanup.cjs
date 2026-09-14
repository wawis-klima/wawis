const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  if (relativePath.endsWith('.sql')) return readSql(root, relativePath);
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const migration = read('sms-module-stage-9-log-cleanup.sql');
assert.match(migration, /admin_cleanup_sms_duplicate_logs/);
assert.match(migration, /security definer/);
assert.match(migration, /current_user_is_admin\(\)/);
assert.match(migration, /coalesce\(d\.source_job_id, l\.job_id\)/);
assert.match(migration, /partition by group_job_id, normalized_cycle/);
assert.match(migration, /row_number\(\) over/);
assert.match(migration, /delete from public\.sms_log/);
assert.match(migration, /device_id\s*=\s*null/);
assert.match(migration, /deleted_duplicate_logs/);
assert.match(migration, /canonicalized_logs/);

const fetchSource = read('src/modules/sms-fetch.js');
assert.match(fetchSource, /cleanupSmsDuplicateLogs/);
assert.match(fetchSource, /admin_cleanup_sms_duplicate_logs/);
assert.match(fetchSource, /admin_get_sms_module_snapshot/);

const generatorSource = read('supabase/functions/generate-service-sms-queue/index.ts');
assert.match(generatorSource, /cleanupDuplicateSmsLogs/);
assert.match(generatorSource, /admin_cleanup_sms_duplicate_logs/);
assert.match(generatorSource, /cleanupResult/);
assert.match(generatorSource, /createdCount, expiredCount, cleanupResult/);

// Od 10.61 release runner korzysta z centralnych grup testów zamiast wpisywać
// każdą komendę smoke bezpośrednio w scripts/run-release.cjs.
const testGroupsSource = read('scripts/test-groups.cjs');
assert.match(testGroupsSource, /test:smoke:sms-log-cleanup/);
assert.match(testGroupsSource, /desktop:\s*\[/);

const runnerSource = read('scripts/run-release.cjs');
assert.match(runnerSource, /getReleaseGroups/);
assert.match(runnerSource, /run-test-group\.cjs/);

const verifySource = read('scripts/verify-release.cjs');
assert.match(verifySource, /predeploy_diagnostics/);
assert.match(verifySource, /verifyDist/);

const readme = read('README.md');
assert.match(readme, /test:smoke:sms-log-cleanup/);
assert.match(readme, /admin_cleanup_sms_duplicate_logs/);

const changelog = read('CHANGELOG.md');
assert.match(changelog, /7\.63/);
assert.match(changelog, /duplikat/iu);

console.log('SMS log cleanup smoke OK');
process.exit(0);
