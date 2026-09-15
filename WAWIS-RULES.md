# WAWIS — stałe zasady projektu i wydania

Ten plik jest nadrzędnym źródłem zasad dla każdej kolejnej wersji aplikacji WAWIS. Szczegóły operacyjne są w `RELEASE-CHECKLIST.md`.

## 1. Źródło prawdy i GAŁĄŹ RELEASE

- Punktem startowym jest ostatni poprawny `main`.
- Dla każdej wersji tworzymy `release/v<WERSJA>` i wszystkie zmiany robocze wykonujemy tam.
- Nie robimy serii roboczych commitów bezpośrednio na `main`.
- Domyślny tryb normalnego finalnego wydania to `auto`; ręczne `mobile`, `desktop` albo `full` pozostają trybem awaryjnym.
- Normalne wydanie trafia do `main` dopiero po testach, pre-deploy GO, finalnym ZIP i zweryfikowanym backupie Drive.
- Wyjątek stanowi ściśle ograniczony tryb `MICRO UI`, opisany niżej: CSS-only, jeden PR check, jeden merge, jeden Vercel; ZIP powstaje po merge i nie blokuje produkcji.
- Push/merge do `main` jest sygnałem produkcyjnego wdrożenia i powinien wystąpić zasadniczo raz dla gotowej wersji.

## 2. Automatyczna klasyfikacja zmian

`scripts/release-impact.cjs` porównuje gałąź release z produkcyjnym `main` i wybiera profil ryzyka:

- `FAST UI` — bezpieczna warstwa prezentacji, np. CSS i statyczne assety.
- `TARGETED` — zmiana funkcjonalna frontendu bez obszarów krytycznych.
- `CRITICAL` — backend, Supabase, RLS/uprawnienia, auth, storage, synchronizacja, push, konfiguracja wdrożenia albo sama automatyka release.

Dodatkowo `scripts/micro-ui-policy.cjs` wyodrębnia z `FAST UI` jeszcze węższy profil `MICRO UI`:

- wszystkie istotne pliki muszą być plikami `.css` pod `src/` albo `public/`,
- nie wolno zmieniać JSX/JS/TS, logiki, Supabase, push, konfiguracji runtime ani backendu,
- jeśli choć jeden istotny plik nie spełnia reguły CSS-only, wydanie automatycznie wraca do standardowej ścieżki.

Pliki wygenerowane wyłącznie przez podbicie wersji oraz dokumentacja wydania nie podnoszą samodzielnie profilu ryzyka.

## 3. Testy — mniej, ale znaczące

### PR / praca nad wersją

- `.github/workflows/pr-checks.yml` wykrywa zmienione pliki.
- Nowy commit anuluje starszy przebieg tego samego PR (`cancel-in-progress`).
- PR-check nie wykonuje finalnego produkcyjnego builda ani pełnego Playwrighta.
- Dla MICRO UI uruchamiany jest tylko jeden szybki zestaw regresji UI; nie uruchamiamy osobno finalnego runnera release.

### Normalne finalne wydanie

- `.github/workflows/release-checks.yml` domyślnie działa w trybie `auto`.
- Każda wybrana grupa regresji wykonuje się jeden raz.
- Playwright uruchamia się wyłącznie wtedy, gdy wymaga tego profil; maksymalnie raz na platformę.
- Produkcyjny `build`, `verify:bundle`, `verify:release`, utworzenie ZIP-a i kontrola ZIP-a wykonują się po jednym razie.
- Regresje są grupowane m.in. jako `jobs`, `photos`, `protocol`, `roles`, `push`, `fuel`, `nameplates`, `mobile`, `desktop` oraz lekkie grupy `ui-fast-*`.

### MICRO UI

- brak `WAWIS final release checks` przed merge,
- brak Playwrighta, chyba że konkretna poprawka ma osobny test wizualny dodany świadomie,
- brak blokującego ZIP/Drive przed merge,
- po zielonym `WAWIS PR checks / targeted-checks` następuje jeden merge do `main`,
- Vercel wykonuje jeden produkcyjny build,
- `.github/workflows/micro-ui-archive.yml` tworzy ZIP asynchronicznie po merge jako GitHub Artifact.

## 4. Diagnostyka

Dla normalnych wydań przed zmianami sprawdzamy `app_diagnostic_events` z ostatnich 24 godzin i zapisujemy baseline w `RELEASE-GATE.json`. Przed finalnym release sprawdzamy ponownie ostatnie 24 h. Nowy niewyjaśniony problem oznacza `NO-GO`.

