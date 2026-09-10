-- WAWIS 10.26 — produkcyjne tankowania pracowników, audyt korekt administratora.

create schema if not exists private;
revoke all on schema private from public;

alter table public.fuel_entries
  add column if not exists corrected_by uuid,
  add column if not exists corrected_at timestamptz,
  add column if not exists correction_count integer not null default 0,
  add column if not exists original_liters numeric(7,2),
  add column if not exists original_odometer_km integer;

alter table public.fuel_entries
  drop constraint if exists fuel_entries_corrected_by_fkey;

alter table public.fuel_entries
  add constraint fuel_entries_corrected_by_fkey
  foreign key (corrected_by) references public.profiles(id) on delete set null;

alter table public.fuel_entries
  drop constraint if exists fuel_entries_correction_count_nonnegative;

alter table public.fuel_entries
  add constraint fuel_entries_correction_count_nonnegative
  check (correction_count >= 0);

create or replace function private.audit_fuel_entry_correction_v1026()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Tożsamość i czas pierwotnego wpisu pozostają niezmienne.
  new.vehicle_id := old.vehicle_id;
  new.fueled_at := old.fueled_at;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.odometer_photo_path := old.odometer_photo_path;
  new.odometer_ai_confidence := old.odometer_ai_confidence;
  new.odometer_read_source := old.odometer_read_source;

  if new.liters is distinct from old.liters or new.odometer_km is distinct from old.odometer_km then
    if coalesce(old.correction_count, 0) = 0 then
      new.original_liters := old.liters;
      new.original_odometer_km := old.odometer_km;
    else
      new.original_liters := old.original_liters;
      new.original_odometer_km := old.original_odometer_km;
    end if;

    new.corrected_by := auth.uid();
    new.corrected_at := now();
    new.correction_count := coalesce(old.correction_count, 0) + 1;
  else
    new.corrected_by := old.corrected_by;
    new.corrected_at := old.corrected_at;
    new.correction_count := old.correction_count;
    new.original_liters := old.original_liters;
    new.original_odometer_km := old.original_odometer_km;
  end if;

  return new;
end;
$$;

revoke all on function private.audit_fuel_entry_correction_v1026() from public, anon, authenticated;

drop trigger if exists fuel_entries_audit_correction_v1026 on public.fuel_entries;
create trigger fuel_entries_audit_correction_v1026
before update on public.fuel_entries
for each row execute function private.audit_fuel_entry_correction_v1026();

create or replace function private.validate_fuel_entry_edit_odometer_v1026()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_odometer integer;
  next_odometer integer;
begin
  if new.odometer_km is not distinct from old.odometer_km then
    return new;
  end if;

  select entry.odometer_km
  into previous_odometer
  from public.fuel_entries as entry
  where entry.vehicle_id = old.vehicle_id
    and entry.id <> old.id
    and (
      entry.fueled_at < old.fueled_at
      or (entry.fueled_at = old.fueled_at and entry.created_at < old.created_at)
      or (entry.fueled_at = old.fueled_at and entry.created_at = old.created_at and entry.id < old.id)
    )
  order by entry.fueled_at desc, entry.created_at desc, entry.id desc
  limit 1;

  select entry.odometer_km
  into next_odometer
  from public.fuel_entries as entry
  where entry.vehicle_id = old.vehicle_id
    and entry.id <> old.id
    and (
      entry.fueled_at > old.fueled_at
      or (entry.fueled_at = old.fueled_at and entry.created_at > old.created_at)
      or (entry.fueled_at = old.fueled_at and entry.created_at = old.created_at and entry.id > old.id)
    )
  order by entry.fueled_at asc, entry.created_at asc, entry.id asc
  limit 1;

  if previous_odometer is not null and new.odometer_km < previous_odometer then
    raise exception using
      errcode = '23514',
      message = format('Poprawiony przebieg nie może być niższy niż poprzednie tankowanie: %s km.', previous_odometer);
  end if;

  if next_odometer is not null and new.odometer_km > next_odometer then
    raise exception using
      errcode = '23514',
      message = format('Poprawiony przebieg nie może być wyższy niż następne tankowanie: %s km.', next_odometer);
  end if;

  return new;
end;
$$;

revoke all on function private.validate_fuel_entry_edit_odometer_v1026() from public, anon, authenticated;

drop trigger if exists fuel_entries_validate_edit_odometer_v1026 on public.fuel_entries;
create trigger fuel_entries_validate_edit_odometer_v1026
before update of odometer_km on public.fuel_entries
for each row execute function private.validate_fuel_entry_edit_odometer_v1026();

comment on column public.fuel_entries.corrected_by is 'Administrator, który ostatnio skorygował wpis tankowania.';
comment on column public.fuel_entries.corrected_at is 'Czas ostatniej korekty wpisu tankowania.';
comment on column public.fuel_entries.correction_count is 'Liczba korekt wpisu tankowania przez administratora.';
comment on column public.fuel_entries.original_liters is 'Pierwotna ilość litrów zachowana przy pierwszej korekcie.';
comment on column public.fuel_entries.original_odometer_km is 'Pierwotny przebieg zachowany przy pierwszej korekcie.';
