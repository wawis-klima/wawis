-- WAWIS 13.99 — moduł serwisowy (etap administratora), zgoda właściciela 30.10.2026.
-- 1) Serwer blokuje zmiany wizyty znajdującej się w Koszu (dotąd chronił tylko interfejs).
-- 2) Administrator może usunąć pomyłkowe zdjęcie przed zakończeniem wizyty.
-- Migracja niedestrukcyjna: nie usuwa ani nie zmienia istniejących danych.

-- ---------------------------------------------------------------------------
-- 1. Kosz: centralne blokady w triggerach (obejmują RPC, zapisy kolumnowe i przyszłe ścieżki).
-- ---------------------------------------------------------------------------
create or replace function private.service_visit_trash_guard_v1399()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  -- W Koszu wolno wyłącznie: przywrócić (deleted_at -> null) oraz rozpocząć trwałe usuwanie.
  if old.deleted_at is not null and new.deleted_at is not null
     and (to_jsonb(new) - array['updated_at','purge_started_at'])
         is distinct from (to_jsonb(old) - array['updated_at','purge_started_at']) then
    raise exception 'Serwis jest w koszu. Przywróć go, aby wprowadzić zmiany.' using errcode = '55000';
  end if;
  return new;
end;
$fn$;
revoke all on function private.service_visit_trash_guard_v1399() from public, anon, authenticated;
drop trigger if exists trg_service_visit_trash_guard_v1399 on public.service_visits;
create trigger trg_service_visit_trash_guard_v1399
  before update on public.service_visits
  for each row execute function private.service_visit_trash_guard_v1399();

-- Wyniki urządzeń, protokół i zdjęcia wizyty w Koszu (INSERT/UPDATE; DELETE pozostaje dla purge).
create or replace function private.service_visit_child_trash_guard_v1399()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_visit uuid;
begin
  if tg_table_name = 'service_visit_photos' then
    select d.service_visit_id into v_visit from public.service_visit_devices d where d.id = new.service_visit_device_id;
  else
    v_visit := new.service_visit_id;
  end if;
  if exists (select 1 from public.service_visits v where v.id = v_visit and v.deleted_at is not null) then
    raise exception 'Serwis jest w koszu. Przywróć go, aby wprowadzić zmiany.' using errcode = '55000';
  end if;
  return new;
end;
$fn$;
revoke all on function private.service_visit_child_trash_guard_v1399() from public, anon, authenticated;
drop trigger if exists trg_service_visit_devices_trash_guard_v1399 on public.service_visit_devices;
create trigger trg_service_visit_devices_trash_guard_v1399
  before insert or update on public.service_visit_devices
  for each row execute function private.service_visit_child_trash_guard_v1399();
drop trigger if exists trg_service_visit_protocols_trash_guard_v1399 on public.service_visit_protocols;
create trigger trg_service_visit_protocols_trash_guard_v1399
  before insert or update on public.service_visit_protocols
  for each row execute function private.service_visit_child_trash_guard_v1399();
drop trigger if exists trg_service_visit_photos_trash_guard_v1399 on public.service_visit_photos;
create trigger trg_service_visit_photos_trash_guard_v1399
  before insert on public.service_visit_photos
  for each row execute function private.service_visit_child_trash_guard_v1399();

-- Upload do Storage dla wizyty w Koszu — odrzucony już na poziomie polityki.
drop policy if exists service_visit_files_admin_upload on storage.objects;
create policy service_visit_files_admin_upload on storage.objects for insert to authenticated
 with check (bucket_id='service-visit-files' and (select public.current_user_is_admin())
             and exists(select 1 from public.service_visits v
                        where v.id::text=(storage.foldername(name))[1] and v.status <> 'odwolany'
                          and v.deleted_at is null));

