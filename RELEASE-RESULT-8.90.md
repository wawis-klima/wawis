# RELEASE RESULT

## Wersja
- 8.90

## Tryb
- desktop — hotfix usuwania komentarzy

## Podsumowanie
- naprawiono modal `Usunąć komentarz?`, który mógł pozostawać w stanie `Trwa...` bez końca,
- po potwierdzonym usunięciu komentarza modal zamyka się natychmiast,
- pełne `refreshAll` i ponowne wczytanie szczegółów działają w tle i nie blokują okna,
- RPC, fallback DELETE oraz odświeżenia mają limit 15 sekund,
- brak rekordu po ponownym usunięciu jest traktowany jako osiągnięty stan,
- wygląd aplikacji, zdjęcia, tabliczki, adresy klientów i Supabase: bez zmian,
- nowa migracja SQL: brak.

## Kontrola lokalna
- nowy `test:smoke:comment-delete-resilience`: timeout, idempotencja RPC/fallback i brak blokowania modalu — OK,
- komplet dostępnych testów smoke desktopu bez pełnego Playwright: dwa przebiegi — OK,
- komplet dostępnych testów smoke mobile bez pełnego Playwright: dwa przebiegi — OK, z jednym znanym pominięciem `job-contractor-conflict`, które lokalnie wymaga niezainstalowanego `@supabase/supabase-js`,
- `verify:release`: dwa przebiegi — OK,
- składnia zmienionych modułów i testu — OK,
- testy czystości ZIP-a oraz `verify-release --require-zip` — OK,
- końcowy ZIP: 454 pliki, brak błędów archiwum,
- produkcyjny build Vite i pełny Playwright: GitHub Actions / Vercel z dostępem do npm.

## Zasada wdrożenia
Publikować po zielonym wyniku GitHub Actions. Nie ma nowego SQL do uruchomienia.
