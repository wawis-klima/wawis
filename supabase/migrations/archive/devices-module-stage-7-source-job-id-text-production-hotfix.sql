-- Stage 7 / v7.87: produkcyjny hotfix dla błędu
-- "column source_job_id is of type uuid but expression is of type text".
--
-- Kiedy uruchomić:
-- - gdy zapis/edycja montażu albo zmiana kontrahenta kończy się błędem source_job_id uuid/text,
-- - gdy po wdrożeniu wielu urządzeń z jednego montażu tabela devices nadal ma source_job_id typu uuid.
--
-- Skrypt jest idempotentny: można go uruchomić ponownie w Supabase SQL Editor.
-- ROLLBACK czyści ewentualną przerwaną transakcję po starszej wersji hotfixa.
rollback;

begin;

-- Tabela devices musi istnieć przed naprawą modułu urządzeń.
do $$
begin
  if to_regclass('public.devices') is null then
    raise exception 'Brak tabeli public.devices. Najpierw uruchom migracje modułu Urządzenia.';
  end if;
end;
$$;

-- Odłącz stare funkcje/trigger, żeby ALTER TYPE nie był blokowany przez zależności.
drop trigger if exists jobs_sync_device_after_change on public.jobs;
drop function if exists public.sync_device_from_job_trigger();
drop function if exists public.admin_sync_devices_from_jobs();
drop function if exists public.sync_device_from_job_row(text, uuid, text, text, date);
drop function if exists public.sync_device_from_job_row(uuid, uuid, text, text, date);

-- CREATE OR REPLACE nie może zmienić typu zwracanego funkcji z OUT/TABLE.
-- Produkcyjne bazy po starszych migracjach mogą mieć inną listę kolumn,
-- więc funkcje raportujące urządzenia odtwarzamy przez DROP + CREATE.
drop function if exists public.admin_list_devices_with_contractor();
drop function if exists public.admin_get_contractor_devices(uuid);

drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text, uuid, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, uuid, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, text);

-- Usuń ewentualny FK z devices.source_job_id do jobs.id. Po wielu urządzeniach jedno zlecenie
-- może mieć source_job_id typu id_montażu::device-2, więc FK uuid nie jest już poprawny.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'devices'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'source_job_id'
  loop
    execute format('alter table public.devices drop constraint if exists %I', v_constraint.constraint_name);
  end loop;
end;
$$;

alter table public.devices
  alter column contractor_id drop not null;

alter table public.devices
  add column if not exists service_reminder_years integer not null default 5;

update public.devices
set service_reminder_years = 5
where service_reminder_years is null or service_reminder_years <= 0;

alter table public.devices
  drop constraint if exists devices_service_reminder_years_check;
alter table public.devices
  add constraint devices_service_reminder_years_check
  check (service_reminder_years between 1 and 10);

alter table public.devices
  drop constraint if exists devices_source_job_id_key;
drop index if exists public.devices_source_job_id_key;

alter table public.devices
  alter column source_job_id type text
  using source_job_id::text;

create unique index devices_source_job_id_key
  on public.devices (source_job_id);

create index if not exists devices_service_reminder_years_idx
  on public.devices(service_reminder_years);

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
    greatest(1, least(coalesce(d.service_reminder_years, 5), 10)) as service_reminder_years,
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
    greatest(1, least(coalesce(d.service_reminder_years, 5), 10)) as service_reminder_years,
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
  v_base_source_job_id text;
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
    set service_reminder_years = v_years
    where id = v_base_source_job_id::uuid;
  end if;

  return v_row;
end;
$$;

