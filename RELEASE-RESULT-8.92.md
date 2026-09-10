# RELEASE RESULT

## Wersja
- 8.92

## Tryb
- desktop — centralny katalog EAN tabliczek znamionowych

## Podsumowanie
- dodano wspólny katalog `nameplate_product_catalog` w Supabase, dostępny wyłącznie dla administratora,
- odczyt EAN sprawdza najpierw katalog Wawis, następnie lokalny słownik i OCR,
- po ręcznym zatwierdzeniu nieznany EAN jest zapisywany w katalogu i staje się dostępny na innych komputerach,
- dodano dwuetapowy import CSV/XLSX z analizą poprawnych i błędnych wierszy przed zapisem,
- dodano wzorcowy plik CSV,
- dodano lokalny fallback dla `5905567600814` i zachowano `5905567600821`,
- awaria lub brak katalogu nie blokuje podstawowego zapisu OCR,
- brak zmian w mobile, zdjęciach, komentarzach, adresach klientów i pozostałych modułach.

## Migracja Supabase
- przed wdrożeniem uruchomić `nameplate-product-catalog-v8.92.sql`,
- migracja jest idempotentna, nie usuwa istniejących danych i dodaje dwie potwierdzone pozycje Imoto R14.

## Kontrola lokalna
- 79 testów smoke niewymagających zewnętrznych zależności — OK,
- `test:smoke:job-contractor-conflict` — niewykonany lokalnie z powodu braku zainstalowanego `@supabase/supabase-js`; GitHub Actions uruchomi go po `npm ci`,
- `test:smoke:nameplate-product-catalog` — OK,
- testy desktopowego OCR, kodów EAN/Code 128 i ochrony białego ekranu — OK,
- kontrola składni JS/JSX — OK,
- `verify:release` — dwa przebiegi poprawne,
- połączenie `npm ping` z publicznym rejestrem przekroczyło lokalny limit czasu, dlatego pełny Vite build i Playwright pozostają do wykonania przez GitHub Actions / Vercel.

## Zasada wdrożenia
1. Uruchomić SQL `nameplate-product-catalog-v8.92.sql`.
2. Wgrać aplikację 8.92.
3. Publikować dopiero po zielonym wyniku workflow desktop i mobile.
4. Sprawdzić na dwóch komputerach: zatwierdzić nowy EAN na pierwszym i ponownie odczytać go na drugim.
