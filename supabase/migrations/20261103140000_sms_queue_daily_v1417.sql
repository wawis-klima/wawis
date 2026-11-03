-- WAWIS 14.17 — codzienne odświeżenie kolejki SMS i powiadomienie administratora (decyzja właściciela 03.11.2026).
-- Wzorzec jak 13.30 (protocol_signed_push): zadanie bazy tworzy jednorazowy kod, funkcja Edge przyjmuje
-- zadanie tylko po potwierdzeniu kodu przez RPC dostępne wyłącznie dla service_role. Bez nowych sekretów.
-- Funkcja generate-service-sms-queue tylko ODŚWIEŻA kolejkę (jak otwarcie modułu SMS) — SMS-y nadal wysyła
-- wyłącznie administrator po zatwierdzeniu. Bez zmian istniejących tabel i danych.
create extension if not exists pg_net with schema extensions;

create table if not exists private.sms_queue_daily_runs_v1417 (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  run_token text not null,
  created_at timestamptz not null default now(),
  last_dispatched_at timestamptz,
  started_at timestamptz,
  processed_at timestamptz,
  result jsonb,
  constraint sms_queue_daily_token_length_v1417 check (length(run_token) = 64)
);
revoke all on private.sms_queue_daily_runs_v1417 from public, anon, authenticated;

-- Przyjęcie zadania: kod zgodny, zadanie z ostatnich 20 h, niewykonane; ponowne przyjęcie po 10 min
-- (gdy poprzednia próba przerwała się przed zakończeniem).
create or replace function public.claim_sms_queue_daily_run_v1417(p_run_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare claimed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sms_queue_daily_service_only' using errcode = '42501';
  end if;
  update private.sms_queue_daily_runs_v1417
     set started_at = now()
   where id = p_run_id
     and run_token = p_token
     and processed_at is null
     and created_at > now() - interval '20 hours'
     and (started_at is null or started_at < now() - interval '10 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$fn$;
revoke all on function public.claim_sms_queue_daily_run_v1417(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_sms_queue_daily_run_v1417(uuid, text) to service_role;

create or replace function public.finish_sms_queue_daily_run_v1417(p_run_id uuid, p_token text, p_result jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare changed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sms_queue_daily_service_only' using errcode = '42501';
  end if;
  update private.sms_queue_daily_runs_v1417
     set processed_at = coalesce(processed_at, now()), result = p_result
   where id = p_run_id and run_token = p_token
  returning true into changed;
  return coalesce(changed, false);
end;
$fn$;
revoke all on function public.finish_sms_queue_daily_run_v1417(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_sms_queue_daily_run_v1417(uuid, text, jsonb) to service_role;

-- Liczba SMS-ów czekających na zatwierdzenie tak, jak widzi je administrator: wpis główny grupy
-- (albo wpis bez grupy) w statusie pending_approval, w grupie bez SMS-a już wysłanego/doręczonego.
create or replace function public.count_pending_sms_groups_v1417()
returns integer
language plpgsql stable security definer set search_path = ''
as $fn$
declare v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sms_queue_daily_service_only' using errcode = '42501';
  end if;
  select count(*) into v_count
  from public.sms_log l
  where l.sms_type = 'service_reminder'
    and lower(btrim(coalesce(l.status, ''))) = 'pending_approval'
    and (l.reminder_group_id is null or l.reminder_group_primary is true)
    and not exists (
      select 1 from public.sms_log s
      where l.reminder_group_id is not null
        and s.reminder_group_id = l.reminder_group_id
        and s.id <> l.id
        and lower(btrim(coalesce(s.status, ''))) in ('sent', 'provider_sent', 'delivered')
    );
  return coalesce(v_count, 0);
end;
$fn$;
revoke all on function public.count_pending_sms_groups_v1417() from public, anon, authenticated;
grant execute on function public.count_pending_sms_groups_v1417() to service_role;

create or replace function private.dispatch_sms_queue_daily_run_v1417(p_run_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare r record;
begin
  select id, run_token, processed_at into r from private.sms_queue_daily_runs_v1417 where id = p_run_id;
  if not found or r.processed_at is not null then return; end if;
  perform net.http_post(
    url => 'https://uohziyaudbpwmupvljyd.supabase.co/functions/v1/generate-service-sms-queue',
    body => jsonb_build_object('eventType', 'sms_queue_daily_v1417', 'runId', r.id, 'token', r.run_token),
    headers => '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds => 60000
  );
  update private.sms_queue_daily_runs_v1417
     set last_dispatched_at = now()
   where id = p_run_id and processed_at is null;
end;
$fn$;
revoke all on function private.dispatch_sms_queue_daily_run_v1417(uuid) from public, anon, authenticated;

-- Jedno zadanie na dzień (czas polski); kolejne uruchomienia tego samego ranka ponawiają tylko
-- niewykonane zadanie (najwyżej co 30 min).
create or replace function private.run_sms_queue_daily_v1417()
returns integer language plpgsql security definer set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  r record;
begin
  insert into private.sms_queue_daily_runs_v1417 (run_date, run_token)
  values (v_today, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (run_date) do nothing;

  select id into r from private.sms_queue_daily_runs_v1417
   where run_date = v_today and processed_at is null
     and (last_dispatched_at is null or last_dispatched_at < now() - interval '30 minutes');
  if not found then return 0; end if;
  perform private.dispatch_sms_queue_daily_run_v1417(r.id);
  return 1;
end;
$fn$;
revoke all on function private.run_sms_queue_daily_v1417() from public, anon, authenticated;

-- 06:17, 07:17 i 08:17 UTC (zimą 7:17–9:17, latem 8:17–10:17 czasu polskiego): pierwsza próba,
-- dwie zapasowe. Zadanie wykonuje się raz dziennie.
do $block$
begin
  if not exists (select 1 from cron.job where jobname = 'wawis-sms-queue-daily-v1417') then
    perform cron.schedule(
      'wawis-sms-queue-daily-v1417',
      '17 6,7,8 * * *',
      'select private.run_sms_queue_daily_v1417();'
    );
  end if;
end
$block$;
