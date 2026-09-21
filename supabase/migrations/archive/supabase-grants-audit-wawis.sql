-- Wawis / klima-app - audyt i poprawki pod zmianę Supabase Data API GRANT
-- Data: 2026-05-14
-- Cel: sprawdzić i uzupełnić jawne GRANT dla tabel używanych przez supabase-js / PostgREST.
-- Uruchom najpierw sekcję A (tylko odczyt). Sekcję B uruchamiaj świadomie, najlepiej po backupie.

-- ============================================================
-- A) AUDYT: pokaż obecne uprawnienia tabel w public dla ról API
-- ============================================================
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_schema, table_name, grantee
order by table_name, grantee;

-- AUDYT: pokaż tabele z public, które nie mają żadnego jawnego GRANT dla authenticated/service_role
select
  t.table_schema,
  t.table_name,
  bool_or(g.grantee = 'authenticated') as has_authenticated_grant,
  bool_or(g.grantee = 'service_role') as has_service_role_grant
from information_schema.tables t
left join information_schema.role_table_grants g
  on g.table_schema = t.table_schema
 and g.table_name = t.table_name
 and g.grantee in ('authenticated', 'service_role')
where t.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
group by t.table_schema, t.table_name
order by t.table_name;

-- AUDYT: pokaż uprawnienia funkcji RPC w public dla authenticated/service_role
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  r.rolname as role_name,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('authenticated'), ('service_role')) as r(rolname)
where n.nspname = 'public'
  and p.proname like 'admin_%'
order by p.proname, arguments, role_name;

-- ============================================================
-- B) POPRAWKI: jawne GRANT dla tabel używanych przez aplikację
-- ============================================================
-- Uwaga: RLS dalej decyduje, które wiersze użytkownik widzi/zmienia.
-- Nie dajemy anon do danych firmowych, bo aplikacja jest po logowaniu.

-- Główne tabele używane bezpośrednio przez frontend
-- Jeśli któraś tabela nie istnieje, dana linia zakończy się błędem; uruchamiaj tylko dla istniejących tabel.
grant select, insert, update, delete on table public.jobs to authenticated, service_role;
grant select, insert, update, delete on table public.job_access to authenticated, service_role;
grant select, insert, update, delete on table public.comments to authenticated, service_role;
grant select, insert, update, delete on table public.photos to authenticated, service_role;
grant select, insert, update, delete on table public.notifications to authenticated, service_role;
grant select, insert, update, delete on table public.contractors to authenticated, service_role;
grant select, insert, update, delete on table public.devices to authenticated, service_role;

grant select, insert, update on table public.push_subscriptions to authenticated, service_role;
grant select on table public.push_delivery_log to authenticated;
grant select, insert, update, delete on table public.push_delivery_log to service_role;

-- SMS: w Twojej aplikacji dostęp użytkownika idzie głównie przez RPC/Edge Functions.
-- Dlatego NIE przywracamy authenticated, jeżeli chcesz utrzymać mocniejszą blokadę z sms-module-stage-6-admin-guards.sql.
grant select, insert, update, delete on table public.sms_settings to service_role;
grant select, insert, update, delete on table public.sms_log to service_role;

-- Audit zdjęć: aplikacja używa RPC; service_role dostaje pełny dostęp techniczny.
grant select, insert, update, delete on table public.photo_audit_log to service_role;

-- Jeśli masz stare tabele z bigint identity / serial, insert przez Data API może wymagać sekwencji.
-- W nowych tabelach zwykle używasz UUID/gen_random_uuid(), więc to jest zabezpieczenie na przyszłość.
grant usage, select on all sequences in schema public to authenticated, service_role;

-- RPC - przykładowe zbiorcze dopilnowanie wykonania funkcji admin_* dla authenticated.
-- Te GRANT-y w większości już masz w plikach, ale ten blok pomaga przy odtworzeniu projektu.
do $$
declare
  f record;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin_%'
  loop
    execute format('grant execute on function %s to authenticated', f.oid::regprocedure);
  end loop;
end $$;

-- ============================================================
-- C) WZORZEC DLA KAŻDEJ NOWEJ TABELI OD TERAZ
-- ============================================================
-- create table public.twoja_nowa_tabela (...);
-- grant select, insert, update, delete on table public.twoja_nowa_tabela to authenticated, service_role;
-- alter table public.twoja_nowa_tabela enable row level security;
-- create policy "..." on public.twoja_nowa_tabela for select to authenticated using (...);