create or replace function public.sync_device_from_job_row(
  p_job_id text,
  p_contractor_id uuid,
  p_model text,
  p_serial_number text,
  p_installation_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed_sources text[] := array[]::text[];
  v_service_reminder_years integer := 5;
begin
  select greatest(1, least(coalesce(j.service_reminder_years, 5), 10))
  into v_service_reminder_years
  from public.jobs j
  where j.id = p_job_id::uuid;

  v_service_reminder_years := coalesce(v_service_reminder_years, 5);

  with source_fields as (
    select
      regexp_split_to_array(replace(replace(coalesce(p_model, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n') as models,
      regexp_split_to_array(replace(replace(coalesce(p_serial_number, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n') as serials
  ), numbered as (
    select
      gs.index,
      trim(coalesce(source_fields.models[gs.index], '')) as model,
      trim(coalesce(source_fields.serials[gs.index], '')) as serial_number
    from source_fields
    cross join lateral generate_series(
      1,
      greatest(
        coalesce(array_length(source_fields.models, 1), 0),
        coalesce(array_length(source_fields.serials, 1), 0)
      )
    ) as gs(index)
  ), device_rows as (
    select
      case when numbered.index = 1 then p_job_id else p_job_id || '::device-' || numbered.index::text end as source_job_id,
      numbered.model,
      numbered.serial_number
    from numbered
    where coalesce(numbered.model, '') <> ''
       or coalesce(numbered.serial_number, '') <> ''
  ), upserted as (
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
      p_contractor_id,
      device_rows.source_job_id,
      'job',
      device_rows.model,
      device_rows.serial_number,
      p_installation_date,
      v_service_reminder_years,
      'aktywne',
      ''
    from device_rows
    on conflict (source_job_id) do update
    set contractor_id = excluded.contractor_id,
        model = excluded.model,
        serial_number = excluded.serial_number,
        installation_date = excluded.installation_date,
        service_reminder_years = excluded.service_reminder_years,
        source_kind = 'job',
        updated_at = timezone('utc', now())
    returning source_job_id
  )
  select coalesce(array_agg(upserted.source_job_id), array[]::text[])
  into v_processed_sources
  from upserted;

  delete from public.devices d
  where d.source_kind = 'job'
    and (d.source_job_id = p_job_id or d.source_job_id like p_job_id || '::device-%')
    and not (d.source_job_id = any(v_processed_sources));
end;
$$;

create or replace function public.admin_sync_devices_from_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_processed integer := 0;
  v_deleted integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może synchronizować urządzenia.';
  end if;

  for v_job in
    select id, contractor_id, device_model, device_serial_number, installation_date
    from public.jobs
  loop
    perform public.sync_device_from_job_row(
      v_job.id::text,
      v_job.contractor_id,
      v_job.device_model,
      v_job.device_serial_number,
      v_job.installation_date
    );
    v_processed := v_processed + 1;
  end loop;

  delete from public.devices d
  where d.source_kind = 'job'
    and d.source_job_id is not null
    and not exists (
      select 1
      from public.jobs j
      where d.source_job_id = j.id::text
         or d.source_job_id like j.id::text || '::device-%'
    );

  get diagnostics v_deleted = row_count;

  return jsonb_build_object('processed_jobs', v_processed, 'deleted_orphans', v_deleted);
end;
$$;

create or replace function public.sync_device_from_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.devices
    where source_job_id = old.id::text
       or source_job_id like old.id::text || '::device-%';
    return old;
  end if;

  perform public.sync_device_from_job_row(
    new.id::text,
    new.contractor_id,
    new.device_model,
    new.device_serial_number,
    new.installation_date
  );

  return new;
end;
$$;

create trigger jobs_sync_device_after_change
after insert or update of contractor_id, device_model, device_serial_number, installation_date or delete on public.jobs
for each row
execute function public.sync_device_from_job_trigger();

grant execute on function public.admin_list_devices_with_contractor() to authenticated;
grant execute on function public.admin_get_contractor_devices(uuid) to authenticated;
grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, text, text) to authenticated;
grant execute on function public.sync_device_from_job_row(text, uuid, text, text, date) to authenticated;
grant execute on function public.admin_sync_devices_from_jobs() to authenticated;

commit;
