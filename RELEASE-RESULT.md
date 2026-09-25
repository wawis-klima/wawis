# RELEASE RESULT

## Wersja
- 11.44

## Tryb
- mobile / hotfix

## Zakres
- druk zapisanego protokołu jako oryginalny PDF A4
- pominięcie pomniejszającego edytora obrazu Phomemo jako ścieżki podstawowej
- PNG 1800 px pozostaje tylko fallbackiem technicznym
- bez zmian w treści PDF, podpisach, Supabase, RLS i Storage

## Kryteria wydania
- `shareStoredJobProtocol` ma preferować pojedynczy plik `application/pdf`
- test ma potwierdzić nazwę pliku `.pdf`, MIME PDF i brak uruchomienia konwersji PNG przy obsłudze PDF
- istniejące testy zapisu/protokołu muszą przejść
- wymagane E2E i build produkcyjny muszą być zielone

## Wynik wdrożenia
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- wymagane E2E: PENDING
- produkcyjny build: PENDING
- deployment produkcyjny: PENDING
- merge produkcyjny: PENDING
