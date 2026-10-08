# RELEASE RESULT

## Wersja
- 12.71

## Tryb
- mobile

## Podsumowanie
- zakres: dotknięcie numeru wersji na iPhonie otwiera istniejącą diagnostykę
- testy GitHub CI: do weryfikacji przed merge
- Playwright mobile: do weryfikacji przed merge
- Closure Gate: do weryfikacji przed merge
- produkcyjny deployment: do potwierdzenia osobno po zielonym CI
- aktywna wersja i SHA: potwierdzenie wymagane po wdrożeniu
- fizyczny iPhone: ręczne potwierdzenie nawigacji i pobierania raportu wymagane
- uwaga: gałąź testowa release/v12.70 i PR #292 pozostają bez zmian

## Zakres implementacji
- Wersja w mobilnym pasku narzędzi jest przyciskiem z etykietą dostępności.
- Diagnostyka mobilna ładowana jest na żądanie, bez nowego przycisku i bez zmian w desktopie.
- Raport diagnostyczny, kolejka zdjęć, odświeżanie i powrót do montaży.
- Test PUSH dostępny tylko administratorowi.
- Test regresyjny scripts/smoke-mobile-version-diagnostics-v1271.mjs.

## Dowód
- Wyniki PR GitHub Actions oraz produkcyjny status Vercel należy zweryfikować po uruchomieniu odpowiednich działań; ten plik nie stwierdza ich sukcesu z góry.
