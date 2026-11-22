-- WAWIS 14.76 — powiadomienie administratora o nowym logowaniu i blokada konta (decyzja właściciela 22.11.2026:
-- „powiadomienie plus blokada”, w panelu Diagnostyka).
--
-- 1) Nowe logowanie = nowa sesja w auth.sessions (odświeżanie tokenu nie tworzy sesji). Zadanie bazy co minutę
--    zapisuje nowe sesje w private.login_session_notices_v1476 i — gdy są — wywołuje funkcję Edge
--    notify-new-login z jednorazowym kodem (wzorzec 14.17). Funkcja wysyła PUSH do administratorów.
--    Działa po stronie serwera: logowanie z pominięciem aplikacji też zostaje zgłoszone.
--    Sesje istniejące w chwili migracji są zapisane jako już zgłoszone (bez lawiny powiadomień).
-- 2) Blokada: administrator (sesja potwierdzona kodem, gdy ma kod) ustawia auth.users.banned_until — Supabase
--    odmawia logowania i odświeżenia sesji — i kończy wszystkie sesje osoby. current_user_mfa_ok() od 14.76
--    zwraca false także dla zablokowanego konta, więc reguły RESTRICTIVE z 14.74 odcinają dane od razu,
--    zanim wygaśnie ostatni token (do 1 h). Odblokowanie przywraca dostęp; konto, historia i dane zostają.
-- Wycofanie: docs/login-notice-block-rollback-v1476.sql.

create extension if not exists pg_net with schema extensions;

-- Konto bez kodu albo sesja potwierdzona kodem — i konto niezablokowane.
create or replace function public.current_user_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
    or (
      (
        coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
        or not exists (
          select 1 from auth.mfa_factors f
          where f.user_id = auth.uid() and f.status = 'verified'
        )
      )
      and not exists (
        select 1 from auth.users u
        where u.id = auth.uid() and u.banned_until is not null and u.banned_until > now()
      )
    );
$$;
revoke all on function public.current_user_mfa_ok() from public;
grant execute on function public.current_user_mfa_ok() to anon, authenticated, service_role;
comment on function public.current_user_mfa_ok() is
  'WAWIS 14.74/14.76: konto z kodem z telefonu musi mieć sesję aal2; konto zablokowane przez administratora — brak dostępu.';

create table if not exists private.login_session_notices_v1476 (
  session_id uuid primary key,
  user_id uuid not null,
  session_created_at timestamptz not null,
  user_agent text,
  detected_at timestamptz not null default now(),
  notified_at timestamptz,
  baseline boolean not null default false
);
create index if not exists login_session_notices_pending_v1476
  on private.login_session_notices_v1476 (detected_at) where notified_at is null;
revoke all on private.login_session_notices_v1476 from public, anon, authenticated;

create table if not exists private.login_notify_runs_v1476 (
  id uuid primary key default gen_random_uuid(),
  run_token text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb,
  constraint login_notify_token_length_v1476 check (length(run_token) = 64)
);
revoke all on private.login_notify_runs_v1476 from public, anon, authenticated;

create table if not exists private.user_access_block_log_v1476 (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  blocked boolean not null,
  actor_id uuid not null,
  sessions_ended integer not null default 0,
  created_at timestamptz not null default now()
);
revoke all on private.user_access_block_log_v1476 from public, anon, authenticated;

-- Sesje sprzed wdrożenia: zapisane jako już zgłoszone.
insert into private.login_session_notices_v1476 (session_id, user_id, session_created_at, user_agent, notified_at, baseline)
select s.id, s.user_id, s.created_at, s.user_agent, now(), true
from auth.sessions s
where s.user_id is not null
on conflict (session_id) do nothing;

-- Przyjęcie zadania przez funkcję Edge: kod zgodny, zadanie z ostatnich 15 min, niewykonane.
-- Zwraca logowania do zgłoszenia i od razu oznacza je jako zgłoszone (najwyżej jedno powiadomienie).
create or replace function public.claim_login_notices_v1476(p_run_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ok boolean := false;
  v_items jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'login_notice_service_only' using errcode = '42501';
  end if;
  update private.login_notify_runs_v1476
     set processed_at = now()
   where id = p_run_id and run_token = p_token and processed_at is null
     and created_at > now() - interval '15 minutes'
  returning true into v_ok;
  if not coalesce(v_ok, false) then
    return null;
  end if;
  with picked as (
    update private.login_session_notices_v1476 n
       set notified_at = now()
     where n.notified_at is null and n.detected_at > now() - interval '1 day'
    returning n.session_id, n.user_id, n.session_created_at, n.user_agent
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'sessionId', p.session_id,
           'userId', p.user_id,
           'fullName', coalesce(nullif(btrim(pr.full_name), ''), pr.email, 'Nieznany użytkownik'),
           'role', pr.role,
           'userAgent', p.user_agent,
           'createdAt', p.session_created_at
         ) order by p.session_created_at), '[]'::jsonb)
    into v_items
  from picked p
  left join public.profiles pr on pr.id = p.user_id;
  return v_items;
