-- WAWIS 14.18 — godzina codziennej kolejki SMS (decyzja właściciela 03.11.2026): powiadomienie o 6:30 czasu
-- polskiego, tylko od poniedziałku do piątku. W sobotę i niedzielę zadanie nic nie robi; SMS-y z weekendu
-- trafiają do poniedziałkowego odświeżenia (kolejka obejmuje wszystkie przypomnienia z terminem do dziś).
-- Wymaga migracji 20261103140000 (14.17). Bez zmian istniejących tabel i danych.
-- pg_cron działa w GMT, a czas polski zmienia się (zima +1, lato +2), więc zadanie startuje co 15 min
-- 04:00–06:45 GMT w dni robocze, a godzinę sprawdza funkcja: pierwsza próba o 6:30 czasu polskiego,
-- ponowienie najwyżej co 30 min, nie później niż do 8:00.

-- Czy w danej chwili wolno uruchomić zadanie: poniedziałek–piątek, 6:30–8:00 czasu polskiego.
create or replace function private.sms_queue_daily_window_v1418(p_at timestamptz)
returns boolean language sql stable set search_path = ''
as $fn$
  select extract(isodow from (p_at at time zone 'Europe/Warsaw')) <= 5
     and (p_at at time zone 'Europe/Warsaw')::time >= time '06:30'
     and (p_at at time zone 'Europe/Warsaw')::time < time '08:00';
$fn$;
revoke all on function private.sms_queue_daily_window_v1418(timestamptz) from public, anon, authenticated;

create or replace function private.run_sms_queue_daily_v1417()
returns integer language plpgsql security definer set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  r record;
begin
  if not private.sms_queue_daily_window_v1418(now()) then return 0; end if;

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

do $block$
begin
  if exists (select 1 from cron.job where jobname = 'wawis-sms-queue-daily-v1417') then
    perform cron.unschedule('wawis-sms-queue-daily-v1417');
  end if;
  if not exists (select 1 from cron.job where jobname = 'wawis-sms-queue-daily-v1418') then
    perform cron.schedule(
      'wawis-sms-queue-daily-v1418',
      '*/15 4-6 * * 1-5',
      'select private.run_sms_queue_daily_v1417();'
    );
  end if;
end
$block$;
