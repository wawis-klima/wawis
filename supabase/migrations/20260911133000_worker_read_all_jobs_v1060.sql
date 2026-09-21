-- WAWIS 10.60 — pracownicy widzą wszystkie montaże, ale nadal mogą modyfikować tylko te, do których mają dostęp.
-- Rozszerzamy wyłącznie polityki SELECT. Polityki INSERT/UPDATE/DELETE nadal korzystają
-- z public.current_user_can_access_job(...) i nie są poszerzane.

begin;

create or replace function public.current_user_can_view_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and p_job_id is not null
    and exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
    ),
    false
  );
$$;

grant execute on function public.current_user_can_view_job(uuid) to authenticated, service_role;

-- Lista montaży: każdy zalogowany użytkownik może zobaczyć wszystkie zlecenia.
drop policy if exists jobs_read_access on public.jobs;
create policy jobs_read_access
on public.jobs
for select
to authenticated
using (auth.uid() is not null);

-- Monterzy przypisani do zleceń muszą być widoczni przy każdym montażu.
drop policy if exists access_read_job on public.job_access;
create policy access_read_job
on public.job_access
for select
to authenticated
using (public.current_user_can_view_job(job_id));

-- Szczegóły montażu w trybie podglądu.
drop policy if exists comments_read_job on public.comments;
create policy comments_read_job
on public.comments
for select
to authenticated
using (public.current_user_can_view_job(job_id));

drop policy if exists photos_read_job on public.photos;
create policy photos_read_job
on public.photos
for select
to authenticated
using (public.current_user_can_view_job(job_id));

-- Prywatne pliki zdjęć pozostają prywatne, ale mogą być odczytane przez zalogowanych pracowników.
drop policy if exists job_photos_storage_select_accessible_job on storage.objects;
create policy job_photos_storage_select_accessible_job
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and public.current_user_can_view_job(public.storage_object_job_id(name))
);

-- Protokół i jego plik są elementem podglądu montażu.
drop policy if exists job_protocols_select_accessible_job on public.job_protocols;
create policy job_protocols_select_accessible_job
on public.job_protocols
for select
to authenticated
using (public.current_user_can_view_job(job_id));

drop policy if exists job_protocols_storage_select_accessible_job on storage.objects;
create policy job_protocols_storage_select_accessible_job
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-protocols'
  and public.current_user_can_view_job(public.storage_object_job_id(name))
);

do $$
begin
  if to_regclass('public.job_protocol_email_log') is not null then
    execute 'drop policy if exists job_protocol_email_log_select_accessible_job on public.job_protocol_email_log';
    execute 'create policy job_protocol_email_log_select_accessible_job on public.job_protocol_email_log for select to authenticated using (public.current_user_can_view_job(job_id))';
  end if;
end
$$;

commit;
