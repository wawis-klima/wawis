-- WAWIS 10.17 — flota firmowa i prywatna historia tankowań pracowników.

alter table public.fuel_vehicles
  add column if not exists vehicle_name text not null default '';

update public.fuel_vehicles
set vehicle_name = registration_number
where btrim(vehicle_name) = '';

with administrator as (
  select id
  from public.profiles
  where lower(role) in ('administrator', 'admin')
  order by id
  limit 1
), fleet(vehicle_name, registration_number) as (
  values
    ('Doblo', 'SZA 6149G'),
    ('Doblo', 'SZA 0673A'),
    ('Vivaro', 'SZA 60398'),
    ('Podnośnik', 'EL 8GP61'),
    ('Master', 'KR 9UH22')
)
insert into public.fuel_vehicles (vehicle_name, registration_number, is_active, created_by)
select fleet.vehicle_name, fleet.registration_number, true, administrator.id
from fleet cross join administrator
on conflict (registration_number) do update set
  vehicle_name = excluded.vehicle_name,
  is_active = true,
  updated_at = now();

update public.fuel_vehicles
set is_active = false,
    updated_at = now()
where registration_number not in ('SZA 6149G', 'SZA 0673A', 'SZA 60398', 'EL 8GP61', 'KR 9UH22');

drop policy if exists fuel_vehicles_admin_select on public.fuel_vehicles;
drop policy if exists fuel_vehicles_fleet_select on public.fuel_vehicles;
create policy fuel_vehicles_fleet_select
on public.fuel_vehicles for select to authenticated
using (is_active or (select public.current_user_is_admin()));

drop policy if exists fuel_entries_admin_select on public.fuel_entries;
drop policy if exists fuel_entries_own_or_admin_select on public.fuel_entries;
create policy fuel_entries_own_or_admin_select
on public.fuel_entries for select to authenticated
using (
  created_by = (select auth.uid())
  or (select public.current_user_is_admin())
);

drop policy if exists fuel_entries_admin_insert on public.fuel_entries;
drop policy if exists fuel_entries_own_insert on public.fuel_entries;
create policy fuel_entries_own_insert
on public.fuel_entries for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists fuel_odometer_photos_admin_select on storage.objects;
drop policy if exists fuel_odometer_photos_own_or_admin_select on storage.objects;
create policy fuel_odometer_photos_own_or_admin_select
on storage.objects for select to authenticated
using (
  bucket_id = 'fuel-odometer-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.current_user_is_admin())
  )
);

drop policy if exists fuel_odometer_photos_admin_insert on storage.objects;
drop policy if exists fuel_odometer_photos_own_insert on storage.objects;
create policy fuel_odometer_photos_own_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fuel-odometer-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

comment on table public.fuel_vehicles is
  'Firmowa flota widoczna dla zalogowanych; zarządzanie pozostaje wyłącznie po stronie administratora.';

comment on table public.fuel_entries is
  'Administrator widzi wszystkie tankowania, a pracownik wyłącznie wpisy utworzone przez własne konto.';
