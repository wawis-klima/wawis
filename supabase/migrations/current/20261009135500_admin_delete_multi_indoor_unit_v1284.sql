-- WAWIS 12.84: admin-only removal of one JW inside an existing multi-split.
-- The job row lock serializes changes with concurrent photo mutations and completion.
-- Photo storage paths stay unchanged: assignment is explicitly in device_index/unit_ref.

create or replace function private.remove_indoor_segment_v1284(p_line text, p_unit integer)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_part text;
  v_number integer;
  v_parts text[] := array[]::text[];
begin
  for v_part in
    select pg_catalog.btrim(t.part)
    from pg_catalog.regexp_split_to_table(coalesce(p_line, ''), '[|]') as t(part)
  loop
    if v_part ~* '^JW[1-5][[:space:]]*:' then
      v_number := (pg_catalog.substring(v_part, '^JW([1-5])'))::integer;
      if v_number = p_unit then
        continue;
      end if;
      if v_number > p_unit then
        v_part := pg_catalog.regexp_replace(v_part, '^JW[1-5]', 'JW' || (v_number - 1)::text, 'i');
      end if;
    end if;
    if v_part <> '' then
      v_parts := pg_catalog.array_append(v_parts, v_part);
    end if;
  end loop;
  return pg_catalog.array_to_string(v_parts, ' | ');
end;
$$;

revoke all on function private.remove_indoor_segment_v1284(text, integer) from public, anon, authenticated;

