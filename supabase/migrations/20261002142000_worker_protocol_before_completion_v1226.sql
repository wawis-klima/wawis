begin;

-- 12.26: pracownik przygotowuje i podpisuje protokół przed zakończeniem montażu.
-- Administrator zachowuje możliwość ręcznego zakończenia bez protokołu.

create or replace function public.current_user_can_write_job_protocol(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_is_staff()
    and p_job_id is not null
    and exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and lower(trim(coalesce(j.status, ''))) in ('w trakcie', 'zakończone')
        and (
          public.current_user_is_admin()
          or lower(trim(coalesce(j.status, ''))) = 'w trakcie'
          or public.current_user_can_finalize_job(p_job_id)
        )
    ),
    false
  );
$$;

revoke all on function public.current_user_can_write_job_protocol(uuid) from public, anon;
grant execute on function public.current_user_can_write_job_protocol(uuid) to authenticated;

-- Zachowujemy dotychczasowe nazwy policy, żeby nie rozbijać istniejących testów
-- i rebuildów, ale rozszerzamy je o zapis protokołu dla statusu W trakcie.
drop policy if exists job_protocols_insert_completed_job on public.job_protocols;
create policy job_protocols_insert_completed_job on public.job_protocols
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.current_user_can_write_job_protocol(job_id)
);

drop policy if exists job_protocols_update_owner_or_admin on public.job_protocols;
create policy job_protocols_update_owner_or_admin on public.job_protocols
for update to authenticated
using (
  public.current_user_can_write_job_protocol(job_id)
  and (
    public.current_user_is_admin()
    or created_by = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and public.current_user_can_write_job_protocol(job_id)
);

drop policy if exists job_protocols_storage_insert_completed_job on storage.objects;
create policy job_protocols_storage_insert_completed_job on storage.objects
for insert to authenticated
with check (
  bucket_id = 'job-protocols'
  and public.current_user_can_write_job_protocol(public.storage_object_job_id(name))
);

create or replace function private.guard_job_completion_nameplates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'Zakończone' and (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.device_model is distinct from new.device_model
    or old.device_serial_number is distinct from new.device_serial_number
  ) then
    if coalesce(auth.role(), '') <> 'service_role' then
      -- Tylko pracownik ma obowiązek przygotować i podpisać protokół przed
      -- przejściem W trakcie -> Zakończone. Administrator zachowuje override.
      if not public.current_user_is_admin()
         and (tg_op = 'INSERT' or old.status is distinct from new.status)
         and not exists (
           select 1
           from public.job_protocols p
           where p.job_id = new.id
             and p.signed_at is not null
             and coalesce(p.file_size_bytes, 0) > 0
             and nullif(pg_catalog.btrim(coalesce(p.storage_path, '')), '') is not null
             and exists (
               select 1
               from storage.objects o
               where o.bucket_id = 'job-protocols'
                 and o.name = p.storage_path
             )
         ) then
        raise exception 'job_protocol_required: zapisz podpisany protokół przed zakończeniem zlecenia'
          using errcode = '23514';
      end if;

      perform private.assert_job_nameplates_complete(new.id, new.device_model, new.device_serial_number);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_job_completion_nameplates() from public, anon, authenticated;

commit;
