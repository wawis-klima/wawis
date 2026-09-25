# RELEASE RESULT

## Wersja
- 11.45

## Tryb
- mobile / hotfix

## Zakres
- usunięcie podstawowej ścieżki PDF z 11.44
- przywrócenie dokładnego mechanizmu PDF → PNG → Phomemo z 10.59
- PNG 1800 px i pojedynczy plik w navigator.share
- przywrócenie starego sposobu renderowania strony przez osobny canvas
- bez zmian w PDF źródłowym, Supabase, RLS i Storage

## Kryteria wydania
- `shareStoredJobProtocol` ma wysyłać jeden PNG i nigdy nie preferować PDF
- renderer ma odpowiadać wersji 10.59
- test wydruku ma potwierdzić PNG 1800 px
- regresje, E2E i build muszą być zielone

## Wynik wdrożenia
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- wymagane E2E: PENDING
- produkcyjny build: PENDING
- deployment produkcyjny: PENDING
- merge produkcyjny: PENDING
