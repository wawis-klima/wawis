-- WAWIS 14.28 — dane prób szczelności dla zakończonych montaży (decyzja właściciela 06.11.2026).
-- Administrator przepisuje z podpisanych protokołów papierowych datę badania, temperaturę i wynik;
-- PDF protokołu (wzór firmowy) wypełnia się tymi danymi. Na razie montaże zakończone w aplikacji
-- (z wpisanym instalatorem). Nowa tabela + funkcje tylko dla administratora; bez zmian istniejących danych.
-- Można uruchomić ponownie.

create table if not exists public.leak_test_records (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  test_date date not null,
  temperature_c numeric(4,1) not null check (temperature_c between -30 and 50),
  result text not null check (result in ('pozytywny', 'negatywny')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.leak_test_records enable row level security;
revoke all on public.leak_test_records from public, anon, authenticated;
grant select, insert, update, delete on public.leak_test_records to service_role;

-- Lista: zakończone montaże z instalatorem + zapisane dane próby.
create or replace function public.leak_tests_list_v1428()
returns table(
  job_id uuid, client text, city text, street text, device_model text,
  completed_at timestamptz, completed_by uuid, completed_by_name text,
  test_date date, temperature_c numeric, result text, updated_at timestamptz
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
         r.test_date, r.temperature_c, r.result, r.updated_at
  from public.jobs j
  left join public.profiles p on p.id = j.completed_by
  left join public.leak_test_records r on r.job_id = j.id
  where j.status = 'Zakończone' and j.completed_by is not null
  order by j.completed_at desc nulls last, j.id;
end;
$$;

-- Dane jednej próby (PDF w karcie montażu).
create or replace function public.leak_test_get_v1428(p_job_id uuid)
returns table(test_date date, temperature_c numeric, result text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query select r.test_date, r.temperature_c, r.result from public.leak_test_records r where r.job_id = p_job_id;
end;
$$;

-- Zapis (upsert) — tylko zakończony montaż.
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
        updated_at = now(), updated_by = auth.uid();
  return true;
end;
$$;

revoke all on function public.leak_tests_list_v1428(), public.leak_test_get_v1428(uuid),
  public.leak_test_save_v1428(uuid, date, numeric, text) from public, anon;
grant execute on function public.leak_tests_list_v1428(), public.leak_test_get_v1428(uuid),
  public.leak_test_save_v1428(uuid, date, numeric, text) to authenticated, service_role;

notify pgrst, 'reload schema';