create or replace function public.admin_delete_job_indoor_unit(
  p_job_id uuid,
  p_device_index integer,
  p_unit_number integer,
  p_expected_model text,
  p_expected_serial text,
  p_expected_photo_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_model text;
  v_serial text;
  v_models text[];
  v_serials text[];
  v_model_line text;
  v_serial_line text;
  v_match text[];
  v_indoor_count integer := 0;
  v_photo_count integer := 0;
  v_manual_count integer := 0;
  v_row_count integer := 0;
  v_unit integer;
  v_target_ids uuid[] := array[]::uuid[];
  v_shift_ids uuid[] := array[]::uuid[];
  v_moved_ids uuid[] := array[]::uuid[];
  v_storage_paths text[] := array[]::text[];
  v_cleanup_paths text[] := array[]::text[];
  v_next_model text;
  v_next_serial text;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usuwać jednostki JW.' using errcode = '42501';
  end if;
  if p_job_id is null or coalesce(p_device_index, 0) < 1 or coalesce(p_unit_number, 0) not between 1 and 5 then
    raise exception 'Nieprawidłowy montaż albo numer jednostki.' using errcode = '22023';
  end if;

  select j.device_model, j.device_serial_number
  into v_model, v_serial
  from public.jobs j
  where j.id = p_job_id
  for update;
  if not found then
    raise exception 'Nie znaleziono montażu.' using errcode = 'P0002';
  end if;
  -- The caller must have an up-to-date view. A queued/double-clicked delete
  -- cannot silently target the next JW after the numbering shifts.
  if coalesce(v_model, '') <> coalesce(p_expected_model, '')
     or coalesce(v_serial, '') <> coalesce(p_expected_serial, '') then
    raise exception 'Dane urządzenia zmieniły się. Odśwież montaż przed usunięciem JW.' using errcode = '40001';
  end if;

  v_models := pg_catalog.regexp_split_to_array(pg_catalog.replace(coalesce(v_model, ''), E'\r', ''), E'\n');
  v_serials := pg_catalog.regexp_split_to_array(pg_catalog.replace(coalesce(v_serial, ''), E'\r', ''), E'\n');
  v_row_count := greatest(
    case when coalesce(v_model, '') = '' then 0 else coalesce(pg_catalog.array_length(v_models, 1), 0) end,
    case when coalesce(v_serial, '') = '' then 0 else coalesce(pg_catalog.array_length(v_serials, 1), 0) end
  );
  if p_device_index > v_row_count then
    raise exception 'Nie znaleziono wskazanego urządzenia.' using errcode = 'P0002';
  end if;

  v_model_line := coalesce(v_models[p_device_index], '');
  v_serial_line := coalesce(v_serials[p_device_index], '');
  for v_match in
    select t.m from pg_catalog.regexp_matches(
      v_model_line || ' | ' || v_serial_line,
      'JW[[:space:]]*([1-5])[[:space:]]*:', 'gi'
    ) as t(m)
  loop
    v_indoor_count := greatest(v_indoor_count, v_match[1]::integer);
  end loop;

  -- Prefer explicit photo assignment; legacy nameplates may still use paths.
  select coalesce(max((pg_catalog.substring(
    coalesce(nullif(pg_catalog.lower(p.unit_ref), ''),
      pg_catalog.lower(pg_catalog.substring(coalesce(p.storage_path, ''), '/nameplates/device-[0-9]+_(jw-[0-9]+)_'))),
    '^jw-([1-5])$'))::integer), 0)
  into v_photo_count
  from public.photos p
  where p.job_id = p_job_id
    and coalesce(nullif(p.device_index, 0),
      (pg_catalog.substring(coalesce(p.storage_path, ''), '/nameplates/device-([0-9]+)_'))::integer
    ) = p_device_index
    and (p.photo_kind = 'nameplate' or p.storage_path ~ '/nameplates/device-[0-9]+_');

  select coalesce(max((pg_catalog.substring(pg_catalog.lower(mv.unit_ref), '^jw-([1-5])$'))::integer), 0)
  into v_manual_count
  from public.nameplate_manual_verifications mv
  where mv.job_id = p_job_id and mv.device_index = p_device_index;

  v_indoor_count := greatest(v_indoor_count, v_photo_count, v_manual_count);
  if v_indoor_count < 3 or p_unit_number > v_indoor_count then
    raise exception 'Multi-split musi zachować co najmniej dwie jednostki JW; wskazana jednostka musi istnieć.' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(p.id order by p.id), array[]::uuid[]),
         coalesce(pg_catalog.array_agg(distinct p.storage_path)
           filter (where coalesce(p.storage_path, '') <> ''), array[]::text[])
  into v_target_ids, v_storage_paths
  from public.photos p
  where p.job_id = p_job_id
    and coalesce(nullif(p.device_index, 0),
      (pg_catalog.substring(coalesce(p.storage_path, ''), '/nameplates/device-([0-9]+)_'))::integer
    ) = p_device_index
    and coalesce(nullif(pg_catalog.lower(p.unit_ref), ''),
      pg_catalog.lower(pg_catalog.substring(coalesce(p.storage_path, ''), '/nameplates/device-[0-9]+_(jw-[0-9]+)_'))) = 'jw-' || p_unit_number::text
    and (p.photo_kind = 'nameplate' or p.storage_path ~ '/nameplates/device-[0-9]+_');

  if v_target_ids is distinct from (
    select coalesce(pg_catalog.array_agg(e.photo_id order by e.photo_id), array[]::uuid[])
    from pg_catalog.unnest(coalesce(p_expected_photo_ids, array[]::uuid[])) as e(photo_id)
  ) then
    raise exception 'Tabliczka wybranej JW została zmieniona. Odśwież montaż przed usunięciem.' using errcode = '40001';
  end if;
  if pg_catalog.cardinality(v_target_ids) = 0
     and private.remove_indoor_segment_v1284(v_model_line, p_unit_number) = v_model_line
     and private.remove_indoor_segment_v1284(v_serial_line, p_unit_number) = v_serial_line then
    raise exception 'Nie można usunąć JW bez zapisanych danych ani tabliczki.' using errcode = '23514';
  end if;

  v_models[p_device_index] := private.remove_indoor_segment_v1284(v_model_line, p_unit_number);
  v_serials[p_device_index] := private.remove_indoor_segment_v1284(v_serial_line, p_unit_number);
  v_next_model := pg_catalog.array_to_string(v_models, E'\n');
  v_next_serial := pg_catalog.array_to_string(v_serials, E'\n');

  -- First shorten model requirements. For completed jobs the v12.69 model
  -- guard validates the resulting JW numbering before any photo can be deleted.
  update public.jobs
  set device_model = nullif(v_next_model, ''),
      device_serial_number = nullif(v_next_serial, '')
  where id = p_job_id;

  -- Unique constraint on manual verification assignment requires shifting
  -- from lower to higher after freeing the removed unit's slot.
  delete from public.nameplate_manual_verifications mv
  where mv.job_id = p_job_id and mv.device_index = p_device_index
    and pg_catalog.lower(mv.unit_ref) = 'jw-' || p_unit_number::text;
  for v_unit in (p_unit_number + 1)..v_indoor_count loop
    update public.nameplate_manual_verifications mv
    set unit_ref = 'jw-' || (v_unit - 1)::text
    where mv.job_id = p_job_id and mv.device_index = p_device_index
      and pg_catalog.lower(mv.unit_ref) = 'jw-' || v_unit::text;
  end loop;

  -- Move logical photo assignments from the highest JW downward. This order
  -- keeps every required JW covered through immediate AFTER-photo triggers on
  -- completed jobs. Snapshot IDs prevent shifting the same row twice.
  for v_unit in reverse v_indoor_count..(p_unit_number + 1) loop
    select coalesce(pg_catalog.array_agg(p.id), array[]::uuid[]) into v_shift_ids
    from public.photos p
    where p.job_id = p_job_id
      and coalesce(nullif(p.device_index, 0),
        (pg_catalog.substring(coalesce(p.storage_path, ''), '/nameplates/device-([0-9]+)_'))::integer
      ) = p_device_index
      and coalesce(nullif(pg_catalog.lower(p.unit_ref), ''),
        pg_catalog.lower(pg_catalog.substring(coalesce(p.storage_path, ''), '/nameplates/device-[0-9]+_(jw-[0-9]+)_'))) = 'jw-' || v_unit::text
      and (p.photo_kind = 'nameplate' or p.storage_path ~ '/nameplates/device-[0-9]+_')
      and not (p.id = any(v_moved_ids));

    update public.photos p set
      photo_kind = 'nameplate',
      device_index = p_device_index,
      unit_ref = 'jw-' || (v_unit - 1)::text
    where p.id = any(v_shift_ids);
    v_moved_ids := pg_catalog.array_cat(v_moved_ids, v_shift_ids);
  end loop;

  -- Delete by original IDs, not by unit_ref: shifted photos may now have the
  -- removed JW's old label, but must never be deleted.
  delete from public.photos p where p.id = any(v_target_ids);

  select coalesce(pg_catalog.array_agg(t.path), array[]::text[])
  into v_cleanup_paths
  from pg_catalog.unnest(v_storage_paths) as t(path)
  where not exists (select 1 from public.photos p where p.storage_path = t.path);

  return pg_catalog.jsonb_build_object(
    'job_id', p_job_id,
    'device_index', p_device_index,
    'deleted_unit', 'jw-' || p_unit_number::text,
    'device_model', nullif(v_next_model, ''),
    'device_serial_number', nullif(v_next_serial, ''),
    'cleanup_storage_paths', pg_catalog.to_jsonb(v_cleanup_paths)
  );
end;
$$;

revoke all on function public.admin_delete_job_indoor_unit(uuid, integer, integer, text, text, uuid[]) from public, anon;
grant execute on function public.admin_delete_job_indoor_unit(uuid, integer, integer, text, text, uuid[]) to authenticated;

comment on function public.admin_delete_job_indoor_unit(uuid, integer, integer, text, text, uuid[]) is
  'WAWIS 12.84: admin-only atomic removal of one JW; other units, outdoor JZ and storage paths are preserved.';
