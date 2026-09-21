-- WAWIS v10.10: przyrostowa synchronizacja, potwierdzenia operacji,
-- cicha diagnostyka i kolejka kopii zapasowych plikow.
-- Skrypt jest idempotentny i nie zmienia istniejacych danych zlecen.

begin;

create table if not exists public.mobile_change_feed (
  change_seq bigint generated always as identity primary key,
  audience_user_id uuid references public.profiles(id) on delete cascade,
  job_id uuid not null,
  change_kind text not null default 'job_changed',
  changed_at timestamptz not null default now()
);

create index if not exists mobile_change_feed_audience_seq_idx
  on public.mobile_change_feed (audience_user_id, change_seq);
create index if not exists mobile_change_feed_global_seq_idx
  on public.mobile_change_feed (change_seq)
  where audience_user_id is null;

alter table public.mobile_change_feed enable row level security;
revoke all on table public.mobile_change_feed from anon, authenticated;
grant select, insert, update, delete on table public.mobile_change_feed to service_role;

create or replace function public.record_mobile_job_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_old_created_by uuid;
  v_old_main_technician uuid;
  v_new_created_by uuid;
  v_new_main_technician uuid;
begin
  if tg_op = 'DELETE' then
    v_job_id := old.id;
    v_old_created_by := old.created_by;
    v_old_main_technician := old.main_technician_id;
  elsif tg_op = 'INSERT' then
    v_job_id := new.id;
    v_new_created_by := new.created_by;
    v_new_main_technician := new.main_technician_id;
  else
    v_job_id := new.id;
    v_old_created_by := old.created_by;
    v_old_main_technician := old.main_technician_id;
    v_new_created_by := new.created_by;
    v_new_main_technician := new.main_technician_id;
  end if;

  -- Jeden wpis globalny jest przeznaczony dla administratorow.
  insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
  values (null, v_job_id, lower(tg_op));

  -- Pracownik dostaje wpis tylko dla zlecen, ktore mogly go dotyczyc przed
  -- lub po zmianie. Ostateczne uprawnienie jest ponownie sprawdzane przy odczycie.
  insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
  select distinct audience_id, v_job_id, lower(tg_op)
  from (
    values (v_old_created_by), (v_old_main_technician),
           (v_new_created_by), (v_new_main_technician)
  ) as direct_users(audience_id)
  where audience_id is not null
  on conflict do nothing;

  if tg_op <> 'DELETE' then
    insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
    select distinct ja.user_id, v_job_id, lower(tg_op)
    from public.job_access ja
    where ja.job_id = v_job_id
      and ja.user_id is not null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.record_mobile_job_change() from public, anon, authenticated;

drop trigger if exists jobs_record_mobile_change on public.jobs;
create trigger jobs_record_mobile_change
after insert or update or delete on public.jobs
for each row execute function public.record_mobile_job_change();

create or replace function public.record_mobile_job_access_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if tg_op = 'DELETE' then v_job_id := old.job_id; else v_job_id := new.job_id; end if;
  insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
  values (null, v_job_id, 'access_' || lower(tg_op));

  if tg_op <> 'INSERT' and old.user_id is not null then
    insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
    values (old.user_id, v_job_id, 'access_' || lower(tg_op));
  end if;
  if tg_op <> 'DELETE' and new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
    values (new.user_id, v_job_id, 'access_' || lower(tg_op));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.record_mobile_job_access_change() from public, anon, authenticated;

drop trigger if exists job_access_record_mobile_change on public.job_access;
create trigger job_access_record_mobile_change
after insert or update or delete on public.job_access
for each row execute function public.record_mobile_job_access_change();

-- Pierwsze uruchomienie zasila dziennik aktualnym stanem. Dzięki temu telefon,
-- który miał starszą migawkę przed wdrożeniem 10.10, nie ominie żadnego zlecenia.
do $$
begin
  if not exists (select 1 from public.mobile_change_feed limit 1) then
    insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
    select null, j.id, 'bootstrap' from public.jobs j;

    insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
    select distinct audience_id, job_id, 'bootstrap'
    from (
      select j.created_by as audience_id, j.id as job_id from public.jobs j
      union all
      select j.main_technician_id, j.id from public.jobs j
      union all
      select ja.user_id, ja.job_id from public.job_access ja
    ) audiences
    where audience_id is not null;
  end if;
end;
$$;

create or replace function public.get_mobile_change_batch(
  p_after_seq bigint default 0,
  p_limit integer default 100
)
returns table (
  change_seq bigint,
  job_id uuid,
  change_kind text,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return query
  select f.change_seq, f.job_id, f.change_kind, f.changed_at
  from public.mobile_change_feed f
  where f.change_seq > greatest(coalesce(p_after_seq, 0), 0)
    and (
      (public.current_user_is_admin() and f.audience_user_id is null)
      or (not public.current_user_is_admin() and f.audience_user_id = auth.uid())
    )
  order by f.change_seq
  limit least(greatest(coalesce(p_limit, 100), 1), 250);
end;
$$;

create or replace function public.get_mobile_change_head()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(f.change_seq), 0)
  from public.mobile_change_feed f
  where auth.uid() is not null
    and (
      (public.current_user_is_admin() and f.audience_user_id is null)
      or (not public.current_user_is_admin() and f.audience_user_id = auth.uid())
    );
$$;

