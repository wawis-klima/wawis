alter table public.devices
add column if not exists status text not null default 'aktywne';

update public.devices
set status = 'aktywne'
where status is null or trim(status) = '';

alter table public.devices
  drop constraint if exists devices_status_check;

alter table public.devices
  add constraint devices_status_check
  check (status in ('aktywne', 'do_serwisu', 'zdemontowane'));

create index if not exists devices_status_idx on public.devices (status);

drop function if exists public.admin_list_devices_basic();
drop function if exists public.admin_list_devices_with_contractor();
drop function if exists public.admin_get_contractor_devices(uuid);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text);

create function public.admin_list_devices_basic()
returns table (
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
language sql
security definer
set search_path = public
as $$
  select d.id, d.contractor_id, d.model, d.serial_number, d.installation_date, d.status, d.notes, d.created_at, d.updated_at
  from public.devices d
  order by d.created_at desc, d.id desc;
$$;

create function public.admin_list_devices_with_contractor()
returns table (
  id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_city text,
  contractor_street text,
  contractor_phone text,
  model text,
  serial_number text,
  installation_date date,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    d.id,
    d.contractor_id,
    coalesce(c.company_name, '') as contractor_name,
    coalesce(c.city, '') as contractor_city,
    coalesce(c.street, '') as contractor_street,
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
  order by d.created_at desc, d.id desc;
$$;

create function public.admin_get_contractor_devices(p_contractor_id uuid)
returns table (
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
language sql
security definer
set search_path = public
as $$
  select d.id, d.contractor_id, d.model, d.serial_number, d.installation_date, d.status, d.notes, d.created_at, d.updated_at
  from public.devices d
  where d.contractor_id = p_contractor_id
  order by d.created_at desc, d.id desc;
$$;

create function public.admin_upsert_device(
  p_id uuid default null,
  p_contractor_id uuid default null,
  p_model text default '',
  p_serial_number text default '',
  p_installation_date date default null,
  p_status text default 'aktywne',
  p_notes text default ''
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.devices;
  v_status text := coalesce(nullif(trim(p_status), ''), 'aktywne');
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać urządzenia.';
  end if;
  if p_contractor_id is null then
    raise exception 'Kontrahent jest wymagany.';
  end if;
  if coalesce(trim(p_serial_number), '') = '' then
    raise exception 'Numer seryjny jest wymagany.';
  end if;
  if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
    raise exception 'Nieprawidłowy status urządzenia.';
  end if;

  if p_id is null then
    insert into public.devices (contractor_id, model, serial_number, installation_date, status, notes)
    values (p_contractor_id, trim(coalesce(p_model, '')), trim(coalesce(p_serial_number, '')), p_installation_date, v_status, coalesce(p_notes, ''))
    returning * into v_row;
  else
    update public.devices
    set contractor_id = p_contractor_id,
        model = trim(coalesce(p_model, '')),
        serial_number = trim(coalesce(p_serial_number, '')),
        installation_date = p_installation_date,
        status = v_status,
        notes = coalesce(p_notes, ''),
        updated_at = timezone('utc', now())
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_list_devices_basic() to authenticated;
grant execute on function public.admin_list_devices_with_contractor() to authenticated;
grant execute on function public.admin_get_contractor_devices(uuid) to authenticated;
grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, text) to authenticated;
