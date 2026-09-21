-- WAWIS 10.61 — pracownik może dodać komentarz do każdego widocznego montażu.
-- Pozostałe uprawnienia do cudzego zlecenia pozostają tylko do odczytu.

begin;

drop policy if exists comments_insert_job on public.comments;
create policy comments_insert_job
on public.comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.current_user_can_view_job(job_id)
  and exists (
    select 1
    from public.jobs j
    where j.id = comments.job_id
      and (
        public.current_user_is_admin()
        or j.status is distinct from 'Zakończone'::text
      )
  )
);

commit;
