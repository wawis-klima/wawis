-- Wawis Klimatyzacja v9.79
-- Prywatne protokoły PDF tworzone wyłącznie dla zakończonych zleceń.
-- Skrypt jest idempotentny i może być uruchomiony ponownie w Supabase SQL Editor.

begin;

create table if not exists public.job_protocols (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

comment on table public.job_protocols is
  'Jeden podpisany protokół PDF przypisany do zakończonego zlecenia.';
comment on column public.job_protocols.storage_path is
  'Ścieżka prywatnego pliku PDF w bucketcie job-protocols.';

alter table public.job_protocols enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert on table public.job_protocols to authenticated, service_role;
grant update, delete on table public.job_protocols to service_role;

drop policy if exists "job_protocols_select_accessible_job" on public.job_protocols;
create policy "job_protocols_select_accessible_job"
on public.job_protocols
for select
to authenticated
using (public.current_user_can_access_job(job_id));

drop policy if exists "job_protocols_insert_completed_job" on public.job_protocols;
create policy "job_protocols_insert_completed_job"
on public.job_protocols
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.current_user_can_access_job(job_id)
  and exists (
    select 1
    from public.jobs j
    where j.id = job_id
      and j.status = 'Zakończone'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-protocols', 'job-protocols', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "job_protocols_storage_select_accessible_job" on storage.objects;
create policy "job_protocols_storage_select_accessible_job"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-protocols'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_protocols_storage_insert_completed_job" on storage.objects;
create policy "job_protocols_storage_insert_completed_job"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-protocols'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
  and exists (
    select 1
    from public.jobs j
    where j.id = public.storage_object_job_id(name)
      and j.status = 'Zakończone'
  )
);

drop policy if exists "job_protocols_storage_delete_admin_or_owner" on storage.objects;
create policy "job_protocols_storage_delete_admin_or_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-protocols'
  and (
    public.current_user_is_admin()
    or owner_id = (select auth.uid()::text)
  )
);

commit;
