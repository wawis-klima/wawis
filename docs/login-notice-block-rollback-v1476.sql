-- WAWIS 14.76 — wycofanie: powiadomienia o nowym logowaniu i blokada kont.
-- Przywraca current_user_mfa_ok() z 14.74, wyłącza zadanie bazy i usuwa funkcje 14.76.
-- Zablokowane konta POZOSTAJĄ zablokowane (auth.users.banned_until) — Supabase dalej odmawia im logowania.
-- Odblokowanie po wycofaniu: update auth.users set banned_until = null where id = '<id konta>';
-- Tabele private.*_v1476 zostają (historia blokad i zgłoszeń); usuń je ręcznie, jeśli trzeba.

do $block$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'wawis-login-notify-v1476' loop
    perform cron.unschedule(j.jobid);
  end loop;
end
$block$;

create or replace function public.current_user_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
    or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;
revoke all on function public.current_user_mfa_ok() from public;
grant execute on function public.current_user_mfa_ok() to anon, authenticated, service_role;
comment on function public.current_user_mfa_ok() is 'WAWIS 14.74: konto z włączonym kodem z telefonu musi mieć sesję aal2.';

drop function if exists public.admin_set_user_blocked_v1476(uuid, boolean);
drop function if exists public.admin_list_user_logins_v1476();
drop function if exists public.claim_login_notices_v1476(uuid, text);
drop function if exists public.finish_login_notify_run_v1476(uuid, text, jsonb);
drop function if exists private.run_login_notify_v1476();
