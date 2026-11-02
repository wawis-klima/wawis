-- WAWIS 14.08: minimalne środowisko do testu migracji naklejek QR na JEDNORAZOWEJ bazie.
-- Nigdy nie uruchamiać na produkcji (przerywa, jeśli istnieje schemat storage).
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
create schema auth; create schema private;
grant usage on schema public, auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (id uuid primary key, full_name text, role text);
create table public.contractors (id uuid primary key, company_name text, contact_person text, city text, street text, phone text);
create table public.jobs (id uuid primary key, client text, title text, city text, street text, status text);
create table public.devices (id uuid primary key, contractor_id uuid, model text, serial_number text,
  installation_date date, source_job_id text unique);
-- Jak w produkcji: pracownik nie czyta urządzeń bezpośrednio.
alter table public.profiles enable row level security;
alter table public.contractors enable row level security;
alter table public.jobs enable row level security;
alter table public.devices enable row level security;
grant select on public.profiles, public.jobs to authenticated;
grant select, insert, update, delete on public.devices to service_role;
grant select on public.contractors to service_role;
create policy profiles_test_read on public.profiles for select to authenticated using (true);
create policy jobs_test_read on public.jobs for select to authenticated using (true);

create function public.current_user_is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid()
    and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')), false) $$;
create function public.current_user_is_staff() returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid()
    and lower(trim(coalesce(p.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')), false) $$;
create function public.current_user_can_edit_job(p_job_id uuid) returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(public.current_user_is_staff() and p_job_id is not null and exists (
    select 1 from public.jobs j where j.id = p_job_id
      and (public.current_user_is_admin() or lower(trim(coalesce(j.status, ''))) <> 'zakończone')), false) $$;
grant execute on function public.current_user_is_admin(), public.current_user_is_staff(),
  public.current_user_can_edit_job(uuid) to authenticated, service_role;
