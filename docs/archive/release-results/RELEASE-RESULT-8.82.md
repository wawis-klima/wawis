# RELEASE RESULT

## Wersja
- 8.82

## Tryb
- poprawka krytyczna mobile: synchronizacja zdjęć i tabliczek

## Wygenerowano
- 2026-07-30

## Zakres
- identyczne zdjęcie otrzymuje stały odcisk pliku oraz stały `upload_key`, więc nie tworzy drugiego wpisu w karcie ani w IndexedDB;
- ścieżka w Supabase Storage jest deterministyczna i oparta na identyfikatorze wysyłki;
- przed pierwszym uploadem i przed `Wyślij ponownie` aplikacja sprawdza, czy odpowiadające zdjęcie znajduje się już w tabeli `photos`;
- istniejący rekord serwerowy usuwa osierocony lokalny błąd bez ponownego wysyłania pliku;
- stare wpisy błędu tabliczek z wersji 8.81 są uzgadniane po montażu, jednostce JZ/JW, użytkowniku i czasie;
- serwerowa tabliczka ma pierwszeństwo nad nowszym lokalnym statusem `Błąd wysyłania`, dzięki czemu nie jest oznaczana jako brakująca;
- blokada `activePhotoUploadPromises` uniemożliwia równoległe wysyłanie tego samego elementu kolejki w aplikacji;
- lokalna baza `wawis-mobile-photo-queue` została podniesiona do wersji 2 i zapisuje `upload_key`, `file_fingerprint`, `unit_key` oraz `planned_storage_path`;
- dodano migrację `photo-upload-idempotency-v8.82.sql`, która usuwa dokładnie zduplikowane rekordy tej samej ścieżki i zakłada częściowy unikalny indeks na `photos.storage_path`;
- mobilny Playwright rozszerzono o ponowne wybranie identycznego pliku oraz usunięcie starego lokalnego błędu JZ, gdy tabliczka istnieje już na serwerze;
- dodano test `test:smoke:mobile-photo-idempotency` i włączono go po dwa razy do mobilnego oraz pełnego procesu wydania.

## Wyniki wykonane lokalnie
- 77 dostępnych testów smoke, przebieg 1: OK;
- 77 dostępnych testów smoke, przebieg 2: OK;
- `test:smoke:mobile-photo-idempotency`: OK;
- `test:smoke:mobile-offline-photo-queue`: OK;
- `test:smoke:nameplate-finish-verification`: OK;
- `test:smoke:mobile-photo-visibility-sync`: OK;
- `test:smoke:photo-cross-device-sync`: OK;
- kontrola składni plików JS/JSX w `src`, `api` i `tests/e2e` przez TypeScript: OK;
- kontrola składni wszystkich skryptów CJS przez `node --check`: OK;
- plan `release:mobile:dry-run`: nowy test, Playwright, verify, build i ZIP obecne po dwa razy;
- konfiguracja wersji `8.82` w `app-version.json`, `package.json`, `package-lock.json` i `src/version.js`: zgodna.
- `verify:release`, przebieg 1: OK;
- `verify:release`, przebieg 2: OK;
- końcowy ZIP: 446 plików, kontrola integralności i `verify-release --require-zip`: OK.

## Kontrole wymagające środowiska CI
- `test:smoke:job-contractor-conflict` importuje `@supabase/supabase-js` i uruchomi się po `npm ci` w GitHub Actions;
- rzeczywisty mobilny Playwright wymaga `@playwright/test` i Chromium;
- produkcyjny build wymaga zależności Vite z publicznego npm.

Próba `npm ping --registry=https://registry.npmjs.org/` została przerwana po 25 sekundach bez odpowiedzi, dlatego w tym środowisku nie wykonano `npm ci`, pełnego Playwright ani produkcyjnego builda. Te kroki są obowiązkowo wykonywane po dwa razy przez GitHub Actions.

## Wdrożenie
1. Najpierw uruchomić w Supabase SQL Editor cały plik `photo-upload-idempotency-v8.82.sql`.
2. Jeżeli migracja 8.81 nie była wcześniej wykonana, uruchomić również `contractor-addresses-v8.81.sql`.
3. Dopiero po poprawnym wykonaniu SQL wdrożyć aplikację 8.82.
4. Opublikować wersję dopiero po zielonym wyniku workflow mobile i desktop.
5. Ręcznie sprawdzić na telefonie: identyczne zdjęcie wybrane dwa razy, upload offline po odzyskaniu internetu oraz zlecenie z serwerową JZ i starym lokalnym błędem.

## Kryterium publikacji
- Zielony wynik obu workflow GitHub Actions: publikacja dozwolona.
- Czerwony wynik któregokolwiek workflow: wersji nie publikować; sprawdzić raport i artefakty testów.
