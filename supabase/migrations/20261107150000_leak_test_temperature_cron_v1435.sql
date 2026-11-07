-- WAWIS 14.35 — temperatura protokołu szczelności uzupełniana przez serwer (decyzja właściciela 07.11.2026).
-- Właściciel nie otwiera PDF-ów, a dokument ma być kompletny „w razie czego”. Baza co 5 minut (pg_cron) sama:
--   1) dodaje do kolejki protokoły bez temperatury (z miejscowością montażu),
--   2) zamienia miejscowość na współrzędne (Open-Meteo, wyszukiwarka; pamięć miejscowości w bazie),
--   3) pobiera średnią temperaturę dnia badania (archiwum pogody; dla ostatnich dni — dane bieżące),
--   4) zapisuje ją w protokole (zaokrągloną do pełnych stopni) — tylko gdy temperatury brak (nie nadpisuje poprawek).
-- Wywołania internetowe przez pg_net (asynchronicznie: zapytanie w jednym przebiegu, odpowiedź w następnym).
-- Do serwisu pogodowego trafia tylko nazwa miejscowości i data — żadnych danych klienta.
-- Błędy: ponowienia z odstępem; po wielu nieudanych próbach wpis kolejki zostaje oznaczony „failed” (widać przyczynę).
-- Kolejka i pamięć miejscowości w schemacie private (bez dostępu z aplikacji). Montaże bez zmian. Można uruchomić ponownie.

create schema if not exists private;

