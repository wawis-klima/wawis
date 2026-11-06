-- WAWIS 14.24: dodatek do scaffold 14.08 — montaż z urządzeniami, protokół, tabliczki (jednorazowa baza, nigdy produkcja).
alter table public.jobs add column device_model text, add column device_serial_number text;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
create schema storage;
create table storage.objects (bucket_id text, name text);
create table public.photos (id uuid primary key default gen_random_uuid(), job_id uuid, photo_kind text, device_index integer,
  unit_ref text, storage_path text, image_url text);
create table public.job_protocols (job_id uuid primary key, signed_at timestamptz, file_size_bytes bigint, storage_path text);
alter table public.photos enable row level security;
alter table public.job_protocols enable row level security;
grant select, insert, update, delete on public.photos, public.job_protocols to service_role;
grant select on storage.objects to service_role;
-- Test zmienia status jako zalogowany użytkownik (w produkcji robią to funkcje i polityki aplikacji).
grant update on public.jobs to authenticated;
create policy jobs_test_update on public.jobs for update to authenticated using (true) with check (true);
