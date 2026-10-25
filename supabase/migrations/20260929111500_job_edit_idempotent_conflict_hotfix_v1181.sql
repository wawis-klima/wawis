-- WAWIS production hotfix: idempotent optimistic-concurrency save.
-- Stale snapshots no longer fail when the database already contains the exact target value.
-- Genuine concurrent changes still raise JOB_EDIT_CONFLICT.

create or replace function public.save_job_concurrent_v1168(
  p_id uuid,
  p_fields jsonb default '{}'::jsonb,
  p_expected jsonb default '{}'::jsonb,
  p_installer_ids uuid[] default null,
  p_expected_installer_ids uuid[] default null,
  p_update_installers boolean default false
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_current public.jobs%rowtype;
  v_saved public.jobs%rowtype;
  v_allowed constant text[] := array[
    'title','client','email','phone','city','street','location','status',
    'installation_date','admin_note','main_technician_id','sms_recipient_phone',
    'contractor_id','contractor_address_id','device_model','device_serial_number'
  ];
  v_key text;
  v_assignments text;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_expected jsonb := coalesce(p_expected, '{}'::jsonb);
  v_installers uuid[];
  v_current_installers uuid[];
  v_expected_installers uuid[];
  v_result_main_technician uuid;
begin
  if auth.uid() is null then
    raise exception 'Zaloguj się ponownie.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Brak identyfikatora montażu.';
  end if;
  if jsonb_typeof(v_fields) is distinct from 'object'
     or jsonb_typeof(v_expected) is distinct from 'object' then
    raise exception 'Niepoprawne dane edycji montażu.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_fields) key_name
    where not key_name = any(v_allowed)
  ) then
    raise exception 'Niedozwolone pole edycji montażu.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_fields) key_name
    where not (v_expected ? key_name)
  ) then
    raise exception 'Brak wartości bazowej dla zmienianego pola.';
  end if;

  select *
  into v_current
  from public.jobs
  where id = p_id
  for update;

  if v_current.id is null then
    raise exception 'Nie zapisano karty. Brak uprawnień albo karta nie istnieje.' using errcode = '42501';
  end if;

  for v_key in select jsonb_object_keys(v_fields)
  loop
    if (to_jsonb(v_current) -> v_key) is distinct from (v_expected -> v_key)
       and (to_jsonb(v_current) -> v_key) is distinct from (v_fields -> v_key) then
      raise exception 'JOB_EDIT_CONFLICT:%', v_key using errcode = 'P0001';
    end if;
  end loop;

  if p_update_installers then
    if v_current.installer_ids is null then
      if p_expected_installer_ids is not null then
        raise exception 'JOB_EDIT_CONFLICT:installer_ids' using errcode = 'P0001';
      end if;
    else
      if p_expected_installer_ids is null then
        raise exception 'JOB_EDIT_CONFLICT:installer_ids' using errcode = 'P0001';
      end if;

      select coalesce(array_agg(x order by x), '{}'::uuid[])
      into v_current_installers
      from (
        select distinct unnest(v_current.installer_ids) as x
      ) normalized_current;

      select coalesce(array_agg(x order by x), '{}'::uuid[])
      into v_expected_installers
      from (
        select distinct unnest(p_expected_installer_ids) as x
      ) normalized_expected;

      if v_current_installers is distinct from v_expected_installers then
        raise exception 'JOB_EDIT_CONFLICT:installer_ids' using errcode = 'P0001';
      end if;
    end if;

    select coalesce(array_agg(x order by x), '{}'::uuid[])
    into v_installers
    from (
      select distinct unnest(coalesce(p_installer_ids, '{}'::uuid[])) as x
    ) normalized_installers;

    if exists (
      select 1
      from unnest(v_installers) installer_id
      left join public.profiles p on p.id = installer_id
      where p.id is null
         or lower(trim(coalesce(p.role, ''))) not in ('employee','pracownik','admin','administrator')
    ) then
      raise exception 'Przypisany monter nie istnieje lub nie jest pracownikiem.' using errcode = '23503';
    end if;

    v_result_main_technician := case
      when v_fields ? 'main_technician_id'
        then nullif(v_fields ->> 'main_technician_id', '')::uuid
      else v_current.main_technician_id
    end;

    if v_result_main_technician is not null
       and not (v_result_main_technician = any(v_installers)) then
      raise exception 'Główny monter musi znajdować się na potwierdzonej liście monterów.';
    end if;

    v_fields := v_fields || jsonb_build_object('installer_ids', to_jsonb(v_installers));
  end if;

  if v_fields <> '{}'::jsonb then
    select string_agg(format('%I = r.%I', key_name, key_name), ',')
    into v_assignments
    from jsonb_object_keys(v_fields) key_name;

    execute format(
      'update public.jobs j
       set %s
       from jsonb_populate_record(null::public.jobs, $1) r
       where j.id = $2
       returning j.*',
      v_assignments
    )
    into v_saved
    using v_fields, p_id;
  else
    v_saved := v_current;
  end if;

  if v_saved.id is null then
    raise exception 'Nie zapisano karty. Brak uprawnień albo karta nie istnieje.' using errcode = '42501';
  end if;

  if p_update_installers and cardinality(v_installers) > 0 then
    insert into public.job_access(job_id, user_id)
    select v_saved.id, installer_id
    from unnest(v_installers) installer_id
    where not exists (
      select 1
      from public.job_access a
      where a.job_id = v_saved.id
        and a.user_id = installer_id
    );
    -- Celowo nie usuwamy job_access przy usunięciu z listy monterów.
    -- Dostęp techniczny i przypisanie biznesowe są od 11.68 osobnymi pojęciami.
  end if;

  return jsonb_build_object(
    'id', v_saved.id,
    'status', v_saved.status,
    'installer_ids', v_saved.installer_ids
  );
end
$function$;

revoke all on function public.save_job_concurrent_v1168(uuid,jsonb,jsonb,uuid[],uuid[],boolean)
  from public, anon;
grant execute on function public.save_job_concurrent_v1168(uuid,jsonb,jsonb,uuid[],uuid[],boolean)
  to authenticated;