create table if not exists private.leak_test_city_coords_v1435 (
  city_key text primary key,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.leak_test_temperature_queue_v1435 (
  job_id uuid primary key references public.leak_test_records(job_id) on delete cascade,
  stage text not null default 'geo' check (stage in ('geo', 'wx', 'failed')),
  city text not null,
  test_date date not null,
  latitude double precision,
  longitude double precision,
  request_id bigint,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now()
);
revoke all on private.leak_test_city_coords_v1435, private.leak_test_temperature_queue_v1435 from public, anon, authenticated;

create or replace function private.leak_test_temperature_tick_v1435()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  q record;
  v_json jsonb;
  v_lat double precision;
  v_lon double precision;
  v_mean numeric;
  v_age integer;
  v_url text;
  v_params jsonb;
  v_req bigint;
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_saved integer := 0;
begin
  -- 1) Kolejka: protokoły bez temperatury; usunięcie już uzupełnionych; zmiana daty/miejscowości → od nowa.
  insert into private.leak_test_temperature_queue_v1435(job_id, city, test_date)
  select r.job_id, btrim(j.city), r.test_date
  from public.leak_test_records r join public.jobs j on j.id = r.job_id
  where r.temperature_c is null and r.test_date is not null and nullif(btrim(j.city), '') is not null
  on conflict (job_id) do nothing;

  delete from private.leak_test_temperature_queue_v1435 q2
  using public.leak_test_records r
  where r.job_id = q2.job_id and r.temperature_c is not null;

  update private.leak_test_temperature_queue_v1435 q2
     set city = btrim(j.city), test_date = r.test_date, stage = 'geo', latitude = null, longitude = null,
         request_id = null, attempts = 0, next_at = now(), last_error = null, updated_at = now()
    from public.leak_test_records r join public.jobs j on j.id = r.job_id
   where r.job_id = q2.job_id and nullif(btrim(j.city), '') is not null
     and (q2.test_date is distinct from r.test_date or q2.city is distinct from btrim(j.city));

  -- 2) Odpowiedzi na wysłane zapytania.
  for q in
    select k.*, h.id as resp_id, h.status_code, h.content, coalesce(h.timed_out, false) as timed_out, h.error_msg
    from private.leak_test_temperature_queue_v1435 k
    left join net._http_response h on h.id = k.request_id
    where k.request_id is not null and k.stage in ('geo', 'wx')
  loop
    if q.resp_id is null then
      -- Brak odpowiedzi dłużej niż godzinę (np. wyczyszczona) — wysyłamy ponownie.
      if q.updated_at < now() - interval '1 hour' then
        update private.leak_test_temperature_queue_v1435
           set request_id = null, attempts = attempts + 1, next_at = now(), last_error = 'brak odpowiedzi', updated_at = now()
         where job_id = q.job_id;
      end if;
      continue;
    end if;

    v_json := null;
    if q.status_code = 200 and not q.timed_out then
      begin v_json := q.content::jsonb; exception when others then v_json := null; end;
    end if;

    if v_json is null then
      update private.leak_test_temperature_queue_v1435
         set request_id = null, attempts = attempts + 1,
             stage = case when attempts + 1 >= 8 then 'failed' else stage end,
             next_at = now() + interval '30 minutes',
             last_error = left(coalesce(q.error_msg, 'HTTP ' || coalesce(q.status_code::text, '?')), 300), updated_at = now()
       where job_id = q.job_id;
      continue;
    end if;

    if q.stage = 'geo' then
      v_lat := nullif(v_json #>> '{results,0,latitude}', '')::double precision;
      v_lon := nullif(v_json #>> '{results,0,longitude}', '')::double precision;
      if v_lat is null or v_lon is null then
        update private.leak_test_temperature_queue_v1435
           set stage = 'failed', request_id = null, last_error = 'nie znaleziono miejscowości', updated_at = now()
         where job_id = q.job_id;
      else
        insert into private.leak_test_city_coords_v1435(city_key, latitude, longitude)
        values (lower(q.city), v_lat, v_lon)
        on conflict (city_key) do update set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = now();
        update private.leak_test_temperature_queue_v1435
           set stage = 'wx', latitude = v_lat, longitude = v_lon, request_id = null, next_at = now(), last_error = null, updated_at = now()
         where job_id = q.job_id;
      end if;
    else
      v_mean := case when jsonb_typeof(v_json #> '{daily,temperature_2m_mean,0}') = 'number'
                     then (v_json #>> '{daily,temperature_2m_mean,0}')::numeric end;
      if v_mean is not null and v_mean between -30 and 50 then
        update public.leak_test_records set temperature_c = round(v_mean, 0), updated_at = now()
         where job_id = q.job_id and temperature_c is null;
        if found then v_saved := v_saved + 1; end if;
        delete from private.leak_test_temperature_queue_v1435 where job_id = q.job_id;
      else
        -- Brak danych (np. archiwum jeszcze bez tego dnia) — ponownie za kilka godzin.
        update private.leak_test_temperature_queue_v1435
           set request_id = null, attempts = attempts + 1,
               stage = case when attempts + 1 >= 12 then 'failed' else stage end,
               next_at = now() + interval '6 hours', last_error = 'brak danych pogodowych dla dnia', updated_at = now()
         where job_id = q.job_id;
      end if;
    end if;
  end loop;

  -- 3) Nowe zapytania (do 20 na przebieg).
  for q in
    select k.* from private.leak_test_temperature_queue_v1435 k
    where k.request_id is null and k.stage in ('geo', 'wx') and k.next_at <= now()
    order by k.next_at, k.job_id
    limit 20
  loop
    if q.stage = 'geo' then
      select c.latitude, c.longitude into v_lat, v_lon from private.leak_test_city_coords_v1435 c where c.city_key = lower(q.city);
      if found then
        update private.leak_test_temperature_queue_v1435
           set stage = 'wx', latitude = v_lat, longitude = v_lon, updated_at = now()
         where job_id = q.job_id;
        q.stage := 'wx'; q.latitude := v_lat; q.longitude := v_lon;
      end if;
    end if;

    if q.stage = 'geo' then
      v_url := 'https://geocoding-api.open-meteo.com/v1/search';
      v_params := jsonb_build_object('name', q.city, 'count', '1', 'language', 'pl', 'countryCode', 'PL', 'format', 'json');
    else
      v_age := v_today - q.test_date;
      if v_age < 0 then
        update private.leak_test_temperature_queue_v1435 set next_at = (q.test_date + 1)::timestamptz, updated_at = now() where job_id = q.job_id;
        continue;
      end if;
      v_url := case when v_age >= 5 then 'https://archive-api.open-meteo.com/v1/archive' else 'https://api.open-meteo.com/v1/forecast' end;
      v_params := jsonb_build_object('latitude', q.latitude::text, 'longitude', q.longitude::text,
        'start_date', q.test_date::text, 'end_date', q.test_date::text, 'daily', 'temperature_2m_mean', 'timezone', 'Europe/Warsaw');
    end if;

    begin
      v_req := net.http_get(v_url, v_params, '{}'::jsonb, 10000);
      update private.leak_test_temperature_queue_v1435 set request_id = v_req, updated_at = now() where job_id = q.job_id;
    exception when others then
      update private.leak_test_temperature_queue_v1435
         set attempts = attempts + 1, next_at = now() + interval '30 minutes', last_error = left(sqlerrm, 300), updated_at = now()
       where job_id = q.job_id;
    end;
  end loop;

  return v_saved;
end;
$$;
revoke all on function private.leak_test_temperature_tick_v1435() from public, anon, authenticated;

-- Harmonogram: co 5 minut (lekki przebieg; bez kolejki nic nie wysyła).
do $block$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (select 1 from cron.job where jobname = 'wawis-leak-test-temperature-v1435') then
      perform cron.schedule('wawis-leak-test-temperature-v1435', '*/5 * * * *', 'select private.leak_test_temperature_tick_v1435();');
    end if;
  end if;
end;
$block$;
