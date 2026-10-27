-- Re-submitted after addressing automatic review concerns: complete migration, role/write/storage/SMS/restore SQL assertions and emergency rollback all PASSED on a local PostgreSQL schema clone (21 production tables, constraints, indexes, policies, grants, functions, triggers; no customer data). Eight Node regressions and desktop/mobile module browser tests PASSED; application build PASSED. Reviewable artifacts: audit/test-migration-v1027.mjs, audit/v1027-db-assertions.sql, audit/v1027-emergency-rollback.sql, audit/WDROZENIE-v10.27.md. This transaction changes schema/permissions only, does not delete existing customer records, preserves recovery data on rollback, provisions no new service. User explicitly requested these fixes and deployment and reiterated 'pracuj dalej'.
-- v10.27: security, transactional writes, recoverable deletion, SMS delivery claims.
-- No additional project, bucket, scheduled backup or paid service.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
drop policy if exists "Users can see jobs" on public.jobs;
drop policy if exists "Admins can insert jobs" on public.jobs;
drop policy if exists "Admins can update jobs" on public.jobs;
drop policy if exists "jobs_select" on public.jobs;
drop policy if exists "jobs_insert" on public.jobs;
drop policy if exists "jobs_update" on public.jobs;
drop policy if exists "jobs_delete" on public.jobs;
drop policy if exists "jobs_admin_update_sms_columns" on public.jobs;
alter table public.jobs enable row level security;
drop policy if exists "Access read" on public.job_access;
drop policy if exists "Access insert" on public.job_access;
drop policy if exists "Access delete" on public.job_access;
drop policy if exists "job_access_select" on public.job_access;
drop policy if exists "job_access_insert" on public.job_access;
drop policy if exists "job_access_delete" on public.job_access;
alter table public.job_access enable row level security;
drop policy if exists "Comments read" on public.comments;
drop policy if exists "Comments insert" on public.comments;
drop policy if exists "comments_select" on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_delete_admin" on public.comments;
alter table public.comments enable row level security;
drop policy if exists "Photos read" on public.photos;
drop policy if exists "Photos insert" on public.photos;
drop policy if exists "photos_select" on public.photos;
drop policy if exists "photos_insert" on public.photos;
drop policy if exists "allow_authenticated_delete_photos" on public.photos;
drop policy if exists "photos_select_accessible_job" on public.photos;
drop policy if exists "photos_insert_accessible_job" on public.photos;
drop policy if exists "photos_update_admin_or_owner" on public.photos;
drop policy if exists "photos_delete_admin_or_owner" on public.photos;
alter table public.photos enable row level security;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
alter table public.profiles enable row level security;
drop policy if exists "notifications_select" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
alter table public.notifications enable row level security;

