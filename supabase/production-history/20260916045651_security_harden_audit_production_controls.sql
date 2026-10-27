create or replace function public.admin_list_devices_basic()
returns table(
  id uuid,
  contractor_id uuid,
  model text,
  serial_number text,
  installation_date date,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może pobierać listę urządzeń.' using errcode = '42501';
  end if;

  return query
  select d.id, d.contractor_id, d.model, d.serial_number, d.installation_date,
         d.status, d.notes, d.created_at, d.updated_at
  from public.devices d
  order by d.created_at desc, d.id desc;
end;
$$;

revoke all on function public.admin_list_devices_basic() from public, anon;
grant execute on function public.admin_list_devices_basic() to authenticated, service_role;

create or replace function public.admin_list_devices_for_service()
returns table(
  id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_city text,
  contractor_phone text,
  model text,
  serial_number text,
  installation_date date,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może pobierać urządzenia do serwisu.' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.contractor_id,
    coalesce(c.company_name, '') as contractor_name,
    coalesce(c.city, '') as contractor_city,
    coalesce(c.phone, '') as contractor_phone,
    d.model,
    d.serial_number,
    d.installation_date,
    d.status,
    d.notes,
    d.created_at,
    d.updated_at
  from public.devices d
  left join public.contractors c on c.id = d.contractor_id
  where d.status = 'do_serwisu'
  order by d.installation_date asc nulls last, d.created_at asc, d.id asc;
end;
$$;

revoke all on function public.admin_list_devices_for_service() from public, anon;
grant execute on function public.admin_list_devices_for_service() to authenticated, service_role;

alter table public.profiles alter column role set default 'Oczekujący';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Użytkownik'),
    new.email,
    'Oczekujący'
  );
  return new;
end;
$$;

drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_read_team on public.profiles;
create policy profiles_read_team
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_is_staff())
);

drop policy if exists fuel_vehicles_fleet_select on public.fuel_vehicles;
create policy fuel_vehicles_fleet_select
on public.fuel_vehicles
for select
to authenticated
using (
  (select public.current_user_is_staff())
  and (is_active or (select public.current_user_is_admin()))
);

drop policy if exists fuel_entries_own_insert on public.fuel_entries;
create policy fuel_entries_own_insert
on public.fuel_entries
for insert
to authenticated
with check (
  (select public.current_user_is_staff())
  and created_by = (select auth.uid())
);

drop policy if exists fuel_entries_own_or_admin_select on public.fuel_entries;
create policy fuel_entries_own_or_admin_select
on public.fuel_entries
for select
to authenticated
using (
  (select public.current_user_is_staff())
  and (
    created_by = (select auth.uid())
    or (select public.current_user_is_admin())
  )
);

drop policy if exists fuel_odometer_photos_own_insert on storage.objects;
create policy fuel_odometer_photos_own_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fuel-odometer-photos'
  and (select public.current_user_is_staff())
  and (storage.foldername(name))[1] = ((select auth.uid()))::text
);

drop policy if exists fuel_odometer_photos_own_or_admin_select on storage.objects;
create policy fuel_odometer_photos_own_or_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fuel-odometer-photos'
  and (select public.current_user_is_staff())
  and (
    (storage.foldername(name))[1] = ((select auth.uid()))::text
    or (select public.current_user_is_admin())
  )
);

comment on column public.profiles.role is 'Rola aplikacyjna. Nowe konta otrzymują Oczekujący i wymagają zatwierdzenia administratora przed uzyskaniem uprawnień pracownika.';