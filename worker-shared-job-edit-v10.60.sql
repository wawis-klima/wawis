begin;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')
    ),
    false
  );
$$;

revoke all on function public.current_user_is_staff() from public, anon;
grant execute on function public.current_user_is_staff() to authenticated;

create or replace function public.current_user_can_view_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_is_staff()
    and p_job_id is not null
    and exists (select 1 from public.jobs j where j.id = p_job_id),
    false
  );
$$;

revoke all on function public.current_user_can_view_job(uuid) from public, anon;
grant execute on function public.current_user_can_view_job(uuid) to authenticated;

create or replace function public.current_user_can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_is_staff()
    and p_job_id is not null
    and exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and (
          public.current_user_is_admin()
          or lower(trim(coalesce(j.status, ''))) <> 'zakończone'
        )
    ),
    false
  );
$$;

revoke all on function public.current_user_can_access_job(uuid) from public, anon;
grant execute on function public.current_user_can_access_job(uuid) to authenticated;

drop policy if exists jobs_read_access on public.jobs;
create policy jobs_read_access on public.jobs for select to authenticated
using (public.current_user_is_staff());

drop policy if exists jobs_update_access on public.jobs;
create policy jobs_update_access on public.jobs for update to authenticated
using (public.current_user_can_access_job(id))
with check (public.current_user_can_access_job(id));

drop policy if exists jobs_create_own on public.jobs;
create policy jobs_create_own on public.jobs for insert to authenticated
with check (
  public.current_user_is_staff()
  and (created_by = auth.uid() or public.current_user_is_admin())
);

drop policy if exists access_insert_admin_or_creator_self on public.job_access;
drop policy if exists access_insert_staff on public.job_access;
create policy access_insert_staff on public.job_access for insert to authenticated
with check (
  public.current_user_can_access_job(job_id)
  and exists (
    select 1 from public.profiles target
    where target.id = user_id
      and lower(trim(coalesce(target.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')
  )
);

drop policy if exists access_delete_admin on public.job_access;
drop policy if exists access_delete_staff on public.job_access;
create policy access_delete_staff on public.job_access for delete to authenticated
using (public.current_user_can_access_job(job_id));

commit;
