-- WAWIS 13.99: test zachowania modułu serwisowego po wszystkich migracjach (jednorazowa baza).
-- Wykonywany jako role authenticated / service_role z ustawionym auth.uid(), więc obejmuje RLS i granty.

-- ---------- narzędzia testowe ----------
create schema wawis_test;
grant usage on schema wawis_test to authenticated, service_role;
create function wawis_test.expect_error(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is null or sqlstate = p_state then return; end if;
    raise exception 'FAIL %: oczekiwano SQLSTATE %, otrzymano % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %: operacja przeszła, a powinna zostać odrzucona', p_label;
end $$;
create function wawis_test.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL %', p_label; end if; end $$;
create function wawis_test.as_user(p_uid uuid, p_role text default 'authenticated') returns void
language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false),
         set_config('request.jwt.claim.role', p_role, false); $$;
create function wawis_test.visit(p_op text) returns uuid language sql stable security definer
set search_path = '' as $$ select id from public.service_visits where create_operation_id = p_op::uuid $$;
create function wawis_test.item(p_op text, p_device text) returns uuid language sql stable security definer
set search_path = '' as $$ select d.id from public.service_visit_devices d
  join public.service_visits v on v.id = d.service_visit_id
  where v.create_operation_id = p_op::uuid and d.device_ref_id = p_device::uuid $$;
