drop policy if exists "jobs_delete" on public.jobs;
create policy "jobs_delete"
on public.jobs
for delete
using (true);
