-- WAWIS 10.25 — pojemność baku pojazdu i serwerowa ochrona ilości tankowania.

create schema if not exists private;
revoke all on schema private from public;

alter table public.fuel_vehicles
  add column if not exists tank_capacity_liters numeric(6,2);

alter table public.fuel_vehicles
  drop constraint if exists fuel_vehicles_tank_capacity_range;

alter table public.fuel_vehicles
  add constraint fuel_vehicles_tank_capacity_range
  check (tank_capacity_liters is null or (tank_capacity_liters > 0 and tank_capacity_liters <= 500));

create or replace function private.validate_fuel_entry_capacity_v1025()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vehicle_capacity numeric(6,2);
begin
  select vehicle.tank_capacity_liters
  into vehicle_capacity
  from public.fuel_vehicles as vehicle
  where vehicle.id = new.vehicle_id;

  if vehicle_capacity is not null and new.liters > vehicle_capacity then
    raise exception using
      errcode = '23514',
      message = format(
        'Nie można zatankować %s l. Pojemność baku tego samochodu to %s l.',
        new.liters,
        vehicle_capacity
      );
  end if;

  return new;
end;
$$;

revoke all on function private.validate_fuel_entry_capacity_v1025() from public, anon, authenticated;

drop trigger if exists fuel_entries_validate_capacity_v1025 on public.fuel_entries;
create trigger fuel_entries_validate_capacity_v1025
before insert or update of vehicle_id, liters on public.fuel_entries
for each row execute function private.validate_fuel_entry_capacity_v1025();

comment on column public.fuel_vehicles.tank_capacity_liters is
  'Pojemność baku pojazdu w litrach. Gdy ustawiona, każde tankowanie jest walidowane po stronie bazy.';
