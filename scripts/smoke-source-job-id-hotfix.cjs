const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveSqlPath } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');
const sqlPath = resolveSqlPath(root, 'devices-module-stage-7-source-job-id-text-production-hotfix.sql');
const errorModulePath = path.join(root, 'src', 'modules', 'database-errors.js');
const actionsPath = path.join(root, 'src', 'hooks', 'useSelectedJobActions.js');
const runReleasePath = path.join(root, 'scripts', 'run-release.cjs');
const packagePath = path.join(root, 'package.json');

assert.ok(fs.existsSync(sqlPath), 'Brakuje SQL hotfixa source_job_id');
assert.ok(fs.existsSync(errorModulePath), 'Brakuje modułu przyjaznych błędów bazy');

const sql = fs.readFileSync(sqlPath, 'utf8');
const errorModule = fs.readFileSync(errorModulePath, 'utf8');
const actions = fs.readFileSync(actionsPath, 'utf8');
const runRelease = fs.readFileSync(runReleasePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

assert.match(sql, /rollback;\s*begin;/i);
assert.match(sql, /alter column source_job_id type text/i);
assert.match(sql, /drop trigger if exists jobs_sync_device_after_change/i);
assert.match(sql, /drop function if exists public\.sync_device_from_job_row\(uuid, uuid, text, text, date\)/i);
assert.match(sql, /drop function if exists public\.admin_list_devices_with_contractor\(\)/i);
assert.match(sql, /drop function if exists public\.admin_get_contractor_devices\(uuid\)/i);
assert.match(sql, /drop constraint if exists devices_source_job_id_key/i);
assert.match(sql, /create unique index devices_source_job_id_key\s+on public\.devices \(source_job_id\)/i);
assert.match(sql, /p_job_id \|\| '::device-' \|\| numbered\.index::text/i);
assert.match(sql, /new\.id::text/i);
assert.match(sql, /regexp_replace\(coalesce\(v_row\.source_job_id/i);
assert.match(sql, /grant execute on function public\.admin_upsert_device\(uuid, uuid, text, text, date, integer, text, text, text, text\)/i);

assert.match(errorModule, /SOURCE_JOB_ID_TEXT_HOTFIX_MESSAGE/);
assert.match(errorModule, /isSourceJobIdTypeMismatchError/);
assert.match(errorModule, /source_job_id/);
assert.match(errorModule, /operator does not exist: uuid = text/);
assert.match(errorModule, /supabase\/migrations\/archive\/devices-module-stage-7-source-job-id-text-production-hotfix\.sql/);

assert.match(actions, /normalizeDatabaseErrorMessage/);
assert.match(actions, /alert\(normalizeDatabaseErrorMessage\(error, SAVE_ERROR_MESSAGE\)\)/);
assert.match(actions, /alert\(normalizeDatabaseErrorMessage\(error, EDIT_SAVE_ERROR_MESSAGE\)\)/);

assert.equal(
  packageJson.scripts['test:smoke:source-job-id-hotfix'],
  'node scripts/smoke-source-job-id-hotfix.cjs',
  'package.json nie zawiera smoke testu source_job_id hotfix'
);
assert.match(runRelease, /npm run test:smoke:source-job-id-hotfix/);

console.log('Smoke OK: source_job_id uuid/text hotfix is documented, tested and wired');
