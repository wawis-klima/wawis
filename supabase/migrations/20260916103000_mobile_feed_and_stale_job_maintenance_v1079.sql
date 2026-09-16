-- WAWIS 10.79 — wspólny feed zmian dla całego zespołu oraz
-- serwerowe starzenie statusu Nowe -> Niezrealizowane po 30 dniach.
-- Migracja jest samowystarczalna również wtedy, gdy historyczna infrastruktura
-- mobile_change_feed z 10.10 nie została wcześniej wdrożona na danym środowisku.

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

-- Od 10.60 każdy pracownik widzi wszystkie montaże. Feed 10.10 kierował
-- globalny wpis tylko do administratora, dlatego nieprzypisany pracownik mógł
-- ominąć zmianę. Od 10.79 każde zdarzenie ma jeden globalny wpis dla zespołu.
create or replace function public.record_mobile_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if tg_op = 'DELETE' then
    v_job_id := old.id;
  else
    v_job_id := new.id;
  end if;

  insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
  values (null, v_job_id, lower(tg_op));

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
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if tg_op = 'DELETE' then v_job_id := old.job_id; else v_job_id := new.job_id; end if;

  -- job_access nadal wpływa na metadane viewerów w aplikacji, ale nie na
  -- widoczność samego montażu; jedna zmiana globalna wystarcza całemu zespołowi.
  insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
  values (null, v_job_id, 'access_' || lower(tg_op));

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.record_mobile_job_access_change() from public, anon, authenticated;

drop trigger if exists job_access_record_mobile_change on public.job_access;
create trigger job_access_record_mobile_change
after insert or update or delete on public.job_access
for each row execute function public.record_mobile_job_access_change();

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
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_is_staff() then
    return;
  end if;

  return query
  select f.change_seq, f.job_id, f.change_kind, f.changed_at
  from public.mobile_change_feed f
  where f.change_seq > greatest(coalesce(p_after_seq, 0), 0)
    and f.audience_user_id is null
  order by f.change_seq
  limit least(greatest(coalesce(p_limit, 100), 1), 250);
end;
$$;

create or replace function public.get_mobile_change_head()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.current_user_is_staff() then coalesce(max(f.change_seq), 0)
    else 0
  end
  from public.mobile_change_feed f
  where f.audience_user_id is null;
$$;

revoke all on function public.get_mobile_change_batch(bigint, integer) from public, anon;
revoke all on function public.get_mobile_change_head() from public, anon;
grant execute on function public.get_mobile_change_batch(bigint, integer) to authenticated, service_role;
grant execute on function public.get_mobile_change_head() to authenticated, service_role;

-- Jednorazowa globalna migawka po zmianie modelu widoczności. Dzięki temu
-- każdy telefon dostanie sekwencje nowsze od swojego starego kursora.
insert into public.mobile_change_feed (audience_user_id, job_id, change_kind)
select null, j.id, 'v1079_bootstrap'
from public.jobs j;

-- Stary klient wykonywał UPDATE statusu podczas zwykłego odczytu listy.
-- Przenosimy maintenance do bazy i uruchamiamy go niezależnie od sesji użytkownika.
create or replace function private.refresh_stale_new_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer := 0;
begin
  with changed as (
    update public.jobs
    set status = 'Niezrealizowane'
    where lower(trim(coalesce(status, ''))) in ('nowe', 'nowe zlecenie')
      and created_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::integer into v_changed from changed;

  return coalesce(v_changed, 0);
end;
$$;

revoke all on function private.refresh_stale_new_jobs() from public, anon, authenticated;
grant execute on function private.refresh_stale_new_jobs() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'wawis-stale-new-jobs-v1079';

select cron.schedule(
  'wawis-stale-new-jobs-v1079',
  '17 * * * *',
  $cron$select private.refresh_stale_new_jobs();$cron$
);

-- Wyrównanie stanu od razu przy wdrożeniu, bez czekania do kolejnej godziny.
select private.refresh_stale_new_jobs();

commit;
