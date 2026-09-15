# WAWIS — stałe zasady projektu i wydania

Ten plik jest nadrzędnym źródłem zasad dla każdej kolejnej wersji aplikacji WAWIS. Szczegóły operacyjne są w `RELEASE-CHECKLIST.md`.

## 1. Źródło prawdy i gałąź release

- Punktem startowym jest ostatni poprawny `main`.
- Dla każdej wersji tworzymy `release/v<WERSJA>` i wszystkie zmiany robocze wykonujemy tam.
- Nie robimy serii roboczych commitów bezpośrednio na `main`.
- Domyślny tryb finalnego wydania to `auto`; ręczne `mobile`, `desktop` albo `full` pozostają trybem awaryjnym.
- `main` dostaje dopiero gotowe wydanie po testach, pre-deploy GO, finalnym ZIP i zweryfikowanym backupie Drive.
- Push/merge do `main` jest sygnałem produkcyjnego wdrożenia i powinien wystąpić zasadniczo raz dla gotowej wersji.

## 2. Automatyczna klasyfikacja zmian

`scripts/release-impact.cjs` porównuje gałąź release z produkcyjnym `main` i wybiera jeden z trzech profili:

- `FAST UI` — wyłącznie bezpieczna warstwa prezentacji, np. CSS i statyczne assety. Uruchamiany jest mały zestaw smoke testów, bez Playwrighta.
- `TARGETED` — zmiana funkcjonalna frontendu bez obszarów krytycznych. Uruchamiane są tylko powiązane grupy regresji oraz E2E właściwej platformy.
- `CRITICAL` — backend, Supabase, RLS/uprawnienia, auth, storage, synchronizacja, push, konfiguracja wdrożenia albo sama automatyka release. Uruchamiana jest pełna regresja oraz E2E mobile i desktop.

Pliki wygenerowane wyłącznie przez podbicie wersji oraz dokumentacja wydania nie podnoszą samodzielnie profilu ryzyka.

## 3. Testy — mniej, ale znaczące

### PR / praca nad wersją

- `.github/workflows/pr-checks.yml` wykrywa zmienione pliki i korzysta z tego samego klasyfikatora ryzyka.
- Nowy commit anuluje starszy przebieg tego samego PR (`cancel-in-progress`).
- PR-check nie wykonuje finalnego produkcyjnego builda ani pełnego Playwrighta.

### Finalne wydanie

- `.github/workflows/release-checks.yml` domyślnie działa w trybie `auto`.
- Każda wybrana grupa regresji wykonuje się jeden raz.
- Playwright uruchamia się wyłącznie wtedy, gdy wymaga tego profil; maksymalnie raz na platformę.
- Niezależnie od profilu produkcyjny `build`, `verify:bundle`, `verify:release`, utworzenie ZIP-a i kontrola ZIP-a wykonują się po jednym razie.
- `verify:release` sprawdza integralność wydania, a nie historyczny kształt kodu.
- Regresje są grupowane m.in. jako `jobs`, `photos`, `protocol`, `roles`, `push`, `fuel`, `nameplates`, `mobile`, `desktop` oraz lekkie grupy `ui-fast-*`.

## 4. Diagnostyka

Przed zmianami sprawdzamy `app_diagnostic_events` z ostatnich 24 godzin i zapisujemy baseline w `RELEASE-GATE.json`. Po zmianach, przed finalnym release, sprawdzamy ponownie ostatnie 24 h. Znany wcześniejszy problem może być opisany jako baseline; nowy niewyjaśniony problem oznacza `NO-GO`.

Po produkcji wymagany jest rzeczywisty odczyt produkcji i diagnostyki — nie wystarcza ręczne wpisanie `true`.

## 5. Bramka GO / NO-GO

Wydanie ma `GO`, gdy:

1. wersja jest spójna w aktywnych plikach,
2. README i CHANGELOG opisują aktualną wersję bez placeholderów,
3. baseline i pre-deploy diagnostics mają `GO`,
4. wszystkie testy wymagane przez automatycznie wybrany profil są zielone,
5. produkcyjny build i `verify:bundle` przechodzą,
6. `verify:release` przechodzi,
7. finalny ZIP istnieje i ma poprawną wersję,
8. ZIP jest zweryfikowany na Google Drive,
9. release jest jawnie oznaczony jako gotowy do `main`.

Czerwony wymagany test, błąd builda, brak Drive albo nowy niewyjaśniony błąd diagnostyczny oznacza `NO-GO`.

## 6. Google Drive

Każde wydanie ma finalny ZIP w `Aplikacja/Wersje`, folder ID `1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S`, pod nazwą `klima-app-v<WERSJA>.zip`. Po uploadzie ponownie odczytujemy folder i potwierdzamy nazwę, ID pliku i rozmiar > 0. Dane zapisujemy w `RELEASE-GATE.json`.

## 7. Ochrona `main` i produkcji

- `main` jest przeznaczony wyłącznie dla gotowych wydań.
- `RELEASE-GATE.json.main_protection.ready_for_main` może być `true` dopiero po zielonym finalnym release i backupie Drive.
- Vercel uruchamia `node scripts/release-policy-gate.cjs --deploy` przed buildem.
- Deploy gate wymaga zweryfikowanego ZIP-a Drive, właściwej gałęzi release i ID finalnego zielonego runu.

## 8. Post-deploy evidence

Po wdrożeniu uruchamiamy `.github/workflows/post-deploy-checks.yml` albo równoważny `scripts/post-deploy-check.mjs`. Dowód musi potwierdzić rzeczywistym odczytem produkcyjną wersję, cache service workera oraz diagnostykę Supabase od chwili wdrożenia.

Skrypt zapisuje `post-deploy-evidence.json`. Dopiero `node scripts/release-policy-gate.cjs --post --evidence post-deploy-evidence.json` może zamknąć wydanie.

## 9. Stała kolejność

`BASELINE -> RELEASE BRANCH -> ZMIANA -> AUTO PR CHECKS -> PRE-DEPLOY -> AUTO FINAL RELEASE -> BUILD/VERIFY/ZIP -> DRIVE -> READY FOR MAIN -> MAIN/PRODUKCJA -> POST-DEPLOY EVIDENCE -> RELEASE CLOSE`

Nie deklarujemy wersji jako zakończonej przed ostatnim krokiem.
