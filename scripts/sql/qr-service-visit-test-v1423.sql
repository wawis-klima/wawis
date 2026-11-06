-- WAWIS 14.23: naklejka QR podczas przeglądu — każdy pracownik, tylko wolna naklejka, tylko urządzenie z wizyty.
create schema wawis_test;
grant usage on schema wawis_test to authenticated, service_role;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;
create function wawis_test.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if p_state is null or sqlstate = p_state then return; end if;
    raise exception 'FAIL %: oczekiwano %, otrzymano % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %: operacja przeszła, a powinna zostać odrzucona', p_label;
end $$;
create function wawis_test.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false) $$;
create function wawis_test.sticker_device(p_code text) returns uuid language sql stable security definer
set search_path = '' as $$ select device_id from public.qr_stickers where code = p_code $$;
create function wawis_test.events(p_code text) returns bigint language sql stable security definer
set search_path = '' as $$ select count(*) from public.qr_sticker_events where code = p_code $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Pracownik A', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000004', 'Pracownik B', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000003', 'Bez roli', 'Gość');
insert into public.contractors values ('c0000000-0000-4000-8000-000000000001', 'KLIENT TEST', null, 'Testowo', 'Fikcyjna 1', '000000000');
-- urządzenia ze starej bazy (bez montażu) — tego dotyczy zmiana
insert into public.devices values
  ('d0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', 'Stary 1', 'SN-11', '2019-05-01', null),
  ('d0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', 'Stary 2', 'SN-12', '2019-05-01', null),
  ('d0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000001', 'Poza wizytą', 'SN-13', '2019-05-01', null);
insert into public.service_visits(id, contractor_id, status, deleted_at) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'zaplanowany', null),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'odwolany', null),
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'zaplanowany', now());
insert into public.service_visit_devices(id, service_visit_id, device_id) values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000011'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000012'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', null),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000013'),
  ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000013');

set role authenticated;

-- bez logowania / bez roli: odmowa
select wawis_test.as_user(null);
select wawis_test.expect_error($q$select public.qr_sticker_assign_service_device_v1423('UYE8EYCQ','e0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001')$q$, '42501', 'bez logowania');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000003');
select wawis_test.expect_error($q$select public.qr_sticker_assign_service_device_v1423('UYE8EYCQ','e0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001')$q$, '42501', 'bez roli');
do $$ begin
  perform wawis_test.expect((select count(*) from public.qr_stickers_for_service_visit_v1423('e0000000-0000-4000-8000-000000000001')) = 0, 'bez roli nie widzi naklejek');
end $$;
-- stara funkcja „z listy” nadal tylko dla administratora
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
select wawis_test.expect_error($q$select public.qr_sticker_assign_device('UYE8EYCQ','d0000000-0000-4000-8000-000000000011',false)$q$, '42501', 'assign_device nadal tylko admin');

