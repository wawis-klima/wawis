-- WAWIS 14.34 — protokół z próby szczelności tworzy się sam przy zakończeniu montażu (decyzja właściciela 07.11.2026).
-- Gdy montaż przechodzi w „Zakończone” (dowolną drogą: telefon, komputer, kolejka offline) i ma instalatora
-- (jobs.completed_by): wpis próby z datą badania = dzień zakończenia (czas polski), wynikiem „pozytywny” i od razu
-- podpisem ze wzoru instalatora (14.33). Temperatura (średnia dnia dla miejscowości) dociągana przez aplikację w tle
-- (baza nie pobiera danych z internetu) — do tego czasu NULL. Administrator może wszystko poprawić w „Próbach szczelności”.
-- Bezpieczeństwo: błąd przy zakładaniu protokołu NIGDY nie blokuje zakończenia montażu (wyjątek przechwycony).
-- Istniejące wpisy bez zmian (on conflict do nothing). Montaże (jobs) bez zmian. Można uruchomić ponownie.

alter table public.leak_test_records alter column temperature_c drop not null;

create or replace function public.leak_test_on_job_completed_v1434()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status = 'Zakończone' and new.completed_by is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'Zakończone') then
    begin
      insert into public.leak_test_records(job_id, test_date, temperature_c, result, updated_at, updated_by)
      values (new.id,
              coalesce((new.completed_at at time zone 'Europe/Warsaw')::date, (now() at time zone 'Europe/Warsaw')::date),
              null, 'pozytywny', now(), null)
      on conflict (job_id) do nothing;
      perform public.leak_test_autosign_v1433(new.completed_by, new.id);
    exception when others then
      raise warning 'WAWIS 14.34: nie udało się założyć protokołu szczelności dla montażu % (%): %', new.id, sqlstate, sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.leak_test_on_job_completed_v1434() from public, anon, authenticated;

drop trigger if exists trg_jobs_leak_test_auto_v1434 on public.jobs;
create trigger trg_jobs_leak_test_auto_v1434
  after insert or update of status on public.jobs
  for each row execute function public.leak_test_on_job_completed_v1434();

-- Temperatura dociągana w tle: tylko gdy jeszcze jej brak; administrator albo instalator protokołu. Podpis zostaje.
create or replace function public.leak_test_set_temperature_v1434(p_job_id uuid, p_temperature_c numeric)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_temperature_c is null or p_temperature_c < -30 or p_temperature_c > 50 then
    raise exception 'leak_temperature_invalid' using errcode = '22023';
  end if;
  update public.leak_test_records r
     set temperature_c = round(p_temperature_c, 1), updated_at = now()
    from public.jobs j
   where j.id = r.job_id and r.job_id = p_job_id and r.temperature_c is null
     and (public.current_user_is_admin() or coalesce(j.completed_by, r.installer_id) = auth.uid());
  return found;
end;
$$;
revoke all on function public.leak_test_set_temperature_v1434(uuid, numeric) from public, anon;
grant execute on function public.leak_test_set_temperature_v1434(uuid, numeric) to authenticated, service_role;

-- Jednorazowo: zakończone montaże z instalatorem bez wpisu (np. zakończone przed uruchomieniem migracji).
insert into public.leak_test_records(job_id, test_date, temperature_c, result, updated_at, updated_by)
select j.id, coalesce((j.completed_at at time zone 'Europe/Warsaw')::date, j.installation_date, (now() at time zone 'Europe/Warsaw')::date),
       null, 'pozytywny', now(), null
from public.jobs j
where j.status = 'Zakończone' and j.completed_by is not null
  and not exists (select 1 from public.leak_test_records r where r.job_id = j.id)
on conflict (job_id) do nothing;
select public.leak_test_autosign_v1433(s.profile_id, null) from (select distinct profile_id from public.leak_test_signatures) s;

notify pgrst, 'reload schema';
