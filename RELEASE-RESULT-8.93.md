# RELEASE RESULT

## Wersja
- 8.93

## Tryb
- desktop — poprawka odporności odczytu tabliczek znamionowych

## Podsumowanie
- kliknięcie `Odczytaj tabliczkę` otwiera okno od razu i nie uruchamia automatycznie ciężkiego skanowania,
- szybki odczyt EAN/Code 128, bezpłatny lokalny OCR nadruku i analiza AI są trzema osobnymi operacjami,
- pobieranie zdjęcia, katalog EAN, zapasowy ZXing, lokalny OCR i AI mają limity czasu,
- okno można zamknąć podczas odczytu; lokalny worker OCR jest wtedy kończony, a spóźniony wynik ignorowany,
- przycisk OCR przy urządzeniu nie zależy już od globalnego stanu `busy` całej aplikacji,
- zmiana zdjęcia tabliczki czyści lokalny cache poprzedniego pliku,
- mobile, zapis urządzeń, zdjęcia, komentarze, adresy klientów i Supabase pozostają bez zmian,
- nowa migracja SQL: brak; katalog z 8.92 nadal korzysta z `nameplate-product-catalog-v8.92.sql`.

## Kontrola lokalna
- 80 dostępnych testów smoke — dwa pełne przebiegi poprawne,
- `test:smoke:job-contractor-conflict` pominięty lokalnie z powodu braku zainstalowanego pakietu `@supabase/supabase-js`; uruchomi go GitHub po `npm ci`,
- testy OCR, EAN/Code 128, katalogu, renderowania i ochrony przed białym ekranem — dodatkowe dwa przebiegi poprawne,
- `test:smoke:desktop-nameplate-read-resilience` — poprawny po końcowej korekcie anulowania workera,
- parser TypeScript/JSX dla zmienionych komponentów — poprawny,
- `verify:release` — dwa przebiegi poprawne,
- publiczny npm nie odpowiedział w 25 sekund (`npm ping`), dlatego lokalny produkcyjny build i pełny Playwright nie zostały wykonane,
- produkcyjny build, brakujący test Supabase i pełny Playwright muszą zakończyć się na zielono w GitHub Actions.

## Zasada wdrożenia
Publikować dopiero po zielonym wyniku GitHub Actions. Dla poprawki 8.93 nie uruchamiać nowego SQL.
