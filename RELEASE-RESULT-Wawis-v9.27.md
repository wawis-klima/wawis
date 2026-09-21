# RELEASE RESULT - Wawis 9.27

## Wersja
- 9.27

## Zakres
- desktop: „Zatwierdź i zapisz” tabliczki nie uruchamia już pełnej `admin_sync_devices_from_jobs()` dla całej bazy,
- desktop: po zapisie nie ma już dodatkowego RPC; istniejący trigger `jobs_sync_device_after_change` automatycznie synchronizuje wyłącznie bieżące zlecenie,
- Supabase: dodano pomocnicze szybkie RPC do synchronizacji jednego montażu (awaryjnie/administracyjnie), ale zwykły zapis tabliczki nie musi go wywoływać,
- Supabase/Centrum 360: poprawiono bezpieczne parsowanie `source_job_id`, aby pusty tekst nie był rzutowany do UUID,
- zdjęcia tabliczek i zapis do `jobs` nadal mają pierwszeństwo; pomocnicza synchronizacja modułu Urządzenia nie blokuje zachowania danych.

## Przyczyna naprawy
- produkcyjne logi 13.08.2026 potwierdziły `canceling statement due to statement timeout` podczas zapisu kolejnych tabliczek,
- stara funkcja `admin_sync_devices_from_jobs()` iterowała po wszystkich zleceniach po każdym zatwierdzeniu jednej tabliczki,
- równolegle dashboard generował błędy `invalid input syntax for type uuid: ""`.

## Supabase
- migracja: `nameplate-single-job-sync-dashboard-safe-uuid-v9.27.sql`,
- migracja została już zastosowana na produkcyjnym projekcie Supabase podczas przygotowania wydania.

## Kontrola
- smoke desktop nameplate save,
- smoke single-job sync + safe UUID,
- verify:release 2x,
- integralność ZIP.
