create or replace function private.sync_worker_contractor_contact_from_job_v1089()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addresses jsonb;
  v_primary_ordinal bigint;
  v_city text := nullif(trim(coalesce(new.city, '')), '');
  v_street text := nullif(trim(coalesce(new.street, '')), '');
begin
  if new.contractor_id is null then
    return new;
  end if;

  if not public.current_user_is_staff() or public.current_user_is_admin() then
    return new;
  end if;

  select coalesce(c.addresses, '[]'::jsonb)
  into v_addresses
  from public.contractors c
  where c.id = new.contractor_id
  for update;

  if not found then
    return new;
  end if;

  if jsonb_typeof(v_addresses) <> 'array' then
    v_addresses := '[]'::jsonb;
  end if;

  if jsonb_array_length(v_addresses) = 0 then
    v_addresses := jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'label', 'Adres główny',
        'city', coalesce(v_city, ''),
        'street', coalesce(v_street, ''),
        'notes', '',
        'is_primary', true
      )
    );
  else
    select coalesce(
      min(ord) filter (
        where lower(coalesce(item->>'is_primary', 'false')) in ('true', '1', 'yes')
      ),
      min(ord)
    )
    into v_primary_ordinal
    from jsonb_array_elements(v_addresses) with ordinality as items(item, ord);

    select jsonb_agg(
      case
        when ord = v_primary_ordinal then
          item || jsonb_build_object(
            'city', coalesce(v_city, ''),
            'street', coalesce(v_street, ''),
            'is_primary', true
          )
        when lower(coalesce(item->>'is_primary', 'false')) in ('true', '1', 'yes') then
          item || jsonb_build_object('is_primary', false)
        else item
      end
      order by ord
    )
    into v_addresses
    from jsonb_array_elements(v_addresses) with ordinality as items(item, ord);
  end if;

  update public.contractors
  set
    company_name = trim(new.client),
    phone = nullif(trim(coalesce(new.phone, '')), ''),
    email = nullif(trim(coalesce(new.email, '')), ''),
    city = v_city,
    street = v_street,
    addresses = v_addresses
  where id = new.contractor_id;

  return new;
end;
$$;

revoke all on function private.sync_worker_contractor_contact_from_job_v1089() from public;
revoke all on function private.sync_worker_contractor_contact_from_job_v1089() from anon;
revoke all on function private.sync_worker_contractor_contact_from_job_v1089() from authenticated;

drop trigger if exists jobs_worker_contractor_contact_sync_v1089 on public.jobs;

create trigger jobs_worker_contractor_contact_sync_v1089
after update of client, phone, email, city, street
on public.jobs
for each row
when (
  old.client is distinct from new.client
  or old.phone is distinct from new.phone
  or old.email is distinct from new.email
  or old.city is distinct from new.city
  or old.street is distinct from new.street
)
execute function private.sync_worker_contractor_contact_from_job_v1089();
