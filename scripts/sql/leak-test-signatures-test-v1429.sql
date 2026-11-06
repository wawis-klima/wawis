-- WAWIS 14.29: podpis składa wyłącznie sam instalator, tylko na swoich, widzianych protokołach; zmiana danych usuwa podpis.
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
create function wawis_test.signatures() returns bigint language sql stable security definer set search_path = ''
as $$ select count(*) from public.leak_test_signatures $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Michał Testowy', 'Pracownik'),
  ('a0000000-0000-4000-8000-000000000003', 'Paweł Testowy', 'Pracownik');
insert into public.jobs(id, client, city, street, status, device_model, completed_at, completed_by) values
  ('b0000000-0000-4000-8000-00000000000a', 'Klient A', 'Zawiercie', 'Testowa 1', 'Zakończone', 'Ukura', '2026-05-02T10:00:00Z', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-00000000000b', 'Klient B', 'Zawiercie', 'Testowa 2', 'Zakończone', 'Teta', '2026-05-03T10:00:00Z', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-00000000000c', 'Klient C', 'Zawiercie', 'Testowa 3', 'Zakończone', 'Hiro', '2026-05-04T10:00:00Z', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-00000000000d', 'Klient D', 'Zawiercie', 'Testowa 4', 'Zakończone', 'Hiro', '2026-05-05T10:00:00Z', 'a0000000-0000-4000-8000-000000000002');

set role authenticated;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-02', 18, 'pozytywny');
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000b', '2026-05-03', 19, 'pozytywny');
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000c', '2026-05-04', 17, 'pozytywny');
  -- D bez danych próby — nie ma go na liście do podpisu.
end $$;
-- administrator nie podpisuje za instalatora (jego lista jest pusta, jego podpis nie trafia na cudze)
do $$ begin
  perform wawis_test.expect((select count(*) from public.leak_test_pending_own_v1429()) = 0, 'admin: brak własnych protokołów');
  perform wawis_test.expect(public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000a']::uuid[], 'data:image/png;base64,' || repeat('A', 300)) = 0, 'admin nie podpisze protokołu Michała');
  perform wawis_test.expect(not wawis_test.signed('b0000000-0000-4000-8000-00000000000a'), 'A nadal niepodpisany');
end $$;
select wawis_test.as_user(null);
select wawis_test.expect_error($q$select * from public.leak_test_pending_own_v1429()$q$, '42501', 'bez logowania');

-- Michał: widzi A i B (nie C Pawła, nie D bez danych), podpisuje tylko zatwierdzone A — nawet gdy poda cudze C
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
do $$ begin
  perform wawis_test.expect((select count(*) from public.leak_test_pending_own_v1429()) = 2, 'Michał: 2 do podpisu');
  perform wawis_test.expect((select bool_and(not has_saved_signature) from public.leak_test_pending_own_v1429()), 'bez zapisanego wzoru');
  perform wawis_test.expect_error($q$select public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000a']::uuid[], null)$q$, '22023', 'bez wzoru nie podpisze zapisanym');
  perform wawis_test.expect(public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000a','b0000000-0000-4000-8000-00000000000c']::uuid[], 'data:image/png;base64,' || repeat('B', 300)) = 1, 'podpisuje tylko swój A');
  perform wawis_test.expect(wawis_test.signed('b0000000-0000-4000-8000-00000000000a'), 'A podpisany');
  perform wawis_test.expect(not wawis_test.signed('b0000000-0000-4000-8000-00000000000c'), 'C Pawła niepodpisany');
  perform wawis_test.expect(not wawis_test.signed('b0000000-0000-4000-8000-00000000000b'), 'B niezatwierdzony — niepodpisany');
  perform wawis_test.expect((select has_saved_signature from public.leak_test_pending_own_v1429() limit 1), 'wzór zapisany');
  perform wawis_test.expect_error($q$select public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000b']::uuid[], 'nie-obraz')$q$, '23514', 'tylko obraz PNG');
  perform wawis_test.expect(public.leak_test_sign_own_v1429(array['b0000000-0000-4000-8000-00000000000b']::uuid[], null) = 1, 'B zapisanym wzorem');
  perform wawis_test.expect(wawis_test.signatures() = 1, 'jeden wzór — bez nowego wpisu');
  perform wawis_test.expect((select count(*) from public.leak_test_pending_own_v1429()) = 0, 'nic do podpisu');
end $$;

-- Administrator: PDF dostaje podpis; zmiana danych usuwa podpis, zapis bez zmian go zostawia
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
do $$ begin
  perform wawis_test.expect((select signature_png from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000a')) like 'data:image/png;base64,B%', 'podpis w danych PDF');
  perform wawis_test.expect((select signed_name from public.leak_test_get_v1428('b0000000-0000-4000-8000-00000000000a')) = 'Michał Testowy', 'nazwisko podpisującego');
  perform wawis_test.expect((select count(*) from public.leak_tests_list_v1428() where signed_at is not null) = 2, 'lista: 2 podpisane');
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000b', '2026-05-03', 19, 'pozytywny');
  perform wawis_test.expect(wawis_test.signed('b0000000-0000-4000-8000-00000000000b'), 'zapis bez zmian zostawia podpis');
  perform public.leak_test_save_v1428('b0000000-0000-4000-8000-00000000000a', '2026-05-02', 21, 'pozytywny');
  perform wawis_test.expect(not wawis_test.signed('b0000000-0000-4000-8000-00000000000a'), 'zmiana temperatury usuwa podpis');
end $$;
select wawis_test.expect_error($q$select * from public.leak_test_signatures$q$, '42501', 'wzory podpisów bez dostępu bezpośredniego');
reset role;
select 'PASS WAWIS 14.29 — podpis protokołów szczelności: tylko sam instalator, tylko swoje zatwierdzone protokoły, zmiana danych usuwa podpis';
