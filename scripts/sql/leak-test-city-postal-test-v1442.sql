-- WAWIS 14.42 (po migracji): nazwy bez kodu i ponowienie wpisów.
select wawis_test.expect(private.leak_test_city_name_v1442('42-400 Zawiercie') = 'Zawiercie', '42-400 Zawiercie');
select wawis_test.expect(private.leak_test_city_name_v1442(' 42 - 427   Pradła ') = 'Pradła', 'spacje w kodzie');
select wawis_test.expect(private.leak_test_city_name_v1442('41-300, Dąbrowa  Górnicza') = 'Dąbrowa Górnicza', 'przecinek i spacje');
select wawis_test.expect(private.leak_test_city_name_v1442('Zawiercie') = 'Zawiercie', 'bez kodu bez zmian');
select wawis_test.expect(private.leak_test_city_name_v1442(null) = '', 'pusto');

select wawis_test.expect((select stage = 'geo' and city = 'Zawiercie' and last_error is null from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000a'), 'wpis od nowa, bez kodu');
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect((select params->>'name' = 'Zawiercie' from net.test_requests where url like '%geocoding-api%' order by id desc limit 1), 'wyszukiwanie: Zawiercie');
-- Nowy montaż z kodem — od razu bez kodu.
insert into public.jobs(id, client, city, street, status, device_model, completed_by, completed_at) values
  ('b0000000-0000-4000-8000-00000000000b', 'B', '42-427 Pradła', 'T 2', 'Zakończone', 'Teta', 'a0000000-0000-4000-8000-000000000002', '2026-10-02T10:00:00Z');
select private.leak_test_temperature_tick_v1435();
select wawis_test.expect((select city = 'Pradła' from private.leak_test_temperature_queue_v1435 where job_id = 'b0000000-0000-4000-8000-00000000000b'), 'nowy wpis bez kodu');
select wawis_test.expect(exists (select 1 from net.test_requests where params->>'name' = 'Pradła'), 'wyszukiwanie: Pradła');
select 'PASS WAWIS 14.42 — temperatura: miejscowość bez kodu pocztowego, ponowienie wpisów „nie znaleziono miejscowości”';
