-- Bezpieczniejsze RLS dla usuwania zdjęć z montaży.
-- Administrator może usuwać każde zdjęcie, a zwykły użytkownik tylko zdjęcie, które sam wgrał.

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

grant execute on function public.current_user_is_admin() to authenticated;

alter table public.photos enable row level security;

drop policy if exists "photos_delete" on public.photos;
drop policy if exists "photos_delete_admin_or_owner" on public.photos;
create policy "photos_delete_admin_or_owner"
on public.photos
for delete
to authenticated
using (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
);

drop policy if exists "job_photos_storage_delete" on storage.objects;
drop policy if exists "job_photos_storage_delete_admin_or_owner" on storage.objects;
create policy "job_photos_storage_delete_admin_or_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-photos'
  and (
    public.current_user_is_admin()
    or exists (
      select 1
      from public.photos p
      where p.storage_path = storage.objects.name
        and p.uploaded_by = auth.uid()
    )
  )
);
