# RELEASE RESULT

## Wersja
- 9.00

## Tryb
- mobile — stabilizacja zapisu tabliczek znamionowych

## Zakres
- po potwierdzonym zapisie modal zamyka się przed pełnym odświeżeniem danych,
- odświeżenie zlecenia działa w tle i ma limit 15 sekund,
- zapis danych urządzenia i upload mają limit 15 sekund,
- po timeoutcie uploadu aplikacja wykonuje lekką weryfikację zdjęć na serwerze przez maksymalnie 8 sekund,
- modal zamyka się po timeoutcie tylko wtedy, gdy wszystkie dodawane tabliczki są już potwierdzone w Supabase,
- każdy etap zapisuje zdarzenie w raporcie diagnostycznym,
- brak zmian w OCR, desktopie, wyglądzie, katalogu EAN i Supabase,
- brak nowej migracji SQL.

## Kontrola lokalna
- test odporności zapisu tabliczek — poprawny,
- test kolejki offline, idempotencji, Centrum synchronizacji, widoczności między urządzeniami i zakończenia zlecenia — poprawne,
- kontrola składni — poprawna,
- `verify:release` — poprawny.

## Ograniczenia środowiska
- pełny Vite build i Playwright wymagają zielonego wyniku GitHub Actions.
