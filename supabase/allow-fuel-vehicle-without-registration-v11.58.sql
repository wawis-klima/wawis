alter table public.fuel_vehicles
  alter column registration_number drop not null;

with administrator as (
  select id
  from public.profiles
  where role = 'Administrator'
  order by created_at, id
  limit 1
)
insert into public.fuel_vehicles (
  vehicle_name,
  registration_number,
  is_active,
  created_by
)
select
  'Edward',
  null,
  true,
  administrator.id
from administrator
where not exists (
  select 1
  from public.fuel_vehicles
  where lower(btrim(vehicle_name)) = 'edward'
    and registration_number is null
);
