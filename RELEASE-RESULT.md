# RELEASE RESULT

## Wersja
- 11.43

## Tryb
- mobile / hotfix

## Zakres
- naprawa regresji rozmiaru wydruku protokołu w Phomemo M832
- przywrócenie sprawdzonego renderu PNG 1800 px
- zachowanie proporcji A4 bez błędnego przeliczania fizycznego rozmiaru przez założone 400 DPI
- bez zmian w PDF, Supabase, RLS, Storage i danych

## Kryteria wydania
- test obrazu protokołu musi potwierdzić szerokość 1800 px
- obraz musi zachować proporcje A4
- test nie może ponownie wyliczać fizycznego rozmiaru Phomemo z założonego DPI
- pełny build i wymagane testy PR muszą być zielone

## Wynik wdrożenia
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- produkcyjny build: PENDING
- deployment produkcyjny: PENDING
- merge produkcyjny: PENDING
