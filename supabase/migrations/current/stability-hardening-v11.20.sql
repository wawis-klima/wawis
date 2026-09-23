-- WAWIS 11.20 — stabilizacja diagnostyki/PUSH oraz porządek RLS, grantów i indeksów.
-- Zmiana nie rozszerza uprawnień pracownika. Administrator otrzymuje tylko odczyt
-- rekordów push_subscriptions potrzebny do technicznego statusu zespołu.

alter policy push_subscriptions_select_own on public.push_subscriptions
  using (((select auth.uid()) = user_id) or (select public.current_user_is_admin()));

alter policy push_subscriptions_insert_own on public.push_subscriptions
  with check ((select auth.uid()) = user_id);

alter policy push_subscriptions_update_own on public.push_subscriptions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy push_delivery_log_select_own on public.push_delivery_log
  using ((select auth.uid()) = user_id);

alter policy photo_audit_log_service_insert on public.photo_audit_log
  with check ((select auth.uid()) is not null);

alter policy comments_insert_job on public.comments
  with check (
    (author_id = (select auth.uid()))
    and public.current_user_can_view_job(job_id)
    and exists (
      select 1 from public.jobs j
      where j.id = comments.job_id
        and ((select public.current_user_is_admin()) or j.status is distinct from 'Zakończone')
    )
  );

alter policy jobs_create_own on public.jobs
  with check (
    (select public.current_user_is_staff())
    and ((created_by = (select auth.uid())) or (select public.current_user_is_admin()))
  );

alter policy job_protocols_insert_completed_job on public.job_protocols
  with check (
    (created_by = (select auth.uid()))
    and public.current_user_can_finalize_job(job_id)
  );

alter policy job_protocols_update_owner_or_admin on public.job_protocols
  using (
    public.current_user_can_access_job(job_id)
    and ((select public.current_user_is_admin()) or (created_by = (select auth.uid())))
  )
  with check (
    (created_by = (select auth.uid()))
    and public.current_user_can_finalize_job(job_id)
  );

alter policy profiles_update_self_or_admin on public.profiles
  using ((id = (select auth.uid())) or (select public.current_user_is_admin()))
  with check ((id = (select auth.uid())) or (select public.current_user_is_admin()));

alter policy photos_insert_job on public.photos
  with check (
    public.current_user_can_access_job(job_id)
    and ((uploaded_by = (select auth.uid())) or (select public.current_user_is_admin()))
    and exists (
      select 1 from public.jobs j
      where j.id = photos.job_id
        and ((select public.current_user_is_admin()) or j.status is distinct from 'Zakończone')
    )
  );

alter policy notifications_read_own on public.notifications
  using (user_id = (select auth.uid()));

alter policy notifications_update_own on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Zostawiamy po jednym indeksie o tej samej definicji.
drop index if exists public.idx_devices_contractor_id;
drop index if exists public.idx_devices_installation_date;
drop index if exists public.idx_jobs_contractor_id;

-- Funkcje wywoływane wyłącznie przez triggery nie powinny być RPC aplikacji.
revoke execute on function public.reject_zero_byte_photo_storage() from public, anon, authenticated;
revoke execute on function private.guard_completed_job_nameplates_after_photo_mutation() from public, anon, authenticated;
revoke execute on function private.lock_job_for_photo_mutation() from public, anon, authenticated;
