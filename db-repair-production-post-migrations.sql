-- DB repair 7.20: pakiet naprawczy po migracjach produkcyjnych.
--
-- Cel:
-- - naprawić konflikt typu uuid/text i ON CONFLICT dla public.devices.source_job_id,
-- - dopuścić NULL w public.devices.contractor_id i ustawić FK na ON DELETE SET NULL,
-- - usunąć blokujący FK z public.photo_audit_log.job_id, zachowując historię audytu zdjęć.
--
-- Użycie:
-- 1. Uruchom ten plik w Supabase SQL Editor na środowisku produkcyjnym.
-- 2. Po wykonaniu odśwież aplikację.
-- 3. Przetestuj: edycję montażu z modelem/numerem seryjnym oraz usuwanie karty montażu.

begin;

-- 1) devices.source_job_id
-- Od wersji 7.83 wiele urządzeń z jednego montażu używa identyfikatorów tekstowych
-- typu id_montażu::device-2. Produkcyjna kolumna nie może więc zostać uuid.
-- Pełne odtworzenie funkcji/triggerów dla tego przypadku jest w:
-- devices-module-stage-7-source-job-id-text-production-hotfix.sql

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'devices'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'source_job_id'
  loop
    execute format('alter table public.devices drop constraint if exists %I', v_constraint.constraint_name);
  end loop;
end;
$$;

alter table public.devices
  drop constraint if exists devices_source_job_id_key;
drop index if exists public.devices_source_job_id_key;

alter table public.devices
  alter column source_job_id type text
  using source_job_id::text;

create unique index if not exists devices_source_job_id_key
  on public.devices (source_job_id);

-- 2) devices.contractor_id
-- contractor_id nie może już wymagać NOT NULL, bo urządzenie zsynchronizowane z montażu
-- może istnieć chwilowo bez przypisanego kontrahenta.
alter table public.devices
  alter column contractor_id drop not null;

alter table public.devices
  drop constraint if exists devices_contractor_id_fkey;

alter table public.devices
  add constraint devices_contractor_id_fkey
  foreign key (contractor_id)
  references public.contractors(id)
  on delete set null;

-- 3) photo_audit_log.job_id
-- Audit log zdjęć ma przechowywać historię także po usunięciu montażu,
-- więc nie może być blokowany przez FK do public.jobs.
alter table public.photo_audit_log
  drop constraint if exists photo_audit_log_job_id_fkey;

create index if not exists photo_audit_log_job_id_idx
  on public.photo_audit_log(job_id);

commit;
