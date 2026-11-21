-- WAWIS 14.74 — kod z telefonu (MFA), etap 2: baza wymaga sesji potwierdzonej kodem (aal2) od każdego konta,
-- które ma włączony kod (zweryfikowany składnik TOTP). Konta bez kodu (dziś: wszyscy pracownicy) — bez zmian.
-- Zgoda właściciela: 21.11.2026 20:38 („Zgoda etap”). Wycofanie: docs/mfa-etap2-rollback-v1474.sql.
--
-- 1) public.current_user_mfa_ok() — prawda, gdy: brak użytkownika (service_role, cron), sesja aal2 albo konto bez kodu.
-- 2) current_user_is_admin() / current_user_is_staff() — dodatkowo wymagają current_user_mfa_ok(); z nich korzysta
--    68 funkcji SECURITY DEFINER i większość reguł RLS (także current_user_can_*_job).
-- 3) Dwie funkcje z własnym sprawdzaniem roli (save_job_contractor_nip, worker_create_or_get_contractor_for_job).
-- 4) Reguła RESTRICTIVE mfa_aal2_required_v1474 na każdej tabeli public z RLS i na storage.objects.

create or replace function public.current_user_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
    or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;
revoke all on function public.current_user_mfa_ok() from public;
grant execute on function public.current_user_mfa_ok() to anon, authenticated, service_role;
comment on function public.current_user_mfa_ok() is 'WAWIS 14.74: konto z włączonym kodem z telefonu musi mieć sesję aal2.';

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false)
  and public.current_user_mfa_ok();
$function$;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')
    ),
    false
  )
  and public.current_user_mfa_ok();
$function$;

create or replace function public.save_job_contractor_nip(p_contractor_id uuid, p_nip text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_role text;
  v_current text;
  v_next text := nullif(regexp_replace(coalesce(p_nip, ''), '[^0-9]', '', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Brak aktywnej sesji.';
  end if;

  -- 14.74: konto z włączonym kodem z telefonu — tylko po potwierdzeniu kodem.
  if not public.current_user_mfa_ok() then
    raise exception 'Potwierdź logowanie kodem z telefonu.' using errcode = '42501';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_role, '') not in ('Pracownik', 'Administrator', 'admin') then
    raise exception 'Brak uprawnień do zapisu NIP klienta.';
  end if;

  if p_contractor_id is null then
    raise exception 'Brak identyfikatora klienta.';
  end if;

  select nullif(regexp_replace(coalesce(c.nip, ''), '[^0-9]', '', 'g'), '')
  into v_current
  from public.contractors c
  where c.id = p_contractor_id
  for update;

  if not found then
    raise exception 'Nie znaleziono klienta.';
  end if;

  if v_role = 'Pracownik' then
    if not exists (
      select 1
      from public.jobs j
      where j.contractor_id = p_contractor_id
    ) then
      raise exception 'Pracownik może uzupełnić NIP tylko klienta powiązanego z montażem.';
    end if;

    if v_next is null then
      return v_current;
    end if;

    if v_current is not null and v_current <> v_next then
      raise exception 'NIP klienta jest już zapisany inaczej. Zmianę może wykonać administrator.';
    end if;
  end if;

  update public.contractors
  set nip = v_next,
      updated_at = timezone('utc', now())
  where id = p_contractor_id
  returning nullif(regexp_replace(coalesce(nip, ''), '[^0-9]', '', 'g'), '')
  into v_current;

  return v_current;
end;
$function$;

create or replace function public.worker_create_or_get_contractor_for_job(p_company_name text, p_phone text default null::text, p_email text default null::text, p_city text default null::text, p_street text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  select role into v_role from public.profiles where id = auth.uid();
  if auth.uid() is null or coalesce(v_role, '') not in ('Pracownik', 'Administrator', 'admin') then raise exception 'Brak uprawnień do dodania klienta.'; end if;
  -- 14.74: konto z włączonym kodem z telefonu — tylko po potwierdzeniu kodem.
  if not public.current_user_mfa_ok() then raise exception 'Potwierdź logowanie kodem z telefonu.' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Podaj klienta.'; end if;

  if public.normalize_contractors_phone(v_phone) is not null then
    select c.id into v_id from public.contractors c where public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone) limit 1;
  end if;
  if v_id is null and public.normalize_contractors_email(v_email) is not null then
    select c.id into v_id from public.contractors c where public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email) limit 1;
  end if;
  if v_id is null then
    select c.id into v_id from public.contractors c where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name) limit 1;
  end if;

  if v_id is null then
    v_addresses := public.normalize_contractor_addresses(null, v_city, v_street);
    insert into public.contractors (company_name, contact_person, phone, email, city, street, addresses, notes, is_active)
    values (v_name, null, v_phone, v_email, v_city, v_street, v_addresses, 'Utworzono przez pracownika z mobilnego formularza nowego klienta.', true)
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'company_name', v_name, 'phone', v_phone, 'email', v_email, 'city', v_city, 'street', v_street);
exception
  when unique_violation then
    select c.id into v_id
    from public.contractors c
    where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name)
       or (public.normalize_contractors_phone(v_phone) is not null and public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone))
       or (public.normalize_contractors_email(v_email) is not null and public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email))
    order by c.created_at asc
    limit 1;
    if v_id is null then raise; end if;
    return jsonb_build_object('id', v_id, 'company_name', v_name, 'phone', v_phone, 'email', v_email, 'city', v_city, 'street', v_street);
end;
$function$;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists mfa_aal2_required_v1474 on public.%I', t.relname);
    execute format(
      'create policy mfa_aal2_required_v1474 on public.%I as restrictive for all to authenticated '
      'using ((select public.current_user_mfa_ok())) with check ((select public.current_user_mfa_ok()))',
      t.relname
    );
  end loop;
end
$$;

drop policy if exists mfa_aal2_required_v1474 on storage.objects;
create policy mfa_aal2_required_v1474 on storage.objects as restrictive for all to authenticated
  using ((select public.current_user_mfa_ok())) with check ((select public.current_user_mfa_ok()));
