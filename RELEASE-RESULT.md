# RELEASE RESULT

## Wersja
- 13.28 (przygotowanie — nie potwierdza wdrożenia)

## Zakres
- Niepełna lub rozbieżna weryfikacja numeru SN: kod kreskowy i OCR, a następnie niezależny od podpowiedzi wizualny odczyt AI.
- Tylko wysoka zgodność AI z jednym z odczytów i jednoznacznie przepisany nadruk S/N daje automatyczne potwierdzenie.
- Przy braku wiarygodnego rozstrzygnięcia monter nadal musi sprawdzić i potwierdzić SN; błędny odczyt nie jest zapisywany automatycznie.
- API nie przekazuje niezweryfikowanych kodów w trybie niezależnej weryfikacji, pozostałe funkcje pozostają bez zmian.

## Bramki
- Zielone CI PR, testy regresji AI, wymagane mobile i desktop E2E, Closure Gate oraz produkcyjny build.
- Po merge potwierdzenie Vercel READY dla SHA i test 13.28 na iPhonie.
