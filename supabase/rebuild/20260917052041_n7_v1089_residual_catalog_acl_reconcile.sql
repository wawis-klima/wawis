-- WAWIS 10.89 / N7 stage B — residual rebuild-only reconcile.
-- Align remaining catalog/default/policy/ACL differences with production 10.88.

alter table public.push_subscriptions
  alter column lifecycle_token drop default;

alter table public.nameplate_manual_verifications
  drop constraint if exists nameplate_manual_verifications_job_id_device_index_unit_ref_key;

drop policy if exists fuel_odometer_photos_admin_insert on storage.objects;
drop policy if exists fuel_odometer_photos_admin_select on storage.objects;

-- Production sequence ACL grants SELECT/UPDATE/USAGE to anon + authenticated.
grant select, update, usage on sequence public.mobile_change_feed_change_seq_seq to anon, authenticated;

-- Production private routine ACLs. The private schema itself remains inaccessible
-- to app roles; these reproduce the production routine ACL matrix exactly.
grant execute on function private.assert_job_nameplates_complete(uuid,text,text) to public;
grant execute on function private.guard_completed_job_nameplates_after_photo_mutation() to public;
grant execute on function private.guard_job_completion_nameplates() to public;
grant execute on function private.job_nameplate_requirements(uuid,text,text) to public;
grant execute on function private.lock_job_for_photo_mutation() to public;
grant execute on function private.refresh_stale_new_jobs() to service_role;
