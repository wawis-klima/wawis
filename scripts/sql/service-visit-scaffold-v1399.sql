-- WAWIS 13.99: minimalne środowisko Supabase do testu migracji serwisu na JEDNORAZOWEJ bazie.
-- Nigdy nie uruchamiać na produkcji ani na bazie z danymi klientów.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    raise exception 'NO-GO: baza wygląda na prawdziwe Supabase (schemat storage istnieje)';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth; create schema storage; create schema private; create schema extensions;
create schema cron; create schema net;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create table auth.users (id uuid primary key);

create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null,
  name text not null, metadata jsonb, owner uuid, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
grant execute on function storage.foldername(text) to authenticated, service_role;

create table net.calls (id bigserial primary key, url text, body jsonb);
create function net.http_post(url text, body jsonb, headers jsonb default null, timeout_milliseconds int default null)
returns bigint language sql as $$ insert into net.calls(url, body) values (url, body) returning id $$;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job(jobname, schedule, command) values (jobname, schedule, command) returning jobid $$;

create table public.profiles (id uuid primary key, full_name text, role text);
create table public.contractors (id uuid primary key, company_name text, contact_person text,
  city text, street text, phone text, email text);
create table public.devices (id uuid primary key, contractor_id uuid references public.contractors(id),
  model text, serial_number text, installation_date date, status text);
create table public.push_delivery_log (id bigserial primary key, type text);
grant select on public.profiles, public.contractors, public.devices to authenticated;
grant select, insert, delete on public.push_delivery_log to service_role;
-- RLS jak w produkcji (zasada smoke-supabase-grants obejmuje też fikcyjne środowisko testowe).
alter table public.profiles enable row level security;
alter table public.contractors enable row level security;
alter table public.devices enable row level security;
alter table public.push_delivery_log enable row level security;
create policy profiles_test_read on public.profiles for select to authenticated using (true);
create policy contractors_test_read on public.contractors for select to authenticated using (true);
create policy devices_test_read on public.devices for select to authenticated using (true);

create function public.current_user_is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid()
    and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')), false) $$;
create function public.current_user_is_staff() returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.role in ('Administrator', 'Pracownik')), false) $$;
grant execute on function public.current_user_is_admin(), public.current_user_is_staff() to authenticated, service_role;
