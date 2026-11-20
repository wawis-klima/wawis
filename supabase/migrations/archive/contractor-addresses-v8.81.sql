-- Wawis 8.81: wielu adresów dla jednego kontrahenta.
-- Każde zlecenie nadal przechowuje własną kopię city/street/location,
-- więc późniejsza zmiana adresów kontrahenta nie modyfikuje historii montaży.

create extension if not exists pgcrypto;

alter table public.contractors
  add column if not exists addresses jsonb not null default '[]'::jsonb;

alter table public.jobs
  add column if not exists contractor_address_id text;

create index if not exists jobs_contractor_address_id_idx
  on public.jobs (contractor_address_id)
  where contractor_address_id is not null;

create or replace function public.normalize_contractor_addresses(
  input_addresses jsonb,
  fallback_city text default null,
  fallback_street text default null
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
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
$$;

update public.contractors
set addresses = public.normalize_contractor_addresses(addresses, city, street)
where jsonb_array_length(coalesce(addresses, '[]'::jsonb)) = 0
   or addresses is null;

-- Usuwamy poprzednią sygnaturę i zastępujemy ją wersją obsługującą JSON z adresami.
drop function if exists public.admin_upsert_contractor(uuid, text, text, text, text, text, text, text, text, boolean);
drop function if exists public.admin_upsert_contractor(uuid, text, text, text, text, text, text, text, text, boolean, jsonb);

create function public.admin_upsert_contractor(
  p_id uuid default null,
  p_company_name text default null,
  p_contact_person text default null,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_street text default null,
  p_notes text default null,
  p_nip text default null,
  p_is_active boolean default true,
  p_addresses jsonb default null
)
returns public.contractors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.contractors;
  v_addresses jsonb;
  v_primary_city text;
  v_primary_street text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać kontrahentów.';
  end if;

  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Nazwa kontrahenta jest wymagana.';
  end if;

  v_addresses := public.normalize_contractor_addresses(p_addresses, p_city, p_street);

  select
    nullif(trim(item->>'city'), ''),
    nullif(trim(item->>'street'), '')
  into v_primary_city, v_primary_street
  from jsonb_array_elements(v_addresses) item
  order by case when lower(coalesce(item->>'is_primary', 'false')) in ('true', '1', 'yes') then 0 else 1 end
  limit 1;

  if p_id is null then
    insert into public.contractors (
      company_name,
      contact_person,
      phone,
      email,
      city,
      street,
      addresses,
      notes,
      nip,
      is_active
    ) values (
      trim(p_company_name),
      nullif(trim(coalesce(p_contact_person, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      v_primary_city,
      v_primary_street,
      v_addresses,
      nullif(trim(coalesce(p_notes, '')), ''),
      nullif(trim(coalesce(p_nip, '')), ''),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.contractors
    set company_name = trim(p_company_name),
        contact_person = nullif(trim(coalesce(p_contact_person, '')), ''),
        phone = nullif(trim(coalesce(p_phone, '')), ''),
        email = nullif(trim(coalesce(p_email, '')), ''),
        city = v_primary_city,
        street = v_primary_street,
        addresses = v_addresses,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        nip = nullif(trim(coalesce(p_nip, '')), ''),
        is_active = coalesce(p_is_active, true)
    where id = p_id
    returning * into v_row;

    if v_row is null then
      raise exception 'Nie znaleziono kontrahenta do edycji.';
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.normalize_contractor_addresses(jsonb, text, text) to authenticated, service_role;
grant execute on function public.admin_upsert_contractor(uuid, text, text, text, text, text, text, text, text, boolean, jsonb) to authenticated;
grant select, insert, update, delete on public.contractors to authenticated, service_role;
