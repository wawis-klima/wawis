-- WAWIS 10.19 — wspólny przebieg floty i ochrona przed niemożliwym skokiem.

create schema if not exists private;
revoke all on schema private from public;

alter table public.fuel_vehicles
  add column if not exists last_odometer_km integer,
  add column if not exists last_fueled_at timestamptz;

alter table public.fuel_vehicles
  drop constraint if exists fuel_vehicles_last_odometer_range;

alter table public.fuel_vehicles
  add constraint fuel_vehicles_last_odometer_range
  check (last_odometer_km is null or (last_odometer_km >= 0 and last_odometer_km <= 5000000));

update public.fuel_vehicles as vehicle
set
  last_odometer_km = summary.last_odometer_km,
  last_fueled_at = summary.last_fueled_at
from (
  select
    vehicle_id,
    max(odometer_km) as last_odometer_km,
    max(fueled_at) as last_fueled_at
  from public.fuel_entries
  group by vehicle_id
) as summary
where summary.vehicle_id = vehicle.id;

create or replace function private.validate_fuel_entry_odometer_v1019()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_odometer integer;
  odometer_delta integer;
begin
  select vehicle.last_odometer_km
  into previous_odometer
  from public.fuel_vehicles as vehicle
  where vehicle.id = new.vehicle_id
  for update;

  if previous_odometer is null then
    return new;
  end if;

  odometer_delta := new.odometer_km - previous_odometer;

  if odometer_delta < 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'Stan licznika nie może być niższy niż ostatnio zapisane %s km.',
        previous_odometer
      );
  end if;

  if odometer_delta > 5000 and nullif(new.odometer_photo_path, '') is null then
    raise exception using
      errcode = '23514',
      message = format(
        'Przebieg wzrósł o %s km. Przy różnicy powyżej 5000 km wymagane jest zdjęcie licznika.',
        odometer_delta
      );
  end if;

  return new;
end;
$$;

revoke all on function private.validate_fuel_entry_odometer_v1019() from public, anon, authenticated;

drop trigger if exists fuel_entries_validate_odometer_v1019 on public.fuel_entries;
create trigger fuel_entries_validate_odometer_v1019
before insert on public.fuel_entries
for each row execute function private.validate_fuel_entry_odometer_v1019();

create or replace function private.refresh_fuel_vehicle_odometer_v1019()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vehicle_id uuid;
begin
  if tg_op = 'DELETE' then
    target_vehicle_id := old.vehicle_id;
  else
    target_vehicle_id := new.vehicle_id;
  end if;

  update public.fuel_vehicles as vehicle
  set
    last_odometer_km = summary.last_odometer_km,
    last_fueled_at = summary.last_fueled_at,
    updated_at = now()
  from (
    select
      max(entry.odometer_km) as last_odometer_km,
      max(entry.fueled_at) as last_fueled_at
    from public.fuel_entries as entry
    where entry.vehicle_id = target_vehicle_id
  ) as summary
  where vehicle.id = target_vehicle_id;

  if tg_op = 'UPDATE' and old.vehicle_id is distinct from new.vehicle_id then
    update public.fuel_vehicles as vehicle
    set
      last_odometer_km = summary.last_odometer_km,
      last_fueled_at = summary.last_fueled_at,
      updated_at = now()
    from (
      select
        max(entry.odometer_km) as last_odometer_km,
        max(entry.fueled_at) as last_fueled_at
      from public.fuel_entries as entry
      where entry.vehicle_id = old.vehicle_id
    ) as summary
    where vehicle.id = old.vehicle_id;
  end if;

  return null;
end;
$$;

revoke all on function private.refresh_fuel_vehicle_odometer_v1019() from public, anon, authenticated;

drop trigger if exists fuel_entries_refresh_odometer_v1019 on public.fuel_entries;
create trigger fuel_entries_refresh_odometer_v1019
after insert or update or delete on public.fuel_entries
for each row execute function private.refresh_fuel_vehicle_odometer_v1019();

comment on column public.fuel_vehicles.last_odometer_km is
  'Ostatni znany przebieg floty używany do walidacji bez ujawniania cudzych wpisów.';

comment on column public.fuel_vehicles.last_fueled_at is
  'Data ostatniego tankowania pojazdu używana do kontroli ciągłości przebiegu.';
