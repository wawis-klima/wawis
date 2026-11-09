-- WAWIS 14.42: miejscowość z kodem pocztowym → wyszukiwanie bez kodu; wpisy „nie znaleziono miejscowości” od nowa.
create schema wawis_test;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;

insert into public.profiles values ('a0000000-0000-4000-8000-000000000002', 'Michał Testowy', 'Pracownik');
insert into public.jobs(id, client, city, street, status, device_model, completed_by, completed_at) values
  ('b0000000-0000-4000-8000-00000000000a', 'A', '42-400 Zawiercie', 'T 1', 'Zakończone', 'Ukura', 'a0000000-0000-4000-8000-000000000002', '2026-10-01T10:00:00Z');
-- Stan jak w produkcji 09.11: wpis „failed” po wyszukaniu nazwy z kodem.
insert into private.leak_test_temperature_queue_v1435(job_id, stage, city, test_date, last_error)
values ('b0000000-0000-4000-8000-00000000000a', 'failed', '42-400 Zawiercie', '2026-10-01', 'nie znaleziono miejscowości')
on conflict (job_id) do update set stage = 'failed', city = excluded.city, last_error = excluded.last_error;
