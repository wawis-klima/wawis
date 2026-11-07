-- WAWIS 14.33: wzór podpisu pracownika i automatyczny podpis protokołów (data podpisu = data badania).
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
create function wawis_test.rec(p_job uuid) returns table(signature_id uuid, signed_date date) language sql stable security definer set search_path = ''
as $$ select r.signature_id, (r.signed_at at time zone 'Europe/Warsaw')::date from public.leak_test_records r where r.job_id = p_job $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Michał Testowy', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000003', 'Paweł Testowy', 'Pracownik');
insert into public.jobs(id, client, city, street, status, device_model, completed_at, completed_by, installation_date) values
  ('b0000000-0000-4000-8000-00000000000a', 'Klient A', 'Zawiercie', 'Testowa 1', 'Zakończone', 'Ukura', '2026-09-02T10:00:00Z', 'a0000000-0000-4000-8000-000000000002', '2026-09-02'),
  ('b0000000-0000-4000-8000-00000000000b', 'Klient B', 'Zawiercie', 'Testowa 2', 'Zakończone', 'Teta', '2026-09-03T10:00:00Z', 'a0000000-0000-4000-8000-000000000002', '2026-09-03'),
  ('b0000000-0000-4000-8000-00000000000e', 'Stary E', 'Zawiercie', 'Testowa 5', 'Zakończone', 'Hiro', null, null, '2026-05-05'),
  ('b0000000-0000-4000-8000-00000000000c', 'Klient C', 'Zawiercie', 'Testowa 3', 'Zakończone', 'Hiro', '2026-09-04T10:00:00Z', 'a0000000-0000-4000-8000-000000000003', '2026-09-04');

set role authenticated;
-- Bez wzoru: zapis danych nie podpisuje.
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000a', '2026-09-02', 18, 'pozytywny', null);
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 16, 'pozytywny', 'a0000000-0000-4000-8000-000000000002');
  perform wawis_test.expect((select signature_id is null from wawis_test.rec('b0000000-0000-4000-8000-00000000000a')), 'A bez wzoru niepodpisany');
end $$;

-- Michał zapisuje wzór: A (jego z aplikacji) i E (przypisany) podpisują się od razu, z datą badania; C Pawła nie.
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
do $$ begin
  perform wawis_test.expect((select count(*) from public.staff_signature_get_own_v1433()) = 0, 'brak wzoru na start');
  perform wawis_test.expect(public.staff_signature_save_own_v1433('data:image/png;base64,' || repeat('M', 300)) = 2, 'zapis wzoru podpisuje 2 protokoły');
  perform wawis_test.expect((select image_png like 'data:image/png;base64,M%' from public.staff_signature_get_own_v1433()), 'podgląd wzoru');
end $$;
select wawis_test.expect_error($q$select public.staff_signature_save_own_v1433('nie-obraz')$q$, '23514', 'tylko obraz PNG');
select wawis_test.expect_error($q$select public.leak_test_autosign_v1433('a0000000-0000-4000-8000-000000000002', null)$q$, '42501', 'funkcja wewnętrzna niedostępna');
select wawis_test.as_user(null);
select wawis_test.expect_error($q$select * from public.staff_signature_get_own_v1433()$q$, '42501', 'bez logowania');

select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ declare v_first uuid; begin
  perform wawis_test.expect((select signed_date = '2026-09-02' from wawis_test.rec('b0000000-0000-4000-8000-00000000000a')), 'A: data podpisu = data badania');
  perform wawis_test.expect((select signed_date = '2026-05-05' from wawis_test.rec('b0000000-0000-4000-8000-00000000000e')), 'E: data podpisu = data badania');
  perform wawis_test.expect((select signature_png like 'data:image/png;base64,M%' from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000e')), 'PDF: wzór Michała');
  -- Nowy protokół Michała podpisuje się przy zapisie danych; C Pawła (bez wzoru) nie.
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000b', '2026-09-03', 19, 'pozytywny', null);
  perform wawis_test.expect((select signature_id is not null and signed_date = '2026-09-03' from wawis_test.rec('b0000000-0000-4000-8000-00000000000b')), 'B podpisany przy zapisie');
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000c', '2026-09-04', 17, 'pozytywny');
  perform wawis_test.expect((select signature_id is null from wawis_test.rec('b0000000-0000-4000-8000-00000000000c')), 'C Pawła bez wzoru — niepodpisany');
  -- Zmiana daty: podpis od razu ponownie, z nową datą.
  select signature_id into v_first from wawis_test.rec('b0000000-0000-4000-8000-00000000000a');
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000a', '2026-09-05', 18, 'pozytywny', null);
  perform wawis_test.expect((select signature_id = v_first and signed_date = '2026-09-05' from wawis_test.rec('b0000000-0000-4000-8000-00000000000a')), 'zmiana daty: podpis z nową datą');
  -- Zmiana instalatora E na Pawła (bez wzoru): podpis Michała znika.
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 16, 'pozytywny', 'a0000000-0000-4000-8000-000000000003');
  perform wawis_test.expect((select signature_id is null from wawis_test.rec('b0000000-0000-4000-8000-00000000000e')), 'E u Pawła: bez podpisu Michała');
end $$;

-- Paweł zapisuje wzór: podpisują się C i E; nowy wzór Michała nie zmienia już podpisanego A.
select wawis_test.as_user('a0000000-0000-4000-8000-000000000003');
select wawis_test.expect(public.staff_signature_save_own_v1433('data:image/png;base64,' || repeat('P', 300)) = 2, 'Paweł: C i E');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
select wawis_test.expect(public.staff_signature_save_own_v1433('data:image/png;base64,' || repeat('N', 300)) = 0, 'nowy wzór Michała: nic do podpisu');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ begin
  perform wawis_test.expect((select signature_png like 'data:image/png;base64,M%' from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000a')), 'A zostaje ze starym wzorem');
  perform wawis_test.expect((select signature_png like 'data:image/png;base64,P%' from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000e')), 'E ze wzorem Pawła');
end $$;
reset role;
select 'PASS WAWIS 14.33 — wzór podpisu pracownika: automatyczny podpis własnych protokołów z datą badania';
