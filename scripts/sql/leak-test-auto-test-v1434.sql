-- WAWIS 14.34: protokół szczelności tworzy się sam przy zakończeniu montażu; temperatura dociągana w tle.
create schema wawis_test;
grant usage on schema wawis_test to authenticated, service_role;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;
create function wawis_test.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAIL %: oczekiwano %, otrzymano % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %: operacja przeszła, a powinna zostać odrzucona', p_label;
end $$;
create function wawis_test.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false) $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Michał Testowy', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000003', 'Paweł Testowy', 'Pracownik');
insert into public.leak_test_signatures(id, profile_id, confirmed_name, image_png) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Michał', 'data:image/png;base64,' || repeat('M', 300));
insert into public.jobs(id, client, city, street, status, device_model) values
  ('b0000000-0000-4000-8000-00000000000a', 'Klient A', 'Zawiercie', 'Testowa 1', 'W trakcie', 'Ukura'),
  ('b0000000-0000-4000-8000-00000000000b', 'Klient B', 'Zawiercie', 'Testowa 2', 'W trakcie', 'Teta'),
  ('b0000000-0000-4000-8000-00000000000c', 'Klient C', 'Zawiercie', 'Testowa 3', 'W trakcie', 'Hiro'),
  ('b0000000-0000-4000-8000-00000000000d', 'Klient D', 'Zawiercie', 'Testowa 4', 'W trakcie', 'Hiro');

-- Zakończenie przez Michała (wzór jest): wpis z datą zakończenia w czasie polskim (00:30 08.11 PL), podpisany, bez temperatury.
update public.jobs set status = 'Zakończone', completed_by = 'a0000000-0000-4000-8000-000000000002', completed_at = '2026-11-07T23:30:00Z'
 where id = 'b0000000-0000-4000-8000-00000000000a';
select wawis_test.expect((select test_date = '2026-11-08' and result = 'pozytywny' and temperature_c is null and signature_id = 'c0000000-0000-4000-8000-000000000001'
  and (signed_at at time zone 'Europe/Warsaw')::date = '2026-11-08' from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'A: protokół sam, podpisany, data zakończenia');
-- Zmiana innych pól zakończonego montażu i ponowne „zakończenie”: wpis bez zmian.
update public.leak_test_records set temperature_c = 9 where job_id = 'b0000000-0000-4000-8000-00000000000a';
update public.jobs set status = 'W trakcie' where id = 'b0000000-0000-4000-8000-00000000000a';
update public.jobs set status = 'Zakończone', completed_at = '2026-11-20T10:00:00Z' where id = 'b0000000-0000-4000-8000-00000000000a';
select wawis_test.expect((select test_date = '2026-11-08' and temperature_c = 9 from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'A: istniejący wpis bez zmian');
-- Bez instalatora: bez wpisu.
update public.jobs set status = 'Zakończone' where id = 'b0000000-0000-4000-8000-00000000000b';
select wawis_test.expect(not exists (select 1 from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000b'), 'B bez instalatora: bez wpisu');
-- Paweł bez wzoru: wpis niepodpisany; po złożeniu wzoru podpisany.
update public.jobs set status = 'Zakończone', completed_by = 'a0000000-0000-4000-8000-000000000003', completed_at = '2026-11-07T10:00:00Z'
 where id = 'b0000000-0000-4000-8000-00000000000c';
select wawis_test.expect((select signature_id is null and test_date = '2026-11-07' from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000c'), 'C: czeka na wzór');
-- Nowy montaż od razu zakończony (insert).
insert into public.jobs(id, client, city, street, status, device_model, completed_by, completed_at) values
  ('b0000000-0000-4000-8000-00000000000e', 'Klient E', 'Zawiercie', 'Testowa 5', 'Zakończone', 'Hiro', 'a0000000-0000-4000-8000-000000000002', '2026-11-06T10:00:00Z');
select wawis_test.expect((select signature_id is not null and test_date = '2026-11-06' from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000e'), 'E: insert zakończonego');

-- Awaria zakładania protokołu NIE blokuje zakończenia montażu.
create function wawis_test.boom() returns trigger language plpgsql as $$ begin raise exception 'awaria testowa'; end $$;
create trigger wawis_test_boom before insert on public.leak_test_records for each row execute function wawis_test.boom();
update public.jobs set status = 'Zakończone', completed_by = 'a0000000-0000-4000-8000-000000000002', completed_at = now() where id = 'b0000000-0000-4000-8000-00000000000d';
select wawis_test.expect((select status = 'Zakończone' from public.jobs where id = 'b0000000-0000-4000-8000-00000000000d'), 'D: montaż zakończony mimo awarii');
select wawis_test.expect(not exists (select 1 from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000d'), 'D: bez wpisu po awarii');
drop trigger wawis_test_boom on public.leak_test_records;

set role authenticated;
-- Temperatura w tle: instalator swojego, nie cudzego; tylko gdy brak; zakres; podpis zostaje.
select wawis_test.as_user('a0000000-0000-4000-8000-000000000003');
select wawis_test.expect(not public.leak_test_set_temperature_v1434('b0000000-0000-4000-8000-00000000000e', 7), 'Paweł: nie cudzy');
select wawis_test.expect(public.leak_test_set_temperature_v1434('b0000000-0000-4000-8000-00000000000c', 6.44), 'Paweł: swój');
select wawis_test.expect(not public.leak_test_set_temperature_v1434('b0000000-0000-4000-8000-00000000000c', 12), 'drugi raz: bez nadpisania');
select wawis_test.expect_error($q$select public.leak_test_set_temperature_v1434('b0000000-0000-4000-8000-00000000000c', 60)$q$, '22023', 'poza zakresem');
select wawis_test.expect(public.staff_signature_save_own_v1433('data:image/png;base64,' || repeat('P', 300)) = 1, 'Paweł składa wzór: C podpisany');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
select wawis_test.expect(public.leak_test_set_temperature_v1434('b0000000-0000-4000-8000-00000000000e', 7.2), 'administrator: E');
select wawis_test.expect((select temperature_c = 7.2 and signed_at is not null from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000e')), 'E: temperatura, podpis zostaje');
select wawis_test.expect((select temperature_c = 6.4 and signed_at is not null from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000c')), 'C: 6,4 i podpis');
-- Podgląd wzorów (administrator): Michał i Paweł ze wzorem, administrator bez; pracownik nie ma dostępu.
select wawis_test.expect((select count(*) from public.staff_signatures_admin_list_v1434()) = 3, 'lista: wszyscy pracownicy');
select wawis_test.expect((select count(*) from public.staff_signatures_admin_list_v1434() where image_png is not null) = 2, 'lista: 2 wzory');
select wawis_test.expect((select image_png like 'data:image/png;base64,P%' from public.staff_signatures_admin_list_v1434() where full_name = 'Paweł Testowy'), 'najnowszy wzór Pawła');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000003');
select wawis_test.expect_error($q$select * from public.staff_signatures_admin_list_v1434()$q$, '42501', 'pracownik: bez podglądu cudzych wzorów');
select wawis_test.as_user(null);
select wawis_test.expect_error($q$select public.leak_test_set_temperature_v1434('b0000000-0000-4000-8000-00000000000c', 5)$q$, '42501', 'bez logowania');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
select wawis_test.expect_error($q$select public.leak_test_on_job_completed_v1434()$q$, '42501', 'funkcja wyzwalacza niedostępna');
reset role;
select 'PASS WAWIS 14.34 — protokół szczelności przy zakończeniu montażu: sam, podpisany, data zakończenia; awaria nie blokuje zakończenia; temperatura w tle';
