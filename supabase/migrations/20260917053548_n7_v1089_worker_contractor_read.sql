-- WAWIS 10.89 / N7 correction
-- Employees must be able to read contractor data. Write operations remain administrator-only.

drop policy if exists contractors_admin_select on public.contractors;
drop policy if exists contractors_staff_select on public.contractors;

create policy contractors_staff_select
on public.contractors
as permissive
for select
to authenticated
using (public.current_user_is_staff());
