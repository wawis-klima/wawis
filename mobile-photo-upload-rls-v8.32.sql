-- v8.32: hotfix RLS dla uploadu zdjęć z aplikacji mobilnej.
-- Cel: pracownik przypisany do montażu oraz administrator mogą dodać zdjęcie
-- do prywatnego bucketu job-photos i zapisać rekord w public.photos.

begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false);
$$;

grant execute on function public.current_user_is_admin() to authenticated, service_role;

create or replace function public.storage_object_job_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(coalesce(p_name, ''), '/', 1)::uuid
    else null
  end;
$$;

grant execute on function public.storage_object_job_id(text) to authenticated, service_role;

create or replace function public.current_user_can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_job_id is not null
    and (
      public.current_user_is_admin()
      or exists (
        select 1
        from public.jobs j
        where j.id = p_job_id
          and (
            j.created_by = auth.uid()
            or j.main_technician_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.job_access ja
        where ja.job_id = p_job_id
          and ja.user_id = auth.uid()
      )
    ),
    false
  );
$$;

grant execute on function public.current_user_can_access_job(uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do update
set public = false;

alter table public.photos enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.photos to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

drop policy if exists "photos_select_accessible_job" on public.photos;
create policy "photos_select_accessible_job"
on public.photos
for select
to authenticated
using (
  public.current_user_can_access_job(job_id)
  or uploaded_by = auth.uid()
);

drop policy if exists "photos_insert_accessible_job" on public.photos;
create policy "photos_insert_accessible_job"
on public.photos
for insert
to authenticated
with check (
  public.current_user_can_access_job(job_id)
  and (
    public.current_user_is_admin()
    or uploaded_by = auth.uid()
  )
);

drop policy if exists "photos_update_admin_or_owner" on public.photos;
create policy "photos_update_admin_or_owner"
on public.photos
for update
to authenticated
using (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
)
with check (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
);

drop policy if exists "photos_delete_admin_or_owner" on public.photos;
create policy "photos_delete_admin_or_owner"
on public.photos
for delete
to authenticated
using (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
  or public.current_user_can_access_job(job_id)
);

drop policy if exists "job_photos_storage_select_accessible_job" on storage.objects;
create policy "job_photos_storage_select_accessible_job"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_photos_storage_insert_accessible_job" on storage.objects;
create policy "job_photos_storage_insert_accessible_job"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_photos_storage_update_accessible_job" on storage.objects;
create policy "job_photos_storage_update_accessible_job"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
)
with check (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_photos_storage_delete_admin_or_owner" on storage.objects;
create policy "job_photos_storage_delete_admin_or_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-photos'
  and (
    public.current_user_is_admin()
    or public.current_user_can_access_job(public.storage_object_job_id(name))
    or exists (
      select 1
      from public.photos p
      where p.storage_path = storage.objects.name
        and p.uploaded_by = auth.uid()
    )
  )
);

commit;
