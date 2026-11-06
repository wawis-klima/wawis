-- WAWIS 14.23 — naklejka QR przypisywana podczas przeglądu serwisowego (decyzja właściciela 06.11.2026).
-- Każdy pracownik (nie tylko przydzielony do wizyty — na serwis jadą często dwie osoby) może przykleić
-- WOLNĄ naklejkę na urządzenie objęte przeglądem, które jeszcze nie ma naklejki.
-- Wymiana i zwalnianie naklejek zostają wyłącznie dla administratora (bez zmian z 14.08).
-- Tylko nowe funkcje; bez zmian tabel, danych i istniejących uprawnień. Można uruchomić ponownie.

-- Naklejki urządzeń z jednej wizyty: pozycja przeglądu → kod.
create or replace function public.qr_stickers_for_service_visit_v1423(p_visit_id uuid)
returns table(item_id uuid, code text)
language sql
stable
security definer
set search_path to ''
as $$
  select i.id, s.code
  from public.service_visit_devices i
  join public.qr_stickers s on s.device_id = i.device_id
  where public.current_user_is_staff()
    and p_visit_id is not null
    and i.service_visit_id = p_visit_id
$$;

-- Przypisanie naklejki do urządzenia z pozycji przeglądu.
create or replace function public.qr_sticker_assign_service_device_v1423(p_code text, p_visit_id uuid, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_visit public.service_visits%rowtype;
  v_device uuid;
begin
  if not public.current_user_is_staff() then
    raise exception 'Brak uprawnień.' using errcode = '42501';
  end if;
  select * into v_visit from public.service_visits where id = p_visit_id;
  if not found or v_visit.deleted_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'visit_not_found');
  end if;
  if v_visit.status = 'odwolany' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'visit_cancelled');
  end if;
  select i.device_id into v_device
  from public.service_visit_devices i
  where i.id = p_item_id and i.service_visit_id = p_visit_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'visit_item_not_found');
  end if;
  if v_device is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_found');
  end if;
  -- p_replace = false: zajętej naklejki ani urządzenia z naklejką nie zmienia nikt, także administrator.
  return private.qr_sticker_assign(p_code, v_device, false);
end;
$$;

revoke all on function public.qr_stickers_for_service_visit_v1423(uuid),
  public.qr_sticker_assign_service_device_v1423(text, uuid, uuid) from public, anon;
grant execute on function public.qr_stickers_for_service_visit_v1423(uuid),
  public.qr_sticker_assign_service_device_v1423(text, uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