-- Anonymous clients have no business-data privileges.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='touch_push_subscriptions_updated_at' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='calculate_service_due_date' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='set_job_service_due_date' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='touch_contractors_updated_at' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='photo_audit_log_event' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_list_contractors' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='current_user_is_admin' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_delete_contractor' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_delete_comment' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='guard_job_sms_runtime_columns' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='photo_audit_photos_change_trigger' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_get_job_photo_audit' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_upsert_sms_settings' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_update_device_status' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='set_contractors_updated_at' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='normalize_contractors_text' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_sync_devices_from_jobs' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='enforce_contractors_no_duplicates' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='enforce_jobs_use_existing_contractor' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='touch_services_updated_at' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='normalize_contractors_email' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='normalize_contractors_phone' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='normalize_contractors_nip' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='enforce_contractors_contact_duplicates' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_delete_device' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='storage_object_job_id' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='current_user_can_access_job' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_upsert_device' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='sync_device_from_job_row' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='touch_devices_updated_at' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_list_devices_basic' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_list_devices_for_service' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_get_dashboard_metrics' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='rls_auto_enable' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_get_sms_module_snapshot' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_get_device_sms_history' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='sync_device_from_job_trigger' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_list_devices_with_contractor' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='handle_new_user' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_get_contractor_devices' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='normalize_contractor_addresses' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_upsert_contractor' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_upsert_nameplate_product' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_import_nameplate_products' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='set_job_completion_metadata' loop execute format('revoke execute on function %s from authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_sync_device_from_job' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='worker_create_or_get_contractor_for_job' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname='admin_delete_job_device' loop execute format('grant execute on function %s to authenticated', f.signature); end loop; end $$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Użytkownik'),
    new.email,
    'Pracownik'
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.worker_create_or_get_contractor_for_job(p_company_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_street text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_id uuid;
  v_name text := trim(coalesce(p_company_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_street text := nullif(trim(coalesce(p_street, '')), '');
  v_addresses jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if auth.uid() is null or coalesce(v_role, '') not in ('Pracownik', 'Administrator', 'admin') then raise exception 'Brak uprawnień do dodania klienta.'; end if;
  if v_name = '' then raise exception 'Podaj klienta.'; end if;

  if public.normalize_contractors_phone(v_phone) is not null then
    select c.id into v_id from public.contractors c where public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone) limit 1;
  end if;
  if v_id is null and public.normalize_contractors_email(v_email) is not null then
    select c.id into v_id from public.contractors c where public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email) limit 1;
  end if;
  if v_id is null then
    select c.id into v_id from public.contractors c where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name) limit 1;
  end if;

  if v_id is null then
    v_addresses := public.normalize_contractor_addresses(null, v_city, v_street);
    insert into public.contractors (company_name, contact_person, phone, email, city, street, addresses, notes, is_active)
    values (v_name, null, v_phone, v_email, v_city, v_street, v_addresses, 'Utworzono przez pracownika z mobilnego formularza nowego klienta.', true)
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'company_name', v_name, 'phone', v_phone, 'email', v_email, 'city', v_city, 'street', v_street);
exception
  when unique_violation then
    select c.id into v_id
    from public.contractors c
    where public.normalize_contractors_text(c.company_name) = public.normalize_contractors_text(v_name)
       or (public.normalize_contractors_phone(v_phone) is not null and public.normalize_contractors_phone(c.phone) = public.normalize_contractors_phone(v_phone))
       or (public.normalize_contractors_email(v_email) is not null and public.normalize_contractors_email(c.email) = public.normalize_contractors_email(v_email))
    order by c.created_at asc
    limit 1;
    if v_id is null then raise; end if;
    return jsonb_build_object('id', v_id, 'company_name', v_name, 'phone', v_phone, 'email', v_email, 'city', v_city, 'street', v_street);
end;
$function$
;

create or replace function private.guard_profile_role() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then return new; end if;
  if public.current_user_is_admin() then return new; end if;
  if tg_op='INSERT' then
    if new.id is distinct from auth.uid() or new.role is distinct from 'Pracownik' then raise exception 'Brak uprawnień do nadania roli.' using errcode='42501'; end if;
  elsif new.id is distinct from old.id or new.role is distinct from old.role then
    raise exception 'Tylko administrator może zmieniać role.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger protect_profile_role before insert or update on public.profiles for each row execute function private.guard_profile_role();
