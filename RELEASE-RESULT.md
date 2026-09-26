# RELEASE RESULT

## Wersja
- 11.52

## Zakres
- mobilny protokół klienta: poprawka realnego przewijania iOS po `Uzupełnij protokół`
- wykrywanie faktycznie aktywnego scroll-containera po przebudowaniu widoku
- korekta o 50 CSS px zgodnie z porównaniem zrzutów użytkownika
- bez zmian w PDF, podpisie, Supabase, RLS i e-mailu

## Dowód błędu
- w 11.51 kod korygował wyłącznie `.protocolWizardModal.scrollTop`
- na iPhonie Safari może utrzymywać aktywne przewinięcie na overlay zamiast na samym modalu
- dlatego test Chromium przechodził, a realny widok na iPhonie praktycznie się nie zmieniał

## Naprawa
- po wejściu w edycję aplikacja czeka na ustabilizowanie layoutu
- wybiera kontener, który rzeczywiście ma aktywne przewinięcie
- cofa jego `scrollTop` o 50 CSS px i powtarza ustawienie po 120 ms, aby skompensować iOS scroll anchoring
- jeśli modal jest realnym scrollerem, zachowanie pozostaje zgodne z dotychczasowym E2E

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
