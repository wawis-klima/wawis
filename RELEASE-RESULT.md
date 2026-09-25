# RELEASE RESULT

## Wersja
- 11.46

## Tryb
- mobile / hotfix

## Zakres
- Phomemo nadal otrzymuje jeden plik PNG
- szerokość PNG 3307 px zamiast 1800 px
- zachowany dokładny renderer PNG z 10.59
- brak udostępniania PDF do Phomemo

## Kryteria wydania
- shareStoredJobProtocol wysyła wyłącznie image/png
- renderer nie zawiera ścieżki share-pdf
- test obrazu potwierdza 3307 px szerokości i proporcje A4
- regresje, E2E i build muszą być zielone

## Wynik wdrożenia
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- wymagane E2E: PENDING
- produkcyjny build: PENDING
- deployment produkcyjny: PENDING
- merge produkcyjny: PENDING
