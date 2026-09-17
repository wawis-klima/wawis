-- WAWIS 10.89 / N7 stage B / rebuild-only function exactness fix.

CREATE OR REPLACE FUNCTION public.admin_get_contractor_devices(p_contractor_id uuid)
 RETURNS TABLE(id uuid, contractor_id uuid, model text, serial_number text, installation_date date, service_reminder_years integer, status text, notes text, source_job_id text, source_kind text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_devices_with_contractor()
 RETURNS TABLE(id uuid, contractor_id uuid, contractor_name text, contractor_city text, contractor_street text, contractor_phone text, contractor_email text, model text, serial_number text, installation_date date, service_reminder_years integer, status text, notes text, source_job_id text, source_kind text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_jobs_use_existing_contractor()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_existing_id uuid;
  v_client text;
begin
  if tg_op not in ('INSERT', 'UPDATE') then
    return new;
  end if;

  v_client := trim(coalesce(new.client, ''));

  if v_client = '' then
    return new;
  end if;

  if new.contractor_id is not null then
    return new;
  end if;

  select c.id
    into v_existing_id
  from public.contractors c
  where public.normalize_contractors_text(c.company_name) =
        public.normalize_contractors_text(v_client)
  limit 1;

  if v_existing_id is not null then
    raise exception 'Taki klient już istnieje w bazie kontrahentów. Wybierz go z listy zamiast wpisywać ręcznie.'
      using errcode = '23505',
            detail = 'Istniejący contractor_id: ' || v_existing_id::text,
            hint = 'W formularzu montażu użyj pola wyboru kontrahenta z bazy.';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_contractor_addresses(input_addresses jsonb, fallback_city text DEFAULT NULL::text, fallback_street text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  with raw_addresses as (
    select
      ordinality,
      coalesce(nullif(trim(item->>'id'), ''), gen_random_uuid()::text) as id,
      nullif(trim(item->>'label'), '') as label,
      nullif(trim(item->>'city'), '') as city,
      nullif(trim(item->>'street'), '') as street,
      nullif(trim(item->>'notes'), '') as notes,
      lower(coalesce(item->>'is_primary', 'false')) in ('true', '1', 'yes') as requested_primary
    from jsonb_array_elements(
      case when jsonb_typeof(input_addresses) = 'array' then input_addresses else '[]'::jsonb end
    ) with ordinality as rows(item, ordinality)
  ), valid_addresses as (
    select *
    from raw_addresses
    where city is not null or street is not null
  ), primary_choice as (
    select coalesce(
      min(ordinality) filter (where requested_primary),
      min(ordinality)
    ) as primary_ordinality
    from valid_addresses
  )
  select jsonb_agg(
    jsonb_build_object(
      'id', address.id,
      'label', coalesce(address.label, case when address.ordinality = choice.primary_ordinality then 'Adres główny' else 'Adres ' || address.ordinality::text end),
      'city', coalesce(address.city, ''),
      'street', coalesce(address.street, ''),
      'notes', coalesce(address.notes, ''),
      'is_primary', address.ordinality = choice.primary_ordinality
    )
    order by address.ordinality
  )
  into result
  from valid_addresses address
  cross join primary_choice choice;

  if result is null and (nullif(trim(coalesce(fallback_city, '')), '') is not null or nullif(trim(coalesce(fallback_street, '')), '') is not null) then
    result := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'label', 'Adres główny',
      'city', coalesce(nullif(trim(coalesce(fallback_city, '')), ''), ''),
      'street', coalesce(nullif(trim(coalesce(fallback_street, '')), ''), ''),
      'notes', '',
      'is_primary', true
    ));
  end if;

  return coalesce(result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_device_from_job_row(p_job_id text, p_contractor_id uuid, p_model text, p_serial_number text, p_installation_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
