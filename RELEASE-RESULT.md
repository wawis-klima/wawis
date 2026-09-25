# RELEASE RESULT

## Wersja
- 11.42

## Tryb
- mobile / hotfix

## Zakres
- naprawa zapisu protokołu pracownika po globalnym timeout Supabase 12 s
- pominięcie pustego UPDATE płatności, gdy potwierdzenie zapłaty jest wyłączone i bez zmian
- kontrolowany RLS dla aktualizacji wyłącznie płatności po zakończeniu przez pracownika, który zakończył zlecenie
- przyjazny komunikat dla timeoutu Supabase zamiast technicznego AbortError

## Kryteria wydania
- `WAWIS PR checks / targeted-checks` musi być zielony
- `test:smoke:mobile-payment` musi potwierdzić brak requestu dla płatności bez zmian
- `test:smoke:mobile-protocol-save` musi potwierdzić obsługę timeoutów
- `test:smoke:mobile-thumbnail-recovery` musi potwierdzić osobne limity REST / podpis zdjęcia / Storage
- migracja RLS musi być zastosowana i sprawdzona advisorami Supabase

## Wynik wdrożenia
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- Supabase migration: PENDING
- produkcyjny build: PENDING
- deployment produkcyjny: PENDING
- merge produkcyjny: PENDING
