-- WAWIS 14.33 — wzór podpisu pracownika i automatyczny podpis protokołów (decyzja właściciela 07.11.2026).
-- Pracownik składa wzór podpisu w aplikacji (Diagnostyka → „Wzór podpisu”). Protokoły z próby szczelności, w których
-- jest instalatorem (jobs.completed_by albo przypisany leak_test_records.installer_id), podpisują się same jego
-- najnowszym wzorem — bez osobnego zatwierdzania. Data podpisu = data badania (decyzja właściciela).
-- Wzór zapisany raz zostaje przy już podpisanych protokołach; nowy wzór trafia na protokoły podpisywane od teraz.
-- Zmiana danych próby lub instalatora usuwa podpis i od razu podpisuje ponownie (aktualny wzór, nowa data badania).
-- Wzory dalej w public.leak_test_signatures (14.29), bez dostępu bezpośredniego. Montaże (jobs) bez zmian.
-- Jednorazowo: podpisuje oczekujące protokoły pracowników, którzy mają już wzór, i ustawia datę podpisu = data badania.
-- Można uruchomić ponownie.

-- Wewnętrzna: podpis ze wzoru dla protokołów instalatora (wszystkich niepodpisanych albo jednego montażu).
create or replace function public.leak_test_autosign_v1433(p_profile_id uuid, p_job_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_signature uuid;
  v_count integer;
begin
  if p_profile_id is null then
    return 0;
  end if;
  select s.id into v_signature from public.leak_test_signatures s
  where s.profile_id = p_profile_id order by s.created_at desc, s.id desc limit 1;
  if v_signature is null then
    return 0;
  end if;
  update public.leak_test_records r
     set signature_id = v_signature,
         signed_at = (r.test_date + time '12:00') at time zone 'Europe/Warsaw'
    from public.jobs j
   where j.id = r.job_id and j.status = 'Zakończone'
     and r.signature_id is null and r.test_date is not null
     and coalesce(j.completed_by, r.installer_id) = p_profile_id
     and (p_job_id is null or r.job_id = p_job_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.leak_test_autosign_v1433(uuid, uuid) from public, anon, authenticated;

-- Pracownik: jego aktualny wzór podpisu (do podglądu w Diagnostyce).
create or replace function public.staff_signature_get_own_v1433()
returns table(image_png text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  return query
  select s.image_png, s.created_at from public.leak_test_signatures s
  where s.profile_id = auth.uid() order by s.created_at desc, s.id desc limit 1;
end;
$$;

-- Pracownik zapisuje SWÓJ wzór podpisu; jego niepodpisane protokoły podpisują się od razu. Zwraca liczbę podpisanych.
create or replace function public.staff_signature_save_own_v1433(p_image_png text)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null or not public.current_user_is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  insert into public.leak_test_signatures(profile_id, confirmed_name, image_png, created_by)
  values (v_uid, coalesce(nullif(btrim(v_name), ''), 'Pracownik'), p_image_png, v_uid);
  return public.leak_test_autosign_v1433(v_uid, null);
end;
$$;

create or replace function public.leak_test_save_v1432(p_job_id uuid, p_test_date date, p_temperature_c numeric, p_result text,
  p_installer_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_completed_by uuid;
  v_installer uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select j.completed_by into v_completed_by from public.jobs j where j.id = p_job_id and j.status = 'Zakończone';
  if not found then
    return false;
  end if;
  if v_completed_by is null then
    if p_installer_id is null then
      raise exception 'leak_installer_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_installer_id
                   and lower(btrim(coalesce(p.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')) then
      raise exception 'leak_installer_invalid' using errcode = '22023';
    end if;
    v_installer := p_installer_id;
  end if;
  insert into public.leak_test_records(job_id, test_date, temperature_c, result, installer_id, updated_at, updated_by)
  values (p_job_id, p_test_date, p_temperature_c, p_result, v_installer, now(), auth.uid())
  on conflict (job_id) do update
    set test_date = excluded.test_date, temperature_c = excluded.temperature_c, result = excluded.result,
        installer_id = excluded.installer_id,
        updated_at = now(), updated_by = auth.uid(),
        signature_id = case when (public.leak_test_records.test_date, public.leak_test_records.temperature_c,
                                  public.leak_test_records.result, public.leak_test_records.installer_id)
                                  is distinct from (excluded.test_date, excluded.temperature_c, excluded.result, excluded.installer_id)
                            then null else public.leak_test_records.signature_id end,
        signed_at = case when (public.leak_test_records.test_date, public.leak_test_records.temperature_c,
                               public.leak_test_records.result, public.leak_test_records.installer_id)
                               is distinct from (excluded.test_date, excluded.temperature_c, excluded.result, excluded.installer_id)
                         then null else public.leak_test_records.signed_at end;
  -- 14.33: podpis ze wzoru instalatora (z datą badania) — bez czekania na podpis w aplikacji.
  perform public.leak_test_autosign_v1433(coalesce(v_completed_by, v_installer), p_job_id);
  return true;
end;
$$;

create or replace function public.leak_test_save_v1428(p_job_id uuid, p_test_date date, p_temperature_c numeric, p_result text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_installer uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs j where j.id = p_job_id and j.status = 'Zakończone') then
    return false;
  end if;
  insert into public.leak_test_records(job_id, test_date, temperature_c, result, updated_at, updated_by)
  values (p_job_id, p_test_date, p_temperature_c, p_result, now(), auth.uid())
  on conflict (job_id) do update
    set test_date = excluded.test_date, temperature_c = excluded.temperature_c, result = excluded.result,
        updated_at = now(), updated_by = auth.uid(),
        signature_id = case when (public.leak_test_records.test_date, public.leak_test_records.temperature_c, public.leak_test_records.result)
                                  is distinct from (excluded.test_date, excluded.temperature_c, excluded.result)
                            then null else public.leak_test_records.signature_id end,
        signed_at = case when (public.leak_test_records.test_date, public.leak_test_records.temperature_c, public.leak_test_records.result)
                               is distinct from (excluded.test_date, excluded.temperature_c, excluded.result)
                         then null else public.leak_test_records.signed_at end;
  select coalesce(j.completed_by, r.installer_id) into v_installer
  from public.jobs j join public.leak_test_records r on r.job_id = j.id where j.id = p_job_id;
  perform public.leak_test_autosign_v1433(v_installer, p_job_id);
  return true;
end;
$$;

revoke all on function public.staff_signature_get_own_v1433(), public.staff_signature_save_own_v1433(text),
  public.leak_test_save_v1432(uuid, date, numeric, text, uuid), public.leak_test_save_v1428(uuid, date, numeric, text) from public, anon;
grant execute on function public.staff_signature_get_own_v1433(), public.staff_signature_save_own_v1433(text),
  public.leak_test_save_v1432(uuid, date, numeric, text, uuid), public.leak_test_save_v1428(uuid, date, numeric, text) to authenticated, service_role;

-- Jednorazowo (bezpieczne przy ponownym uruchomieniu): data podpisu = data badania przy już podpisanych,
-- podpis ze wzoru dla oczekujących protokołów pracowników, którzy mają wzór.
update public.leak_test_records r
   set signed_at = (r.test_date + time '12:00') at time zone 'Europe/Warsaw'
 where r.signature_id is not null and r.test_date is not null
   and r.signed_at is distinct from (r.test_date + time '12:00') at time zone 'Europe/Warsaw';
select public.leak_test_autosign_v1433(s.profile_id, null)
from (select distinct profile_id from public.leak_test_signatures) s;

notify pgrst, 'reload schema';
