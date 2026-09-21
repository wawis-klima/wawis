begin;

create extension if not exists pgcrypto;

create or replace function public.normalize_contractors_email(input_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(input_email, ''))), '');
$$;

create or replace function public.normalize_contractors_phone(input_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(input_phone, ''), '\D+', '', 'g'), '');
$$;

create or replace function public.normalize_contractors_nip(input_nip text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(input_nip, ''), '\D+', '', 'g'), '');
$$;

create index if not exists contractors_email_lookup_idx
  on public.contractors (public.normalize_contractors_email(email));

create index if not exists contractors_phone_lookup_idx
  on public.contractors (public.normalize_contractors_phone(phone));

create index if not exists contractors_nip_lookup_idx
  on public.contractors (public.normalize_contractors_nip(nip));

create or replace function public.enforce_contractors_contact_duplicates()
returns trigger
language plpgsql
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

  select 'nazwa', new.company_name, c.company_name
    into v_conflict_name, v_conflict_value, v_conflict_company
  from public.contractors c
  where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(new.company_name)
    and (tg_op = 'INSERT' or c.id <> new.id)
  limit 1;

  if v_conflict_name is null and public.normalize_contractors_email(new.email) is not null then
    select 'email', new.email, c.company_name
      into v_conflict_name, v_conflict_value, v_conflict_company
    from public.contractors c
    where public.normalize_contractors_email(c.email) = public.normalize_contractors_email(new.email)
      and (tg_op = 'INSERT' or c.id <> new.id)
    limit 1;
  end if;

  if v_conflict_name is null and public.normalize_contractors_phone(new.phone) is not null then
    select 'telefon', new.phone, c.company_name
      into v_conflict_name, v_conflict_value, v_conflict_company
    from public.contractors c
    where public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(new.phone)
      and (tg_op = 'INSERT' or c.id <> new.id)
    limit 1;
  end if;

  if v_conflict_name is null and public.normalize_contractors_nip(new.nip) is not null then
    select 'NIP', new.nip, c.company_name
      into v_conflict_name, v_conflict_value, v_conflict_company
    from public.contractors c
    where public.normalize_contractors_nip(c.nip) = public.normalize_contractors_nip(new.nip)
      and (tg_op = 'INSERT' or c.id <> new.id)
    limit 1;
  end if;

  if v_conflict_name is not null then
    raise exception 'Kontrahent już istnieje w bazie — duplikat po polu: %.', v_conflict_name
      using errcode = '23505',
            detail = format('Konflikt: %s = %s; istniejący wpis: %s', v_conflict_name, coalesce(v_conflict_value, '—'), coalesce(v_conflict_company, 'bez nazwy')),
            hint = 'Otwórz istniejącego kontrahenta albo popraw dane przed zapisem.';
  end if;

  return new;
end;
$$;

drop trigger if exists contractors_contact_duplicates_guard on public.contractors;

create trigger contractors_contact_duplicates_guard
before insert or update of company_name, email, phone, nip
on public.contractors
for each row
execute function public.enforce_contractors_contact_duplicates();

commit;
