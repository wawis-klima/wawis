-- WAWIS 10.89 — N7 stage B
-- Helper functions that existed before tracked migrations began and are required
-- by later historical migrations (RLS/storage policies, protocol access checks).

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false);
$$;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
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

create or replace function public.current_user_can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    public.current_user_is_staff()
    and p_job_id is not null
    and exists (select 1 from public.jobs j where j.id = p_job_id),
    false
  );
$$;

create or replace function public.storage_object_job_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(coalesce(p_name, ''), '/', 1)::uuid
    else null
  end;
$$;
