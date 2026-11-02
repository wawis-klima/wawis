-- WAWIS 14.08: test naklejek QR po migracji (jednorazowa baza). Wywołania jako authenticated z auth.uid().
create schema wawis_test;
grant usage on schema wawis_test to authenticated, service_role;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;
create function wawis_test.expect_error(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
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

-- dane fikcyjne
insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Pracownik Test', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000003', 'Bez roli', 'Gość');
insert into public.contractors values ('c0000000-0000-4000-8000-000000000001', 'KLIENT TEST', null, 'Testowo', 'Fikcyjna 1', '000000000');
insert into public.jobs values
  ('b0000000-0000-4000-8000-000000000001', 'Klient Montaż', null, 'Zawiercie', 'Testowa 1', 'W trakcie'),
  ('b0000000-0000-4000-8000-000000000002', 'Klient Zakończony', null, 'Zawiercie', 'Testowa 2', 'Zakończone');
insert into public.devices values
  ('d0000000-0000-4000-8000-000000000001', null, 'Ukura', 'SN-1', '2026-11-01', 'b0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002', null, 'Hiro', 'SN-2', '2026-11-01', 'b0000000-0000-4000-8000-000000000001::device-2'),
  ('d0000000-0000-4000-8000-000000000003', null, 'Teta', 'SN-3', '2026-10-01', 'b0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'Stary', 'SN-4', '2020-05-01', null);

-- import kodów: 324, wszystkie wolne, alfabet bez znaków mylących
do $$ begin
  perform wawis_test.expect((select count(*) from public.qr_stickers) = 324, 'import 324 kodów');
  perform wawis_test.expect((select count(*) from public.qr_stickers where device_id is not null) = 0, 'kody wolne po imporcie');
  perform wawis_test.expect((select count(distinct batch) from public.qr_stickers) = 2, 'dwie partie');
end $$;

set role authenticated;

-- anon / bez roli: brak dostępu
select wawis_test.as_user(null);
select wawis_test.expect_error($q$select public.qr_sticker_lookup('UYE8EYCQ')$q$, '42501', 'lookup bez logowania');
select wawis_test.expect_error($q$select * from public.qr_stickers$q$, '42501', 'tabela niedostępna bezpośrednio');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000003');
select wawis_test.expect_error($q$select public.qr_sticker_lookup('UYE8EYCQ')$q$, '42501', 'lookup bez roli');

-- pracownik: lookup i przypisanie przy montażu
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
do $$ declare r jsonb; begin
  r := public.qr_sticker_lookup('uye8-eycq');
  perform wawis_test.expect(r->>'status' = 'free' and r->>'code' = 'UYE8EYCQ', 'lookup wolnej naklejki (małe litery, myślnik)');
  r := public.qr_sticker_lookup('ABCDEFGH');
  perform wawis_test.expect(r->>'status' = 'unknown', 'obcy kod = unknown');
  r := public.qr_sticker_lookup('https://x');
  perform wawis_test.expect(r->>'status' = 'invalid', 'zły format = invalid');

  r := public.qr_sticker_assign_job_device('UYE8-EYCQ', 'b0000000-0000-4000-8000-000000000001', 1);
  perform wawis_test.expect((r->>'ok')::boolean, 'pracownik przypisuje do urządzenia 1');
  perform wawis_test.expect(wawis_test.sticker_device('UYE8EYCQ') = 'd0000000-0000-4000-8000-000000000001', 'zapis w bazie');
  r := public.qr_sticker_assign_job_device('UYE8EYCQ', 'b0000000-0000-4000-8000-000000000001', 1);
  perform wawis_test.expect((r->>'ok')::boolean and (r->>'already')::boolean, 'ponowne przypisanie tej samej = bez zmian');
  perform wawis_test.expect(wawis_test.events('UYE8EYCQ') = 1, 'jedno zdarzenie');

  -- ta sama naklejka na inne urządzenie: odmowa dla pracownika
  r := public.qr_sticker_assign_job_device('UYE8EYCQ', 'b0000000-0000-4000-8000-000000000001', 2);
  perform wawis_test.expect(r->>'reason' = 'sticker_taken' and (r->>'can_replace')::boolean = false, 'naklejka zajęta');
  perform wawis_test.expect(r->'device'->>'device_index' = '1', 'informacja, gdzie przypisana');
  -- druga naklejka na to samo urządzenie: odmowa
  r := public.qr_sticker_assign_job_device('BNKJXZDY', 'b0000000-0000-4000-8000-000000000001', 1);
  perform wawis_test.expect(r->>'reason' = 'device_has_sticker' and r->>'existing_code' = 'UYE8EYCQ'
    and r->>'target_device_id' = 'd0000000-0000-4000-8000-000000000001', 'urządzenie ma już naklejkę');
  -- multi: urządzenie 2
  r := public.qr_sticker_assign_job_device('BNKJXZDY', 'b0000000-0000-4000-8000-000000000001', 2);
  perform wawis_test.expect((r->>'ok')::boolean, 'urządzenie 2');
  -- niezapisane urządzenie 3
  r := public.qr_sticker_assign_job_device('CXFBEHEP', 'b0000000-0000-4000-8000-000000000001', 3);
  perform wawis_test.expect(r->>'reason' = 'device_not_saved', 'brak urządzenia 3');
  r := public.qr_sticker_assign_job_device('ZZZZZZZZ', 'b0000000-0000-4000-8000-000000000001', 3);
  perform wawis_test.expect(r->>'reason' = 'device_not_saved', 'brak urządzenia przed kodem');
  r := public.qr_sticker_assign_job_device('ZZZZZZZZ', 'b0000000-0000-4000-8000-000000000001', 2);
  perform wawis_test.expect(r->>'reason' = 'unknown_code', 'obcy kod odrzucony');

  -- lista naklejek montażu
  perform wawis_test.expect((select count(*) from public.qr_stickers_for_job('b0000000-0000-4000-8000-000000000001')) = 2, 'lista naklejek montażu');
  perform wawis_test.expect((select code from public.qr_stickers_for_job('b0000000-0000-4000-8000-000000000001') where device_index = 2) = 'BNKJXZDY', 'indeks urządzenia 2');
  -- lookup przypisanej
  r := public.qr_sticker_lookup('BNKJ-XZDY');
  perform wawis_test.expect(r->>'status' = 'assigned' and r->'device'->>'job_id' = 'b0000000-0000-4000-8000-000000000001'
    and r->'device'->>'device_index' = '2' and r->'device'->>'client' = 'Klient Montaż', 'lookup przypisanej');
end $$;
select wawis_test.expect_error($q$select public.qr_sticker_assign_job_device('CXFBEHEP', 'b0000000-0000-4000-8000-000000000002', 1)$q$, '42501', 'pracownik: zakończony montaż');
select wawis_test.expect_error($q$select public.qr_sticker_assign_device('CXFBEHEP', 'd0000000-0000-4000-8000-000000000004')$q$, '42501', 'pracownik: przypisanie z listy urządzeń');
select wawis_test.expect_error($q$select public.qr_sticker_unassign('UYE8EYCQ')$q$, '42501', 'pracownik: zwolnienie');
do $$ begin
  perform wawis_test.expect((select count(*) from public.qr_stickers_for_devices(array['d0000000-0000-4000-8000-000000000001']::uuid[])) = 0, 'pracownik nie widzi listy urządzeń');
end $$;

-- administrator: serwis (starsze urządzenie), przepisanie, zwolnienie
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ declare r jsonb; begin
  r := public.qr_sticker_assign_device('CXFB-EHEP', 'd0000000-0000-4000-8000-000000000004');
  perform wawis_test.expect((r->>'ok')::boolean, 'admin przypisuje do starszego urządzenia');
  r := public.qr_sticker_lookup('CXFBEHEP');
  perform wawis_test.expect(r->'device'->>'client' = 'KLIENT TEST' and r->'device'->>'job_id' is null
    and r->'device'->>'contractor_id' = 'c0000000-0000-4000-8000-000000000001', 'lookup starszego urządzenia');
  -- admin, zakończony montaż
  r := public.qr_sticker_assign_job_device('S2A7KTAV', 'b0000000-0000-4000-8000-000000000002', 1);
  perform wawis_test.expect((r->>'ok')::boolean, 'admin: zakończony montaż');
  -- przepisanie bez potwierdzenia: odmowa z can_replace
  r := public.qr_sticker_assign_device('UYE8EYCQ', 'd0000000-0000-4000-8000-000000000003');
  perform wawis_test.expect(r->>'reason' = 'sticker_taken' and (r->>'can_replace')::boolean, 'admin bez potwierdzenia');
  -- wymiana uszkodzonej naklejki: nowa na urządzenie z naklejką
  r := public.qr_sticker_assign_device('EGNBZQ2N', 'd0000000-0000-4000-8000-000000000001', true);
  perform wawis_test.expect((r->>'ok')::boolean and r->>'replaced_code' = 'UYE8EYCQ', 'wymiana naklejki');
  perform wawis_test.expect(wawis_test.sticker_device('UYE8EYCQ') is null, 'stara naklejka zwolniona');
  -- przepisanie zajętej naklejki
  r := public.qr_sticker_assign_device('EGNBZQ2N', 'd0000000-0000-4000-8000-000000000002', true);
  perform wawis_test.expect((r->>'ok')::boolean and r->>'previous_device_id' = 'd0000000-0000-4000-8000-000000000001'
    and r->>'replaced_code' = 'BNKJXZDY', 'przepisanie na urządzenie 2 (zwalnia BNKJ)');
  perform wawis_test.expect(wawis_test.sticker_device('BNKJXZDY') is null and wawis_test.sticker_device('EGNBZQ2N') = 'd0000000-0000-4000-8000-000000000002', 'stan po przepisaniu');
  r := public.qr_sticker_unassign('EGNB-ZQ2N');
  perform wawis_test.expect((r->>'ok')::boolean and wawis_test.sticker_device('EGNBZQ2N') is null, 'zwolnienie');
  perform wawis_test.expect(wawis_test.events('EGNBZQ2N') = 3, 'historia zdarzeń: assign, reassign, unassign');
  perform wawis_test.expect((select count(*) from public.qr_stickers_for_devices(array['d0000000-0000-4000-8000-000000000004']::uuid[])) = 1, 'admin: lista dla urządzeń');
end $$;

-- usunięcie urządzenia (np. z montażu) zwalnia naklejkę, nie blokuje usunięcia
reset role;
delete from public.devices where id = 'd0000000-0000-4000-8000-000000000004';
do $$ begin
  perform wawis_test.expect(wawis_test.sticker_device('CXFBEHEP') is null, 'usunięte urządzenie zwalnia naklejkę');
end $$;
-- jedna naklejka na urządzenie wymuszona też w bazie
do $$ begin
  begin
    update public.qr_stickers set device_id = 'd0000000-0000-4000-8000-000000000003' where code = 'P6PM8JBE';
    raise exception 'FAIL unikalność urządzenia';
  exception when unique_violation then null;
  end;
end $$;
select 'WAWIS 14.08 QR stickers SQL: PASS';
