create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text,
  body text,
  is_read boolean default false,
  link_job_id uuid,
  created_at timestamptz default now()
);

grant select, insert, update, delete
  on table public.notifications
  to authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

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

alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
drop policy if exists "notifications_delete" on public.notifications;

create policy "notifications_select_owner_or_admin"
on public.notifications
for select
to authenticated
using (
  public.current_user_is_admin()
  or user_id = auth.uid()
);

create policy "notifications_insert_owner_or_admin"
on public.notifications
for insert
to authenticated
with check (
  public.current_user_is_admin()
  or user_id = auth.uid()
);

create policy "notifications_update_owner_or_admin"
on public.notifications
for update
to authenticated
using (
  public.current_user_is_admin()
  or user_id = auth.uid()
)
with check (
  public.current_user_is_admin()
  or user_id = auth.uid()
);

create policy "notifications_delete_owner_or_admin"
on public.notifications
for delete
to authenticated
using (
  public.current_user_is_admin()
  or user_id = auth.uid()
);
