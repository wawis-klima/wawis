-- Push notifications for assignment events
-- Run this in Supabase SQL Editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  type text not null,
  status text not null,
  response_code integer,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.touch_push_subscriptions_updated_at();

grant select, insert, update
  on table public.push_subscriptions
  to authenticated;

grant select
  on table public.push_delivery_log
  to authenticated;

grant select, insert, update, delete
  on table public.push_subscriptions, public.push_delivery_log
  to service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "push_delivery_log_select_own" on public.push_delivery_log;
create policy "push_delivery_log_select_own"
on public.push_delivery_log
for select
using (auth.uid() = user_id);
