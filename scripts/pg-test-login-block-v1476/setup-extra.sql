-- WAWIS 14.76 — uzupełnienie atrapy Supabase (na bazie testu 14.74) o sesje, blokadę, cron i pg_net.
create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt()->>'role', 'service_role') $$;
grant execute on function auth.role() to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, banned_until timestamptz, updated_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now(),
  updated_at timestamptz, refreshed_at timestamp, user_agent text, ip inet);
alter table public.profiles add column full_name text, add column email text;
update public.profiles set full_name = case id
  when '00000000-0000-0000-0000-0000000000a1' then 'Piotr Admin'
  when '00000000-0000-0000-0000-0000000000a2' then 'Drugi Admin'
  else 'Kacper Pracownik' end;
insert into auth.users (id, email) select id, id::text || '@test' from public.profiles;
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid $$;
create function cron.unschedule(id bigint) returns boolean language sql as $$ delete from cron.job where jobid = id returning true $$;
create schema net;
create table net.calls (id bigserial primary key, url text, body jsonb);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ insert into net.calls(url, body) values (url, body) returning id $$;
-- sesja istniejąca przed wdrożeniem
insert into auth.sessions (user_id, user_agent) values ('00000000-0000-0000-0000-0000000000b1', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1');
