-- WAWIS 14.32 — instalator przypisany do starych montaży w próbach szczelności (decyzja właściciela 07.11.2026).
-- 85 zakończonych montaży z kwietnia–sierpnia 2026 nie ma zapisanego instalatora (jobs.completed_by — aplikacja
-- zapisuje go od 10.08.2026). Administrator przypisuje instalatora w zakładce „Próby szczelności”; przypisanie
-- trafia WYŁĄCZNIE do leak_test_records.installer_id — montaż (jobs) pozostaje bez zmian.
-- Instalator protokołu = jobs.completed_by, a gdy go brak — leak_test_records.installer_id. Tylko ten instalator
-- widzi protokół do podpisu i może go podpisać. Zmiana instalatora po podpisie usuwa podpis (jak zmiana danych).
-- Nowa kolumna, funkcje 14.28/14.29 odtworzone. Bez usuwania danych. Można uruchomić ponownie.

alter table public.leak_test_records
  add column if not exists installer_id uuid references public.profiles(id) on delete set null;

-- Typy wyników się zmieniają — funkcje odczytu tworzone od nowa.
drop function if exists public.leak_tests_list_v1428();
drop function if exists public.leak_test_get_v1428(uuid);

-- Lista administratora: WSZYSTKIE zakończone montaże. installer_* = instalator protokołu (z aplikacji albo przypisany).
create function public.leak_tests_list_v1428()
returns table(
  job_id uuid, client text, city text, street text, device_model text,
  completed_at timestamptz, completed_by uuid, completed_by_name text,
  test_date date, temperature_c numeric, result text, updated_at timestamptz, signed_at timestamptz,
  installation_date date, installer_id uuid, installer_name text, installer_from_app boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
  select j.id, j.client, j.city, j.street, j.device_model,
         j.completed_at, j.completed_by, p.full_name,
         r.test_date, r.temperature_c, r.result, r.updated_at, r.signed_at,
         j.installation_date,
         coalesce(j.completed_by, r.installer_id),
         coalesce(p.full_name, ip.full_name),
         j.completed_by is not null
  from public.jobs j
  left join public.profiles p on p.id = j.completed_by
  left join public.leak_test_records r on r.job_id = j.id
  left join public.profiles ip on ip.id = r.installer_id
  where j.status = 'Zakończone'
  order by coalesce(j.completed_at, j.installation_date::timestamptz) desc nulls last, j.id;
end;
$$;

create function public.leak_test_get_v1428(p_job_id uuid)
returns table(test_date date, temperature_c numeric, result text, signed_at timestamptz, signature_png text, signed_name text,
  installer_id uuid, installer_name text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
  select r.test_date, r.temperature_c, r.result, r.signed_at, s.image_png, s.confirmed_name,
         coalesce(j.completed_by, r.installer_id), coalesce(p.full_name, ip.full_name)
  from public.leak_test_records r
  join public.jobs j on j.id = r.job_id
  left join public.leak_test_signatures s on s.id = r.signature_id
  left join public.profiles p on p.id = j.completed_by
  left join public.profiles ip on ip.id = r.installer_id
  where r.job_id = p_job_id;
end;
$$;

-- Lista instalatorów do wyboru (pracownicy i administratorzy).
create or replace function public.leak_test_installers_v1432()
returns table(id uuid, full_name text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name from public.profiles p
  where lower(btrim(coalesce(p.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')
    and nullif(btrim(p.full_name), '') is not null
  order by p.full_name, p.id;
end;
$$;

-- Zapis danych próby z instalatorem. Montaż z instalatorem z aplikacji: p_installer_id ignorowany.
-- Montaż bez instalatora: instalator wymagany (inaczej nikt nie podpisze). Zmiana danych lub instalatora usuwa podpis.
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
  return true;
end;
$$;

-- 14.28 (starsze aplikacje): bez zmiany instalatora przypisanego w 14.32.
create or replace function public.leak_test_save_v1428(p_job_id uuid, p_test_date date, p_temperature_c numeric, p_result text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
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
  return true;
end;
$$;

-- Instalator na swoim telefonie: także protokoły, do których administrator go przypisał.
create or replace function public.leak_test_pending_own_v1429()
returns table(job_id uuid, client text, city text, street text, test_date date, temperature_c numeric, result text, has_saved_signature boolean)
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
  select j.id, j.client, j.city, j.street, r.test_date, r.temperature_c, r.result,
         exists (select 1 from public.leak_test_signatures s where s.profile_id = auth.uid())
  from public.leak_test_records r
  join public.jobs j on j.id = r.job_id
  where coalesce(j.completed_by, r.installer_id) = auth.uid() and j.status = 'Zakończone' and r.signature_id is null
  order by r.test_date, j.id;
end;
$$;

create or replace function public.leak_test_sign_own_v1429(p_job_ids uuid[], p_image_png text default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_signature uuid;
  v_count integer;
begin
  if v_uid is null or not public.current_user_is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if coalesce(array_length(p_job_ids, 1), 0) = 0 then
    return 0;
  end if;
  select count(*) into v_count
  from public.leak_test_records r
  join public.jobs j on j.id = r.job_id
  where r.job_id = any(p_job_ids) and coalesce(j.completed_by, r.installer_id) = v_uid
    and j.status = 'Zakończone' and r.signature_id is null;
  if v_count = 0 then
    return 0;  -- nic własnego do podpisu: bez zapisywania wzoru
  end if;
  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  if p_image_png is not null then
    insert into public.leak_test_signatures(profile_id, confirmed_name, image_png, created_by)
    values (v_uid, coalesce(nullif(btrim(v_name), ''), 'Instalator'), p_image_png, v_uid)
    returning id into v_signature;
  else
    select s.id into v_signature from public.leak_test_signatures s
    where s.profile_id = v_uid order by s.created_at desc limit 1;
    if v_signature is null then
      raise exception 'leak_sign_no_saved_signature' using errcode = '22023';
    end if;
  end if;
  update public.leak_test_records r
     set signature_id = v_signature, signed_at = now()
    from public.jobs j
   where j.id = r.job_id and r.job_id = any(p_job_ids)
     and coalesce(j.completed_by, r.installer_id) = v_uid and j.status = 'Zakończone' and r.signature_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.leak_tests_list_v1428(), public.leak_test_get_v1428(uuid), public.leak_test_installers_v1432(),
  public.leak_test_save_v1432(uuid, date, numeric, text, uuid), public.leak_test_save_v1428(uuid, date, numeric, text),
  public.leak_test_pending_own_v1429(), public.leak_test_sign_own_v1429(uuid[], text) from public, anon;
grant execute on function public.leak_tests_list_v1428(), public.leak_test_get_v1428(uuid), public.leak_test_installers_v1432(),
  public.leak_test_save_v1432(uuid, date, numeric, text, uuid), public.leak_test_save_v1428(uuid, date, numeric, text),
  public.leak_test_pending_own_v1429(), public.leak_test_sign_own_v1429(uuid[], text) to authenticated, service_role;

notify pgrst, 'reload schema';
