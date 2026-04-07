-- Uruchom w Supabase SQL Editor, jeśli usuwanie zdjęć zwraca błąd RLS

drop policy if exists "photos_delete" on public.photos;
create policy "photos_delete"
on public.photos
for delete
to authenticated
using (true);

drop policy if exists "job_photos_storage_delete" on storage.objects;
create policy "job_photos_storage_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'job-photos');