Dla MICRO UI diagnostyka nie blokuje samego deployu, ponieważ ścieżka dopuszcza wyłącznie CSS. Po produkcji nadal można wykonać kontrolę wersji i diagnostyki asynchronicznie.

## 5. Bramka GO / NO-GO

### Normalne wydanie

Wymaga spójnej wersji, README/CHANGELOG bez placeholderów, diagnostyki GO, wymaganych testów, produkcyjnego builda, `verify:bundle`, `verify:release`, finalnego ZIP-a, zweryfikowanego backupu Drive oraz `ready_for_main=true`.

### MICRO UI

`scripts/micro-ui-deploy-gate.cjs` przed buildem Vercela wymaga:

1. spójnej wersji we wszystkich aktywnych plikach,
2. README i CHANGELOG bez placeholderów,
3. `release_mode=micro-ui`,
4. `drive_backup.required=false` i `deferred=true`,
5. właściwej gałęzi `release/v<WERSJA>`,
6. wymagania zielonego `WAWIS PR checks / targeted-checks`,
7. niezależnej ponownej klasyfikacji diffu produkcyjnego jako CSS-only,
8. identycznej listy plików CSS w diffie i `RELEASE-GATE.json`.

Jeżeli produkcyjny diff zawiera coś poza dozwolonym CSS, MICRO UI dostaje `NO-GO` i nie może ominąć standardowej bramki.

## 6. Google Drive i archiwum

Normalne wydanie ma finalny ZIP w `Aplikacja/Wersje`, folder ID `1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S`, pod nazwą `klima-app-v<WERSJA>.zip`, zweryfikowany przed merge.

Dla MICRO UI ZIP nie blokuje wdrożenia. Po merge workflow `WAWIS micro UI archive` tworzy `klima-app-v<WERSJA>.zip` jako GitHub Artifact. Kopię na Drive można uzupełnić później bez uruchamiania kolejnego deployu produkcyjnego.

## 7. Ochrona `main` i produkcji

- `main` jest przeznaczony wyłącznie dla gotowych wydań.
- Normalny release wymaga finalnego runu i backupu Drive.
- MICRO UI wymaga CSS-only oraz zielonego `WAWIS PR checks / targeted-checks`; finalny runner i Drive nie są wymagane przed merge.
- GitHub Ruleset powinien wymuszać PR do `main`, zielony `WAWIS PR checks / targeted-checks`, blokadę force-push i blokadę usuwania `main`.
- Vercel uruchamia `node scripts/vercel-deploy-guard.cjs`, następnie `scripts/deploy-gate-router.sh`, a dopiero potem build.
- Router wybiera standardowy `release-policy-gate.cjs --deploy` albo `micro-ui-deploy-gate.cjs` na podstawie `RELEASE-GATE.json.release_mode`.
- `vercel-deploy-guard.cjs` dopuszcza wyłącznie środowisko `production` i gałąź `main`.
- Automatyczne deploye Vercela są wyłączone dla wszystkich gałęzi roboczych, także nazw zawierających `/` takich jak `release/vX`.
- Jedyną gałęzią, która może automatycznie uruchomić Vercel, jest `main`; jeden merge gotowego wydania oznacza jeden produkcyjny deploy.

## 8. POST-DEPLOY EVIDENCE

Dla normalnego wydania po wdrożeniu uruchamiamy `.github/workflows/post-deploy-checks.yml` albo równoważny `scripts/post-deploy-check.mjs`. Dowód potwierdza produkcyjną wersję, cache service workera oraz diagnostykę Supabase.

Dla MICRO UI ten dowód jest asynchroniczny i nie blokuje wejścia CSS-only na produkcję.

## 9. Stała kolejność

Normalny release:

`BASELINE -> RELEASE BRANCH -> ZMIANA -> PR CHECKS -> PRE-DEPLOY -> FINAL RELEASE -> BUILD/VERIFY/ZIP -> DRIVE -> MAIN -> VERCEL -> POST-DEPLOY`

MICRO UI:

`RELEASE BRANCH -> CSS ONLY -> VERSION/GATE -> ONE PR CHECK -> MAIN -> ONE VERCEL -> DEFERRED ZIP/POST-CHECK`

Nie używamy MICRO UI do zmian funkcjonalnych ani infrastrukturalnych.
