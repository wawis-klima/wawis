-- Klima App — szczegółowa diagnostyka stanu produkcyjnej bazy po migracjach
-- Ten plik NIE wprowadza zmian. Pokazuje status oraz gotowe komendy naprawcze.

select 'devices.source_job_id type text' as check_name,
       case
         when exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'devices'
             and column_name = 'source_job_id'
             and data_type = 'text'
         ) then 'OK'
         else 'CHECK'
       end as status,
       case
         when exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'devices'
             and column_name = 'source_job_id'
             and data_type = 'text'
         ) then 'Kolumna source_job_id ma typ text i obsłuży id_montażu::device-N.'
         else 'Kolumna source_job_id nadal nie ma typu text. To może powodować błąd uuid/text przy zapisie montażu.'
       end as details,
       $$-- Uruchom pełny hotfix:
-- devices-module-stage-7-source-job-id-text-production-hotfix.sql$$ as suggested_fix;

select 'devices.source_job_id unique index compatibility' as check_name,
       case
         when exists (
           select 1
           from pg_indexes
           where schemaname = 'public'
             and tablename = 'devices'
             and indexname = 'devices_source_job_id_key'
             and indexdef ilike '%create unique index%'
             and indexdef not ilike '%where source_job_id is not null%'
         ) then 'OK'
         else 'CHECK'
       end as status,
       case
         when exists (
           select 1
           from pg_indexes
           where schemaname = 'public'
             and tablename = 'devices'
             and indexname = 'devices_source_job_id_key'
             and indexdef ilike '%create unique index%'
             and indexdef not ilike '%where source_job_id is not null%'
         ) then 'Index jest zgodny z ON CONFLICT (source_job_id).'
         else 'Brakuje zwyklego unique index albo nadal jest partial unique index.'
       end as details,
       $$drop index if exists public.devices_source_job_id_key;
create unique index if not exists devices_source_job_id_key
  on public.devices (source_job_id);$$ as suggested_fix;

select 'devices.contractor_id nullability' as check_name,
       case
         when exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'devices'
             and column_name = 'contractor_id'
             and is_nullable = 'YES'
         ) then 'OK'
         else 'CHECK'
       end as status,
       case
         when exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'devices'
             and column_name = 'contractor_id'
             and is_nullable = 'YES'
         ) then 'Kolumna contractor_id dopuszcza NULL.'
         else 'Kolumna contractor_id nadal ma NOT NULL i blokuje zapis czesci montaży.'
       end as details,
       $$alter table public.devices
  alter column contractor_id drop not null;$$ as suggested_fix;

select 'devices.contractor_id foreign key on delete set null' as check_name,
       case
         when exists (
           select 1
           from pg_constraint
           where conrelid = 'public.devices'::regclass
             and contype = 'f'
             and conname = 'devices_contractor_id_fkey'
             and pg_get_constraintdef(oid) ilike '%foreign key (contractor_id)%references public.contractors(id) on delete set null%'
         ) then 'OK'
         else 'CHECK'
       end as status,
       case
         when exists (
           select 1
           from pg_constraint
           where conrelid = 'public.devices'::regclass
             and contype = 'f'
             and conname = 'devices_contractor_id_fkey'
             and pg_get_constraintdef(oid) ilike '%foreign key (contractor_id)%references public.contractors(id) on delete set null%'
         ) then 'FK contractor_id ma poprawne ON DELETE SET NULL.'
         else 'FK contractor_id jest niepoprawny albo nie istnieje w oczekiwanej postaci.'
       end as details,
       $$alter table public.devices
  drop constraint if exists devices_contractor_id_fkey;

alter table public.devices
  add constraint devices_contractor_id_fkey
  foreign key (contractor_id)
  references public.contractors(id)
  on delete set null;$$ as suggested_fix;

select 'photo_audit_log.job_id foreign key removed' as check_name,
       case
         when exists (
           select 1
           from pg_constraint
           where conrelid = 'public.photo_audit_log'::regclass
             and conname = 'photo_audit_log_job_id_fkey'
         ) then 'CHECK'
         else 'OK'
       end as status,
       case
         when exists (
           select 1
           from pg_constraint
           where conrelid = 'public.photo_audit_log'::regclass
             and conname = 'photo_audit_log_job_id_fkey'
         ) then 'FK do jobs nadal istnieje i moze blokowac usuwanie kart montaży.'
         else 'FK do jobs zostal usuniety z tabeli auditowej.'
       end as details,
       $$alter table public.photo_audit_log
  drop constraint if exists photo_audit_log_job_id_fkey;$$ as suggested_fix;

select 'photo_audit_log.job_id index' as check_name,
       case
         when exists (
           select 1
           from pg_indexes
           where schemaname = 'public'
             and tablename = 'photo_audit_log'
             and indexname = 'photo_audit_log_job_id_idx'
         ) then 'OK'
         else 'CHECK'
       end as status,
       case
         when exists (
           select 1
           from pg_indexes
           where schemaname = 'public'
             and tablename = 'photo_audit_log'
             and indexname = 'photo_audit_log_job_id_idx'
         ) then 'Indeks job_id dla audit log istnieje.'
         else 'Brakuje indeksu job_id dla audit log.'
       end as details,
       $$create index if not exists photo_audit_log_job_id_idx
  on public.photo_audit_log(job_id);$$ as suggested_fix;
