
create table if not exists public.app_diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id text not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  event_type text not null,
  severity text not null default 'warning',
  app_version text not null default '',
  platform text not null default '',
  online boolean,
  queue_pending integer not null default 0,
  queue_errors integer not null default 0,
  retry_count integer not null default 0,
  error_code text not null default '',
  error_message text not null default '',
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint app_diagnostic_events_severity_check check (severity in ('warning', 'error')),
  constraint app_diagnostic_events_lengths_check check (
    length(client_event_id) between 8 and 180
    and length(event_type) <= 120
    and length(app_version) <= 24
    and length(platform) <= 24
    and length(error_code) <= 80
    and length(error_message) <= 500
  ),
  unique (user_id, client_event_id)
);

create index if not exists app_diagnostic_events_received_idx
  on public.app_diagnostic_events (received_at desc);
create index if not exists app_diagnostic_events_user_received_idx
  on public.app_diagnostic_events (user_id, received_at desc);

alter table public.app_diagnostic_events enable row level security;

revoke all on table public.app_diagnostic_events from anon, authenticated;
grant insert on table public.app_diagnostic_events to authenticated;
grant select, delete on table public.app_diagnostic_events to authenticated;
grant select, insert, update, delete on table public.app_diagnostic_events to service_role;

drop policy if exists "app_diagnostic_events_insert_own" on public.app_diagnostic_events;
create policy "app_diagnostic_events_insert_own"
on public.app_diagnostic_events for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "app_diagnostic_events_admin_read" on public.app_diagnostic_events;
create policy "app_diagnostic_events_admin_read"
on public.app_diagnostic_events for select to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "app_diagnostic_events_admin_delete" on public.app_diagnostic_events;
create policy "app_diagnostic_events_admin_delete"
on public.app_diagnostic_events for delete to authenticated
using ((select public.current_user_is_admin()));
