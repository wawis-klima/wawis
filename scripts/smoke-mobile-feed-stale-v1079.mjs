import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const desktop = read('src/modules/jobs-fetch.js');
const mobile = read('src/mobile791/modules/jobs-fetch.js');
const migration = read('supabase/migrations/20260916103000_mobile_feed_and_stale_job_maintenance_v1079.sql');
const securityMigration = read('supabase/migrations/20260916104500_mobile_feed_rls_invoker_v1079.sql');

for (const [label, source] of [['desktop', desktop], ['mobile', mobile]]) {
  assert.doesNotMatch(source, /syncStaleJobsStatus/, `${label}: odczyt nadal uruchamia maintenance statusu`);
  assert.doesNotMatch(source, /update\(\{\s*status:\s*['"]Niezrealizowane['"]\s*\}\)/, `${label}: odczyt nadal wykonuje UPDATE statusu`);
}

assert.match(migration, /create table if not exists public\.mobile_change_feed/i);
assert.match(migration, /alter table public\.mobile_change_feed enable row level security/i);
assert.match(migration, /create trigger jobs_record_mobile_change/i);
assert.match(migration, /create trigger job_access_record_mobile_change/i);
assert.match(migration, /record_mobile_job_change/);
assert.match(migration, /current_user_is_staff\(\)/);
assert.match(migration, /f\.audience_user_id is null/);
assert.match(migration, /v1079_bootstrap/);
assert.match(migration, /private\.refresh_stale_new_jobs/);
assert.match(migration, /created_at < now\(\) - interval '30 days'/);
assert.match(migration, /create extension if not exists pg_cron/i);
assert.match(migration, /cron\.schedule/);
assert.match(migration, /'17 \* \* \* \*'/);
assert.match(migration, /revoke all on function private\.refresh_stale_new_jobs\(\) from public, anon, authenticated/i);

assert.match(securityMigration, /create policy mobile_change_feed_staff_global_select/i);
assert.match(securityMigration, /audience_user_id is null\s+and public\.current_user_is_staff\(\)/i);
assert.match(securityMigration, /security invoker/i);
assert.match(securityMigration, /grant select on table public\.mobile_change_feed to authenticated/i);
assert.match(securityMigration, /revoke all on function public\.get_mobile_change_batch\(bigint, integer\) from public, anon/i);
assert.match(securityMigration, /revoke all on function public\.get_mobile_change_head\(\) from public, anon/i);

console.log('OK: 10.79 — wspólny feed całego zespołu z RLS/invoker i serwerowe starzenie statusu bez UPDATE podczas odczytu.');
