-- WAWIS 14.49 — codzienne czyszczenie dziennika przebiegów pg_cron (audyt 20.11.2026).
-- Zadania w tle (pushe co 3 min, temperatura co 5 min) dopisują ok. 10 tys. wierszy tygodniowo do
-- cron.job_run_details; 20.11.2026 tabela miała 41,7 tys. wierszy i nikt jej nie czyścił.
-- Usuwane są wyłącznie wpisy dziennika starsze niż 7 dni — żadnych danych WAWIS.
-- Uruchomione przez właściciela w SQL Editor 20.11.2026 (jobid 10); plik zapisuje ten stan w repozytorium.
-- Można uruchomić ponownie (nie tworzy drugiego zadania).

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'wawis-cron-history-cleanup-v1449') then
    perform cron.schedule(
      'wawis-cron-history-cleanup-v1449',
      '53 3 * * *',
      $cmd$delete from cron.job_run_details where end_time < now() - interval '7 days'$cmd$
    );
  end if;
end;
$$;
