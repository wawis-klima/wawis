drop database if exists wawis_mfa_test;
create database wawis_mfa_test;
\c wawis_mfa_test
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
create schema storage;
grant usage on schema storage to authenticated;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert on storage.objects to authenticated;

grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, role text);
create table public.contractors (id uuid primary key default gen_random_uuid(), company_name text, contact_person text, phone text, email text, city text, street text, addresses jsonb, notes text, is_active boolean, nip text, created_at timestamptz default now(), updated_at timestamptz);
create table public.jobs (id uuid primary key default gen_random_uuid(), contractor_id uuid);
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid);
alter table public.profiles enable row level security;
alter table public.contractors enable row level security;
alter table public.jobs enable row level security;
alter table public.push_subscriptions enable row level security;
grant select, insert, update on all tables in schema public to authenticated;
create function public.normalize_contractors_phone(t text) returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(t,''),'\D','','g'),'') $$;
create function public.normalize_contractors_email(t text) returns text language sql immutable as $$ select nullif(lower(trim(coalesce(t,''))),'') $$;
create function public.normalize_contractors_text(t text) returns text language sql immutable as $$ select lower(trim(coalesce(t,''))) $$;
create function public.normalize_contractor_addresses(a jsonb, c text, s text) returns jsonb language sql immutable as $$ select '[]'::jsonb $$;
-- produkcyjne definicje sprzed 14.74
create or replace function public.current_user_is_admin() returns boolean language sql stable security definer set search_path to 'public' as $f$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid() and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')), false); $f$;
create or replace function public.current_user_is_staff() returns boolean language sql stable security definer set search_path to 'public' as $f$
  select coalesce(auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and lower(trim(coalesce(p.role, ''))) in ('employee','pracownik','admin','administrator')), false); $f$;
grant execute on all functions in schema public to authenticated, anon, service_role;
create policy profiles_staff on public.profiles for select to authenticated using (public.current_user_is_staff());
create policy contractors_staff on public.contractors for select to authenticated using (public.current_user_is_staff());
create policy jobs_staff_select on public.jobs for select to authenticated using (public.current_user_is_staff());
create policy jobs_admin_insert on public.jobs for insert to authenticated with check (public.current_user_is_admin());
create policy objects_staff_select on storage.objects for select to authenticated using (public.current_user_is_staff());
create policy push_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

insert into public.profiles values ('00000000-0000-0000-0000-0000000000a1','Administrator'),('00000000-0000-0000-0000-0000000000a2','Administrator'),('00000000-0000-0000-0000-0000000000b1','Pracownik');
insert into auth.mfa_factors(user_id,status) values ('00000000-0000-0000-0000-0000000000a1','verified'),('00000000-0000-0000-0000-0000000000a2','unverified');
insert into public.contractors(id, company_name) values ('00000000-0000-0000-0000-00000000c001','Klient A');
insert into public.jobs(contractor_id) values ('00000000-0000-0000-0000-00000000c001');
insert into public.push_subscriptions(user_id) values ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1');
insert into storage.objects(bucket_id,name) values ('job-photos','a.jpg');
