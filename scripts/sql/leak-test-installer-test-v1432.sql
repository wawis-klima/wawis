-- WAWIS 14.32: instalator przypisany przez administratora do starych montaży (bez jobs.completed_by).
-- Montaż bez zmian; protokół trafia do podpisu tylko przypisanemu instalatorowi; zmiana instalatora usuwa podpis.
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
create function wawis_test.signed(p_job uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select signature_id is not null and signed_at is not null from public.leak_test_records where job_id = p_job $$;
create function wawis_test.job_completed_by(p_job uuid) returns uuid language sql stable security definer set search_path = ''
as $$ select completed_by from public.jobs where id = p_job $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Michał Testowy', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000003', 'Paweł Testowy', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000004', 'Klient Konto', 'klient');
insert into public.jobs(id, client, city, street, status, device_model, completed_at, completed_by, installation_date) values
  ('b0000000-0000-4000-8000-00000000000a', 'Klient A', 'Zawiercie', 'Testowa 1', 'Zakończone', 'Ukura', '2026-09-02T10:00:00Z', 'a0000000-0000-4000-8000-000000000002', '2026-09-02'),
  ('b0000000-0000-4000-8000-00000000000e', 'Stary E', 'Zawiercie', 'Testowa 5', 'Zakończone', 'Hiro', null, null, '2026-05-05'),
  ('b0000000-0000-4000-8000-00000000000f', 'Otwarty F', 'Zawiercie', 'Testowa 6', 'W trakcie', 'Hiro', null, null, '2026-05-06');

set role authenticated;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ begin
  -- lista: wszystkie zakończone (także bez instalatora), bez otwartych
  perform wawis_test.expect((select count(*) from public.leak_tests_list_v1428()) = 2, 'lista: 2 zakończone');
  perform wawis_test.expect((select installer_id is null and not installer_from_app and installation_date = '2026-05-05'
    from public.leak_tests_list_v1428() where job_id = 'b0000000-0000-4000-8000-00000000000e'), 'E bez instalatora, z datą montażu');
  perform wawis_test.expect((select installer_from_app and installer_name = 'Michał Testowy'
    from public.leak_tests_list_v1428() where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'A: instalator z aplikacji');
  perform wawis_test.expect((select count(*) from public.leak_test_installers_v1432()) = 3, 'lista instalatorów bez konta klienta');
end $$;
select wawis_test.expect_error($q$select public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny', null)$q$, '22023', 'E: instalator wymagany');
select wawis_test.expect_error($q$select public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny', 'a0000000-0000-4000-8000-000000000004')$q$, '22023', 'E: konto klienta nie jest instalatorem');
do $$ begin
  perform wawis_test.expect(public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny', 'a0000000-0000-4000-8000-000000000003'), 'E zapisany z Pawłem');
  perform wawis_test.expect(not public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000f', '2026-05-06', 18, 'pozytywny', 'a0000000-0000-4000-8000-000000000003'), 'F otwarty — bez zapisu');
  -- A ma instalatora z aplikacji: przypisanie innego jest ignorowane
  perform wawis_test.expect(public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000a', '2026-09-02', 17, 'pozytywny', 'a0000000-0000-4000-8000-000000000003'), 'A zapisany');
  perform wawis_test.expect((select installer_id = 'a0000000-0000-4000-8000-000000000002' from public.leak_tests_list_v1428() where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'A nadal Michała');
  perform wawis_test.expect((select installer_name = 'Paweł Testowy' from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000e')), 'PDF: instalator E');
  perform wawis_test.expect(wawis_test.job_completed_by('b0000000-0000-4000-8000-00000000000e') is null, 'montaż E bez zmian');
end $$;

-- Paweł widzi i podpisuje E; Michał widzi tylko A
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
do $$ begin
  perform wawis_test.expect((select array_agg(job_id::text order by job_id) from public.leak_test_pending_own_v1429()) = array['b0000000-0000-4000-8000-00000000000a'], 'Michał: tylko A');
  perform wawis_test.expect(public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000e']::uuid[], 'data:image/png;base64,' || repeat('M', 300)) = 0, 'Michał nie podpisze E Pawła');
end $$;
select wawis_test.expect_error($q$select * from public.leak_test_installers_v1432()$q$, '42501', 'pracownik: bez listy instalatorów');
select wawis_test.expect_error($q$select public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny', 'a0000000-0000-4000-8000-000000000002')$q$, '42501', 'pracownik nie przypisuje');
select wawis_test.as_user('a0000000-0000-4000-8000-000000000003');
do $$ begin
  perform wawis_test.expect((select count(*) from public.leak_test_pending_own_v1429() where job_id = 'b0000000-0000-4000-8000-00000000000e') = 1, 'Paweł: E do podpisu');
  perform wawis_test.expect(public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000e']::uuid[], 'data:image/png;base64,' || repeat('P', 300)) = 1, 'Paweł podpisuje E');
  perform wawis_test.expect(wawis_test.signed('b0000000-0000-4000-8000-00000000000e'), 'E podpisany');
end $$;

-- Administrator: zapis bez zmian zostawia podpis; stara funkcja 14.28 nie rusza instalatora; zmiana instalatora usuwa podpis
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny', 'a0000000-0000-4000-8000-000000000003');
  perform wawis_test.expect(wawis_test.signed('b0000000-0000-4000-8000-00000000000e'), 'bez zmian — podpis zostaje');
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny');
  perform wawis_test.expect(wawis_test.signed('b0000000-0000-4000-8000-00000000000e'), '14.28 bez zmian — podpis zostaje');
  perform wawis_test.expect((select installer_name = 'Paweł Testowy' from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000e')), '14.28 nie zmienia instalatora');
  perform public.leak_test_save_v1432('b0000000-0000-4000-8000-00000000000e', '2026-05-05', 18, 'pozytywny', 'a0000000-0000-4000-8000-000000000002');
  perform wawis_test.expect(not wawis_test.signed('b0000000-0000-4000-8000-00000000000e'), 'zmiana instalatora usuwa podpis');
end $$;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
select wawis_test.expect((select count(*) from public.leak_test_pending_own_v1429() where job_id = 'b0000000-0000-4000-8000-00000000000e') = 1, 'Michał: E teraz jego');
reset role;
select 'PASS WAWIS 14.32 — instalator przypisany do starych montaży: montaż bez zmian, podpis tylko przypisanego, zmiana instalatora usuwa podpis';
