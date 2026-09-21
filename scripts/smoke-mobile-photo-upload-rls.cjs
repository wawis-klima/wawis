const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mobilePhotosPath = path.join(root, 'src', 'mobile791', 'modules', 'photos.js');
const mobileActionsPath = path.join(root, 'src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const sqlPath = path.join(root, 'mobile-photo-upload-rls-v8.32.sql');
const migrationSqlPath = path.join(root, 'supabase', 'migrations', 'mobile-photo-upload-rls-v8.32.sql');
const desktopPhotosPath = path.join(root, 'src', 'modules', 'photos.js');

const mobilePhotos = fs.readFileSync(mobilePhotosPath, 'utf8');
const mobileActions = fs.readFileSync(mobileActionsPath, 'utf8');
const sql = fs.readFileSync(sqlPath, 'utf8');
const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
const desktopPhotos = fs.readFileSync(desktopPhotosPath, 'utf8');

assert.match(mobilePhotos, /async function getAuthenticatedUploaderId\(\{ supabase, profile \}\)/, 'Mobile upload should resolve uploader from authenticated session');
assert.match(mobilePhotos, /supabase\.auth\.getUser\(\)/, 'Mobile upload should use auth.getUser() so uploaded_by matches auth.uid()');
assert.match(mobilePhotos, /uploaded_by: uploaderId/, 'Photo insert should use uploaderId from auth.uid(), not a stale profile id');
assert.match(mobilePhotos, /row-level security[\s\S]*mobile-photo-upload-rls-v8\.32\.sql/, 'Mobile queue should translate RLS errors into actionable Polish hint');
assert.match(mobileActions, /void \(async \(\) => \{[\s\S]*try \{[\s\S]*await uploadJobPhotos\([\s\S]*catch \(error\)/, 'Mobile action should catch async upload startup failures');
assert.doesNotMatch(desktopPhotos, /getAuthenticatedUploaderId|mobile-photo-upload-rls-v8\.32/, 'Desktop photo module should remain untouched by mobile RLS hotfix');

for (const source of [sql, migrationSql]) {
  assert.match(source, /grant usage on schema public to authenticated, service_role;/i, 'SQL must include explicit schema grants');
  assert.match(source, /grant select, insert, update, delete on table public\.photos to authenticated, service_role;/i, 'SQL must include explicit photos grants');
  assert.match(source, /create policy "photos_insert_accessible_job"/i, 'SQL must recreate photos insert policy');
  assert.match(source, /create policy "job_photos_storage_insert_accessible_job"/i, 'SQL must recreate storage insert policy');
  assert.match(source, /public\.current_user_can_access_job\(job_id\)/i, 'Photos policy must restrict uploads to accessible jobs');
  assert.match(source, /uploaded_by = auth\.uid\(\)/i, 'Photos policy must bind owner to auth.uid()');
  assert.match(source, /public\.storage_object_job_id\(name\)/i, 'Storage policy must derive job id from storage path');
}

console.log('Mobile photo upload RLS smoke OK');
process.exit(0);