revoke all on function public.get_mobile_change_batch(bigint, integer) from public, anon;
revoke all on function public.get_mobile_change_head() from public, anon;
grant execute on function public.get_mobile_change_batch(bigint, integer) to authenticated, service_role;
grant execute on function public.get_mobile_change_head() to authenticated, service_role;

create table if not exists public.mobile_sync_receipts (
  operation_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  operation_type text not null,
  completed_at timestamptz not null default now(),
  constraint mobile_sync_receipts_operation_id_length check (length(operation_id) between 8 and 180)
);

create index if not exists mobile_sync_receipts_user_completed_idx
  on public.mobile_sync_receipts (user_id, completed_at desc);
alter table public.mobile_sync_receipts enable row level security;
revoke all on table public.mobile_sync_receipts from anon, authenticated;
grant select, insert on table public.mobile_sync_receipts to authenticated;
grant select, insert, update, delete on table public.mobile_sync_receipts to service_role;

drop policy if exists "mobile_sync_receipts_select_own_or_admin" on public.mobile_sync_receipts;
create policy "mobile_sync_receipts_select_own_or_admin"
on public.mobile_sync_receipts for select to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "mobile_sync_receipts_insert_own" on public.mobile_sync_receipts;
create policy "mobile_sync_receipts_insert_own"
on public.mobile_sync_receipts for insert to authenticated
with check (user_id = auth.uid());

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
with check (user_id = auth.uid());

drop policy if exists "app_diagnostic_events_admin_read" on public.app_diagnostic_events;
create policy "app_diagnostic_events_admin_read"
on public.app_diagnostic_events for select to authenticated
using (public.current_user_is_admin());

drop policy if exists "app_diagnostic_events_admin_delete" on public.app_diagnostic_events;
create policy "app_diagnostic_events_admin_delete"
on public.app_diagnostic_events for delete to authenticated
using (public.current_user_is_admin());

create table if not exists public.storage_backup_queue (
  id bigint generated always as identity primary key,
  source_bucket text not null,
  source_path text not null,
  source_kind text not null,
  source_version integer not null default 1,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  destination_path text not null default '',
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storage_backup_queue_status_check check (status in ('pending', 'copying', 'completed', 'error')),
  constraint storage_backup_queue_source_unique unique (source_bucket, source_path)
);

create index if not exists storage_backup_queue_work_idx
  on public.storage_backup_queue (status, next_attempt_at, id);
alter table public.storage_backup_queue enable row level security;
revoke all on table public.storage_backup_queue from anon, authenticated;
grant select on table public.storage_backup_queue to authenticated;
grant select, insert, update, delete on table public.storage_backup_queue to service_role;

drop policy if exists "storage_backup_queue_admin_read" on public.storage_backup_queue;
create policy "storage_backup_queue_admin_read"
on public.storage_backup_queue for select to authenticated
using (public.current_user_is_admin());

create or replace function public.get_storage_backup_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'administrator access required';
  end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'pending', count(*) filter (where status in ('pending', 'copying')),
      'errors', count(*) filter (where status = 'error'),
      'completed', count(*) filter (where status = 'completed'),
      'last_completed_at', max(completed_at)
    )
    from public.storage_backup_queue
  );
end;
$$;

revoke all on function public.get_storage_backup_overview() from public, anon;
grant execute on function public.get_storage_backup_overview() to authenticated, service_role;

create or replace function public.enqueue_storage_backup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text;
  v_path text;
  v_kind text;
begin
  if tg_table_name = 'photos' then
    v_bucket := 'job-photos';
    v_path := new.storage_path;
    v_kind := 'photo';
  else
    v_bucket := 'job-protocols';
    v_path := new.storage_path;
    v_kind := 'protocol';
  end if;

  if nullif(trim(coalesce(v_path, '')), '') is null then
    return new;
  end if;

  insert into public.storage_backup_queue (source_bucket, source_path, source_kind)
  values (v_bucket, v_path, v_kind)
  on conflict (source_bucket, source_path) do update
  set source_version = public.storage_backup_queue.source_version + 1,
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      completed_at = null,
      last_error = '',
      updated_at = now();
  return new;
end;
$$;

revoke all on function public.enqueue_storage_backup() from public, anon, authenticated;

drop trigger if exists photos_enqueue_storage_backup on public.photos;
create trigger photos_enqueue_storage_backup
after insert or update of storage_path on public.photos
for each row execute function public.enqueue_storage_backup();

do $$
begin
  if to_regclass('public.job_protocols') is not null then
    execute 'drop trigger if exists job_protocols_enqueue_storage_backup on public.job_protocols';
    execute 'create trigger job_protocols_enqueue_storage_backup after insert or update of storage_path on public.job_protocols for each row execute function public.enqueue_storage_backup()';
  end if;
end;
$$;

insert into public.storage_backup_queue (source_bucket, source_path, source_kind)
select 'job-photos', p.storage_path, 'photo'
from public.photos p
where nullif(trim(coalesce(p.storage_path, '')), '') is not null
on conflict (source_bucket, source_path) do nothing;

do $$
begin
  if to_regclass('public.job_protocols') is not null then
    execute $seed$
      insert into public.storage_backup_queue (source_bucket, source_path, source_kind)
      select 'job-protocols', p.storage_path, 'protocol'
      from public.job_protocols p
      where nullif(trim(coalesce(p.storage_path, '')), '') is not null
      on conflict (source_bucket, source_path) do nothing
    $seed$;
  end if;
end;
$$;

commit;
