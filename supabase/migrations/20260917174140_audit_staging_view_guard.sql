-- Rebuild gap: legacy worker-read migration allowed pending/no-profile users.
create or replace function public.current_user_can_view_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.current_user_is_staff() and p_job_id is not null
    and exists(select 1 from public.jobs j where j.id=p_job_id),false);
$$;
revoke all on function public.current_user_can_view_job(uuid) from public,anon;
grant execute on function public.current_user_can_view_job(uuid) to authenticated,service_role;
