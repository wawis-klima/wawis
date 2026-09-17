-- A01: a job is a stale snapshot. Only explicit changes may patch its contractor.
create or replace function private.sync_worker_contractor_contact_from_job_v1089()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_addresses jsonb;
  v_ordinal bigint;
  v_primary boolean := false;
  v_city_changed boolean := old.city is distinct from new.city;
  v_street_changed boolean := old.street is distinct from new.street;
begin
  -- Reassignment selects another contractor; it must never copy the old contact.
  if new.contractor_id is null or old.contractor_id is distinct from new.contractor_id
     or not public.current_user_is_staff() or public.current_user_is_admin() then
    return new;
  end if;
  select c.addresses into v_addresses from public.contractors c
    where c.id = new.contractor_id for update;
  if not found then return new; end if;

  if (v_city_changed or v_street_changed)
     and old.contractor_address_id is not distinct from new.contractor_address_id then
    if jsonb_typeof(v_addresses) = 'array' then
      select ord, coalesce((item->>'is_primary')::boolean, false)
        into v_ordinal, v_primary
        from jsonb_array_elements(v_addresses) with ordinality as a(item, ord)
        where (new.contractor_address_id is not null and item->>'id' = new.contractor_address_id)
           or (new.contractor_address_id is null and item->>'is_primary' = 'true')
        order by ord limit 1;
      if v_ordinal is not null then
        select jsonb_agg(case when ord = v_ordinal then item
          || case when v_city_changed then jsonb_build_object('city', coalesce(new.city,'')) else '{}'::jsonb end
          || case when v_street_changed then jsonb_build_object('street', coalesce(new.street,'')) else '{}'::jsonb end
          else item end order by ord)
          into v_addresses from jsonb_array_elements(v_addresses) with ordinality as a(item,ord);
      elsif new.contractor_address_id is null and jsonb_array_length(v_addresses) = 0 then
        v_primary := true;
      end if;
    elsif new.contractor_address_id is null then
      v_primary := true;
    end if;
  end if;
  update public.contractors c set
    company_name = case when old.client is distinct from new.client then trim(new.client) else c.company_name end,
    phone = case when old.phone is distinct from new.phone then nullif(trim(coalesce(new.phone,'')),'') else c.phone end,
    email = case when old.email is distinct from new.email then nullif(trim(coalesce(new.email,'')),'') else c.email end,
    city = case when v_primary and v_city_changed then nullif(trim(coalesce(new.city,'')),'') else c.city end,
    street = case when v_primary and v_street_changed then nullif(trim(coalesce(new.street,'')),'') else c.street end,
    addresses = v_addresses
    where c.id = new.contractor_id;
  return new;
end;
$$;
revoke all on function private.sync_worker_contractor_contact_from_job_v1089() from public, anon, authenticated;

-- A02: both fields feed the required unit set, even after completion.
create or replace function private.guard_job_completion_nameplates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'Zakończone' and (
    tg_op = 'INSERT' or old.status is distinct from new.status
    or old.device_model is distinct from new.device_model
    or old.device_serial_number is distinct from new.device_serial_number
  ) then
    if coalesce(auth.role(), '') <> 'service_role' then
      perform private.assert_job_nameplates_complete(new.id, new.device_model, new.device_serial_number);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_job_completion_nameplates() from public, anon, authenticated;
