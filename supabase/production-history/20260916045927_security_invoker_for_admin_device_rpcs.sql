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
security invoker
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
security invoker
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