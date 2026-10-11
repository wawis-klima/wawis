# RELEASE RESULT

## Wersja
- 13.06

## Tryb
- mobile

## Zakres
- Potwierdzenie odrzucenia edycji urządzeń wyświetlane nad pełnoekranowym kreatorem.
- „Wstecz” i „Zamknij” prowadzą do dostępnego okna potwierdzenia, bez wpływu na dane ani OCR.
- Regresja Playwright: wejście przez przesunięcie karty i zwykłe wejście w Tabliczki, powrót oraz potwierdzenie odrzucenia.

## Weryfikacja
- Do potwierdzenia na PR: wymagane zielone CI dokładnego SHA, Playwright mobile, powiązane regresje i build.
- Wdrożenie: Vercel READY, kontrola /app-version.json (13.06) i fizyczny iPhone — niepotwierdzone w tej gałęzi.
