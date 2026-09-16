-- WAWIS 10.88 — N2: backend completeness guard for required JW/JZ nameplates.
-- The same jobs row is used as the serialization lock for completion and nameplate mutations.

create or replace function private.job_nameplate_requirements(
  p_job_id uuid,
  p_device_model text,
  p_device_serial_number text
)
returns table(device_index integer, unit_ref text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_model_lines text[] := pg_catalog.regexp_split_to_array(pg_catalog.replace(coalesce(p_device_model, ''), E'\r', ''), E'\n');
  v_serial_lines text[] := pg_catalog.regexp_split_to_array(pg_catalog.replace(coalesce(p_device_serial_number, ''), E'\r', ''), E'\n');
  v_raw_count integer := greatest(coalesce(pg_catalog.array_length(v_model_lines, 1), 0), coalesce(pg_catalog.array_length(v_serial_lines, 1), 0));
  v_raw_index integer;
  v_device_index integer := 0;
  v_model_line text;
  v_serial_line text;
  v_indoor_count integer;
  v_unit integer;
  v_match text[];
  v_has_device_data boolean := nullif(pg_catalog.btrim(coalesce(p_device_model, '') || coalesce(p_device_serial_number, '')), '') is not null;
  v_inferred_devices integer;
begin
  if v_has_device_data then
    for v_raw_index in 1..greatest(v_raw_count, 1) loop
      v_model_line := pg_catalog.btrim(coalesce(v_model_lines[v_raw_index], ''));
      v_serial_line := pg_catalog.btrim(coalesce(v_serial_lines[v_raw_index], ''));
      if v_model_line = '' and v_serial_line = '' then
        continue;
      end if;

      v_device_index := v_device_index + 1;
      v_indoor_count := 1;
      for v_match in
        select m
        from pg_catalog.regexp_matches(
          v_model_line || ' | ' || v_serial_line,
          'JW[[:space:]]*([1-5])[[:space:]]*:',
          'gi'
        ) as m
      loop
        v_indoor_count := greatest(v_indoor_count, coalesce(v_match[1]::integer, 1));
      end loop;

      device_index := v_device_index;
      unit_ref := 'jz';
      return next;
      for v_unit in 1..v_indoor_count loop
        device_index := v_device_index;
        unit_ref := 'jw-' || v_unit::text;
        return next;
      end loop;
    end loop;
  end if;

  if v_device_index > 0 then
    return;
  end if;

  -- Mirrors the frontend fallback: with no serialized device rows, infer from
  -- already stored nameplates; if none exist, require one JZ + one JW.
  select greatest(coalesce(max(p.device_index), 0), 1)
    into v_inferred_devices
  from public.photos p
  where p.job_id = p_job_id
    and p.photo_kind = 'nameplate';

  for v_device_index in 1..v_inferred_devices loop
    select greatest(
      coalesce(max((pg_catalog.substring(p.unit_ref, '^jw-([0-9]+)$'))::integer), 0),
      1
    )
      into v_indoor_count
    from public.photos p
    where p.job_id = p_job_id
      and p.photo_kind = 'nameplate'
      and p.device_index = v_device_index;

    device_index := v_device_index;
    unit_ref := 'jz';
    return next;
    for v_unit in 1..v_indoor_count loop
      device_index := v_device_index;
      unit_ref := 'jw-' || v_unit::text;
      return next;
    end loop;
  end loop;
end;
$$;

create or replace function private.assert_job_nameplates_complete(
  p_job_id uuid,
  p_device_model text,
  p_device_serial_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required record;
  v_missing text[] := array[]::text[];
begin
  if p_job_id is null then
    raise exception 'job_nameplates_invalid_job' using errcode = '22023';
  end if;

  for v_required in
    select *
    from private.job_nameplate_requirements(p_job_id, p_device_model, p_device_serial_number)
  loop
    if not exists (
      select 1
      from public.photos p
      where p.job_id = p_job_id
        and p.photo_kind = 'nameplate'
        and p.device_index = v_required.device_index
        and p.unit_ref = v_required.unit_ref
        and (
          nullif(pg_catalog.btrim(coalesce(p.storage_path, '')), '') is not null
          or nullif(pg_catalog.btrim(coalesce(p.image_url, '')), '') is not null
        )
    ) then
      v_missing := pg_catalog.array_append(v_missing, 'device-' || v_required.device_index::text || ':' || v_required.unit_ref);
    end if;
  end loop;

  if coalesce(pg_catalog.array_length(v_missing, 1), 0) > 0 then
    raise exception 'job_nameplates_incomplete: %', pg_catalog.array_to_string(v_missing, ', ')
      using errcode = '23514';
  end if;
end;
$$;

create or replace function private.guard_job_completion_nameplates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'Zakończone'
     and (tg_op = 'INSERT' or old.status is distinct from 'Zakończone') then
    -- Trusted service-role maintenance remains possible; every user-facing
    -- direct REST/SQL path, including Administrator, must satisfy the invariant.
    if coalesce(auth.role(), '') <> 'service_role' then
      perform private.assert_job_nameplates_complete(new.id, new.device_model, new.device_serial_number);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.lock_job_for_photo_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_job uuid := case when tg_op <> 'INSERT' and old.photo_kind = 'nameplate' then old.job_id else null end;
  v_new_job uuid := case when tg_op <> 'DELETE' and new.photo_kind = 'nameplate' then new.job_id else null end;
begin
  if v_old_job is null and v_new_job is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Ordered row locks prevent DELETE/UPDATE of a required nameplate from racing
  -- with the status transition to Zakończone.
  perform j.id
  from public.jobs j
  where j.id = any(pg_catalog.array_remove(array[v_old_job, v_new_job]::uuid[], null))
  order by j.id
  for update;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.guard_completed_job_nameplates_after_photo_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_job record;
begin
  -- Adding a nameplate can only improve completeness. Deletions and updates
  -- must preserve the invariant for every completed job they affect.
  if tg_op = 'INSERT' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.photo_kind <> 'nameplate' and new.photo_kind = 'nameplate' then
    return new;
  end if;
  if (tg_op = 'DELETE' and old.photo_kind <> 'nameplate')
     or (tg_op = 'UPDATE' and old.photo_kind <> 'nameplate' and new.photo_kind <> 'nameplate') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  for v_job_id in
    select distinct x
    from unnest(pg_catalog.array_remove(array[
      case when tg_op <> 'INSERT' and old.photo_kind = 'nameplate' then old.job_id else null end,
      case when tg_op <> 'DELETE' and new.photo_kind = 'nameplate' then new.job_id else null end
    ]::uuid[], null)) as x
  loop
    select j.id, j.status, j.device_model, j.device_serial_number
      into v_job
    from public.jobs j
    where j.id = v_job_id;

    if found and v_job.status = 'Zakończone' then
      perform private.assert_job_nameplates_complete(v_job.id, v_job.device_model, v_job.device_serial_number);
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_jobs_nameplate_completion_guard on public.jobs;
create trigger trg_jobs_nameplate_completion_guard
before insert or update on public.jobs
for each row execute function private.guard_job_completion_nameplates();

drop trigger if exists trg_photos_nameplate_job_lock on public.photos;
create trigger trg_photos_nameplate_job_lock
before insert or update or delete on public.photos
for each row execute function private.lock_job_for_photo_mutation();

drop trigger if exists trg_photos_completed_nameplate_guard on public.photos;
create trigger trg_photos_completed_nameplate_guard
after update or delete on public.photos
for each row execute function private.guard_completed_job_nameplates_after_photo_mutation();
