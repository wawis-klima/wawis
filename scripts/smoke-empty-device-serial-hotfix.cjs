const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sqlPath = path.join(root, 'devices-empty-serial-hotfix-v8.60.sql');
const archivedSqlPath = path.join(root, 'supabase', 'migrations', 'current', 'devices-empty-serial-hotfix-v8.60.sql');
const mobileErrorsPath = path.join(root, 'src', 'mobile791', 'modules', 'database-errors.js');
const packagePath = path.join(root, 'package.json');
const releaseRunnerPath = path.join(root, 'scripts', 'run-release.cjs');

assert.ok(fs.existsSync(sqlPath), 'Brakuje głównego SQL hotfixa pustych numerów seryjnych');
assert.ok(fs.existsSync(archivedSqlPath), 'Brakuje kopii SQL w supabase/migrations/current');

const sql = fs.readFileSync(sqlPath, 'utf8');
const archivedSql = fs.readFileSync(archivedSqlPath, 'utf8');
const mobileErrors = fs.readFileSync(mobileErrorsPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const releaseRunner = fs.readFileSync(releaseRunnerPath, 'utf8');

assert.equal(sql, archivedSql, 'Kopia migracji Supabase różni się od pliku głównego');
assert.match(sql, /drop constraint if exists devices_serial_number_key/i);
assert.match(sql, /drop index if exists public\.devices_serial_number_key/i);
assert.match(sql, /create unique index devices_serial_number_key/i);
assert.match(sql, /where nullif\(btrim\(serial_number\), ''\) is not null/i);
assert.doesNotMatch(sql, /update public\.devices\s+set serial_number/i, 'Hotfix nie może nadpisywać istniejących numerów');

assert.match(mobileErrors, /EMPTY_DEVICE_SERIAL_HOTFIX_MESSAGE/);
assert.match(mobileErrors, /isEmptyDeviceSerialUniqueError/);
assert.match(mobileErrors, /devices_serial_number_key/);
assert.match(mobileErrors, /devices-empty-serial-hotfix-v8\.60\.sql/);

assert.equal(
  packageJson.scripts['test:smoke:empty-device-serial'],
  'node scripts/smoke-empty-device-serial-hotfix.cjs',
  'package.json nie zawiera smoke testu pustego numeru seryjnego'
);
assert.match(releaseRunner, /npm run test:smoke:empty-device-serial/);

console.log('Smoke OK: blank device serials are allowed while real serials stay unique');