-- Pracownik A (nieprzydzielony do wizyty) przykleja wolną naklejkę na urządzenie ze starej bazy
do $$ declare r jsonb; begin
  r := public.qr_sticker_assign_service_device_v1423('uye8-eycq', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  perform wawis_test.expect((r->>'ok')::boolean and r->>'code' = 'UYE8EYCQ', 'pracownik przypisuje wolną naklejkę');
  perform wawis_test.expect(wawis_test.sticker_device('UYE8EYCQ') = 'd0000000-0000-4000-8000-000000000011', 'zapis w bazie');
  perform wawis_test.expect(wawis_test.events('UYE8EYCQ') = 1, 'zdarzenie w historii naklejki');
  perform wawis_test.expect((select code from public.qr_stickers_for_service_visit_v1423('e0000000-0000-4000-8000-000000000001')
    where item_id = 'f0000000-0000-4000-8000-000000000001') = 'UYE8EYCQ', 'pracownik widzi kod w wizycie');
  perform wawis_test.expect((select count(*) from public.qr_stickers_for_service_visit_v1423('e0000000-0000-4000-8000-000000000001')) = 1, 'tylko jedna pozycja z naklejką');
  r := public.qr_sticker_assign_service_device_v1423('UYE8EYCQ', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  perform wawis_test.expect((r->>'ok')::boolean and (r->>'already')::boolean, 'ponowny skan = bez zmian');
  perform wawis_test.expect(wawis_test.events('UYE8EYCQ') = 1, 'bez drugiego zdarzenia');
end $$;

-- Pracownik B (drugi na serwisie): zajęta naklejka i urządzenie z naklejką — odmowa
select wawis_test.as_user('a0000000-0000-4000-8000-000000000004');
do $$ declare r jsonb; begin
  r := public.qr_sticker_assign_service_device_v1423('UYE8EYCQ', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
  perform wawis_test.expect(r->>'reason' = 'sticker_taken' and (r->>'can_replace')::boolean = false, 'zajęta naklejka');
  r := public.qr_sticker_assign_service_device_v1423('BNKJXZDY', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  perform wawis_test.expect(r->>'reason' = 'device_has_sticker' and r->>'existing_code' = 'UYE8EYCQ', 'urządzenie ma już naklejkę');
  perform wawis_test.expect(wawis_test.sticker_device('BNKJXZDY') is null, 'BNKJXZDY dalej wolna');
  -- drugi pracownik przykleja na drugie urządzenie
  r := public.qr_sticker_assign_service_device_v1423('BNKJXZDY', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
  perform wawis_test.expect((r->>'ok')::boolean, 'drugi pracownik przypisuje');
  perform wawis_test.expect(wawis_test.sticker_device('BNKJXZDY') = 'd0000000-0000-4000-8000-000000000012', 'zapis drugiego');
  -- pozycja z innej wizyty, pozycja bez urządzenia, wizyta odwołana i w Koszu
  r := public.qr_sticker_assign_service_device_v1423('CXFBEHEP', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004');
  perform wawis_test.expect(r->>'reason' = 'visit_item_not_found', 'urządzenie spoza wizyty');
  r := public.qr_sticker_assign_service_device_v1423('CXFBEHEP', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003');
  perform wawis_test.expect(r->>'reason' = 'device_not_found', 'pozycja bez urządzenia');
  r := public.qr_sticker_assign_service_device_v1423('CXFBEHEP', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000004');
  perform wawis_test.expect(r->>'reason' = 'visit_cancelled', 'wizyta odwołana');
  r := public.qr_sticker_assign_service_device_v1423('CXFBEHEP', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000005');
  perform wawis_test.expect(r->>'reason' = 'visit_not_found', 'wizyta w Koszu');
  r := public.qr_sticker_assign_service_device_v1423('CXFBEHEP', 'e0000000-0000-4000-9000-000000000009', 'f0000000-0000-4000-8000-000000000001');
  perform wawis_test.expect(r->>'reason' = 'visit_not_found', 'nieistniejąca wizyta');
  r := public.qr_sticker_assign_service_device_v1423('ABCDEFGH', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
  perform wawis_test.expect(r->>'reason' = 'unknown_code', 'obcy kod');
  perform wawis_test.expect(wawis_test.sticker_device('CXFBEHEP') is null, 'CXFBEHEP dalej wolna');
end $$;
select wawis_test.expect_error($q$select public.qr_sticker_unassign('UYE8EYCQ')$q$, '42501', 'pracownik nie zwalnia naklejki');

-- Administrator: ta sama funkcja nie wymienia naklejki (wymiana tylko świadomie w Przeglądach serwisowych)
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ declare r jsonb; begin
  r := public.qr_sticker_assign_service_device_v1423('CXFBEHEP', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  perform wawis_test.expect(r->>'reason' = 'device_has_sticker', 'admin: bez cichej wymiany');
  perform wawis_test.expect(wawis_test.sticker_device('UYE8EYCQ') = 'd0000000-0000-4000-8000-000000000011', 'naklejka bez zmian');
end $$;
reset role;
select 'PASS WAWIS 14.23 — naklejka QR podczas przeglądu: każdy pracownik, tylko wolna naklejka, tylko urządzenie z wizyty';
