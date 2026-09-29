-- WAWIS 11.76 — stały okres przypomnień serwisowych: 5 lat.
-- Decyzja biznesowa: service_reminder_years nie jest konfigurowalne.

begin;

update public.jobs
set service_reminder_years = 5
where service_reminder_years is distinct from 5;

update public.devices
set service_reminder_years = 5
where service_reminder_years is distinct from 5;

alter table public.jobs
  alter column service_reminder_years set default 5,
  alter column service_reminder_years set not null;

alter table public.devices
  alter column service_reminder_years set default 5,
  alter column service_reminder_years set not null;

alter table public.jobs
  drop constraint if exists jobs_service_reminder_years_check;
alter table public.jobs
  add constraint jobs_service_reminder_years_check
  check (service_reminder_years = 5);

alter table public.devices
  drop constraint if exists devices_service_reminder_years_check;
alter table public.devices
  add constraint devices_service_reminder_years_check
  check (service_reminder_years = 5);

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
set search_path to 'public'
as $function$
declare
  v_row public.devices;
  v_status text;
  v_years integer := 5;
  v_base_source_job_id text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać urządzenia.';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'aktywne');
  if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
    raise exception 'Nieprawidłowy status urządzenia.';
  end if;

  -- 11.76: okres przypomnienia jest stałą regułą biznesową.
  v_years := 5;

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
      source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind),
      updated_at = timezone('utc', now())
    where id = p_id
    returning * into v_row;

    if v_row is null then
      raise exception 'Nie znaleziono urządzenia do edycji.';
    end if;
  end if;

  v_base_source_job_id := regexp_replace(coalesce(v_row.source_job_id, ''), '::device-[0-9]+$', '');
  if v_base_source_job_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.jobs
    set service_reminder_years = 5
    where id = v_base_source_job_id::uuid;
  end if;

  return v_row;
end;
$function$;

commit;
