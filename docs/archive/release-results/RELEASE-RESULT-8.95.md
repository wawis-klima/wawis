# RELEASE RESULT

## Wersja
- 8.95

## Tryb
- desktop — rozszerzenie katalogu EAN Rotenso bez zmian funkcjonalnych w mobile

## Zakres
- wbudowany katalog 92 potwierdzonych EAN-ów Rotenso,
- rodziny: Imoto, Ukura, Revio, Mirai, Teta, Roni, Elis, Luve, Versu i Fresh oraz ich warianty,
- rozróżnienie JW/JZ, kodu modelu, rewizji i mocy,
- centralny seed Supabase oraz pełny eksport CSV,
- wbudowany fallback działający również przy braku odpowiedzi centralnego katalogu,
- centralna pozycja Supabase nadal ma pierwszeństwo nad katalogiem wbudowanym.

## Pliki danych
- `src/data/rotenso-ean-catalog-v8.95.js` — 92 pozycje dostępne bez sieci,
- `nameplate-product-catalog-rotenso-seed-v8.95.sql` — idempotentny import do istniejącego katalogu Supabase,
- `wawis-katalog-ean-rotenso-v8.95.csv` — pełny katalog do kontroli i importu.

## Zabezpieczenia
- wszystkie EAN-y mają 13 cyfr i prawidłową sumę kontrolną,
- brak duplikatów EAN,
- `Xi` jest przypisane do JW, a `Xo` do JZ,
- brak zgadywania brakujących kodów,
- znany EAN jest rozpoznawany przed oczekiwaniem na centralny katalog,
- błąd lub brak tabeli Supabase nie blokuje rozpoznania pozycji wbudowanej,
- mobile, zdjęcia, komentarze, adresy klientów i pozostałe moduły nie zostały zmienione.

## Kontrola
- 84 skrypty smoke wykryte w projekcie,
- 83 dostępne smoke testy × 2 przebiegi — poprawne,
- `test:smoke:job-contractor-conflict` — pominięty lokalnie z powodu braku pakietu `@supabase/supabase-js`; uruchomi go GitHub Actions po `npm ci`,
- test katalogu sprawdza liczbę 92, unikalność, sumy kontrolne, typy JW/JZ, centralny lookup i fallback,
- testy OCR, EAN/Code 128 oraz utrzymania podglądu — poprawne,
- próba `npm run build` zatrzymała się na `npm ci`; dwie próby `npm ping` do publicznego rejestru przekroczyły limit czasu środowiska,
- pełny build i Playwright — do potwierdzenia przez GitHub Actions.

## Migracja SQL
1. Wymagana wcześniej: `nameplate-product-catalog-v8.92.sql`.
2. Dla wersji 8.95 uruchom: `nameplate-product-catalog-rotenso-seed-v8.95.sql`.
3. Seed jest idempotentny i może być uruchomiony ponownie.
