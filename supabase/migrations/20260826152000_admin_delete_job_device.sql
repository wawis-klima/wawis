create or replace function public.admin_delete_job_device(
  p_job_id uuid,
  p_device_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model text;
  v_serial text;
  v_models text[];
  v_serials text[];
  v_row_count integer := 0;
  v_photo_max_index integer := 0;
  v_next_model text := '';
  v_next_serial text := '';
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usuwać urządzenia z montażu.' using errcode = '42501';
  end if;

  if coalesce(p_device_index, 0) < 1 then
    raise exception 'Nieprawidłowy numer urządzenia.' using errcode = '22023';
  end if;

  select j.device_model, j.device_serial_number
    into v_model, v_serial
  from public.jobs j
  where j.id = p_job_id
  for update;

  if not found then
    raise exception 'Nie znaleziono montażu.' using errcode = 'P0002';
  end if;

  v_models := regexp_split_to_array(
    replace(replace(coalesce(v_model, ''), E'\r\n', E'\n'), E'\r', E'\n'),
    E'\n'
  );
  v_serials := regexp_split_to_array(
    replace(replace(coalesce(v_serial, ''), E'\r\n', E'\n'), E'\r', E'\n'),
    E'\n'
  );

  select coalesce(max(
    nullif(substring(coalesce(nullif(p.storage_path, ''), p.image_url, '') from '/nameplates/device-([0-9]+)_'), '')::integer
  ), 0)
    into v_photo_max_index
  from public.photos p
  where p.job_id = p_job_id;

  v_row_count := greatest(
    case when coalesce(v_model, '') = '' then 0 else coalesce(array_length(v_models, 1), 0) end,
    case when coalesce(v_serial, '') = '' then 0 else coalesce(array_length(v_serials, 1), 0) end,
    v_photo_max_index
  );

  if p_device_index > v_row_count then
    raise exception 'Nie znaleziono urządzenia % w tym montażu.', p_device_index using errcode = 'P0002';
  end if;

  select coalesce(string_agg(coalesce(v_models[gs], ''), E'\n' order by gs), '')
    into v_next_model
  from generate_series(1, v_row_count) gs
  where gs <> p_device_index;

  select coalesce(string_agg(coalesce(v_serials[gs], ''), E'\n' order by gs), '')
    into v_next_serial
  from generate_series(1, v_row_count) gs
  where gs <> p_device_index;

  delete from public.nameplate_manual_verifications
  where job_id = p_job_id
    and device_index = p_device_index;

  update public.nameplate_manual_verifications
  set device_index = device_index + 1000
  where job_id = p_job_id
    and device_index > p_device_index;

  update public.nameplate_manual_verifications
  set device_index = device_index - 1001
  where job_id = p_job_id
    and device_index > 1000 + p_device_index;

  delete from public.photos p
  where p.job_id = p_job_id
    and nullif(substring(coalesce(nullif(p.storage_path, ''), p.image_url, '') from '/nameplates/device-([0-9]+)_'), '')::integer = p_device_index;

  with indexed_photos as (
    select
      p.id,
      nullif(substring(coalesce(nullif(p.storage_path, ''), p.image_url, '') from '/nameplates/device-([0-9]+)_'), '')::integer as old_device_index
    from public.photos p
    where p.job_id = p_job_id
  )
  update public.photos p
  set
    storage_path = case
      when coalesce(p.storage_path, '') <> '' then regexp_replace(
        p.storage_path,
        '/nameplates/device-[0-9]+_',
        '/nameplates/device-' || (ip.old_device_index - 1)::text || '_'
      )
      else p.storage_path
    end,
    image_url = case
      when coalesce(p.image_url, '') <> '' then regexp_replace(
        p.image_url,
        '/nameplates/device-[0-9]+_',
        '/nameplates/device-' || (ip.old_device_index - 1)::text || '_'
      )
      else p.image_url
    end
  from indexed_photos ip
  where p.id = ip.id
    and ip.old_device_index > p_device_index;

  update public.jobs
  set
    device_model = nullif(v_next_model, ''),
    device_serial_number = nullif(v_next_serial, '')
  where id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'deleted_device_index', p_device_index,
    'device_model', nullif(v_next_model, ''),
    'device_serial_number', nullif(v_next_serial, '')
  );
end;
$$;

revoke all on function public.admin_delete_job_device(uuid, integer) from public;
revoke all on function public.admin_delete_job_device(uuid, integer) from anon;
grant execute on function public.admin_delete_job_device(uuid, integer) to authenticated;
