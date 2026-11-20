# RELEASE RESULT

## Wersja
- 8.98

## Tryb
- mobile — Centrum synchronizacji zdjęć

## Zakres
- status połączenia i zdjęć pracownika otwiera Centrum synchronizacji,
- centrum pokazuje lokalne, wysyłane i błędne zdjęcia zapisane w IndexedDB,
- wpis zawiera rodzaj zdjęcia/tabliczki, klienta, adres, czas, liczbę prób i komunikat błędu,
- dodano ponowienie pojedyncze oraz `Wyślij wszystkie`, także dla pozycji oznaczonych jako błąd,
- dodano przejście z wpisu kolejki do właściwego zlecenia,
- lista jest filtrowana do aktualnie zalogowanego pracownika,
- czas ostatniej poprawnej synchronizacji jest zapisywany lokalnie osobno dla użytkownika,
- pobieranie szczegółów zlecenia nie zmienia już statusu kolejki zdjęć,
- brak zmian w OCR, desktopie, komentarzach, klientach, adresach i Supabase,
- brak nowej migracji SQL.

## Zabezpieczenia
- ręczne `Wyślij wszystkie` korzysta z istniejącej deduplikacji i blokady równoległych uploadów,
- przy ręcznej synchronizacji ponawiane są także pozycje `error`,
- bez internetu wysyłanie jest zablokowane, a pliki pozostają w IndexedDB,
- centrum nie umożliwia kasowania niewysłanych zdjęć,
- kolejka innego użytkownika zalogowanego wcześniej na tym samym telefonie nie jest wyświetlana.

## Kontrola lokalna
- 87 testów smoke możliwych bez `node_modules`, `dist` i screenshotów — dwa pełne przebiegi poprawne,
- `test:smoke:mobile-photo-sync-center` — poprawny,
- `test:smoke:mobile-photo-sync-indicator` — poprawny,
- `test:smoke:e2e-mobile` — poprawny,
- plan `release:mobile:dry-run` zawiera nowy test w obu przebiegach oraz pełny Playwright, build, ZIP i verify,
- parser TypeScript sprawdził składnię 298 plików JS/JSX/CJS/MJS — poprawnie,
- `verify:release` — pierwszy przebieg poprawny; drugi wykonywany po zapisaniu raportu,
- `npm ping` do publicznego npm nie zakończył się w limicie 25 sekund.

## Build i Playwright
- lokalne środowisko nie ma katalogu `node_modules`,
- produkcyjny Vite build i pełny Playwright nie zostały wykonane lokalnie z powodu braku odpowiedzi publicznego npm,
- przed publikacją wymagany jest zielony wynik workflow GitHub Actions mobile,
- workflow wykona `npm ci`, Chromium, dwa przebiegi Playwright, dwa buildy, kontrolę bundle, screenshot i ZIP.
