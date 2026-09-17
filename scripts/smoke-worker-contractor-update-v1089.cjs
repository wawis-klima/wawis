const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const updateSql = read('supabase', 'migrations', '20260917065004_n7_v1089_worker_contractor_contact_update.sql');
const readSql = read('supabase', 'migrations', '20260917053548_n7_v1089_worker_contractor_read.sql');

assert.match(updateSql, /create or replace function private\.sync_worker_contractor_contact_from_job_v1089\(\)/i,
  'Worker contractor sync must stay in private schema.');
assert.match(updateSql, /security definer/i,
  'Worker contractor sync needs controlled SECURITY DEFINER because direct contractor UPDATE stays blocked.');
assert.match(updateSql, /set search_path\s*=\s*''/i,
  'SECURITY DEFINER function must use an empty pinned search_path.');
assert.match(updateSql, /not public\.current_user_is_staff\(\) or public\.current_user_is_admin\(\)/i,
  'Sync must run for workers only and not alter administrator save semantics.');
assert.match(updateSql, /update public\.contractors[\s\S]*company_name\s*=\s*trim\(new\.client\)[\s\S]*phone\s*=[\s\S]*email\s*=[\s\S]*city\s*=\s*v_city[\s\S]*street\s*=\s*v_street[\s\S]*addresses\s*=\s*v_addresses/i,
  'Worker sync must update only the approved contractor contact/address snapshot.');
assert.doesNotMatch(updateSql, /set[\s\S]{0,500}\bnotes\s*=/i,
  'Worker sync must not write contractor notes.');
assert.doesNotMatch(updateSql, /set[\s\S]{0,500}\bnip\s*=/i,
  'Worker sync must not write contractor NIP.');
assert.doesNotMatch(updateSql, /set[\s\S]{0,500}\bis_active\s*=/i,
  'Worker sync must not change contractor active state.');
assert.match(updateSql, /after update of client, phone, email, city, street\s+on public\.jobs/i,
  'Worker contractor changes must be driven by an allowed job edit, not by broad table UPDATE access.');
assert.match(updateSql, /revoke all on function private\.sync_worker_contractor_contact_from_job_v1089\(\) from authenticated/i,
  'Trigger function must not be directly executable by authenticated clients.');

assert.match(readSql, /for select[\s\S]*to authenticated[\s\S]*using \(public\.current_user_is_staff\(\)\)/i,
  'Workers must keep read access to contractor contact data.');
assert.doesNotMatch(readSql, /for update/i,
  'The worker-read migration must not grant direct contractor UPDATE.');
assert.doesNotMatch(readSql, /for delete/i,
  'The worker-read migration must not grant contractor DELETE.');

console.log('PASS smoke-worker-contractor-update-v1089');
