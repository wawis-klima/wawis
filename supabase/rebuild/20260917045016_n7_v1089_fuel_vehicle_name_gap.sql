-- WAWIS 10.89 / N7 stage B / rebuild-only schema reconcile.
alter table public.fuel_vehicles
  add column if not exists vehicle_name text not null default ''::text;
