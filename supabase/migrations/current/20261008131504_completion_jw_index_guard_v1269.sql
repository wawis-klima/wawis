-- WAWIS 12.69 — new completion transitions require explicit JW and JZ models.
-- Preserve existing protocol/photo guards and the admin exception for physical nameplate photos.
-- Historic completed jobs remain unchanged until their device models are explicitly edited.

create or replace function private.guard_job_device_models_v1269()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line text;
  v_part text;
  v_jw integer;
  v_jz integer;
  v_jw_numbers integer[];
  v_jw_number integer;
  v_unindexed_jw boolean;
  v_i integer;
  v_rows integer := 0;
begin
  if new.status is distinct from 'Zakończone'
     or not (
       tg_op = 'INSERT'
       or old.status is distinct from 'Zakończone'
       or old.device_model is distinct from new.device_model
     )
  then
    return new;
  end if;

  -- No role, including service_role, bypasses integrity for new completion transitions.

  for v_line in
    select pg_catalog.btrim(t.line)
      from pg_catalog.regexp_split_to_table(
        pg_catalog.replace(coalesce(new.device_model, ''), E'\r', ''), E'\n'
      ) as t(line)
  loop
    if v_line = '' then continue; end if;
    v_rows := v_rows + 1;
    v_jw := 0;
    v_jz := 0;
    v_jw_numbers := '{}'::integer[];
    v_unindexed_jw := false;

    for v_part in
      select pg_catalog.btrim(p.part)
        from pg_catalog.regexp_split_to_table(v_line, '[|]') as p(part)
    loop
      if v_part ~* '^JW[1-5]?[[:space:]]*:' then
        if v_part !~* '^JW[1-5]?[[:space:]]*:[[:space:]]*[^[:space:]]' then
          raise exception 'job_device_models_incomplete:JW' using errcode='23514';
        end if;
        v_jw := v_jw + 1;
        v_jw_number := nullif(pg_catalog.regexp_replace(
          pg_catalog.split_part(v_part, ':', 1), '[^0-9]', '', 'g'
        ), '')::integer;
        if v_jw_number is null then
          v_unindexed_jw := true;
        else
          if v_jw_number = any(v_jw_numbers) then
            raise exception 'job_device_models_duplicate_jw_index' using errcode='23514';
          end if;
          v_jw_numbers := pg_catalog.array_append(v_jw_numbers, v_jw_number);
        end if;
      elsif v_part ~* '^JZ[[:space:]]*:' then
        if v_part !~* '^JZ[[:space:]]*:[[:space:]]*[^[:space:]]' then
          raise exception 'job_device_models_incomplete:JZ' using errcode='23514';
        end if;
        v_jz := v_jz + 1;
      else
        raise exception 'job_device_models_unstructured: oczekiwano JW i JZ w każdym urządzeniu'
          using errcode='23514';
      end if;
    end loop;

    -- Multi-split indices must be distinct and uninterrupted (JW1..JWN).
    if v_jw > 1 and v_unindexed_jw then
      raise exception 'job_device_models_mixed_jw_indices' using errcode='23514';
    end if;
    if pg_catalog.cardinality(v_jw_numbers) > 0 then
      if pg_catalog.cardinality(v_jw_numbers) <> v_jw then
        raise exception 'job_device_models_mixed_jw_indices' using errcode='23514';
      end if;
      for v_i in 1..v_jw loop
        if not (v_i = any(v_jw_numbers)) then
          raise exception 'job_device_models_missing_jw_index:%', v_i using errcode='23514';
        end if;
      end loop;
    end if;

    if v_jw < 1 or v_jz <> 1 or v_jw > 5 then
      raise exception 'job_device_models_incomplete: device % requires JW and JZ', v_rows
        using errcode='23514';
    end if;
  end loop;

  if v_rows = 0 then
    raise exception 'job_device_models_incomplete: add JW and JZ' using errcode='23514';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_job_device_models_v1269() from public, anon, authenticated;
drop trigger if exists trg_jobs_device_models_v1267 on public.jobs;
drop trigger if exists trg_jobs_device_models_v1269 on public.jobs;
create trigger trg_jobs_device_models_v1269
before insert or update of status, device_model on public.jobs
for each row execute function private.guard_job_device_models_v1269();

comment on function private.guard_job_device_models_v1269() is
  'WAWIS 12.69: JW/JZ integrity, unique contiguous JW indices, all roles, existing photo/protocol guards preserved.';