create policy profiles_read_team on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id=auth.uid() and role='Pracownik');
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (id=auth.uid() or public.current_user_is_admin()) with check (id=auth.uid() or public.current_user_is_admin());
create policy jobs_read_access on public.jobs for select to authenticated using (public.current_user_can_access_job(id));
create policy jobs_create_own on public.jobs for insert to authenticated with check (created_by=auth.uid() or public.current_user_is_admin());
create policy jobs_update_access on public.jobs for update to authenticated using (public.current_user_can_access_job(id)) with check (public.current_user_can_access_job(id));
create policy jobs_delete_admin on public.jobs for delete to authenticated using (public.current_user_is_admin());
create or replace function private.guard_job_fields() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()='service_role' or auth.uid() is null or public.current_user_is_admin() then return new; end if;
  if tg_op='INSERT' then
    if new.created_by is distinct from auth.uid() or new.main_technician_id is not null or coalesce(new.admin_note,'')<>'' or coalesce(new.status,'') not in ('Nowe','W trakcie') then raise exception 'Brak uprawnień do przypisania lub statusu.' using errcode='42501'; end if;
  else
    if old.status='Zakończone' then
      if (to_jsonb(new) - array['payment_confirmation_enabled','payment_amount','payment_kind','payment_method','payment_paid_at','payment_recorded_by','payment_updated_at'])
         is distinct from (to_jsonb(old) - array['payment_confirmation_enabled','payment_amount','payment_kind','payment_method','payment_paid_at','payment_recorded_by','payment_updated_at'])
         or (new.payment_recorded_by is not null and new.payment_recorded_by<>auth.uid()) then
        raise exception 'Zakończona karta pozwala tylko zapisać potwierdzenie płatności.' using errcode='42501';
      end if;
      return new;
    end if;
    if new.created_by is distinct from old.created_by or new.main_technician_id is distinct from old.main_technician_id or coalesce(new.admin_note,'') is distinct from coalesce(old.admin_note,'')
       or new.sms_consent is distinct from old.sms_consent or new.sms_reminder_enabled is distinct from old.sms_reminder_enabled
       or new.completed_at is distinct from old.completed_at or new.completed_by is distinct from old.completed_by then
      raise exception 'Brak uprawnień do zmiany pól administratora lub zakończonej karty.' using errcode='42501';
    end if;
    if new.status is distinct from old.status and not ((old.status='W trakcie' and new.status='Zakończone') or (old.status in ('Nowe','Niezrealizowane','Nowe zlecenie') and new.status='W trakcie')) then raise exception 'Niedozwolona zmiana statusu.' using errcode='42501'; end if;
  end if;
  return new;
