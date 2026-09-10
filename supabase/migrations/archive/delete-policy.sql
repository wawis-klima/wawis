-- Admin-only RLS policy for deleting jobs.
-- Uruchom w Supabase SQL Editor, żeby kasowanie montaży było dostępne tylko dla administratora.

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false);
$$;

grant execute on function public.current_user_is_admin() to authenticated;

alter table public.jobs enable row level security;

drop policy if exists "jobs_delete" on public.jobs;
create policy "jobs_delete_admin"
on public.jobs
for delete
to authenticated
using (public.current_user_is_admin());
