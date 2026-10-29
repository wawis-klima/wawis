-- WAWIS 13.95 — trwałe usunięcie serwisu tylko z kosza, bez naruszania danych klienta i montaży.
-- Pliki muszą zostać usunięte przez Storage API, nigdy przez DELETE storage.objects.
alter table public.service_visits
  add column if not exists purge_started_at timestamptz;

create or replace function public.service_visit_purge_prepare_v1395(p_visit_id uuid, p_actor_id uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $fn$
declare v_visit record; v_paths text[];
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_only' using errcode='42501';
  end if;
  if p_actor_id is null or not exists(
    select 1 from public.profiles where id=p_actor_id and role='Administrator'
  ) then raise exception 'administrator_required' using errcode='42501'; end if;
  select id,deleted_at,purge_started_at into v_visit
    from public.service_visits where id=p_visit_id for update;
  if not found then raise exception 'Nie znaleziono przeglądu'; end if;
  if v_visit.deleted_at is null then raise exception 'Najpierw przenieś przegląd do kosza'; end if;
  if v_visit.purge_started_at is null then
    update public.service_visits set purge_started_at=now(),updated_at=now() where id=p_visit_id;
  end if;
  select coalesce(array_agg(name order by name),array[]::text[])
    into v_paths from storage.objects
    where bucket_id='service-visit-files' and name like (p_visit_id::text || '/%');
  return v_paths;
end;
$fn$;
revoke all on function public.service_visit_purge_prepare_v1395(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_visit_purge_prepare_v1395(uuid,uuid) to service_role;

-- Nie pozwalamy przywrócić wizyty podczas nieodwracalnego kasowania jej plików.
create or replace function public.service_visit_admin_restore(p_visit_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare v_visit record;
begin
  if auth.uid() is null or not public.current_user_is_admin()
    then raise exception 'Tylko administrator może przywrócić serwis' using errcode='42501'; end if;
  select id,status,deleted_at,purge_started_at into v_visit
    from public.service_visits where id=p_visit_id for update;
  if not found then raise exception 'Nie znaleziono przeglądu'; end if;
  if v_visit.purge_started_at is not null then
    raise exception 'Trwa trwałe usuwanie. Nie można przywrócić tej wizyty.'; end if;
  if v_visit.deleted_at is null then return true; end if;
  update public.service_visits set deleted_at=null,deleted_by=null,updated_at=now()
    where id=p_visit_id;
  insert into private.service_visit_trash_audit_v1394(visit_id,actor_id,action,status_at_action)
    values(p_visit_id,auth.uid(),'restore',v_visit.status);
  return true;
end;
$fn$;
revoke all on function public.service_visit_admin_restore(uuid) from public,anon;
grant execute on function public.service_visit_admin_restore(uuid) to authenticated;

-- Po usunięciu i weryfikacji plików z Storage API, atomowo usuń tylko dane tej wizyty.
create or replace function public.service_visit_purge_finalize_v1395(p_visit_id uuid,p_actor_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare v_visit record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_only' using errcode='42501'; end if;
  if p_actor_id is null or not exists(
    select 1 from public.profiles where id=p_actor_id and role='Administrator'
  ) then raise exception 'administrator_required' using errcode='42501'; end if;
  select id,deleted_at,purge_started_at into v_visit
    from public.service_visits where id=p_visit_id for update;
  if not found then raise exception 'Nie znaleziono przeglądu'; end if;
  if v_visit.deleted_at is null or v_visit.purge_started_at is null then
    raise exception 'Nie potwierdzono rozpoczęcia trwałego usuwania'; end if;
  if exists(
    select 1 from storage.objects
    where bucket_id='service-visit-files' and name like (p_visit_id::text || '/%')
  ) then raise exception 'Pliki nadal istnieją w Storage; usunięcie bazy wstrzymane'; end if;

  delete from public.service_visit_protocol_email_log where service_visit_id=p_visit_id;
  delete from public.service_visit_photos where service_visit_device_id in
    (select id from public.service_visit_devices where service_visit_id=p_visit_id);
  delete from public.push_delivery_log
    where type in ('service_visit_assigned:'||p_visit_id::text,
                   'service_visit_completed:'||p_visit_id::text);
  delete from private.service_visit_trash_audit_v1394 where visit_id=p_visit_id;
  delete from public.service_visits where id=p_visit_id and deleted_at is not null;
  if not found then raise exception 'Nie usunięto przeglądu'; end if;
  -- Podrzędne urządzenia wizyty, protokół, zdarzenia i kolejki PUSH: FK ON DELETE CASCADE.
  return true;
end;
$fn$;
revoke all on function public.service_visit_purge_finalize_v1395(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_visit_purge_finalize_v1395(uuid,uuid) to service_role;
