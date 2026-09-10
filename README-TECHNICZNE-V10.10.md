# WAWIS 10.10 — uruchomienie warstwy technicznej

Kod aplikacji jest zgodny wstecznie: po wgraniu samej paczki nadal działa tak jak 10.09. Aby uruchomić pełną synchronizację przyrostową, centralną diagnostykę i kopię plików, wykonaj również poniższe kroki w Supabase.

## 1. Baza danych

Uruchom w SQL Editor cały plik:

`supabase/migrations/20260907120000_reliable_sync_diagnostics_backup_v1010.sql`

Skrypt nie usuwa danych i można go wykonać ponownie.

## 2. Drugi magazyn kopii

Kopia jest celowo zapisywana w **drugim projekcie Supabase**. Kopia w tym samym projekcie nie chroniłaby przed awarią lub przypadkowym usunięciem projektu głównego.

Utwórz pusty projekt przeznaczony na kopie, a w projekcie głównym ustaw sekrety funkcji:

- `BACKUP_SUPABASE_URL` — adres drugiego projektu,
- `BACKUP_SUPABASE_SERVICE_ROLE_KEY` — service role key drugiego projektu,
- `BACKUP_CRON_SECRET` — długi losowy sekret do wywołania harmonogramu,
- opcjonalnie `BACKUP_PHOTO_BUCKET` i `BACKUP_PROTOCOL_BUCKET` — własne nazwy prywatnych bucketów.

Wdróż funkcję `backup-storage-assets`. Wywołuj ją cyklicznie metodą POST z nagłówkiem `x-backup-secret`. Jedno wywołanie kopiuje domyślnie 20 pozycji i podejmuje przerwaną pracę od pierwszego nieukończonego pliku. Gdy odpowiedź ma `hasMore: true`, funkcję należy wywołać ponownie.

## 3. Co jest automatyczne

- aplikacja zapisuje numer ostatniej odebranej zmiany i po przerwaniu nie pobiera ponownie całej listy,
- operacje offline mają trwały identyfikator, blokadę próby oraz potwierdzenie po stronie serwera,
- zdjęcie jest kompresowane jeden raz, a gotowy plik pozostaje w kolejce do skutecznego wysłania,
- błędy techniczne bez danych klientów są cicho wysyłane do tabeli `app_diagnostic_events`,
- administrator widzi centralne błędy i stan kopii w istniejącym module Diagnostyka,
- nowe zdjęcia i protokoły automatycznie trafiają do kolejki kopii.
