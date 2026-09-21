# RELEASE RESULT

## Wersja
- 8.99

## Tryb
- desktop — automatyczny OCR wyłącznie brakującego numeru seryjnego

## Zakres
- EAN, model i numer seryjny są przetwarzane jako niezależne wyniki,
- po kliknięciu `Odczytaj EAN / Code 128` wynik EAN i modelu jest zachowywany natychmiast,
- gdy EAN i dokładny model są znane, ale Code 128 nie zwrócił SN, uruchamia się lokalny OCR tylko dolnego obszaru i nadruku `SN`,
- pełny OCR PC/EAN/SN/model pozostaje fallbackiem, gdy brakuje również EAN-u lub modelu,
- numer seryjny z nadruku jest wpisywany automatycznie i oznaczony jako wymagający porównania znak po znaku,
- AI nadal działa wyłącznie po ręcznym kliknięciu,
- brak zmian w mobile, zdjęciach, komentarzach, klientach, adresach i Supabase,
- brak nowej migracji SQL.

## Kontrola lokalna
- dwa przebiegi testów OCR, EAN, katalogu produktów, utrzymania źródła zdjęcia, komentarzy i mobilnej kolejki zdjęć — poprawne,
- `test:smoke:desktop-nameplate-automatic-fallback` kontroluje osobny OCR tylko dla brakującego SN,
- `verify:release` — poprawny,
- kontrola składni plików JS/CJS/MJS — poprawna,
- końcowy ZIP zawiera 480 plików i nie zawiera `node_modules`, częściowego `dist` ani plików roboczych.

## Ograniczenia środowiska
- pełny Vite build i Playwright wymagają zielonego wyniku GitHub Actions, ponieważ lokalne środowisko nie ma gwarantowanego dostępu do publicznego npm.
