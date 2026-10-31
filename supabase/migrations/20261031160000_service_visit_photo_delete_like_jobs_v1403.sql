-- WAWIS 14.03 — usuwanie zdjęć serwisu jak w montażach (decyzja właściciela 31.10.2026).
-- Administrator może usunąć zdjęcie także po podpisaniu i zakończeniu wizyty (jak zdjęcia montażu).
-- Pozostają: tylko administrator, nie dla wizyty w Koszu, audyt każdego usunięcia, oraz zasada
-- przeglądu „usterka wymaga zdjęcia” — w zakończonej wizycie nie można usunąć OSTATNIEGO zdjęcia usterki.
-- Migracja niedestrukcyjna.
create or replace function public.service_visit_admin_delete_photo(p_photo_id uuid)
returns text language plpgsql security definer set search_path = ''
as $fn$
declare r record; v record; v_left integer;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usunąć zdjęcie' using errcode = '42501';
  end if;
  select p.id, p.storage_path, p.file_size_bytes, p.service_visit_device_id as item_id,
         d.service_visit_id as visit_id, d.result as item_result
    into r
    from public.service_visit_photos p
    join public.service_visit_devices d on d.id = p.service_visit_device_id
    where p.id = p_photo_id;
  if not found then raise exception 'Nie znaleziono zdjęcia'; end if;
  select id, status, deleted_at into v from public.service_visits where id = r.visit_id for update;
  if v.deleted_at is not null then
    raise exception 'Serwis jest w koszu. Przywróć go, aby wprowadzić zmiany.' using errcode = '55000';
  end if;
  if v.status = 'wykonany' and r.item_result = 'usterka' then
    select count(*) into v_left from public.service_visit_photos
      where service_visit_device_id = r.item_id and id <> p_photo_id;
    if v_left = 0 then
      raise exception 'To jedyne zdjęcie usterki w podpisanym protokole — nie można go usunąć.';
    end if;
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

-- Plik zdjęcia: tylko nieużywany plik w katalogu photos wizyty spoza Kosza (status bez znaczenia, jak montaże).
-- PDF i podpisy nadal nigdy nie są usuwane z przeglądarki.
drop policy if exists service_visit_files_admin_delete_unreferenced_photo_v1399 on storage.objects;
create policy service_visit_files_admin_delete_unreferenced_photo_v1399 on storage.objects
 for delete to authenticated
 using (bucket_id = 'service-visit-files'
        and (select public.current_user_is_admin())
        and (storage.foldername(objects.name))[2] = 'photos'
        and exists (select 1 from public.service_visits v
                    where v.id::text = (storage.foldername(objects.name))[1]
                      and v.deleted_at is null)
        and not exists (select 1 from public.service_visit_photos p where p.storage_path = objects.name));
