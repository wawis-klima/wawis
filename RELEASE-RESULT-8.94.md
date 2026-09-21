# RELEASE RESULT

## Wersja
- 8.94

## Tryb
- desktop — naprawa utraty podglądu i wyniku Code 128

## Przyczyna
- podpisany URL tego samego zdjęcia mógł zmienić się podczas sprawdzania katalogu EAN,
- efekt komponentu resetował wtedy `sourceFile`, `previewUrl` i token operacji,
- kody były już widoczne, ale dalsze wpisanie modelu i numeru seryjnego było anulowane.

## Poprawka
- reset obszaru roboczego zależy od stałej tożsamości rekordu zdjęcia, nie od czasowego URL,
- URL jest zapamiętywany na czas otwartego modala,
- numer seryjny z Code 128 trafia do formularza przed zapytaniem do katalogu,
- dodano awaryjne rozpoznanie SN z nie-EAN-owych detekcji,
- dodano widoczny komunikat awaryjny podglądu.

## Kontrola
- wszystkie dostępne smoke testy poza jednym wymagającym lokalnie `@supabase/supabase-js` — dwa przebiegi,
- `test:smoke:desktop-nameplate-source-persistence` — OK,
- testy OCR, EAN/Code 128, katalogu EAN i białego ekranu — OK,
- kontrola składni JS/JSX — OK,
- `verify:release` — dwa przebiegi poprawne,
- ZIP — 463 pliki, dwa przebiegi kontroli i pełny test integralności poprawne,
- lokalny build — zatrzymany podczas `npm ci` przez limit czasu środowiska bez dostępu do publicznego npm,
- pełny build i Playwright — GitHub Actions.

## Migracja SQL
- brak nowej migracji dla 8.94; katalog z 8.92 nadal wymaga wcześniejszego `nameplate-product-catalog-v8.92.sql`.
