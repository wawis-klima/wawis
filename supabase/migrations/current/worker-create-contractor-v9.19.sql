-- Wawis 9.19 — bezpieczne dodawanie nowego klienta przez pracownika mobilnego.
-- Pracownik nie dostaje SELECT/INSERT do całej tabeli contractors.
-- SECURITY DEFINER pozwala tylko utworzyć lub odzyskać kontrahenta pasującego do danych wpisanych w formularzu.

create or replace function public.worker_create_or_get_contractor_for_job(
  p_company_name text,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_street text default null
)
returns public.contractors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_row public.contractors;
  v_name text := trim(coalesce(p_company_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_street text := nullif(trim(coalesce(p_street, '')), '');
  v_addresses jsonb;
begin
  select role into v_role
  from public.profiles
  where id = auth.uid();

  if v_role not in ('Pracownik', 'Administrator') then
    raise exception 'Brak uprawnień do dodania klienta.';
  end if;

  if v_name = '' then
    raise exception 'Podaj klienta.';
  end if;

  select c.* into v_row
  from public.contractors c
  where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name)
  limit 1;

  if v_row.id is null and public.normalize_contractors_phone(v_phone) is not null then
    select c.* into v_row
    from public.contractors c
    where public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone)
    limit 1;
  end if;

  if v_row.id is null and public.normalize_contractors_email(v_email) is not null then
    select c.* into v_row
    from public.contractors c
    where public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email)
    limit 1;
  end if;

  if v_row.id is not null then
    return v_row;
  end if;

  v_addresses := public.normalize_contractor_addresses(null, v_city, v_street);

  insert into public.contractors (
    company_name,
    contact_person,
    phone,
    email,
    city,
    street,
    addresses,
    notes,
    is_active
  ) values (
    v_name,
    null,
    v_phone,
    v_email,
    v_city,
    v_street,
    v_addresses,
    'Utworzono przez pracownika z mobilnego formularza nowego klienta.',
    true
  )
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    select c.* into v_row
    from public.contractors c
    where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name)
       or (public.normalize_contractors_phone(v_phone) is not null and public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone))
       or (public.normalize_contractors_email(v_email) is not null and public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email))
    order by c.created_at asc
    limit 1;

    if v_row.id is null then
      raise;
    end if;

    return v_row;
end;
$$;

revoke all on function public.worker_create_or_get_contractor_for_job(text, text, text, text, text) from public;
grant execute on function public.worker_create_or_get_contractor_for_job(text, text, text, text, text) to authenticated;
