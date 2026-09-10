const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');

const criticalFiles = [
  'delete-policy.sql',
  'photos-delete-policy.sql',
  'notifications.sql',
];

for (const file of criticalFiles) {
  const source = readSql(root, file);
  assert(!/using\s*\(\s*true\s*\)/i.test(source), `${file}: destrukcyjne RLS nie może mieć using (true)`);
  assert(!/with\s+check\s*\(\s*true\s*\)/i.test(source), `${file}: RLS nie może mieć with check (true)`);
  assert(source.includes('current_user_is_admin'), `${file}: polityka musi sprawdzać administratora`);
}

const deletePolicy = readSql(root, 'delete-policy.sql');
assert(/for\s+delete[\s\S]*?using\s*\(\s*public\.current_user_is_admin\s*\(\s*\)\s*\)/i.test(deletePolicy), 'delete-policy.sql: kasowanie montaży ma być admin-only');

const photosPolicy = readSql(root, 'photos-delete-policy.sql');
assert(photosPolicy.includes('photos_delete_admin_or_owner'), 'photos-delete-policy.sql: brak polityki admin-or-owner dla public.photos');
assert(photosPolicy.includes('job_photos_storage_delete_admin_or_owner'), 'photos-delete-policy.sql: brak polityki admin-or-owner dla storage.objects');
assert(photosPolicy.includes('uploaded_by = auth.uid()'), 'photos-delete-policy.sql: właściciel zdjęcia powinien być ograniczony przez uploaded_by');
assert(photosPolicy.includes("bucket_id = 'job-photos'"), 'photos-delete-policy.sql: polityka storage musi ograniczać bucket job-photos');

const notificationsPolicy = readSql(root, 'notifications.sql');
assert(notificationsPolicy.includes('notifications_select_owner_or_admin'), 'notifications.sql: brak polityki select owner-or-admin');
assert(notificationsPolicy.includes('notifications_insert_owner_or_admin'), 'notifications.sql: brak polityki insert owner-or-admin');
assert(notificationsPolicy.includes('notifications_update_owner_or_admin'), 'notifications.sql: brak polityki update owner-or-admin');
assert(notificationsPolicy.includes('notifications_delete_owner_or_admin'), 'notifications.sql: brak polityki delete owner-or-admin');
assert(/user_id\s*=\s*auth\.uid\s*\(\s*\)/i.test(notificationsPolicy), 'notifications.sql: użytkownik powinien widzieć/zmieniać tylko swoje powiadomienia, poza administratorem');

console.log('Destructive RLS smoke OK');
