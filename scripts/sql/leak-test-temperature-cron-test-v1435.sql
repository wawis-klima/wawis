-- WAWIS 14.35: temperatura protokołu uzupełniana przez serwer (kolejka + pg_net, atrapa odpowiedzi).
create schema wawis_test;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;
create function wawis_test.respond(p_url_like text, p_status integer, p_content text) returns integer language plpgsql as $$
declare v integer := 0; r record;
begin
  for r in select t.id from net.test_requests t where t.url like p_url_like
           and not exists (select 1 from net._http_response h where h.id = t.id) loop
    insert into net._http_response(id, status_code, content, timed_out) values (r.id, p_status, p_content, false);
    v := v + 1;
  end loop;
  return v;
end $$;

insert into public.profiles values ('a0000000-0000-4000-8000-000000000002', 'Michał Testowy', 'Pracownik');
insert into public.jobs(id, client, city, street, status, device_model, completed_by, completed_at) values
  ('b0000000-0000-4000-8000-00000000000a', 'A', 'Zawiercie', 'T 1', 'Zakończone', 'Ukura', 'a0000000-0000-4000-8000-000000000002', '2026-10-01T10:00:00Z'),
  ('b0000000-0000-4000-8000-00000000000b', 'B', ' Zawiercie ', 'T 2', 'Zakończone', 'Teta', 'a0000000-0000-4000-8000-000000000002', '2026-10-02T10:00:00Z'),
  ('b0000000-0000-4000-8000-00000000000c', 'C', 'Nibylandia', 'T 3', 'Zakończone', 'Hiro', 'a0000000-0000-4000-8000-000000000002', '2026-10-03T10:00:00Z'),
  ('b0000000-0000-4000-8000-00000000000d', 'D', 'Zawiercie', 'T 4', 'Zakończone', 'Hiro', 'a0000000-0000-4000-8000-000000000002', '2026-10-04T10:00:00Z');
-- Wpisy jak po zakończeniu montażu (14.34). D ma już temperaturę administratora.
update public.leak_test_records set temperature_c = 21 where job_id = 'b0000000-0000-4000-8000-00000000000d';

-- Przebieg 1: kolejka, zapytania o miejscowości (Zawiercie raz na wpis — pamięć dopiero po odpowiedzi).
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect((select count(*) from private.leak_test_temperature_queue_v1435) = 3, 'kolejka: A, B, C (D ma temperaturę)');
select wawis_test.expect((select count(*) from net.test_requests where url like '%geocoding-api%') = 3, '3 zapytania o miejscowość');
select wawis_test.expect((select params->>'name' from net.test_requests where params->>'name' = 'Nibylandia') = 'Nibylandia', 'nazwa miejscowości w zapytaniu');
select wawis_test.respond('%geocoding-api%' , 200, '{"results":[{"name":"Zawiercie","latitude":50.49,"longitude":19.42}]}') ;
update net._http_response set content = '{"results":[]}' where id = (select id from net.test_requests where params->>'name' = 'Nibylandia');

-- Przebieg 2: współrzędne → zapytania o pogodę (archiwum, data badania, strefa PL); Nibylandia — błąd opisany.
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect((select stage = 'failed' and last_error = 'nie znaleziono miejscowości' from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000c'), 'C: nieznana miejscowość');
select wawis_test.expect((select count(*) from net.test_requests where url = 'https://archive-api.open-meteo.com/v1/archive') = 2, '2 zapytania do archiwum');
select wawis_test.expect((select params @> '{"start_date":"2026-10-01","end_date":"2026-10-01","daily":"temperature_2m_mean","timezone":"Europe/Warsaw","latitude":"50.49"}'::jsonb
  from net.test_requests where params->>'start_date' = '2026-10-01'), 'parametry pogody');
select wawis_test.expect((select count(*) from private.leak_test_city_coords_v1435) = 1, 'pamięć miejscowości');
-- A: średnia 7,6 → 8. B: archiwum bez danych → ponownie za 6 h.
update net._http_response set status_code = 0 where false;
insert into net._http_response(id, status_code, content, timed_out)
  select id, 200, '{"daily":{"time":["2026-10-01"],"temperature_2m_mean":[7.6]}}', false from net.test_requests where params->>'start_date' = '2026-10-01';
insert into net._http_response(id, status_code, content, timed_out)
  select id, 200, '{"daily":{"time":["2026-10-02"],"temperature_2m_mean":[null]}}', false from net.test_requests where params->>'start_date' = '2026-10-02';

-- Przebieg 3: zapis temperatury A (bez nadpisania D); B czeka.
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect((select temperature_c = 8 from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'A: 8 °C zapisane');
select wawis_test.expect((select temperature_c = 21 from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000d'), 'D: temperatura administratora bez zmian');
select wawis_test.expect(not exists (select 1 from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'A zdjęte z kolejki');
select wawis_test.expect((select stage = 'wx' and attempts = 1 and next_at > now() + interval '5 hours' from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000b'), 'B: ponownie za 6 h');

-- Administrator wpisuje temperaturę B ręcznie → B znika z kolejki.
update public.leak_test_records set temperature_c = 5 where job_id = 'b0000000-0000-4000-8000-00000000000b';
-- Nowy montaż z ostatnich dni → dane bieżące (forecast); błąd HTTP → ponowienie.
insert into public.jobs(id, client, city, street, status, device_model, completed_by, completed_at) values
  ('b0000000-0000-4000-8000-00000000000e', 'E', 'Zawiercie', 'T 5', 'Zakończone', 'Hiro', 'a0000000-0000-4000-8000-000000000002', now());
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect(not exists (select 1 from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000b'), 'B zdjęte po wpisie ręcznym');
select wawis_test.expect((select count(*) from net.test_requests where url = 'https://api.open-meteo.com/v1/forecast') = 1, 'E: dane bieżące, miejscowość z pamięci (bez geokodowania)');
select wawis_test.respond('https://api.open-meteo.com/v1/forecast', 502, 'Bad Gateway');
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect((select attempts = 1 and request_id is null and last_error = 'HTTP 502' from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000e'), 'E: błąd HTTP → ponowienie');
-- Ujemna temperatura.
update private.leak_test_temperature_queue_v1435 set next_at = now() where job_id = 'b0000000-0000-4000-8000-00000000000e';
select private.leak_test_temperature_tick_v1435();
select wawis_test.respond('https://api.open-meteo.com/v1/forecast', 200, '{"daily":{"temperature_2m_mean":[-3.5]}}');
select wawis_test.expect(private.leak_test_temperature_tick_v1435() = 1, 'E: zapisane');
select wawis_test.expect((select temperature_c = -4 from public.leak_test_records where job_id = 'b0000000-0000-4000-8000-00000000000e'), 'E: -4 °C');

-- Brak dostępu z aplikacji.
set role authenticated;
do $$ begin
  begin perform private.leak_test_temperature_tick_v1435(); raise exception 'FAIL: tick dostępny'; exception when insufficient_privilege then null; end;
  begin perform count(*) from private.leak_test_temperature_queue_v1435; raise exception 'FAIL: kolejka dostępna'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS WAWIS 14.35 — temperatura protokołu z serwera: kolejka, miejscowość → współrzędne → średnia dnia, bez nadpisywania, ponowienia, bez dostępu z aplikacji';
