-- WAWIS 14.28: dane prób szczelności — tylko administrator, tylko zakończone montaże z instalatorem na liście.
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
create function wawis_test.records() returns bigint language sql stable security definer set search_path = ''
as $$ select count(*) from public.leak_test_records $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Pracownik Test', 'Pracownik');
insert into public.jobs(id, client, city, street, status, device_model, completed_at, completed_by) values
  ('b0000000-0000-4000-8000-00000000000a', 'Klient A', 'Zawiercie', 'Testowa 1', 'Zakończone', 'Ukura', '2026-05-02T10:00:00Z', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-00000000000b', 'Klient B', 'Zawiercie', 'Testowa 2', 'Zakończone', 'Teta', null, null),
  ('b0000000-0000-4000-8000-00000000000c', 'Klient C', 'Zawiercie', 'Testowa 3', 'W trakcie', 'Hiro', null, null);

set role authenticated;
-- pracownik i niezalogowany: odmowa, bez zapisu
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
select wawis_test.expect_error($q$select * from public.leak_tests_list_v1428()$q$, '42501', 'pracownik: lista');
select wawis_test.expect_error($q$select public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-02', 18, 'pozytywny')$q$, '42501', 'pracownik: zapis');
select wawis_test.expect_error($q$select * from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000a')$q$, '42501', 'pracownik: odczyt');
select wawis_test.expect_error($q$select * from public.leak_test_records$q$, '42501', 'tabela bez dostępu bezpośredniego');
select wawis_test.as_user(null);
select wawis_test.expect_error($q$select * from public.leak_tests_list_v1428()$q$, '42501', 'bez logowania');

select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ declare n int; begin
  select count(*) into n from public.leak_tests_list_v1428();
  perform wawis_test.expect(n = 1, 'lista: tylko zakończony montaż z instalatorem');
  perform wawis_test.expect((select completed_by_name from public.leak_tests_list_v1428()) = 'Pracownik Test', 'instalator z profilu');
  perform wawis_test.expect((select test_date from public.leak_tests_list_v1428()) is null, 'bez danych przed wpisaniem');
  perform wawis_test.expect(public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-02', 18, 'pozytywny'), 'zapis');
  perform wawis_test.expect(public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-03', 19.5, 'pozytywny'), 'poprawka (upsert)');
  perform wawis_test.expect(wawis_test.records() = 1, 'jeden wpis na montaż');
  perform wawis_test.expect((select temperature_c from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000a')) = 19.5, 'odczyt po poprawce');
  perform wawis_test.expect((select test_date from public.leak_tests_list_v1428()) = date '2026-05-03', 'lista z danymi');
  perform wawis_test.expect(public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000c', '2026-05-02', 18, 'pozytywny') = false, 'montaż w trakcie: bez zapisu');
  perform wawis_test.expect(wawis_test.records() = 1, 'w trakcie nie zapisany');
end $$;
select wawis_test.expect_error($q$select public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-02', 18, 'dobry')$q$, '23514', 'wynik spoza listy');
select wawis_test.expect_error($q$select public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-02', 99, 'pozytywny')$q$, '23514', 'temperatura poza zakresem');
reset role;
-- usunięcie montażu usuwa dane próby
delete from public.jobs where id = 'b0000000-0000-4000-8000-00000000000a';
do $$ begin perform wawis_test.expect(wawis_test.records() = 0, 'kaskada przy usunięciu montażu'); end $$;
select 'PASS WAWIS 14.28 — dane prób szczelności: tylko administrator, zakończone montaże z instalatorem, poprawka bez duplikatu';