create function wawis_test.completed_event(p_visit uuid) returns table(id uuid, event_token text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.event_token from private.service_visit_completed_push_events_v1389 e where e.visit_id = p_visit $$;
-- Wpis zdjęcia z pominięciem RLS — symuluje zdjęcie dodane, zanim wizyta została zakończona.
create function wawis_test.add_photo_unchecked(p_item uuid, p_path text, p_size bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.service_visit_photos(service_visit_device_id,storage_path,file_size_bytes,mime_type,created_by)
  values (p_item, p_path, p_size, 'image/jpeg', auth.uid()) $$;
grant execute on all functions in schema wawis_test to authenticated, service_role;

-- ---------- dane fikcyjne ----------
insert into public.profiles values
  ('a0000000-0000-4000-8000-000000000001', 'Admin Test', 'Administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'Pracownik Test', 'Pracownik');
insert into public.contractors values ('c0000000-0000-4000-8000-000000000001', 'KLIENT TEST', null, 'Testowo', 'Fikcyjna 1', '000', 'test@example.invalid');
insert into public.devices values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Model A', 'SN-A', '2025-05-01', null),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Model B', 'SN-B', '2025-05-01', null);

-- ---------- administrator tworzy dwie wizyty prawdziwym RPC ----------
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select public.service_visit_admin_create('c0000000-0000-4000-8000-000000000001',
  array['d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002']::uuid[],
  '2026-11-05', '10:00', 'Wizyta do kosza', null, 'e0000000-0000-4000-8000-000000000001');
select public.service_visit_admin_create('c0000000-0000-4000-8000-000000000001',
  array['d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002']::uuid[],
  '2026-11-06', null, 'Wizyta wykonywana', null, 'e0000000-0000-4000-8000-000000000002');

do $$
declare v1 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000001');
declare i1 uuid := wawis_test.item('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
declare ok jsonb := '{"filtry":true,"jednostka_wewnetrzna":true,"skropliny":true,"jednostka_zewnetrzna":true,"dzialanie":true,"instalacja":true}';
declare p1 uuid; p2 uuid; path text; n int;
begin
  perform wawis_test.expect(v1 is not null, 'utworzenie wizyty 1');
  -- wynik z usterką i dwa zdjęcia (upload Storage przez politykę + wpis w tabeli)
  perform public.service_visit_admin_save_item(v1, i1, ok, 'usterka', 'Nieszczelność');
  insert into storage.objects(bucket_id,name,metadata) values
    ('service-visit-files', v1||'/photos/'||i1||'/a.jpg', '{"size":1000}'),
    ('service-visit-files', v1||'/photos/'||i1||'/b.jpg', '{"size":1000}');
  insert into public.service_visit_photos(service_visit_device_id,storage_path,file_size_bytes,mime_type)
    values (i1, v1||'/photos/'||i1||'/a.jpg', 1000, 'image/jpeg') returning id into p1;
  insert into public.service_visit_photos(service_visit_device_id,storage_path,file_size_bytes,mime_type)
    values (i1, v1||'/photos/'||i1||'/b.jpg', 1000, 'image/jpeg') returning id into p2;

  -- PDF i podpis nie mogą zostać usunięte przez administratora z poziomu przeglądarki
  insert into storage.objects(bucket_id,name,metadata) values ('service-visit-files', v1||'/pdf/x.pdf', '{"size":10}');
  delete from storage.objects where name = v1||'/pdf/x.pdf';
  get diagnostics n = row_count;
  perform wawis_test.expect(n = 0, 'polityka: PDF nie do usunięcia przez admina');
  -- plik wskazywany przez wpis zdjęcia — nie do usunięcia
  delete from storage.objects where name = v1||'/photos/'||i1||'/b.jpg';
  get diagnostics n = row_count;
  perform wawis_test.expect(n = 0, 'polityka: plik wskazywany przez zdjęcie nie do usunięcia');

  -- usunięcie zdjęcia: najpierw wiersz (RPC), potem plik przez Storage
  path := public.service_visit_admin_delete_photo(p1);
  perform wawis_test.expect(path = v1||'/photos/'||i1||'/a.jpg', 'RPC zwraca ścieżkę usuniętego zdjęcia');
  perform wawis_test.expect(not exists(select 1 from public.service_visit_photos where id=p1), 'wiersz zdjęcia usunięty');
  delete from storage.objects where name = path;
  get diagnostics n = row_count;
  perform wawis_test.expect(n = 1, 'polityka: nieużywany plik zdjęcia aktywnej wizyty do usunięcia');
  perform wawis_test.expect(exists(select 1 from public.service_visit_photos where id=p2), 'drugie zdjęcie zostaje');
  perform wawis_test.expect_error(format('select public.service_visit_admin_delete_photo(%L)', p1), null, 'ponowne usunięcie tego samego zdjęcia');
end $$;

-- pracownik nie może usuwać zdjęć ani ich widzieć (etap administratora)
reset role;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
set role authenticated;
do $$
declare v1 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000001');
declare p uuid;
begin
  select id into p from public.service_visit_photos limit 1;
  perform wawis_test.expect(p is null, 'pracownik nie widzi zdjęć serwisu (RLS)');
  select ph.id into p from public.service_visit_photos ph limit 1;
  perform wawis_test.expect_error(format('select public.service_visit_admin_delete_photo(%L)',
    'f0000000-0000-4000-8000-000000000009'), '42501', 'pracownik: RPC usunięcia zdjęcia');
  perform wawis_test.expect(not exists(select 1 from public.service_visits), 'pracownik nie widzi wizyt (RLS)');
end $$;

-- ---------- Kosz: każda ścieżka zapisu odrzucona przez serwer ----------
reset role;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
do $$
declare v1 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000001');
declare i1 uuid := wawis_test.item('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
declare i2 uuid := wawis_test.item('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002');
declare ok jsonb := '{"filtry":true,"jednostka_wewnetrzna":true,"skropliny":true,"jednostka_zewnetrzna":true,"dzialanie":true,"instalacja":true}';
declare p2 uuid; snap jsonb; n int;
begin
  perform public.service_visit_admin_save_item(v1, i2, ok, 'sprawne', '');
  select id into p2 from public.service_visit_photos where service_visit_device_id=i1;
  -- pliki PDF/podpisu i migawka zgodna z bazą, żeby complete doszedł do wstawienia protokołu
  insert into storage.objects(bucket_id,name,metadata) values
    ('service-visit-files', v1||'/pdf/t.pdf', '{"size":500}'),
    ('service-visit-files', v1||'/signatures/t.png', '{"size":50}');
  perform wawis_test.expect(public.service_visit_admin_trash(v1), 'przeniesienie do kosza');

  perform wawis_test.expect_error(format('update public.service_visits set scheduled_date=%L where id=%L','2026-12-01',v1), '55000', 'kosz: zmiana terminu');
  perform wawis_test.expect_error(format('update public.service_visits set notes=%L where id=%L','x',v1), '55000', 'kosz: zmiana uwag');
  perform wawis_test.expect_error(format('update public.service_visits set primary_technician_id=%L where id=%L','a0000000-0000-4000-8000-000000000002',v1), '55000', 'kosz: zmiana przydziału');
  perform wawis_test.expect_error(format('select public.service_visit_admin_save_item(%L,%L,%L::jsonb,%L,%L)',v1,i2,ok,'usterka',''), '55000', 'kosz: zapis wyniku');
  perform wawis_test.expect_error(format('select public.service_visit_admin_wait_for_signature(%L)',v1), '55000', 'kosz: oczekiwanie na podpis');
  perform wawis_test.expect_error(format('select public.service_visit_admin_cancel(%L)',v1), '55000', 'kosz: odwołanie');
  select jsonb_build_object('items', jsonb_agg(jsonb_build_object('id',d.id,'result',d.result,'checklist',d.checklist,'notes',d.notes,'performed_by',d.performed_by)))
    into snap from public.service_visit_devices d where d.service_visit_id=v1;
  perform wawis_test.expect_error(format('select public.service_visit_admin_complete(%L,%L,%L,%L,500,%L::jsonb)',
    v1, v1||'/pdf/t.pdf', v1||'/signatures/t.png', 't.pdf', snap), '55000', 'kosz: zakończenie z PDF');
  perform wawis_test.expect_error(format('select public.service_visit_admin_delete_photo(%L)',p2), '55000', 'kosz: usunięcie zdjęcia');
  perform wawis_test.expect_error(format('insert into storage.objects(bucket_id,name,metadata) values(%L,%L,%L)',
    'service-visit-files', v1||'/photos/'||i1||'/c.jpg', '{"size":1}'), '42501', 'kosz: upload do Storage');
  perform wawis_test.expect_error(format('insert into public.service_visit_photos(service_visit_device_id,storage_path,file_size_bytes,mime_type) values(%L,%L,1,%L)',
    i1, v1||'/photos/'||i1||'/b.jpg', 'image/jpeg'), null, 'kosz: wpis zdjęcia');
  delete from storage.objects where name = v1||'/photos/'||i1||'/b.jpg';
  get diagnostics n = row_count;
  perform wawis_test.expect(n = 0, 'kosz: pliki nie do usunięcia przez przeglądarkę');
  perform wawis_test.expect((select status from public.service_visits where id=v1) = 'w_trakcie', 'kosz: status bez zmian');

  -- przywrócenie działa i odblokowuje edycję (13.94 bez regresji)
  perform wawis_test.expect(public.service_visit_admin_restore(v1), 'przywrócenie');
  update public.service_visits set scheduled_date='2026-12-01', notes='po przywróceniu' where id=v1;
  perform wawis_test.expect((select notes from public.service_visits where id=v1)='po przywróceniu', 'edycja po przywróceniu');
  perform wawis_test.expect(public.service_visit_admin_trash(v1), 'ponowne przeniesienie do kosza');
end $$;

-- ---------- trwałe usuwanie (13.95) nadal działa przy blokadach Kosza ----------
-- 14.01: Edge Function używa klucza service_role BEZ identyfikatora użytkownika (auth.uid() = null).
-- Wcześniej test podawał sub administratora i maskował błąd „Brak uprawnień do przydziału” (produkcja 31.10.2026).
reset role;
select wawis_test.as_user(null, 'service_role');
set role service_role;
do $$
declare v1 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000001');
declare paths text[];
begin
  paths := public.service_visit_purge_prepare_v1395(v1, 'a0000000-0000-4000-8000-000000000001');
  perform wawis_test.expect(cardinality(paths) >= 3, 'purge: lista plików wizyty');
end $$;
reset role;
-- symulacja Storage API (service role) — usuwa pliki tej wizyty
delete from storage.objects where name like (wawis_test.visit('e0000000-0000-4000-8000-000000000001')::text || '/%');
set role service_role;
do $$
declare v1 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000001');
begin
  perform wawis_test.expect(public.service_visit_purge_finalize_v1395(v1, 'a0000000-0000-4000-8000-000000000001'), 'purge: finalizacja');
end $$;
reset role;
do $$ begin
  perform wawis_test.expect(wawis_test.visit('e0000000-0000-4000-8000-000000000001') is null, 'purge: wizyta usunięta');
  perform wawis_test.expect((select count(*) from public.devices)=2, 'purge: urządzenia klienta zostają');
  perform wawis_test.expect(wawis_test.visit('e0000000-0000-4000-8000-000000000002') is not null, 'purge: inna wizyta zostaje');
end $$;

-- ---------- regresja: pełne wykonanie aktywnej wizyty ----------
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
do $$
declare v2 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000002');
declare a uuid := wawis_test.item('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001');
declare b uuid := wawis_test.item('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002');
declare ok jsonb := '{"filtry":true,"jednostka_wewnetrzna":true,"skropliny":true,"jednostka_zewnetrzna":true,"dzialanie":true,"instalacja":true}';
declare snap jsonb; ph uuid; n int;
begin
  perform wawis_test.expect_error(format('select public.service_visit_admin_save_item(%L,%L,%L::jsonb,%L,%L)',v2,a,
    '{"filtry":true}','sprawne',''), null, 'wynik z niekompletną listą pozycji odrzucony');
  -- 14.04: komplet sześciu pozycji, ale żadna niewykonana → odrzucone; część wykonana → dozwolone.
  perform wawis_test.expect_error(format('select public.service_visit_admin_save_item(%L,%L,%L::jsonb,%L,%L)',v2,a,
    '{"filtry":false,"jednostka_wewnetrzna":false,"skropliny":false,"jednostka_zewnetrzna":false,"dzialanie":false,"instalacja":false}','sprawne',''),
    null, 'wynik bez żadnej wykonanej czynności odrzucony');
  perform public.service_visit_admin_save_item(v2, a, ok, 'sprawne', '');
  perform public.service_visit_admin_save_item(v2, b,
    '{"filtry":true,"jednostka_wewnetrzna":true,"skropliny":false,"jednostka_zewnetrzna":false,"dzialanie":false,"instalacja":false}'::jsonb,
    'usterka', 'Do wymiany');
  perform wawis_test.expect((select result from public.service_visit_devices where id=b)='usterka', '14.04: usterka zapisana przy 2 z 6 czynności');
  insert into storage.objects(bucket_id,name,metadata) values ('service-visit-files', v2||'/photos/'||b||'/u.jpg', '{"size":900}');
  insert into public.service_visit_photos(service_visit_device_id,storage_path,file_size_bytes,mime_type)
    values (b, v2||'/photos/'||b||'/u.jpg', 900, 'image/jpeg') returning id into ph;
  perform public.service_visit_admin_wait_for_signature(v2);
  insert into storage.objects(bucket_id,name,metadata) values
    ('service-visit-files', v2||'/pdf/p.pdf', '{"size":800}'),
    ('service-visit-files', v2||'/signatures/s.png', '{"size":80}');
  select jsonb_build_object('items', jsonb_agg(jsonb_build_object('id',d.id,'result',d.result,'checklist',d.checklist,'notes',d.notes,'performed_by',d.performed_by)))
    into snap from public.service_visit_devices d where d.service_visit_id=v2;
  perform public.service_visit_admin_complete(v2, v2||'/pdf/p.pdf', v2||'/signatures/s.png', 'p.pdf', 800, snap);
  perform wawis_test.expect((select status from public.service_visits where id=v2)='wykonany', 'regresja: zakończenie wizyty');
  perform wawis_test.expect(exists(select 1 from public.service_visit_protocols where service_visit_id=v2), 'regresja: protokół zapisany');
  -- 14.03: jak w montażach — admin usuwa zdjęcie także po zakończeniu, ale nie OSTATNIE zdjęcie usterki.
  perform wawis_test.expect_error(format('select public.service_visit_admin_delete_photo(%L)',ph), null, 'zakończona: ostatnie zdjęcie usterki chronione');
  perform wawis_test.expect(exists(select 1 from public.service_visit_photos where id=ph), 'zakończona: jedyne zdjęcie usterki zostaje');
  insert into storage.objects(bucket_id,name,metadata) values ('service-visit-files', v2||'/photos/'||b||'/u2.jpg', '{"size":700}');
  -- drugie zdjęcie usterki dodane przed zakończeniem (po zakończeniu RLS nie pozwala dodawać zdjęć)
  perform wawis_test.add_photo_unchecked(b, v2||'/photos/'||b||'/u2.jpg', 700);
  perform wawis_test.expect(public.service_visit_admin_delete_photo(ph) = v2||'/photos/'||b||'/u.jpg', 'zakończona: drugie zdjęcie pozwala usunąć pierwsze');
  perform wawis_test.expect((select count(*) from public.service_visit_photos where service_visit_device_id=b)=1, 'zakończona: zostaje jedno zdjęcie usterki');
  delete from storage.objects where name = v2||'/photos/'||b||'/u.jpg';
  get diagnostics n = row_count;
  perform wawis_test.expect(n = 1, 'zakończona: nieużywany plik zdjęcia do usunięcia (polityka)');
  delete from storage.objects where name = v2||'/pdf/p.pdf';
  get diagnostics n = row_count;
  perform wawis_test.expect(n = 0, 'zakończona: PDF nadal nie do usunięcia');
end $$;

-- ---------- PUSH „zakończono”: wizyta w Koszu nie jest powiadamiana ----------
reset role;
select wawis_test.as_user(null, 'service_role');
set role service_role;
do $$
declare v2 uuid := wawis_test.visit('e0000000-0000-4000-8000-000000000002');
declare e record;
begin
  select * into e from wawis_test.completed_event(v2);
  perform wawis_test.expect(e.id is not null, 'push: zdarzenie zakończenia w kolejce');
  perform wawis_test.expect((select count(*) from public.get_service_visit_completed_push_event_v1389(e.id, e.event_token)) = 1, 'push: aktywna wizyta');
end $$;
reset role;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select public.service_visit_admin_trash(wawis_test.visit('e0000000-0000-4000-8000-000000000002'));
reset role;
select wawis_test.as_user(null, 'service_role');
set role service_role;
do $$
declare e record;
begin
  select * into e from wawis_test.completed_event(wawis_test.visit('e0000000-0000-4000-8000-000000000002'));
  perform wawis_test.expect((select count(*) from public.get_service_visit_completed_push_event_v1389(e.id, e.event_token)) = 0, 'push: brak dla wizyty w koszu');
end $$;
reset role;
-- ---------- 14.01: zmiana przydziału nadal tylko dla administratora (trigger) ----------
-- Pracownik z ominiętym RLS (symulacja przez funkcję definer bez roli admina) nadal odrzucony.
create function wawis_test.raw_assign(p_visit uuid, p_tech uuid) returns void
language sql security definer set search_path = '' as $$
  update public.service_visits set primary_technician_id = p_tech where id = p_visit $$;
grant execute on function wawis_test.raw_assign(uuid, uuid) to authenticated, service_role;
reset role;
select public.service_visit_admin_restore(wawis_test.visit('e0000000-0000-4000-8000-000000000002'))
  from (select wawis_test.as_user('a0000000-0000-4000-8000-000000000001')) x;
select wawis_test.as_user('a0000000-0000-4000-8000-000000000002');
set role authenticated;
do $$ begin
  perform wawis_test.expect_error(format('select wawis_test.raw_assign(%L,%L)',
    wawis_test.visit('e0000000-0000-4000-8000-000000000002'), 'a0000000-0000-4000-8000-000000000002'),
    null, 'pracownik: przydział odrzucony przez trigger');
end $$;
reset role;
select wawis_test.as_user(null, 'anon');
do $$ begin
  perform wawis_test.expect_error(format('select wawis_test.raw_assign(%L,%L)',
    wawis_test.visit('e0000000-0000-4000-8000-000000000002'), 'a0000000-0000-4000-8000-000000000002'),
    null, 'anon: przydział odrzucony przez trigger');
end $$;
reset role;
select 'SERVICE_SQL_V1399_OK';
