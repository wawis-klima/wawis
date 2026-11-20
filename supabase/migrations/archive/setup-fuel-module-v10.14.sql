-- WAWIS 10.14 — testowy moduł tankowań dostępny wyłącznie dla administratora.

create table if not exists public.fuel_vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null unique,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_vehicles_registration_format check (
    registration_number = upper(btrim(registration_number))
    and length(registration_number) between 2 and 16
  )
);

create table if not exists public.fuel_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fuel_vehicles(id),
  fueled_at timestamptz not null default now(),
  liters numeric(7,2) not null,
  odometer_km integer not null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint fuel_entries_liters_range check (liters > 0 and liters <= 500),
  constraint fuel_entries_odometer_range check (odometer_km >= 0 and odometer_km <= 5000000)
);

create index if not exists fuel_entries_fueled_at_idx
  on public.fuel_entries (fueled_at desc);

create index if not exists fuel_entries_vehicle_fueled_at_idx
  on public.fuel_entries (vehicle_id, fueled_at desc);

create index if not exists fuel_entries_created_by_idx
  on public.fuel_entries (created_by);

create index if not exists fuel_vehicles_created_by_idx
  on public.fuel_vehicles (created_by);

alter table public.fuel_vehicles enable row level security;
alter table public.fuel_entries enable row level security;

drop policy if exists fuel_vehicles_admin_select on public.fuel_vehicles;
create policy fuel_vehicles_admin_select
on public.fuel_vehicles for select to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists fuel_vehicles_admin_insert on public.fuel_vehicles;
create policy fuel_vehicles_admin_insert
on public.fuel_vehicles for insert to authenticated
with check (
  (select public.current_user_is_admin())
  and created_by = (select auth.uid())
);

drop policy if exists fuel_vehicles_admin_update on public.fuel_vehicles;
create policy fuel_vehicles_admin_update
on public.fuel_vehicles for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists fuel_vehicles_admin_delete on public.fuel_vehicles;
create policy fuel_vehicles_admin_delete
on public.fuel_vehicles for delete to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists fuel_entries_admin_select on public.fuel_entries;
create policy fuel_entries_admin_select
on public.fuel_entries for select to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists fuel_entries_admin_insert on public.fuel_entries;
create policy fuel_entries_admin_insert
on public.fuel_entries for insert to authenticated
with check (
  (select public.current_user_is_admin())
  and created_by = (select auth.uid())
);

drop policy if exists fuel_entries_admin_update on public.fuel_entries;
create policy fuel_entries_admin_update
on public.fuel_entries for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists fuel_entries_admin_delete on public.fuel_entries;
create policy fuel_entries_admin_delete
on public.fuel_entries for delete to authenticated
using ((select public.current_user_is_admin()));

grant select, insert, update, delete on public.fuel_vehicles to authenticated;
grant select, insert, update, delete on public.fuel_entries to authenticated;

comment on table public.fuel_vehicles is
  'Pojazdy dostępne w module tankowań; w wersji 10.14 widoczne wyłącznie dla administratora.';

comment on table public.fuel_entries is
  'Historia tankowań: czas zapisywany automatycznie przez serwer, pojazd, litry i stan licznika.';
