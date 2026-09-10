# RELEASE RESULT - Wawis 9.21

## Wersja
- 9.21

## Zakres
- mobile administrator: mikrofon `Komentarz administratora` jest wymuszony w stałej kolumnie 48 px po prawej stronie pola, identycznie funkcjonalnie jak mikrofony przy `Miejscowość` i `Ulica i numer`,
- pole komentarza ma kompaktowe 2 wiersze / około 68 px wysokości,
- zachowano modal `Nagrywanie komentarza`, podgląd rozpoznawanego tekstu i przycisk `Zakończ nagrywanie`,
- `Data montażu` i `Wyczyść datę` są w jednym kompaktowym wierszu,
- pole daty ma dodatkowe ograniczenie szerokości iOS, aby nie ucinało prawego obramowania/zaokrąglenia,
- bez zmian: `Instalatorzy (opcjonalnie)` są niewidoczni przy tworzeniu nowego zlecenia i dostępni przy edycji.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Function.

## Kontrola lokalna
- nowy `smoke-mobile-new-job-layout-v921` sprawdza układ komentarza i daty,
- regresja obejmuje formularz 9.20, brak urządzeń 9.16, nagłówek 9.15, głos, dodawanie klienta przez pracownika 9.19, push 9.18 i numer wersji,
- testy uruchamiane 2× przed wydaniem.

## Build
- pełny lokalny build Vite nie jest oznaczony jako PASS, ponieważ w roboczym środowisku brakuje `node_modules/vite/bin/vite.js`; problem występuje przed kompilacją kodu 9.21.
