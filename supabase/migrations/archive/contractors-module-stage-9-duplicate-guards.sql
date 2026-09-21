create extension if not exists pgcrypto;

create or replace function public.normalize_contractors_text(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')))
$$;

create or replace function public.ensure_unique_contractor_company_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  if public.normalize_contractors_text(new.company_name) = '' then
    raise exception 'Nazwa kontrahenta jest wymagana.';
  end if;

  select c.id
    into v_existing_id
  from public.contractors c
  where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(new.company_name)
    and (tg_op = 'INSERT' or c.id <> new.id)
  limit 1;

  if v_existing_id is not null then
    raise exception 'Kontrahent o takiej nazwie już istnieje. Wybierz istniejący wpis z bazy.';
  end if;

  new.company_name := trim(new.company_name);
  new.contact_person := nullif(trim(coalesce(new.contact_person, '')), '');
  new.phone := nullif(trim(coalesce(new.phone, '')), '');
  new.email := nullif(trim(coalesce(new.email, '')), '');
  new.city := nullif(trim(coalesce(new.city, '')), '');
  new.street := nullif(trim(coalesce(new.street, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  new.nip := nullif(trim(coalesce(new.nip, '')), '');

  return new;
end;
$$;

drop trigger if exists contractors_unique_company_name_guard on public.contractors;
create trigger contractors_unique_company_name_guard
before insert or update on public.contractors
for each row
execute function public.ensure_unique_contractor_company_name();

create or replace function public.prevent_job_duplicate_contractor_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_contractor public.contractors%rowtype;
begin
  new.client := trim(coalesce(new.client, ''));
  new.city := trim(coalesce(new.city, ''));
  new.street := trim(coalesce(new.street, ''));

  if new.client = '' then
    raise exception 'Podaj klienta.';
  end if;

  if new.contractor_id is null then
    select *
      into v_existing_contractor
    from public.contractors c
    where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(new.client)
    limit 1;

    if v_existing_contractor.id is not null then
      raise exception 'Klient % już istnieje w bazie kontrahentów. Wybierz go z bazy zamiast dodawać duplikat.', v_existing_contractor.company_name;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_prevent_duplicate_contractor_name_guard on public.jobs;
create trigger jobs_prevent_duplicate_contractor_name_guard
before insert or update on public.jobs
for each row
execute function public.prevent_job_duplicate_contractor_name();

create unique index if not exists contractors_company_name_unique_idx
  on public.contractors (public.normalize_contractors_text(company_name));
