# RELEASE RESULT

## Wersja
- 13.27 (przygotowanie — nie potwierdza wdrożenia)

## Zakres
- Potwierdzanie SN wyłącznie gdy niezależny odczyt Code 128 i OCR nadruku zgadzają się.
- Ostrzeżenie o niezgodnych numerach, brak automatycznego prefill, ręczna korekta i check na zdjęciu.
- Dla pojedynczego źródła / AI odczyt pozostaje tylko propozycją do ręcznej akceptacji.
- Zachowana obsługa różnych serii jednostek i wymagane dane protokołu.

## Bramki
- Wymagane zielone CI PR (targeted-checks, E2E mobile, build, Closure Gate).
- Po merge Vercel READY dla tego samego SHA i sprawdzenie 13.27 na iPhonie.
