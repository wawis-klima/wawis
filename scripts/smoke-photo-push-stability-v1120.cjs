const fs = require('node:fs');
const assert = require('node:assert/strict');

const read = (path) => fs.readFileSync(path, 'utf8');

const mobileApp = read('src/mobile791/App.jsx');
assert.match(mobileApp, /photo\.thumbnail\.load\.retry/, 'Retry miniatury ma być ostrzeżeniem, nie błędem końcowym.');
assert.match(mobileApp, /photo\.thumbnail\.load\.succeeded/, 'Odzyskana miniatura ma zapisywać sukces techniczny.');
assert.match(mobileApp, /THUMBNAIL_RECOVERY_FAILED/, 'Dopiero wyczerpane odzyskiwanie ma tworzyć końcowy błąd miniatury.');

const diagnostics = read('src/modules/diagnostics.js');
assert.match(diagnostics, /loadPushSubscriptionOverview/);
assert.match(diagnostics, /select\('user_id, is_active, device_label, last_seen_at, updated_at'\)/);
assert.doesNotMatch(diagnostics, /select\([^\n]*endpoint[^\n]*p256dh[^\n]*auth/, 'Widok statusu PUSH nie może pobierać kluczy subskrypcji.');

const panel = read('src/components/diagnostics/DiagnosticsPanel.jsx');
assert.match(panel, /Status PUSH zespołu/);
assert.match(panel, /BRAK PUSH/);
assert.match(panel, /PUSH ON/);

const migration = read('supabase/migrations/current/stability-hardening-v11.20.sql');
for (const policy of [
  'push_subscriptions_select_own',
  'push_subscriptions_insert_own',
  'push_subscriptions_update_own',
  'push_delivery_log_select_own',
  'photo_audit_log_service_insert',
  'comments_insert_job',
  'jobs_create_own',
  'job_protocols_insert_completed_job',
  'job_protocols_update_owner_or_admin',
  'profiles_update_self_or_admin',
  'photos_insert_job',
  'notifications_read_own',
  'notifications_update_own',
]) assert.match(migration, new RegExp('alter policy\\s+' + policy, 'i'), 'Brak optymalizacji RLS: ' + policy);

assert.match(migration, /current_user_is_admin\(\)\)\s*\)/, 'Administrator ma widzieć statusy PUSH całego zespołu.');
assert.match(migration, /drop index if exists public\.idx_devices_contractor_id/i);
assert.match(migration, /drop index if exists public\.idx_devices_installation_date/i);
assert.match(migration, /drop index if exists public\.idx_jobs_contractor_id/i);
assert.match(migration, /revoke execute on function public\.reject_zero_byte_photo_storage\(\)/i);

console.log('OK: v11.20 stabilizuje diagnostykę miniaturek, status PUSH, granty, indeksy i RLS.');