end;
$fn$;
revoke all on function public.claim_login_notices_v1476(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_login_notices_v1476(uuid, text) to service_role;

create or replace function public.finish_login_notify_run_v1476(p_run_id uuid, p_token text, p_result jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare changed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'login_notice_service_only' using errcode = '42501';
  end if;
  update private.login_notify_runs_v1476 set result = p_result
   where id = p_run_id and run_token = p_token
  returning true into changed;
  return coalesce(changed, false);
end;
$fn$;
revoke all on function public.finish_login_notify_run_v1476(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_login_notify_run_v1476(uuid, text, jsonb) to service_role;

-- Co minutę: nowe sesje → zapis; gdy są niezgłoszone, jedno wywołanie funkcji (najwyżej co 2 min).
create or replace function private.run_login_notify_v1476()
returns integer language plpgsql security definer set search_path = ''
as $fn$
declare
  v_run_id uuid;
  v_token text;
begin
  insert into private.login_session_notices_v1476 (session_id, user_id, session_created_at, user_agent)
  select s.id, s.user_id, s.created_at, s.user_agent
  from auth.sessions s
  where s.user_id is not null and s.created_at > now() - interval '1 day'
  on conflict (session_id) do nothing;

  if not exists (
    select 1 from private.login_session_notices_v1476
     where notified_at is null and detected_at > now() - interval '1 day'
  ) then
    return 0;
  end if;
  if exists (
    select 1 from private.login_notify_runs_v1476
     where processed_at is null and created_at > now() - interval '2 minutes'
  ) then
    return 0;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.login_notify_runs_v1476 (run_token) values (v_token) returning id into v_run_id;
  perform net.http_post(
    url => 'https://uohziyaudbpwmupvljyd.supabase.co/functions/v1/notify-new-login',
    body => jsonb_build_object('eventType', 'login_notice_v1476', 'runId', v_run_id, 'token', v_token),
    headers => '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds => 30000
  );
  delete from private.login_notify_runs_v1476 where created_at < now() - interval '7 days';
  delete from private.login_session_notices_v1476 where detected_at < now() - interval '90 days';
  return 1;
end;
$fn$;
revoke all on function private.run_login_notify_v1476() from public, anon, authenticated;

-- Diagnostyka administratora: konta i ich aktywne logowania (sesje).
create or replace function public.admin_list_user_logins_v1476()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może przeglądać logowania.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'userId', p.id,
             'fullName', coalesce(nullif(btrim(p.full_name), ''), p.email),
             'email', p.email,
             'role', p.role,
             'isSelf', p.id = auth.uid(),
             'blocked', coalesce(u.banned_until > now(), false),
             'sessions', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'createdAt', s.created_at,
                        'lastActiveAt', greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz),
                        'userAgent', s.user_agent,
                        'current', s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
                      ) order by s.created_at desc)
               from auth.sessions s where s.user_id = p.id
             ), '[]'::jsonb)
           ) order by (p.role = 'Administrator') desc, coalesce(nullif(btrim(p.full_name), ''), p.email))
    from public.profiles p
    left join auth.users u on u.id = p.id
  ), '[]'::jsonb);
end;
$fn$;
revoke all on function public.admin_list_user_logins_v1476() from public, anon;
grant execute on function public.admin_list_user_logins_v1476() to authenticated;

-- Blokada / odblokowanie. Nie dla własnego konta. Blokada kończy wszystkie sesje (wylogowanie wszędzie).
create or replace function public.admin_set_user_blocked_v1476(p_user_id uuid, p_blocked boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ended integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może blokować konta.' using errcode = '42501';
  end if;
  if p_user_id is null or p_blocked is null then
    raise exception 'Nieprawidłowe dane blokady.' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nie można zablokować własnego konta.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id)
     or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Nie znaleziono konta.' using errcode = '22023';
  end if;

  update auth.users
     set banned_until = case when p_blocked then now() + interval '100 years' else null end,
         updated_at = now()
   where id = p_user_id;

  if p_blocked then
    delete from auth.sessions where user_id = p_user_id;
    get diagnostics v_ended = row_count;
  end if;

  insert into private.user_access_block_log_v1476 (user_id, blocked, actor_id, sessions_ended)
  values (p_user_id, p_blocked, auth.uid(), v_ended);

  return jsonb_build_object('userId', p_user_id, 'blocked', p_blocked, 'sessionsEnded', v_ended);
end;
$fn$;
revoke all on function public.admin_set_user_blocked_v1476(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_blocked_v1476(uuid, boolean) to authenticated;

do $block$
begin
  if not exists (select 1 from cron.job where jobname = 'wawis-login-notify-v1476') then
    perform cron.schedule('wawis-login-notify-v1476', '* * * * *', 'select private.run_login_notify_v1476();');
  end if;
end
$block$;
