-- WAWIS 11.61 — edycja danych klienta z mobilnego montażu ma nadpisywać kartotekę.
-- 1) Aktualizacja istniejącego kontrahenta nie jest blokowana przez historyczny duplikat email/telefon/NIP.
--    Ochrona przed tworzeniem nowych duplikatów pozostaje aktywna przy INSERT.
--    Unikalność nazwy firmy nadal pilnuje istniejący indeks contractors_company_name_unique_idx.
-- 2) Synchronizacja danych kontaktowych z edytowanego zlecenia działa dla całego personelu,
--    czyli zarówno Administratora, jak i Pracownika.

create or replace function public.enforce_contractors_contact_duplicates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict_name text;
  v_conflict_value text;
  v_conflict_company text;
begin
  new.company_name := trim(coalesce(new.company_name, ''));

  if new.company_name = '' then
    raise exception 'Nazwa kontrahenta jest wymagana';
  end if;

  -- Edycja istniejącej kartoteki ma zawsze przejść. W bazie są historyczne wpisy
  -- ze wspólnym emailem/telefonem i nie mogą one blokować poprawienia danych klienta.
  -- Nazwa nadal jest chroniona przez unikalny indeks po normalize_contractors_text(company_name).
  if tg_op = 'UPDATE' then
    return new;
  end if;

  select 'nazwa', new.company_name, c.company_name
    into v_conflict_name, v_conflict_value, v_conflict_company
  from public.contractors c
  where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(new.company_name)
  limit 1;

  if v_conflict_name is null and public.normalize_contractors_email(new.email) is not null then
    select 'email', new.email, c.company_name
      into v_conflict_name, v_conflict_value, v_conflict_company
    from public.contractors c
    where public.normalize_contractors_email(c.email) = public.normalize_contractors_email(new.email)
    limit 1;
  end if;

  if v_conflict_name is null and public.normalize_contractors_phone(new.phone) is not null then
    select 'telefon', new.phone, c.company_name
      into v_conflict_name, v_conflict_value, v_conflict_company
    from public.contractors c
    where public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(new.phone)
    limit 1;
  end if;

  if v_conflict_name is null and public.normalize_contractors_nip(new.nip) is not null then
    select 'NIP', new.nip, c.company_name
      into v_conflict_name, v_conflict_value, v_conflict_company
    from public.contractors c
    where public.normalize_contractors_nip(c.nip) = public.normalize_contractors_nip(new.nip)
    limit 1;
  end if;

  if v_conflict_name is not null then
    raise exception 'Kontrahent już istnieje w bazie — duplikat po polu: %.', v_conflict_name
      using errcode = '23505',
            detail = format(
              'Konflikt: %s = %s; istniejący wpis: %s',
              v_conflict_name,
              coalesce(v_conflict_value, '—'),
              coalesce(v_conflict_company, 'bez nazwy')
            ),
            hint = 'Otwórz istniejącego kontrahenta albo popraw dane przed zapisem.';
  end if;

  return new;
end;
$$;

create or replace function private.sync_worker_contractor_contact_from_job_v1089()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addresses jsonb;
  v_ordinal bigint;
  v_primary boolean := false;
  v_city_changed boolean := old.city is distinct from new.city;
  v_street_changed boolean := old.street is distinct from new.street;
begin
  -- Reassignment selects another contractor; it must never copy the old contact.
  -- Synchronizacja dotyczy każdego zalogowanego członka personelu, w tym Administratora.
  if new.contractor_id is null
     or old.contractor_id is distinct from new.contractor_id
     or not public.current_user_is_staff() then
    return new;
  end if;

  select c.addresses
    into v_addresses
  from public.contractors c
  where c.id = new.contractor_id
  for update;

  if not found then
    return new;
  end if;

  if (v_city_changed or v_street_changed)
     and old.contractor_address_id is not distinct from new.contractor_address_id then
    if jsonb_typeof(v_addresses) = 'array' then
      select ord, coalesce((item->>'is_primary')::boolean, false)
        into v_ordinal, v_primary
      from jsonb_array_elements(v_addresses) with ordinality as a(item, ord)
      where (new.contractor_address_id is not null and item->>'id' = new.contractor_address_id)
         or (new.contractor_address_id is null and item->>'is_primary' = 'true')
      order by ord
      limit 1;

      if v_ordinal is not null then
        select jsonb_agg(
          case
            when ord = v_ordinal then
              item
              || case when v_city_changed then jsonb_build_object('city', coalesce(new.city, '')) else '{}'::jsonb end
              || case when v_street_changed then jsonb_build_object('street', coalesce(new.street, '')) else '{}'::jsonb end
            else item
          end
          order by ord
        )
        into v_addresses
        from jsonb_array_elements(v_addresses) with ordinality as a(item, ord);
      elsif new.contractor_address_id is null and jsonb_array_length(v_addresses) = 0 then
        v_primary := true;
      end if;
    elsif new.contractor_address_id is null then
      v_primary := true;
    end if;
  end if;

  update public.contractors c
  set
    company_name = case when old.client is distinct from new.client then trim(new.client) else c.company_name end,
    phone = case when old.phone is distinct from new.phone then nullif(trim(coalesce(new.phone, '')), '') else c.phone end,
    email = case when old.email is distinct from new.email then nullif(trim(coalesce(new.email, '')), '') else c.email end,
    city = case when v_primary and v_city_changed then nullif(trim(coalesce(new.city, '')), '') else c.city end,
    street = case when v_primary and v_street_changed then nullif(trim(coalesce(new.street, '')), '') else c.street end,
    addresses = v_addresses
  where c.id = new.contractor_id;

  return new;
end;
$$;

revoke all on function private.sync_worker_contractor_contact_from_job_v1089() from public, anon, authenticated;
