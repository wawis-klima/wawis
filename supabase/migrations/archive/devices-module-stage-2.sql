-- Moduł urządzeń / wersja 6.86 / etap 2
-- Rozszerzenie już wdrożonej tabeli devices o datę montażu urządzenia
-- oraz zwracanie danych kontrahenta (firma, miasto, telefon) do widoku administratora.

alter table public.devices add column if not exists installation_date date;
create index if not exists devices_installation_date_idx on public.devices(installation_date);

create or replace function public.admin_list_devices()
returns table (
  id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_city text,
  contractor_phone text,
  model text,
  serial_number text,
  installation_date date,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'Administrator'
  ) then
    raise exception 'Tylko administrator może odczytywać urządzenia.';
  end if;

  return query
  select
    d.id,
    d.contractor_id,
    c.company_name as contractor_name,
    c.city as contractor_city,
    c.phone as contractor_phone,
    d.model,
    d.serial_number,
    d.installation_date,
    d.notes,
    d.is_active,
    d.created_at,
    d.updated_at
  from public.devices d
  join public.contractors c on c.id = d.contractor_id
  order by d.installation_date desc nulls last, c.company_name asc, d.model asc, d.created_at desc;
end;
$$;

create or replace function public.admin_upsert_device(
  p_id uuid default null,
  p_contractor_id uuid default null,
  p_model text default null,
  p_serial_number text default null,
  p_installation_date date default null,
  p_notes text default null,
  p_is_active boolean default true
)
returns table (
  id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_city text,
  contractor_phone text,
  model text,
  serial_number text,
  installation_date date,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.devices;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'Administrator'
  ) then
    raise exception 'Tylko administrator może zapisywać urządzenia.';
  end if;

  if p_contractor_id is null then
    raise exception 'Wybierz kontrahenta dla urządzenia.';
  end if;

  if nullif(btrim(coalesce(p_model, '')), '') is null then
    raise exception 'Model urządzenia jest wymagany.';
  end if;

  if nullif(btrim(coalesce(p_serial_number, '')), '') is null then
    raise exception 'Numer seryjny urządzenia jest wymagany.';
  end if;

  insert into public.devices (
    id,
    contractor_id,
    model,
    serial_number,
    installation_date,
    notes,
    is_active
  ) values (
    coalesce(p_id, gen_random_uuid()),
    p_contractor_id,
    btrim(p_model),
    upper(regexp_replace(btrim(p_serial_number), '\\s+', '', 'g')),
    p_installation_date,
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_is_active, true)
  )
  on conflict (id) do update
  set
    contractor_id = excluded.contractor_id,
    model = excluded.model,
    serial_number = excluded.serial_number,
    installation_date = excluded.installation_date,
    notes = excluded.notes,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now())
  returning * into v_row;

  return query
  select
    v_row.id,
    v_row.contractor_id,
    c.company_name as contractor_name,
    c.city as contractor_city,
    c.phone as contractor_phone,
    v_row.model,
    v_row.serial_number,
    v_row.installation_date,
    v_row.notes,
    v_row.is_active,
    v_row.created_at,
    v_row.updated_at
  from public.contractors c
  where c.id = v_row.contractor_id;
end;
$$;

grant execute on function public.admin_list_devices() to authenticated;
grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, boolean) to authenticated;
