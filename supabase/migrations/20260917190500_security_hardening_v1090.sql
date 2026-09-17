-- WAWIS 10.90 — security hardening after the 10.89 production audit.
-- Keep application behavior unchanged while removing unintended elevated exposure.

begin;

-- These SECURITY DEFINER RPCs are intentionally available to signed-in users,
-- but must never be callable by anon/PUBLIC. Their bodies still enforce the
-- application-level authorization checks.
revoke execute on function public.admin_list_deleted_jobs() from public, anon;
revoke execute on function public.job_file_can_be_deleted(text, text) from public, anon;
grant execute on function public.admin_list_deleted_jobs() to authenticated, service_role;
grant execute on function public.job_file_can_be_deleted(text, text) to authenticated, service_role;

-- Both elevated functions only reference schema-qualified application objects.
-- An empty search_path prevents object-shadowing while leaving pg_catalog built-ins available.
alter function public.admin_list_deleted_jobs() set search_path = '';
alter function public.job_file_can_be_deleted(text, text) set search_path = '';

-- Pure path parsing does not require owner privileges. Storage policies may still call it,
-- but it now executes with the caller's privileges instead of bypassing RLS/ACL boundaries.
alter function public.storage_object_job_id(text) security invoker;
alter function public.storage_object_job_id(text) set search_path = '';

-- Pin search_path for functions reported by the Supabase security advisor.
-- Their application-object references are already schema-qualified; pg_catalog built-ins
-- remain available with an empty search_path.
alter function public.touch_devices_updated_at() set search_path = '';
alter function public.touch_push_subscriptions_updated_at() set search_path = '';
alter function public.guard_job_sms_runtime_columns() set search_path = '';
alter function public.touch_services_updated_at() set search_path = '';
alter function public.set_contractors_updated_at() set search_path = '';
alter function public.enforce_contractors_no_duplicates() set search_path = '';
alter function public.normalize_contractors_email(text) set search_path = '';
alter function public.normalize_contractors_phone(text) set search_path = '';
alter function public.normalize_contractors_nip(text) set search_path = '';
alter function public.enforce_contractors_contact_duplicates() set search_path = '';
alter function public.enforce_jobs_use_existing_contractor() set search_path = '';
alter function public.touch_contractors_updated_at() set search_path = '';
alter function public.calculate_service_due_date(date) set search_path = '';
alter function public.set_job_service_due_date() set search_path = '';
alter function public.normalize_contractors_text(text) set search_path = '';

commit;
