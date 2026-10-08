-- WAWIS 12.67 — new completion transitions require explicit JW and JZ models.
-- Preserve existing protocol/photo guards and the admin exception for physical nameplate photos.
-- Historic completed jobs remain unchanged until their device models are explicitly edited.

create or replace function private.guard_job_device_models_v1267()
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

  -- Existing internal maintenance may replay legacy snapshots; ordinary users,
  -- including Administrator, are never exempted from the JW/JZ model guard.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

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

    for v_part in
      select pg_catalog.btrim(p.part)
        from pg_catalog.regexp_split_to_table(v_line, '[|]') as p(part)
    loop
      if v_part ~* '^JW[1-5]?[[:space:]]*:' then
        if v_part !~* '^JW[1-5]?[[:space:]]*:[[:space:]]*[^[:space:]]' then
          raise exception 'job_device_models_incomplete:JW' using errcode='23514';
        end if;
        v_jw := v_jw + 1;
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

revoke all on function private.guard_job_device_models_v1267() from public, anon, authenticated;
drop trigger if exists trg_jobs_device_models_v1267 on public.jobs;
create trigger trg_jobs_device_models_v1267
before insert or update of status, device_model on public.jobs
for each row execute function private.guard_job_device_models_v1267();

comment on function private.guard_job_device_models_v1267() is
  'WAWIS 12.67: full JW+JZ model on each device for completion; existing nameplate photo and protocol checks stay in force.';
