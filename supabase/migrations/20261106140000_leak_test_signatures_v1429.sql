-- WAWIS 14.29 — podpisy instalatorów na protokołach z próby szczelności (decyzja właściciela 06.11.2026).
-- Instalator sam, na swoim telefonie, widzi listę swoich protokołów z uzupełnionymi danymi i podpisuje je palcem
-- (albo zapisanym wcześniej wzorem — jednym kliknięciem). Data podpisu = dzień złożenia. Wzór w bazie, nie w telefonie.
-- Zmiana danych próby po podpisie usuwa podpis z tego protokołu (podpisany dokument się zmienił).
-- Nowa tabela, dwie kolumny w leak_test_records (14.28); podpis składa wyłącznie sam instalator (własne protokoły).
-- Można uruchomić ponownie.

create table if not exists public.leak_test_signatures (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  confirmed_name text not null check (length(btrim(confirmed_name)) between 3 and 120),
  image_png text not null check (image_png like 'data:image/png;base64,%' and length(image_png) between 200 and 400000),
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.leak_test_signatures enable row level security;
revoke all on public.leak_test_signatures from public, anon, authenticated;
grant select, insert, update, delete on public.leak_test_signatures to service_role;

alter table public.leak_test_records
  add column if not exists signature_id uuid references public.leak_test_signatures(id),
  add column if not exists signed_at timestamptz;

-- Typy wyników się zmieniają — funkcje 14.28 tworzone od nowa.
drop function if exists public.leak_tests_list_v1428();
drop function if exists public.leak_test_get_v1428(uuid);

create function public.leak_tests_list_v1428()
returns table(
  job_id uuid, client text, city text, street text, device_model text,
  completed_at timestamptz, completed_by uuid, completed_by_name text,
  test_date date, temperature_c numeric, result text, updated_at timestamptz, signed_at timestamptz
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
         r.test_date, r.temperature_c, r.result, r.updated_at, r.signed_at
  from public.jobs j
  left join public.profiles p on p.id = j.completed_by
  left join public.leak_test_records r on r.job_id = j.id
  where j.status = 'Zakończone' and j.completed_by is not null
  order by j.completed_at desc nulls last, j.id;
end;
$$;

create function public.leak_test_get_v1428(p_job_id uuid)
returns table(test_date date, temperature_c numeric, result text, signed_at timestamptz, signature_png text, signed_name text)
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
  select r.test_date, r.temperature_c, r.result, r.signed_at, s.image_png, s.confirmed_name
  from public.leak_test_records r
  left join public.leak_test_signatures s on s.id = r.signature_id
  where r.job_id = p_job_id;
end;
$$;

-- Zapis danych próby: zmiana daty, temperatury lub wyniku usuwa podpis z tego protokołu.
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

-- Instalator na swoim telefonie: lista jego protokołów do podpisu (uzupełnione dane, bez podpisu).
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
  where j.completed_by = auth.uid() and j.status = 'Zakończone' and r.signature_id is null
  order by r.test_date, j.id;
end;
$$;

-- Instalator podpisuje SWOJE protokoły z listy: nowym podpisem (p_image_png) albo zapisanym wzorem (null).
-- p_job_ids = dokładnie te protokoły, które widział na liście — podpis nie trafia na nic, czego nie zatwierdził.
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
  where r.job_id = any(p_job_ids) and j.completed_by = v_uid and j.status = 'Zakończone' and r.signature_id is null;
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
     and j.completed_by = v_uid and j.status = 'Zakończone' and r.signature_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.leak_tests_list_v1428(), public.leak_test_get_v1428(uuid),
  public.leak_test_save_v1428(uuid, date, numeric, text), public.leak_test_pending_own_v1429(),
  public.leak_test_sign_own_v1429(uuid[], text) from public, anon;
grant execute on function public.leak_tests_list_v1428(), public.leak_test_get_v1428(uuid),
  public.leak_test_save_v1428(uuid, date, numeric, text), public.leak_test_pending_own_v1429(),
  public.leak_test_sign_own_v1429(uuid[], text) to authenticated, service_role;

notify pgrst, 'reload schema';
