# RELEASE RESULT

## Wersja
- 8.96

## Tryb
- desktop — naprawa odczytu EAN, modelu i numeru seryjnego bez zmian w mobile

## Zakres
- usunięto runtime zależność czytnika tabliczek od zewnętrznego CDN UNPKG,
- zachowano natywny `BarcodeDetector` przeglądarki,
- dodano własny lokalny dekoder EAN-13 z walidacją sumy kontrolnej,
- gdy kody kreskowe nie dają kompletu danych, automatycznie uruchamiany jest lokalny Tesseract dla nadruków `PC/EAN`, `SN` i kodu modelu,
- wynik lokalnego OCR jest łączony z wynikami kodów przed sprawdzeniem katalogu EAN,
- numer seryjny odczytany z nadruku jest wpisywany automatycznie i oznaczany jako wymagający kontroli znak po znaku,
- surowy wynik pokazuje źródło każdej wartości i diagnostykę użytych lokalnych czytników,
- zamknięcie okna albo przekroczenie limitu czasu kończy również automatyczny worker OCR.

## Przypadek regresyjny
- model: `RO35Xi R14`,
- EAN: `5905567601132`,
- numer seryjny: `540V9839703A70010130182`,
- dodano parser typowych pomyłek OCR, ale EAN jest przyjmowany wyłącznie po poprawnej sumie kontrolnej EAN-13,
- dodano fixture zdjęcia oraz test `test:smoke:desktop-nameplate-automatic-fallback`.

## Zabezpieczenia
- znany EAN nadal uzupełnia markę, model i moc z wbudowanego lub centralnego katalogu,
- zgodność JZ/JW pozostaje kontrolowana,
- zapis następuje dopiero po ręcznym zatwierdzeniu administratora,
- brak zmian w aplikacji mobilnej, kolejce zdjęć, komentarzach, adresach klientów i Supabase,
- brak nowej migracji SQL.

## Kontrola
- 86 skryptów `test:smoke:*` wykrytych w projekcie,
- 84 testy możliwe do wykonania bez `node_modules` i katalogu `dist` — dwa pełne przebiegi poprawne,
- `test:smoke:dist-mobile-css` wymaga wcześniejszego produkcyjnego builda,
- `test:smoke:job-contractor-conflict` wymaga zainstalowanego `@supabase/supabase-js`; oba testy wykona GitHub Actions po `npm ci`,
- testy OCR, EAN/Code 128, katalogu produktów, utrzymania zdjęcia, białego ekranu i limitów czasu — poprawne,
- moduły JS zmienionego czytnika i testów przechodzą kontrolę składni Node,
- `npm ping` do publicznego rejestru nie zakończył się w limicie lokalnego środowiska; lokalny build nie został potwierdzony,
- pełny Vite build i Playwright — wymagane zielone wyniki GitHub Actions przed publikacją.

## Migracje
- dla wersji 8.96 nie ma nowego SQL,
- pozostają wcześniejsze migracje katalogu z 8.92 oraz poprawiony seed 8.95, jeśli nie zostały jeszcze wykonane.
