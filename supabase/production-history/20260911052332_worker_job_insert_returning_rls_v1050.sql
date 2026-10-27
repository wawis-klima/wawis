drop policy if exists jobs_read_access on public.jobs;
create policy jobs_read_access
on public.jobs
for select
to authenticated
using (
  created_by = auth.uid()
  or main_technician_id = auth.uid()
  or public.current_user_can_access_job(id)
);