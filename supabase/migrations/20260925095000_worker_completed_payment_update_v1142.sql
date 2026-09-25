-- WAWIS 11.42 — pracownik kończący zlecenie może zapisać wyłącznie pola płatności.
-- RLS dopuszcza UPDATE zakończonego wiersza tylko dla completed_by.
-- Trigger private.guard_job_fields() nadal odrzuca zmianę wszystkich pól poza payment_*.

begin;

drop policy if exists jobs_update_access on public.jobs;
create policy jobs_update_access
on public.jobs
for update
to authenticated
using (
  public.current_user_can_edit_job(id)
  or (
    public.current_user_is_staff()
    and status = 'Zakończone'
    and completed_by = (select auth.uid())
  )
)
with check (
  public.current_user_can_edit_job(id)
  or (
    public.current_user_is_staff()
    and status = 'Zakończone'
    and completed_by = (select auth.uid())
  )
);

commit;
