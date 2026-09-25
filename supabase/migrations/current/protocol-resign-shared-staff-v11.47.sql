-- WAWIS 11.47 — ponowne podpisanie protokołu przez dowolnego pracownika zespołu.
-- UI pozwala pracownikom otwierać wszystkie zakończone montaże, więc RLS protokołu
-- musi być spójny z tym przepływem. Nadal wymagamy statusu Zakończone.

begin;

create or replace function public.current_user_can_finalize_job(p_job_id uuid)
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
        and j.status = 'Zakończone'
    ),
    false
  );
$$;

revoke all on function public.current_user_can_finalize_job(uuid) from public, anon;
grant execute on function public.current_user_can_finalize_job(uuid) to authenticated, service_role;

grant select, insert, update on table public.job_protocols to authenticated, service_role;

drop policy if exists job_protocols_update_owner_or_admin on public.job_protocols;
create policy job_protocols_update_owner_or_admin
on public.job_protocols
for update
to authenticated
using (
  public.current_user_can_finalize_job(job_id)
)
with check (
  created_by = (select auth.uid())
  and public.current_user_can_finalize_job(job_id)
);

-- Polityki INSERT tabeli i Storage już korzystają z current_user_can_finalize_job(),
-- więc po tej zmianie automatycznie pozwalają pracownikowi zespołu ponownie
-- zapisać protokół zakończonego montażu, niezależnie od tego kto go zakończył.

commit;
