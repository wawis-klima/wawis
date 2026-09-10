create extension if not exists pgcrypto;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Administrator'
  );
$$;

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  city text,
  street text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.contractors enable row level security;

create or replace function public.touch_contractors_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists contractors_set_updated_at on public.contractors;
create trigger contractors_set_updated_at
before update on public.contractors
for each row
execute function public.touch_contractors_updated_at();

drop policy if exists "contractors_admin_select" on public.contractors;
create policy "contractors_admin_select"
on public.contractors
for select
using (public.current_user_is_admin());

drop policy if exists "contractors_admin_insert" on public.contractors;
create policy "contractors_admin_insert"
on public.contractors
for insert
with check (public.current_user_is_admin());

drop policy if exists "contractors_admin_update" on public.contractors;
create policy "contractors_admin_update"
on public.contractors
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "contractors_admin_delete" on public.contractors;
create policy "contractors_admin_delete"
on public.contractors
for delete
using (public.current_user_is_admin());

create or replace function public.admin_list_contractors()
returns setof public.contractors
language sql
security definer
set search_path = public
as $$
  select *
  from public.contractors
  where public.current_user_is_admin()
  order by lower(company_name), created_at desc;
$$;

create or replace function public.admin_upsert_contractor(
  p_id uuid default null,
  p_company_name text default null,
  p_contact_person text default null,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_street text default null,
  p_notes text default null,
  p_is_active boolean default true
)
returns public.contractors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.contractors;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać kontrahentów.';
  end if;

  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Nazwa kontrahenta jest wymagana.';
  end if;

  if p_id is null then
    insert into public.contractors (
      company_name,
      contact_person,
      phone,
      email,
      city,
      street,
      notes,
      is_active
    ) values (
      trim(p_company_name),
      nullif(trim(coalesce(p_contact_person, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_street, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.contractors
    set company_name = trim(p_company_name),
        contact_person = nullif(trim(coalesce(p_contact_person, '')), ''),
        phone = nullif(trim(coalesce(p_phone, '')), ''),
        email = nullif(trim(coalesce(p_email, '')), ''),
        city = nullif(trim(coalesce(p_city, '')), ''),
        street = nullif(trim(coalesce(p_street, '')), ''),
        notes = nullif(trim(coalesce(p_notes, '')), ''),
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

create or replace function public.admin_delete_contractor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usuwać kontrahentów.';
  end if;

  delete from public.contractors where id = p_id;
end;
$$;

grant select, insert, update, delete on public.contractors to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.admin_list_contractors() to authenticated;
grant execute on function public.admin_upsert_contractor(uuid, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_contractor(uuid) to authenticated;
