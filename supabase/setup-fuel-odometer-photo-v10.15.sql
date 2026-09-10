-- WAWIS 10.15 — prywatne zdjęcia licznika i wynik odczytu AI.

alter table public.fuel_entries
  add column if not exists odometer_photo_path text,
  add column if not exists odometer_ai_confidence numeric(4,3);

alter table public.fuel_entries
  drop constraint if exists fuel_entries_ai_confidence_range;

alter table public.fuel_entries
  add constraint fuel_entries_ai_confidence_range
  check (odometer_ai_confidence is null or (odometer_ai_confidence >= 0 and odometer_ai_confidence <= 1));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fuel-odometer-photos',
  'fuel-odometer-photos',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fuel_odometer_photos_admin_select on storage.objects;
create policy fuel_odometer_photos_admin_select
on storage.objects for select to authenticated
using (
  bucket_id = 'fuel-odometer-photos'
  and (select public.current_user_is_admin())
);

drop policy if exists fuel_odometer_photos_admin_insert on storage.objects;
create policy fuel_odometer_photos_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fuel-odometer-photos'
  and (select public.current_user_is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists fuel_odometer_photos_admin_delete on storage.objects;
create policy fuel_odometer_photos_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'fuel-odometer-photos'
  and (select public.current_user_is_admin())
);

comment on column public.fuel_entries.odometer_photo_path is
  'Prywatna ścieżka zdjęcia głównego licznika ODO użytego do odczytu przebiegu.';

comment on column public.fuel_entries.odometer_ai_confidence is
  'Pewność odczytu przebiegu przez AI w zakresie 0–1; wynik zawsze potwierdza użytkownik.';

