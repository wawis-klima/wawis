-- Moduł urządzeń etap 4: lata gwarancji / okres wysyłki przypomnień SMS.

alter table public.jobs
  add column if not exists service_reminder_years integer not null default 5;

alter table public.devices
  add column if not exists service_reminder_years integer not null default 5;

update public.jobs
set service_reminder_years = 5
where service_reminder_years is null or service_reminder_years <= 0;

update public.devices
set service_reminder_years = 5
where service_reminder_years is null or service_reminder_years <= 0;

alter table public.jobs
  drop constraint if exists jobs_service_reminder_years_check;
alter table public.jobs
  add constraint jobs_service_reminder_years_check
  check (service_reminder_years between 1 and 10);

alter table public.devices
  drop constraint if exists devices_service_reminder_years_check;
alter table public.devices
  add constraint devices_service_reminder_years_check
  check (service_reminder_years between 1 and 10);

create index if not exists jobs_service_reminder_years_idx on public.jobs(service_reminder_years);
create index if not exists devices_service_reminder_years_idx on public.devices(service_reminder_years);

create or replace function public.admin_list_devices_with_contractor()
returns table (
  id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_city text,
  contractor_street text,
  contractor_phone text,
  contractor_email text,
  model text,
  serial_number text,
  installation_date date,
  service_reminder_years integer,
  status text,
  notes text,
  source_job_id text,
  source_kind text,
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
    coalesce(c.email, '') as contractor_email,
    d.model,
    d.serial_number,
    d.installation_date,
    d.service_reminder_years,
    d.status,
    d.notes,
    d.source_job_id,
    d.source_kind,
    d.created_at,
    d.updated_at
  from public.devices d
  left join public.contractors c on c.id = d.contractor_id
  where public.current_user_is_admin()
  order by d.installation_date desc nulls last, d.created_at desc, d.id desc;
$$;

create or replace function public.admin_get_contractor_devices(p_contractor_id uuid)
returns table (
  id uuid,
  contractor_id uuid,
  model text,
  serial_number text,
  installation_date date,
  service_reminder_years integer,
  status text,
  notes text,
  source_job_id text,
  source_kind text,
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
    d.model,
    d.serial_number,
    d.installation_date,
    d.service_reminder_years,
    d.status,
    d.notes,
    d.source_job_id,
    d.source_kind,
    d.created_at,
    d.updated_at
  from public.devices d
  where public.current_user_is_admin()
    and d.contractor_id = p_contractor_id
  order by d.installation_date desc nulls last, d.created_at desc, d.id desc;
$$;

create or replace function public.admin_upsert_device(
  p_id uuid default null,
  p_contractor_id uuid default null,
  p_model text default '',
  p_serial_number text default '',
  p_installation_date date default null,
  p_service_reminder_years integer default 5,
  p_status text default 'aktywne',
  p_notes text default '',
  p_source_job_id text default null,
  p_source_kind text default 'manual'
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.devices;
  v_status text;
  v_years integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać urządzenia.';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'aktywne');
  if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
    raise exception 'Nieprawidłowy status urządzenia.';
  end if;

  v_years := greatest(1, least(coalesce(p_service_reminder_years, 5), 10));

  if p_id is null then
    insert into public.devices (
      contractor_id,
      model,
      serial_number,
      installation_date,
      service_reminder_years,
      status,
      notes,
      source_job_id,
      source_kind
    )
    values (
      p_contractor_id,
      trim(coalesce(p_model, '')),
      trim(coalesce(p_serial_number, '')),
      p_installation_date,
      v_years,
      v_status,
      coalesce(p_notes, ''),
      nullif(trim(coalesce(p_source_job_id, '')), ''),
      coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), 'manual')
    )
    returning * into v_row;
  else
    update public.devices
    set
      contractor_id = p_contractor_id,
      model = trim(coalesce(p_model, '')),
      serial_number = trim(coalesce(p_serial_number, '')),
      installation_date = p_installation_date,
      service_reminder_years = v_years,
      status = v_status,
      notes = coalesce(p_notes, ''),
      source_job_id = nullif(trim(coalesce(p_source_job_id, '')), ''),
      source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind)
    where id = p_id
    returning * into v_row;

    if v_row is null then
      raise exception 'Nie znaleziono urządzenia do edycji.';
    end if;
  end if;

  if v_row.source_job_id is not null then
    update public.jobs
    set service_reminder_years = v_years
    where id = v_row.source_job_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_sync_devices_from_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może synchronizować urządzenia.';
  end if;

  insert into public.devices (
    contractor_id,
    source_job_id,
    source_kind,
    model,
    serial_number,
    installation_date,
    service_reminder_years,
    status,
    notes
  )
  select
    j.contractor_id,
    j.id,
    'job',
    coalesce(j.device_model, ''),
    coalesce(j.device_serial_number, ''),
    j.installation_date,
    greatest(1, least(coalesce(j.service_reminder_years, 5), 10)),
    'aktywne',
    ''
  from public.jobs j
  where coalesce(trim(j.device_model), '') <> ''
     or coalesce(trim(j.device_serial_number), '') <> ''
  on conflict (source_job_id) do update
  set
    contractor_id = excluded.contractor_id,
    model = excluded.model,
    serial_number = excluded.serial_number,
    installation_date = excluded.installation_date,
    service_reminder_years = excluded.service_reminder_years,
    updated_at = timezone('utc', now());

  get diagnostics v_count = row_count;
  return jsonb_build_object('synced', true, 'count', v_count);
end;
$$;