end $$;
create trigger protect_job_fields before insert or update on public.jobs for each row execute function private.guard_job_fields();
create policy access_read_job on public.job_access for select to authenticated using (public.current_user_can_access_job(job_id));
create policy access_insert_admin_or_creator_self on public.job_access for insert to authenticated with check (public.current_user_is_admin() or (user_id=auth.uid() and exists(select 1 from public.jobs j where j.id=job_id and j.created_by=auth.uid())));
create policy access_delete_admin on public.job_access for delete to authenticated using (public.current_user_is_admin());
create policy comments_read_job on public.comments for select to authenticated using (public.current_user_can_access_job(job_id));
create policy comments_insert_job on public.comments for insert to authenticated with check (author_id=auth.uid() and public.current_user_can_access_job(job_id) and exists(select 1 from public.jobs j where j.id=job_id and (public.current_user_is_admin() or j.status is distinct from 'Zakończone')));
create policy comments_delete_admin on public.comments for delete to authenticated using (public.current_user_is_admin());
create policy photos_read_job on public.photos for select to authenticated using (public.current_user_can_access_job(job_id));
create policy photos_insert_job on public.photos for insert to authenticated with check (public.current_user_can_access_job(job_id) and (uploaded_by=auth.uid() or public.current_user_is_admin()) and exists(select 1 from public.jobs j where j.id=job_id and (public.current_user_is_admin() or j.status is distinct from 'Zakończone')));
create policy photos_update_job on public.photos for update to authenticated using (public.current_user_can_access_job(job_id) and exists(select 1 from public.jobs j where j.id=job_id and (public.current_user_is_admin() or j.status is distinct from 'Zakończone'))) with check (public.current_user_can_access_job(job_id));
create policy photos_delete_job on public.photos for delete to authenticated using (public.current_user_can_access_job(job_id) and exists(select 1 from public.jobs j where j.id=job_id and (public.current_user_is_admin() or j.status is distinct from 'Zakończone')));
create policy notifications_read_own on public.notifications for select to authenticated using (user_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy notifications_insert_job on public.notifications for insert to authenticated with check (public.current_user_is_admin() or (public.current_user_can_access_job(link_job_id) and (
exists(select 1 from public.profiles p where p.id=user_id and lower(p.role) in ('administrator','admin')) or
exists(select 1 from public.job_access a where a.job_id=link_job_id and a.user_id=notifications.user_id) or
exists(select 1 from public.jobs j where j.id=link_job_id and (j.created_by=notifications.user_id or j.main_technician_id=notifications.user_id)))));

-- Snapshot and delete are one database transaction. Storage files are retained.
create table private.job_recycle_bin (
  archive_id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  snapshot jsonb not null,
  restored_at timestamptz
);
revoke all on private.job_recycle_bin from public, anon, authenticated;
create index job_recycle_bin_job_idx on private.job_recycle_bin(job_id) where restored_at is null;
create or replace function private.archive_job_before_delete() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb := jsonb_build_object('jobs',to_jsonb(old)); t text; rows jsonb;
begin
  foreach t in array array['job_access','comments','photos','nameplate_manual_verifications','job_protocols','job_protocol_email_log','push_delivery_log'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where job_id=$1',t) into rows using old.id;
    snap := snap || jsonb_build_object(t,rows);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into rows from public.devices d where d.source_job_id=old.id::text or d.source_job_id like old.id::text || '::device-%';
  snap := snap || jsonb_build_object('devices',rows);
  select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) into rows from public.sms_log l
    where l.job_id=old.id or l.device_id in (select d.id from public.devices d where d.source_job_id=old.id::text or d.source_job_id like old.id::text || '::device-%');
  snap := snap || jsonb_build_object('sms_log',rows);
  insert into private.job_recycle_bin(job_id,deleted_by,snapshot) values(old.id,auth.uid(),snap);
  return old;
end $$;
create trigger archive_job_before_delete before delete on public.jobs for each row execute function private.archive_job_before_delete();

create or replace function public.admin_list_deleted_jobs() returns table(archive_id uuid,job_id uuid,client text,deleted_at timestamptz) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.current_user_is_admin() then raise exception 'Tylko administrator ma dostęp do kosza.' using errcode='42501'; end if;
  return query select r.archive_id,r.job_id,r.snapshot->'jobs'->>'client',r.deleted_at from private.job_recycle_bin r where r.restored_at is null order by r.deleted_at desc;
end $$;
create or replace function public.admin_restore_deleted_job(p_archive_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r private.job_recycle_bin%rowtype; t text;
begin
  if not public.current_user_is_admin() then raise exception 'Tylko administrator może przywracać karty.' using errcode='42501'; end if;
  select * into r from private.job_recycle_bin where archive_id=p_archive_id and restored_at is null for update;
  if not found then raise exception 'Karta została już przywrócona albo wpis nie istnieje.'; end if;
  insert into public.jobs select * from jsonb_populate_record(null::public.jobs,r.snapshot->'jobs');
  -- The insert trigger regenerates derived devices; restore their original identities.
  delete from public.devices where source_job_id=r.job_id::text or source_job_id like r.job_id::text || '::device-%';
  foreach t in array array['devices','job_access','comments','photos','nameplate_manual_verifications','job_protocols','job_protocol_email_log','sms_log'] loop
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',t,t) using coalesce(r.snapshot->t,'[]'::jsonb);
  end loop;
  update public.push_delivery_log set job_id=r.job_id where id in(select (x->>'id')::uuid from jsonb_array_elements(r.snapshot->'push_delivery_log') x);
  update public.jobs set completed_at=(r.snapshot->'jobs'->>'completed_at')::timestamptz, completed_by=(r.snapshot->'jobs'->>'completed_by')::uuid where id=r.job_id;
  update private.job_recycle_bin set restored_at=now() where archive_id=r.archive_id;
  return r.job_id;
end $$;

create or replace function public.admin_delete_jobs_recoverable(p_ids uuid[],p_only_unlinked boolean default false) returns table(id uuid) language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
  if not public.current_user_is_admin() then raise exception 'Tylko administrator może usuwać karty.' using errcode='42501'; end if;
  return query delete from public.jobs j where j.id=any(p_ids) and (not p_only_unlinked or j.contractor_id is null) returning j.id;
  get diagnostics n = row_count;
  if n=0 then raise exception 'Nie usunięto karty. Odśwież dane i sprawdź powiązania.'; end if;
end $$;

-- One RPC commits job fields and assignment changes together; RLS still applies.
create or replace function public.save_job_with_access(p_id uuid,p_fields jsonb,p_viewer_ids uuid[] default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved public.jobs%rowtype; cols text; vals text; assignments text; allowed text[] := array[
'title','client','email','phone','city','street','location','status','installation_date','admin_note','main_technician_id','sms_recipient_phone','contractor_id','contractor_address_id','device_model','device_serial_number'];
begin
  if auth.uid() is null then raise exception 'Zaloguj się ponownie.' using errcode='42501'; end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then raise exception 'Niepoprawne dane karty.'; end if;
  if p_id is null then
    allowed:=allowed || array['created_by','sms_consent','sms_reminder_enabled'];
    p_fields:=p_fields || jsonb_build_object('created_by',auth.uid());
    if exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(allowed)) then raise exception 'Niedozwolone pole.'; end if;
    select string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') into cols,vals from jsonb_object_keys(p_fields) k;
    execute format('insert into public.jobs (%s) select %s from jsonb_populate_record(null::public.jobs,$1) r returning *',cols,vals) into saved using p_fields;
  else
    if exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(allowed)) then raise exception 'Niedozwolone pole.'; end if;
    select string_agg(format('%I=r.%I',k,k),',') into assignments from jsonb_object_keys(p_fields) k;
    if assignments is null then raise exception 'Brak danych do zapisu.'; end if;
    execute format('update public.jobs j set %s from jsonb_populate_record(null::public.jobs,$1) r where j.id=$2 returning j.*',assignments) into saved using p_fields,p_id;
    if saved.id is null then raise exception 'Nie zapisano karty. Brak uprawnień albo karta nie istnieje.' using errcode='42501'; end if;
  end if;
  if p_viewer_ids is not null then
    if exists(select 1 from unnest(p_viewer_ids) u where u is null or not exists(select 1 from public.profiles p where p.id=u)) then
      raise exception 'Przypisany pracownik nie istnieje.' using errcode='23503';
    end if;
    if public.current_user_is_admin() then
      delete from public.job_access a where a.job_id=saved.id and not a.user_id=any(p_viewer_ids);
      insert into public.job_access(job_id,user_id) select saved.id,u from (select distinct unnest(p_viewer_ids) u) ids where u is not null and not exists(select 1 from public.job_access a where a.job_id=saved.id and a.user_id=u);
    elsif p_id is null then
      if exists(select 1 from unnest(p_viewer_ids) u where u is distinct from auth.uid()) then raise exception 'Brak uprawnień do przypisania pracowników.' using errcode='42501'; end if;
      insert into public.job_access(job_id,user_id) select saved.id,auth.uid() where auth.uid()=any(p_viewer_ids);
    else
      raise exception 'Tylko administrator może zmieniać przypisania.' using errcode='42501';
    end if;
  end if;
  return jsonb_build_object('id',saved.id,'status',saved.status);
end $$;

-- No Storage delete while a live or deleted card still references the file.
create or replace function public.job_file_can_be_deleted(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select auth.uid() is not null and (public.current_user_is_admin() or public.current_user_can_access_job(public.storage_object_job_id(p_path)))
and case p_bucket
when 'job-photos' then not exists(select 1 from public.photos p where p.storage_path=p_path)
 and not exists(select 1 from private.job_recycle_bin r, jsonb_array_elements(r.snapshot->'photos') p where r.restored_at is null and p->>'storage_path'=p_path)
when 'job-protocols' then not exists(select 1 from public.job_protocols p where p.storage_path=p_path)
 and not exists(select 1 from private.job_recycle_bin r, jsonb_array_elements(r.snapshot->'job_protocols') p where r.restored_at is null and p->>'storage_path'=p_path)
else false end
$$;
drop policy if exists "Allow authenticated uploads to job-photos" on storage.objects;
drop policy if exists "Allow public read job-photos" on storage.objects;
drop policy if exists "Allow authenticated delete job-photos" on storage.objects;
drop policy if exists "job_photos_storage_delete_admin_or_owner" on storage.objects;
drop policy if exists "job_protocols_storage_delete_admin_or_owner" on storage.objects;

create policy retained_job_files_delete on storage.objects for delete to authenticated using (bucket_id in ('job-photos','job-protocols') and public.job_file_can_be_deleted(bucket_id,name));

-- Durable at-most-once claim, independent of deletable SMS history.
create table private.sms_delivery_claims (
  delivery_key text primary key, claim_id uuid not null unique default gen_random_uuid(),
  claimed_at timestamptz not null default now(), provider_message_id text, confirmed_at timestamptz
);
revoke all on private.sms_delivery_claims from public,anon,authenticated;
create or replace function public.claim_service_sms(p_job_id uuid,p_device_id uuid,p_cycle integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare linked uuid:=p_job_id; source text; delivery text; claimed uuid; job public.jobs%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501'; end if;
  if p_cycle is null or p_cycle<1 or p_cycle>100 then raise exception 'Niepoprawny cykl przypomnienia.'; end if;
  if p_device_id is not null then
    select split_part(source_job_id,'::',1) into source from public.devices where id=p_device_id;
    if not found then raise exception 'Urządzenie nie istnieje.'; end if;
    if source ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      if linked is not null and linked<>source::uuid then raise exception 'Niezgodne powiązanie karty i urządzenia.'; end if;
      linked:=source::uuid;
    end if;
  end if;
  if linked is not null then
    select * into job from public.jobs where id=linked;
    if not found then raise exception 'Karta nie istnieje.'; end if;
    if not job.sms_consent or not job.sms_reminder_enabled then raise exception 'Zgoda SMS lub przypomnienia są wyłączone dla tej karty.'; end if;
    delivery:='job:'||linked::text||':cycle:'||p_cycle::text;
  elsif p_device_id is not null then delivery:='device:'||p_device_id::text||':cycle:'||p_cycle::text;
  else raise exception 'Brak karty lub urządzenia do wysyłki.'; end if;
  if exists(
    select 1 from public.sms_log l left join public.devices d on d.id=l.device_id
    where coalesce(l.reminder_cycle,1)=p_cycle
      and (l.status in ('sent','provider_sent','delivered') or l.provider_message_id is not null)
      and ((linked is not null and (l.job_id=linked or split_part(d.source_job_id,'::',1)=linked::text)) or (linked is null and l.device_id=p_device_id))
  ) then return null; end if;
  insert into private.sms_delivery_claims(delivery_key) values(delivery) on conflict do nothing returning claim_id into claimed;
  return claimed;
end $$;
create or replace function public.confirm_service_sms(p_claim_id uuid,p_provider_message_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Brak uprawnień.' using errcode='42501'; end if;
  if nullif(trim(p_provider_message_id),'') is null then raise exception 'Brak potwierdzenia operatora.'; end if;
  update private.sms_delivery_claims set provider_message_id=p_provider_message_id,confirmed_at=now() where claim_id=p_claim_id and (provider_message_id is null or provider_message_id=p_provider_message_id);
  if not found then raise exception 'Nie znaleziono rezerwacji SMS.'; end if;
end $$;
revoke all on function public.claim_service_sms(uuid,uuid,integer),public.confirm_service_sms(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_service_sms(uuid,uuid,integer),public.confirm_service_sms(uuid,text) to service_role;
grant execute on function public.admin_list_deleted_jobs(),public.admin_restore_deleted_job(uuid),public.admin_delete_jobs_recoverable(uuid[],boolean),public.save_job_with_access(uuid,jsonb,uuid[]),public.job_file_can_be_deleted(text,text) to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.photo_audit_log_event(p_action text, p_job_id uuid DEFAULT NULL::uuid, p_photo_id uuid DEFAULT NULL::uuid, p_storage_path text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_source text DEFAULT 'app'::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_role text := case when public.current_user_is_admin() then 'admin' else 'user' end;
begin
  if auth.uid() is not null and not public.current_user_is_admin() and p_job_id is not null and not public.current_user_can_access_job(p_job_id) then
    raise exception 'Brak dostępu do karty.' using errcode='42501';
  end if;
  insert into public.photo_audit_log (
    job_id,
    photo_id,
    actor_user_id,
    actor_role,
    action,
    source,
    storage_path,
    image_url,
    details
  )
  values (
    p_job_id,
    p_photo_id,
    v_actor_id,
    v_actor_role,
    trim(coalesce(p_action, '')),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'app'),
    nullif(trim(coalesce(p_storage_path, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$function$;
notify pgrst,'reload schema';
grant execute on all functions in schema public to service_role;
commit;