# WAWIS — stałe zasady projektu i wydania

Ten plik jest nadrzędnym źródłem zasad dla każdej kolejnej wersji aplikacji WAWIS. Szczegóły operacyjne są w `RELEASE-CHECKLIST.md`.

## 1. Źródło prawdy i GAŁĄŹ RELEASE

- Punktem startowym jest ostatni poprawny `main`.
- Dla każdej wersji tworzymy `release/v<WERSJA>` i wszystkie zmiany robocze wykonujemy tam.
- Nie robimy serii roboczych commitów bezpośrednio na `main`.
- Zakres wydania musi być jawny: `mobile`, `desktop` albo `full`.
- `main` dostaje dopiero gotowe wydanie po testach, pre-deploy GO, finalnym ZIP i zweryfikowanym backupie Drive.
- Push/merge do `main` jest sygnałem produkcyjnego wdrożenia Vercela i powinien wystąpić zasadniczo raz dla gotowej wersji.

## 2. Testy — mniej, ale znaczące

### PR / praca nad wersją

- `.github/workflows/pr-checks.yml` wykrywa zmienione pliki i uruchamia `core` + tylko odpowiednie grupy domenowe.
- Nowy commit anuluje starszy przebieg tego samego PR (`cancel-in-progress`).
- PR-check nie uruchamia pełnego Playwright ani pełnego builda.

### Finalne wydanie

- `.github/workflows/release-checks.yml` uruchamiamy świadomie dla `mobile`, `desktop` albo `full`.
- Każda grupa regresji wykonuje się jeden raz.
- Playwright mobile wykonuje się najwyżej raz, Playwright desktop najwyżej raz.
- Build, `verify:bundle` i `verify:release` wykonują się po jednym razie.
- `verify:release` sprawdza integralność wydania, a nie literalne napisy lub historyczny kształt kodu.
- Regresje są grupowane: `jobs`, `photos`, `protocol`, `roles`, `push`, `fuel`, `nameplates` oraz grupy platformowe.
- Test, który sprawdza wyłącznie konkretną treść przycisku albo nazwę scenariusza, nie powinien blokować wydania, jeśli nie jest to wymaganie funkcjonalne.

## 3. Diagnostyka

### Baseline

Przed zmianami sprawdzamy `app_diagnostic_events` z ostatnich 24 godzin i zapisujemy stan w `RELEASE-GATE.json`.
Znany, istniejący wcześniej problem może być opisany jako baseline; niewyjaśniony nowy problem oznacza `NO-GO`.

### Pre-deploy

Po zmianach i przed finalnym release ponownie sprawdzamy ostatnie 24 h. Wymagany jest status `GO`.

### Po wdrożeniu

Po produkcji nie wystarcza ręczne wpisanie `true`. Wymagany jest rzeczywisty odczyt produkcji i diagnostyki — patrz sekcja POST-DEPLOY EVIDENCE.

## 4. Bramka GO / NO-GO

Wydanie ma `GO`, gdy:

1. wersja jest spójna w aktywnych plikach,
2. README i CHANGELOG opisują aktualną wersję bez placeholderów,
3. baseline i pre-deploy diagnostics mają `GO`,
4. odpowiednie regresje oraz prawdziwe E2E są zielone,
5. produkcyjny build i `verify:bundle` przechodzą,
6. `verify:release` przechodzi,
7. finalny ZIP istnieje i ma poprawną wersję,
8. ZIP jest zweryfikowany na Google Drive,
9. release jest jawnie oznaczony jako gotowy do `main`.

Czerwony test funkcjonalny, błąd builda, brak Drive albo nowy niewyjaśniony błąd diagnostyczny oznacza `NO-GO`.

## 5. Google Drive

Każde wydanie ma finalny ZIP w:

- ścieżka: `Aplikacja/Wersje`,
- folder ID: `1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S`,
- nazwa: `klima-app-v<WERSJA>.zip`.

Po uploadzie trzeba ponownie odczytać folder i potwierdzić nazwę, ID pliku i rozmiar > 0. Dane zapisujemy w `RELEASE-GATE.json`.

## 6. Ochrona `main` i Vercela

- `main` jest przeznaczony wyłącznie dla gotowych wydań.
- `RELEASE-GATE.json.main_protection.ready_for_main` musi być `true` dopiero po zielonym finalnym release i backupie Drive.
- Vercel uruchamia `node scripts/release-policy-gate.cjs --deploy` przed buildem.
- Deploy gate wymaga zweryfikowanego ZIP-a Drive, właściwej gałęzi `release/v<WERSJA>` i ID finalnego zielonego runu.
- Dzięki temu przypadkowy push niegotowej wersji na `main` nie powinien przejść do produkcyjnego builda.
- Dodatkowa ochrona GitHub Branch Protection / Ruleset powinna wymagać PR do `main`; ustawienia są opisane w `MAIN-PROTECTION.md`.

## 7. POST-DEPLOY EVIDENCE

Po wdrożeniu uruchamiamy `.github/workflows/post-deploy-checks.yml` albo równoważny `scripts/post-deploy-check.mjs`.

Dowód musi potwierdzić rzeczywistym odczytem:

- produkcyjny `app-version.json` = aktualna wersja,
- produkcyjny `push-sw.js` zawiera `wawis-app-shell-v<WERSJA>`,
- diagnostyka Supabase została odczytana,
- od chwili wdrożenia nie pojawił się nowy błąd/ostrzeżenie blokujące wydanie.

Skrypt zapisuje `post-deploy-evidence.json`. Dopiero `node scripts/release-policy-gate.cjs --post --evidence post-deploy-evidence.json` może zamknąć wydanie.

## 8. Stała kolejność

`BASELINE DIAGNOSTICS -> GAŁĄŹ RELEASE -> ZMIANA -> TARGETED PR CHECKS -> PRE-DEPLOY DIAGNOSTICS -> FINAL RELEASE CHECKS -> FINAL ZIP -> GOOGLE DRIVE -> READY FOR MAIN -> MAIN/VERCEL -> PRODUCTION CHECK -> POST-DEPLOY EVIDENCE -> RELEASE CLOSE`

Nie deklarujemy wersji jako zakończonej przed ostatnim krokiem.
