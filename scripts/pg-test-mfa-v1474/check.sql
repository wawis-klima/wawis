-- :phase = 'after' (po migracji) albo 'rollback'
create or replace function pg_temp.as_user(sub text, aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when sub is null then '{}' else json_build_object('sub', sub, 'aal', aal, 'role', 'authenticated')::text end, true);
end $$;
\set ON_ERROR_STOP on
begin;
set local role authenticated;
-- A: administrator z kodem, sesja aal1
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','aal1');
select 'A_is_admin' k, public.current_user_is_admin()::text v
union all select 'A_jobs', count(*)::text from public.jobs
union all select 'A_own_push', count(*)::text from public.push_subscriptions
union all select 'A_storage', count(*)::text from storage.objects;
rollback;
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','aal2');
select 'B_is_admin' k, public.current_user_is_admin()::text v
union all select 'B_jobs', count(*)::text from public.jobs
union all select 'B_own_push', count(*)::text from public.push_subscriptions
union all select 'B_storage', count(*)::text from storage.objects
union all select 'B_nip', public.save_job_contractor_nip('00000000-0000-0000-0000-00000000c001','123-456-78-90')
union all select 'B_new_client', (public.worker_create_or_get_contractor_for_job('Klient B'))->>'company_name';
rollback;
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1','aal1');
select 'C_is_staff' k, public.current_user_is_staff()::text v
union all select 'C_jobs', count(*)::text from public.jobs
union all select 'C_own_push', count(*)::text from public.push_subscriptions
union all select 'C_nip', coalesce(public.save_job_contractor_nip('00000000-0000-0000-0000-00000000c001','1234567890'),'null');
rollback;
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2','aal1');
select 'E_unverified_admin_is_admin' k, public.current_user_is_admin()::text v union all select 'E_jobs', count(*)::text from public.jobs;
rollback;
begin; select pg_temp.as_user(null,null);
select 'D_service_mfa_ok' k, coalesce((select public.current_user_mfa_ok()::text where exists(select 1 from pg_proc where proname='current_user_mfa_ok')),'brak funkcji') v;
rollback;
