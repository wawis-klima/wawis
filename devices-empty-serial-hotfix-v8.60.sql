-- Wawis Klimatyzacja v8.60
-- Hotfix: pozwala zapisywać wiele urządzeń bez numeru seryjnego.
--
-- Przyczyna błędu:
-- stary indeks devices_serial_number_key traktował pusty tekst jako normalną,
-- unikalną wartość. Drugie urządzenie bez numeru seryjnego powodowało:
-- duplicate key value violates unique constraint "devices_serial_number_key".
--
-- Po tej zmianie:
-- - pusty numer seryjny może wystąpić w wielu urządzeniach,
-- - faktycznie wpisane numery seryjne nadal muszą być unikalne,
-- - nie trzeba przywracać OCR ani wpisywać sztucznych numerów.
--
-- Skrypt jest idempotentny i można go uruchomić ponownie.

rollback;
begin;

do $$
begin
  if to_regclass('public.devices') is null then
    raise exception 'Brak tabeli public.devices. Najpierw uruchom migracje modułu Urządzenia.';
  end if;
end;
$$;

-- Obsługa obu możliwych wariantów historycznej bazy:
-- unikalnego constraintu albo samodzielnego indeksu o tej samej nazwie.
alter table public.devices
  drop constraint if exists devices_serial_number_key;

drop index if exists public.devices_serial_number_key;

-- Unikalność obowiązuje wyłącznie dla niepustych numerów.
create unique index devices_serial_number_key
  on public.devices (lower(btrim(serial_number)))
  where nullif(btrim(serial_number), '') is not null;

commit;