-- PUSH „zakończono” nie jest wysyłany dla wizyty w Koszu (spójnie z PUSH przydziału 13.94).
create or replace function public.get_service_visit_completed_push_event_v1389(p_event_id uuid,p_token text)
returns table(visit_id uuid,protocol_id uuid,completed_at timestamptz,actor_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only' using errcode='42501'; end if;
 return query select e.visit_id,e.protocol_id,e.completed_at,e.actor_id
   from private.service_visit_completed_push_events_v1389 e
   join public.service_visits v on v.id=e.visit_id and v.status='wykonany' and v.deleted_at is null
   join public.service_visit_protocols p on p.id=e.protocol_id and p.service_visit_id=e.visit_id
   where e.id=p_event_id and e.event_token=p_token and e.processed_at is null;
end;
$fn$;
revoke all on function public.get_service_visit_completed_push_event_v1389(uuid,text) from public,anon,authenticated;
grant execute on function public.get_service_visit_completed_push_event_v1389(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Usunięcie pomyłkowego zdjęcia (tylko administrator, tylko przed zakończeniem).
-- ---------------------------------------------------------------------------
create table if not exists private.service_visit_photo_delete_audit_v1399 (
  id bigint generated always as identity primary key,
  visit_id uuid not null,
  item_id uuid not null,
  photo_id uuid not null,
  storage_path text not null,
  file_size_bytes bigint,
  actor_id uuid not null,
  deleted_at timestamptz not null default now()
);
revoke all on private.service_visit_photo_delete_audit_v1399 from public, anon, authenticated;

-- Najpierw wiersz w bazie (atomowo, pod blokadą wizyty), potem plik przez Storage API.
-- Gdy usunięcie pliku się nie uda, zostaje nieużywany plik (sprząta go trwałe usunięcie wizyty),
-- nigdy wpis wskazujący na nieistniejący plik.
create or replace function public.service_visit_admin_delete_photo(p_photo_id uuid)
returns text language plpgsql security definer set search_path = ''
as $fn$
declare r record; v record;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usunąć zdjęcie' using errcode = '42501';
  end if;
  select p.id, p.storage_path, p.file_size_bytes, p.service_visit_device_id as item_id, d.service_visit_id as visit_id
    into r
    from public.service_visit_photos p
    join public.service_visit_devices d on d.id = p.service_visit_device_id
    where p.id = p_photo_id;
  if not found then raise exception 'Nie znaleziono zdjęcia'; end if;
  select id, status, deleted_at into v from public.service_visits where id = r.visit_id for update;
  if v.deleted_at is not null then
    raise exception 'Serwis jest w koszu. Przywróć go, aby wprowadzić zmiany.' using errcode = '55000';
  end if;
  if v.status not in ('zaplanowany','w_trakcie','oczekuje_na_podpis')
     or exists (select 1 from public.service_visit_protocols pr where pr.service_visit_id = r.visit_id) then
    raise exception 'Zdjęcie można usunąć tylko przed podpisaniem i zakończeniem wizyty';
  end if;
  delete from public.service_visit_photos where id = p_photo_id;
  if not found then raise exception 'Nie usunięto zdjęcia'; end if;
  insert into private.service_visit_photo_delete_audit_v1399
    (visit_id, item_id, photo_id, storage_path, file_size_bytes, actor_id)
  values (r.visit_id, r.item_id, r.id, r.storage_path, r.file_size_bytes, auth.uid());
  return r.storage_path;
end;
$fn$;
revoke all on function public.service_visit_admin_delete_photo(uuid) from public, anon, authenticated;
grant execute on function public.service_visit_admin_delete_photo(uuid) to authenticated;

-- Plik zdjęcia można skasować przez Storage API wyłącznie, gdy żaden wpis już go nie wskazuje,
-- leży w katalogu photos aktywnej (niezakończonej, nie w Koszu) wizyty. PDF i podpisy — nigdy.
drop policy if exists service_visit_files_admin_delete_unreferenced_photo_v1399 on storage.objects;
create policy service_visit_files_admin_delete_unreferenced_photo_v1399 on storage.objects
 for delete to authenticated
 using (bucket_id = 'service-visit-files'
        and (select public.current_user_is_admin())
        and (storage.foldername(objects.name))[2] = 'photos'
        and exists (select 1 from public.service_visits v
                    where v.id::text = (storage.foldername(objects.name))[1]
                      and v.deleted_at is null
                      and v.status in ('zaplanowany','w_trakcie','oczekuje_na_podpis'))
        and not exists (select 1 from public.service_visit_photos p where p.storage_path = objects.name));

comment on function public.service_visit_admin_delete_photo(uuid) is
  'WAWIS 13.99: administrator usuwa pomyłkowe zdjęcie przed podpisem; audyt w private.service_visit_photo_delete_audit_v1399.';
