-- WAWIS 14.24: naklejka QR wymagana do zakończenia montażu przez pracownika; administrator może zakończyć.
create schema wawis_test;
grant usage on schema wawis_test to authenticated, service_role;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;
create function wawis_test.expect_error_like(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = '23514' and sqlerrm like p_like then return; end if;
    raise exception 'FAIL %: oczekiwano 23514 „%”, otrzymano % (%)', p_label, p_like, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %: zakończenie przeszło, a powinno zostać zablokowane', p_label;
end $$;
create function wawis_test.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false) $$;
create function wawis_test.status(p_job uuid) returns text language sql stable security definer
set search_path = '' as $$ select status from public.jobs where id = p_job $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Pracownik Test', 'Pracownik');
-- Montaż A: 2 urządzenia (druga linia = urządzenie 2), komplet tabliczek i protokół.
-- Montaż B: 1 urządzenie, bez naklejki — zakończy administrator.
-- Montaż C: 2 urządzenia, urządzenie 2 nie zapisane w devices (nie da się przypisać naklejki).
insert into public.jobs(id, client, city, street, status, device_model, device_serial_number) values
  ('b0000000-0000-4000-8000-00000000000a', 'Klient A', 'Zawiercie', 'Testowa 1', 'W trakcie', E'Ukura\nHiro', E'SN-A1\nSN-A2'),
  ('b0000000-0000-4000-8000-00000000000b', 'Klient B', 'Zawiercie', 'Testowa 2', 'W trakcie', 'Teta', 'SN-B1'),
  ('b0000000-0000-4000-8000-00000000000c', 'Klient C', 'Zawiercie', 'Testowa 3', 'W trakcie', E'Ukura\nHiro', E'SN-C1\nSN-C2');
insert into public.devices values
  ('d0000000-0000-4000-8000-0000000000a1', null, 'Ukura', 'SN-A1', '2026-11-01', 'b0000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-0000000000a2', null, 'Hiro', 'SN-A2', '2026-11-01', 'b0000000-0000-4000-8000-00000000000a::device-2'),
  ('d0000000-0000-4000-8000-0000000000b1', null, 'Teta', 'SN-B1', '2026-11-01', 'b0000000-0000-4000-8000-00000000000b'),
  ('d0000000-0000-4000-8000-0000000000c1', null, 'Ukura', 'SN-C1', '2026-11-01', 'b0000000-0000-4000-8000-00000000000c');
insert into public.photos(job_id, photo_kind, device_index, unit_ref, storage_path)
select j, 'nameplate', d, u, 'x/' || j || d || u
from unnest(array['b0000000-0000-4000-8000-00000000000a','b0000000-0000-4000-8000-00000000000b','b0000000-0000-4000-8000-00000000000c']::uuid[]) j,
     generate_series(1, 2) d, unnest(array['jz','jw-1']) u;
insert into public.job_protocols
select j, now(), 100, 'p/' || j
from unnest(array['b0000000-0000-4000-8000-00000000000a','b0000000-0000-4000-8000-00000000000b','b0000000-0000-4000-8000-00000000000c']::uuid[]) j;
insert into storage.objects select 'job-protocols', storage_path from public.job_protocols;
update public.qr_stickers set device_id = 'd0000000-0000-4000-8000-0000000000a1' where code = 'UYE8EYCQ';
update public.qr_stickers set device_id = 'd0000000-0000-4000-8000-0000000000c1' where code = 'BNKJXZDY';

do $$ begin
  perform wawis_test.expect(private.job_missing_qr_stickers_v1424('b0000000-0000-4000-8000-00000000000a', E'Ukura\nHiro', E'SN-A1\nSN-A2') = array[2], 'A: brak naklejki na urządzeniu 2');
  perform wawis_test.expect(private.job_missing_qr_stickers_v1424('b0000000-0000-4000-8000-00000000000b', 'Teta', 'SN-B1') = array[1], 'B: brak na urządzeniu 1');
  perform wawis_test.expect(private.job_missing_qr_stickers_v1424('b0000000-0000-4000-8000-00000000000b', '', '') = array[]::integer[], 'bez urządzeń: bez wymogu');
  perform wawis_test.expect(private.job_missing_qr_stickers_v1424('b0000000-0000-4000-8000-00000000000a', E'JW1: Ukura | JW2: Hiro | JZ: Out', E'JW1: 1 | JW2: 2 | JZ: 3') = array[]::integer[], 'multi split (1 urządzenie) z naklejką = komplet');
end $$;

set role authenticated;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
-- Pracownik: brak naklejki na urządzeniu 2 → blokada, status bez zmian
select wawis_test.expect_error_like($q$update public.jobs set status = 'Zakończone' where id = 'b0000000-0000-4000-8000-00000000000a'$q$, 'job_qr_sticker_required: 2', 'A: pracownik zablokowany');
do $$ begin perform wawis_test.expect(wawis_test.status('b0000000-0000-4000-8000-00000000000a') = 'W trakcie', 'A: status bez zmian'); end $$;
-- Montaż C: urządzenie 2 niezapisane → blokada
select wawis_test.expect_error_like($q$update public.jobs set status = 'Zakończone' where id = 'b0000000-0000-4000-8000-00000000000c'$q$, 'job_qr_sticker_required: 2', 'C: urządzenie bez wpisu w devices');
-- Zwykła edycja bez zmiany statusu działa bez naklejek
update public.jobs set street = 'Testowa 2a' where id = 'b0000000-0000-4000-8000-00000000000b';
reset role;
update public.qr_stickers set device_id = 'd0000000-0000-4000-8000-0000000000a2' where code = 'CXFBEHEP';
set role authenticated;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
update public.jobs set status = 'Zakończone' where id = 'b0000000-0000-4000-8000-00000000000a';
do $$ begin perform wawis_test.expect(wawis_test.status('b0000000-0000-4000-8000-00000000000a') = 'Zakończone', 'A: pracownik kończy z kompletem naklejek'); end $$;
-- Administrator: kończy montaż B bez naklejki (decyzja właściciela — jak przy tabliczkach)
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
update public.jobs set status = 'Zakończone' where id = 'b0000000-0000-4000-8000-00000000000b';
do $$ begin perform wawis_test.expect(wawis_test.status('b0000000-0000-4000-8000-00000000000b') = 'Zakończone', 'B: administrator kończy bez naklejki'); end $$;
-- Tabliczki nadal wymagane (ochrona z 10.88 bez zmian): usunięta tabliczka blokuje także administratora
reset role;
delete from public.photos where job_id = 'b0000000-0000-4000-8000-00000000000c' and device_index = 1 and unit_ref = 'jz';
set role authenticated;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
select wawis_test.expect_error_like($q$update public.jobs set status = 'Zakończone' where id = 'b0000000-0000-4000-8000-00000000000c'$q$, 'job_nameplates_incomplete%', 'C: tabliczki dalej pilnowane');
reset role;
select 'PASS WAWIS 14.24 — naklejka QR wymagana do zakończenia montażu przez pracownika; administrator może zakończyć; tabliczki i protokół bez zmian';
