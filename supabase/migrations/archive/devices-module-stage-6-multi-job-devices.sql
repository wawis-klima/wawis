-- Stage 6 / v7.83: wiele urządzeń z jednego montażu jako osobne rekordy devices.
-- Stare montaże zostają w jobs bez migracji danych. Funkcje tylko rozbijają wieloliniowe
-- pola device_model/device_serial_number podczas synchronizacji katalogu devices.

begin;

drop trigger if exists jobs_sync_device_after_change on public.jobs;
drop function if exists public.sync_device_from_job_trigger();
drop function if exists public.admin_sync_devices_from_jobs();
drop function if exists public.sync_device_from_job_row(text, uuid, text, text, date);

drop index if exists public.devices_source_job_id_key;
create unique index devices_source_job_id_key
  on public.devices (source_job_id);

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
begin
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
      installation_date
    )
    select
      p_contractor_id,
      device_rows.source_job_id,
      'job',
      device_rows.model,
      device_rows.serial_number,
      p_installation_date
    from device_rows
    on conflict (source_job_id) do update
    set contractor_id = excluded.contractor_id,
        model = excluded.model,
        serial_number = excluded.serial_number,
        installation_date = excluded.installation_date,
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

grant execute on function public.sync_device_from_job_row(text, uuid, text, text, date) to authenticated;
grant execute on function public.admin_sync_devices_from_jobs() to authenticated;

commit;
