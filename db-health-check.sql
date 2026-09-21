-- Klima App — diagnostyka stanu produkcyjnej bazy po migracjach
-- Ten plik NIE wprowadza zmian. Służy tylko do odczytu i weryfikacji.


select 'devices.source_job_id type' as check_name,
       column_name,
       data_type,
       case when data_type = 'text' then 'OK' else 'CHECK' end as status
from information_schema.columns
where table_schema = 'public'
  and table_name = 'devices'
  and column_name = 'source_job_id';

select 'devices.source_job_id index' as check_name,
       indexname,
       indexdef,
       case
         when indexdef ilike '%create unique index%' and indexdef not ilike '%where source_job_id is not null%'
           then 'OK'
         else 'CHECK'
       end as status
from pg_indexes
where schemaname = 'public'
  and tablename = 'devices'
  and indexname = 'devices_source_job_id_key';

select 'devices.contractor_id nullability' as check_name,
       column_name,
       is_nullable,
       data_type,
       case when is_nullable = 'YES' then 'OK' else 'CHECK' end as status
from information_schema.columns
where table_schema = 'public'
  and table_name = 'devices'
  and column_name = 'contractor_id';

select 'devices.contractor_id foreign key' as check_name,
       conname,
       pg_get_constraintdef(oid) as constraint_def,
       case
         when pg_get_constraintdef(oid) ilike '%foreign key (contractor_id)%references public.contractors(id) on delete set null%'
           then 'OK'
         else 'CHECK'
       end as status
from pg_constraint
where conrelid = 'public.devices'::regclass
  and contype = 'f'
  and conname = 'devices_contractor_id_fkey';

select 'photo_audit_log.job_id foreign key removed' as check_name,
       case when exists (
         select 1
         from pg_constraint
         where conrelid = 'public.photo_audit_log'::regclass
           and conname = 'photo_audit_log_job_id_fkey'
       ) then 'CHECK' else 'OK' end as status,
       case when exists (
         select 1
         from pg_constraint
         where conrelid = 'public.photo_audit_log'::regclass
           and conname = 'photo_audit_log_job_id_fkey'
       ) then 'FK still exists' else 'No FK to jobs' end as details;

select 'photo_audit_log.job_id index' as check_name,
       indexname,
       indexdef,
       case when indexname = 'photo_audit_log_job_id_idx' then 'OK' else 'CHECK' end as status
from pg_indexes
where schemaname = 'public'
  and tablename = 'photo_audit_log'
  and indexname = 'photo_audit_log_job_id_idx';
