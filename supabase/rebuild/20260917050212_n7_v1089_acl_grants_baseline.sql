-- WAWIS 10.89 / N7 stage B / rebuild-only ACL baseline.

-- schema ACL
revoke all on schema public from anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
revoke all on schema private from anon, authenticated, service_role;

-- public table ACL: reset app roles, then reproduce production effective grants.
revoke all privileges on all tables in schema public from anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;

grant select,insert,delete on public.app_diagnostic_events to authenticated;
grant all privileges on public.comments,public.contractors,public.devices,public.fuel_entries,public.fuel_vehicles,public.job_access,public.job_protocols,public.jobs,public.nameplate_manual_verifications,public.nameplate_product_catalog,public.notifications,public.photo_audit_log,public.photos,public.profiles,public.push_delivery_log,public.services to authenticated;
grant select on public.job_protocol_email_log,public.mobile_change_feed,public.push_subscriptions to authenticated;
-- sms_log and sms_settings intentionally remain service-role only at table ACL level.

-- sequences
revoke all privileges on all sequences in schema public from anon, authenticated, service_role;
grant all privileges on all sequences in schema public to service_role;
grant usage,select on all sequences in schema public to authenticated;

-- routine ACL. Remove default PUBLIC exposure, then re-grant the production matrix.
revoke execute on all functions in schema public from public, anon, authenticated, service_role;
grant execute on all functions in schema public to service_role;

grant execute on function
 public.admin_delete_comment(uuid),
 public.admin_delete_contractor(uuid),
 public.admin_delete_device(uuid),
 public.admin_delete_job_device(uuid,integer),
 public.admin_delete_jobs_recoverable(uuid[],boolean),
 public.admin_get_contractor_devices(uuid),
 public.admin_get_dashboard_metrics(),
 public.admin_get_device_sms_history(uuid,uuid),
 public.admin_get_job_photo_audit(uuid),
 public.admin_get_sms_module_snapshot(),
 public.admin_import_nameplate_products(jsonb),
 public.admin_list_contractors(),
 public.admin_list_deleted_jobs(),
 public.admin_list_devices_basic(),
 public.admin_list_devices_for_service(),
 public.admin_list_devices_with_contractor(),
 public.admin_restore_deleted_job(uuid),
 public.admin_sync_device_from_job(uuid),
 public.admin_sync_devices_from_jobs(),
 public.admin_update_device_status(uuid,text),
 public.admin_upsert_contractor(uuid,text,text,text,text,text,text,text,text,boolean,jsonb),
 public.admin_upsert_device(uuid,uuid,text,text,date,integer,text,text,text,text),
 public.admin_upsert_nameplate_product(text,text,text,text,text,numeric,text,text,text,text,boolean),
 public.admin_upsert_sms_settings(boolean,text,text,text,text),
 public.calculate_service_due_date(date),
 public.current_user_can_access_job(uuid),
 public.current_user_can_edit_job(uuid),
 public.current_user_can_finalize_job(uuid),
 public.current_user_can_view_job(uuid),
 public.current_user_is_admin(),
 public.current_user_is_staff(),
 public.get_mobile_change_batch(bigint,integer),
 public.get_mobile_change_head(),
 public.job_file_can_be_deleted(text,text),
 public.normalize_contractor_addresses(jsonb,text,text),
 public.normalize_contractors_email(text),
 public.normalize_contractors_nip(text),
 public.normalize_contractors_phone(text),
 public.normalize_contractors_text(text),
 public.photo_audit_log_event(text,uuid,uuid,text,text,text,jsonb),
 public.push_subscription_disable_self(text,text,text,text),
 public.push_subscription_sync_self(text,text,text,text,text,text),
 public.save_job_with_access(uuid,jsonb,uuid[]),
 public.storage_object_job_id(text),
 public.worker_create_or_get_contractor_for_job(text,text,text,text,text)
 to authenticated;

grant execute on function
 public.admin_delete_jobs_recoverable(uuid[],boolean),
 public.admin_list_deleted_jobs(),
 public.admin_restore_deleted_job(uuid),
 public.job_file_can_be_deleted(text,text),
 public.save_job_with_access(uuid,jsonb,uuid[])
 to public,anon;

-- private helper routines stay inaccessible to app roles.
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
