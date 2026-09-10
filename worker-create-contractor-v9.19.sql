-- Wawis 9.19 — bezpieczne dodawanie nowego klienta przez pracownika mobilnego.
-- Pracownik nie dostaje SELECT/INSERT do całej tabeli contractors.
-- Funkcja zwraca wyłącznie ID oraz dane podane przez bieżącego użytkownika,
-- aby nie ujawniać pracownikowi prywatnych danych istniejących kontrahentów.

drop function if exists public.worker_create_or_get_contractor_for_job(text, text, text, text, text);

create function public.worker_create_or_get_contractor_for_job(
  p_company_name text,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_street text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_id uuid;
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

  if public.normalize_contractors_phone(v_phone) is not null then
    select c.id into v_id
    from public.contractors c
    where public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone)
    limit 1;
  end if;

  if v_id is null and public.normalize_contractors_email(v_email) is not null then
    select c.id into v_id
    from public.contractors c
    where public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email)
    limit 1;
  end if;

  if v_id is null then
    select c.id into v_id
    from public.contractors c
    where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name)
    limit 1;
  end if;

  if v_id is null then
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
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'company_name', v_name,
    'phone', v_phone,
    'email', v_email,
    'city', v_city,
    'street', v_street
  );
exception
  when unique_violation then
    select c.id into v_id
    from public.contractors c
    where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name)
       or (public.normalize_contractors_phone(v_phone) is not null and public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone))
       or (public.normalize_contractors_email(v_email) is not null and public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email))
    order by c.created_at asc
    limit 1;

    if v_id is null then
      raise;
    end if;

    return jsonb_build_object(
      'id', v_id,
      'company_name', v_name,
      'phone', v_phone,
      'email', v_email,
      'city', v_city,
      'street', v_street
    );
end;
$$;

revoke all on function public.worker_create_or_get_contractor_for_job(text, text, text, text, text) from public;
grant execute on function public.worker_create_or_get_contractor_for_job(text, text, text, text, text) to authenticated;
