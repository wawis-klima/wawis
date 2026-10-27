-- WAWIS 13.84 — wyłączanie martwych subskrypcji PUSH (zgoda właściciela 27.10.2026 10:13).
--
-- Problem (27.10.2026): telefon, który dostał nową subskrypcję (np. przy aktualizacjach PWA), zostawia
-- starą aktywną. Apple przyjmuje na nią powiadomienia (HTTP 201), ale ich nie doręcza — każde powiadomienie
-- szło na 2–3 adresy, a odbierał tylko jeden.
--
-- Reguła (raz dziennie): subskrypcja jest wyłączana (is_active = false — nic nie jest usuwane), gdy
--   1) urządzenie nie otwierało aplikacji od p_stale_days dni (last_seen_at), ORAZ
--   2) ta sama osoba ma INNĄ aktywną subskrypcję, widzianą później i w ciągu ostatnich p_stale_days dni.
-- Osoba z jednym urządzeniem nigdy nie traci powiadomień. Gdy wyłączone urządzenie jednak otworzy
-- aplikację, klient widzi is_active = false i sam tworzy nową subskrypcję (push-subscriptions.js,
-- replaceExpiredPushSubscription — ta sama ścieżka co po 404/410).
begin;

create or replace function private.deactivate_stale_push_subscriptions(p_stale_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := greatest(coalesce(p_stale_days, 7), 3);
  v_cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_stale_days, 7), 3));
  v_changed integer := 0;
begin
  with stale as (
    select s.id
    from public.push_subscriptions s
    where s.is_active
      and coalesce(s.last_seen_at, s.updated_at, s.created_at) < v_cutoff
      and exists (
        select 1
        from public.push_subscriptions o
        where o.user_id = s.user_id
          and o.id <> s.id
          and o.is_active
          and coalesce(o.last_seen_at, o.updated_at, o.created_at) >= v_cutoff
          and coalesce(o.last_seen_at, o.updated_at, o.created_at) > coalesce(s.last_seen_at, s.updated_at, s.created_at)
      )
    for update of s skip locked
  ), changed as (
    update public.push_subscriptions p
    set is_active = false
    from stale
    where p.id = stale.id and p.is_active
    returning 1
  )
  select count(*)::integer into v_changed from changed;

  if v_changed > 0 then
    raise log 'wawis push cleanup: deactivated % stale subscription(s) (older than % days, user has a newer active device)', v_changed, v_days;
  end if;
  return coalesce(v_changed, 0);
end;
$$;

comment on function private.deactivate_stale_push_subscriptions(integer) is
  'WAWIS 13.84: wyłącza (is_active=false) subskrypcje PUSH nieużywane od N dni, tylko gdy ta sama osoba ma nowsze aktywne urządzenie. Nic nie usuwa.';

revoke all on function private.deactivate_stale_push_subscriptions(integer) from public, anon, authenticated;
grant execute on function private.deactivate_stale_push_subscriptions(integer) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'wawis-push-stale-cleanup-v1384';

select cron.schedule(
  'wawis-push-stale-cleanup-v1384',
  '41 2 * * *',
  $cron$select private.deactivate_stale_push_subscriptions(7);$cron$
);

commit;
