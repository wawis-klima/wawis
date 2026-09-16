# WAWIS — stałe zasady projektu i wydania

Ten plik jest nadrzędnym źródłem zasad dla każdej kolejnej wersji aplikacji WAWIS. Szczegóły operacyjne są w `RELEASE-CHECKLIST.md`.

## 1. Źródło prawdy i GAŁĄŹ RELEASE

- Punktem startowym jest ostatni poprawny `main`.
- Dla każdej wersji tworzymy `release/v<WERSJA>` i wszystkie zmiany robocze wykonujemy tam.
- Nie robimy serii roboczych commitów bezpośrednio na `main`.
- Domyślny tryb normalnego finalnego wydania to `auto`; ręczne `mobile`, `desktop` albo `full` pozostają trybem awaryjnym.
- Normalne wydanie trafia do `main` dopiero po wymaganych testach i zielonym finalnym runie. GitHub (`main` + historia commitów) jest źródłem archiwalnym; ZIP i Google Drive nie są zależnością wydania.
- Wyjątek stanowi ściśle ograniczony tryb `MICRO UI`, opisany niżej: CSS-only, jeden PR check, jeden merge, jeden Vercel; archiwum nie blokuje produkcji.
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

Diagnostykę sprawdzamy **na początku pracy nad wersją**, żeby wiedzieć, czy produkcja ma już istniejące problemy zanim zaczniemy zmiany. Wynik można zapisać jako baseline w `RELEASE-GATE.json`.

Diagnostyka jest od teraz **informacyjna**. Nie jest elementem GO/NO-GO finalnego release, nie blokuje merge do `main`, Vercela ani zamknięcia post-deploy. Powód: zdarzenia mogą zostać dosłane z opóźnieniem przez starszą wersję aplikacji i dawać fałszywy alarm po wdrożeniu.

Po produkcji diagnostykę nadal zbieramy i analizujemy jako raport. Realne nowe błędy trafiają do kolejnej poprawki, ale sam raport nie zatrzymuje wydanej wersji.

## 5. Bramka GO / NO-GO

### Normalne wydanie

Wymaga spójnej wersji, README/CHANGELOG bez placeholderów, wymaganych testów, produkcyjnego builda, `verify:bundle`, `verify:release`, `ready_for_main=true` oraz zielonego finalnego runu przypiętego do gałęzi release.

**Diagnostyka nie jest warunkiem bramki GO/NO-GO.**

### MICRO UI

`scripts/micro-ui-deploy-gate.cjs` przed buildem Vercela wymaga:

1. spójnej wersji we wszystkich aktywnych plikach,
2. README i CHANGELOG bez placeholderów,
3. `release_mode=micro-ui`,
4. `archive.blocking=false`,
5. właściwej gałęzi `release/v<WERSJA>`,
6. wymagania zielonego `WAWIS PR checks / targeted-checks`,
7. niezależnej ponownej klasyfikacji diffu produkcyjnego jako CSS-only,
8. identycznej listy plików CSS w diffie i `RELEASE-GATE.json`.

Jeżeli produkcyjny diff zawiera coś poza dozwolonym CSS, MICRO UI dostaje `NO-GO` i nie może ominąć standardowej bramki.

## 6. GitHub i archiwum

`main` wraz z historią commitów jest źródłem prawdy i archiwum każdej wersji. Google Drive nie jest używany w procesie release. ZIP jest opcjonalny i tworzony tylko na żądanie (`--package`); jego brak nie blokuje testów, merge ani Vercela.

## 7. Ochrona `main` i produkcji

- `main` jest przeznaczony wyłącznie dla gotowych wydań.
- Normalny release wymaga zielonego finalnego runu; Drive/ZIP nie są warunkiem.
- MICRO UI wymaga CSS-only oraz zielonego `WAWIS PR checks / targeted-checks`; finalny runner nie jest wymagany przed merge.
- GitHub Ruleset powinien wymuszać PR do `main`, zielony `WAWIS PR checks / targeted-checks`, blokadę force-push i blokadę usuwania `main`.
- Vercel uruchamia `node scripts/vercel-deploy-guard.cjs`, następnie `scripts/deploy-gate-router.sh`, a dopiero potem build.
- Router wybiera standardowy `release-policy-gate.cjs --deploy` albo `micro-ui-deploy-gate.cjs` na podstawie `RELEASE-GATE.json.release_mode`.
- `vercel-deploy-guard.cjs` dopuszcza wyłącznie środowisko `production` i gałąź `main`.
- Automatyczne deploye Vercela są wyłączone dla wszystkich gałęzi roboczych, także nazw zawierających `/` takich jak `release/vX`.
- Jedyną gałęzią, która może automatycznie uruchomić Vercel, jest `main`; jeden merge gotowego wydania oznacza jeden produkcyjny deploy.

## 8. Kontrola po wdrożeniu

Po merge wymagany jest zielony deployment Vercela dla commita `main`. Odczyt `/app-version.json` i cache Service Workera pozostaje szybkim testem pomocniczym, ale nie tworzy drugiej blokującej bramki release. Nie tworzymy per-wersja gałęzi/workflow tylko po to, aby powtórzyć kontrolę po poprawnym deployu. Diagnostyka pozostaje informacyjna.

## 9. Stała kolejność

Normalny release:

`DIAGNOSTYKA STARTOWA (INFO) -> RELEASE BRANCH -> ZMIANA -> PR CHECKS -> FINAL RELEASE -> BUILD/VERIFY -> MAIN -> VERCEL -> OPCJONALNY SZYBKI LIVE CHECK`

MICRO UI:

`RELEASE BRANCH -> CSS ONLY -> VERSION/GATE -> ONE PR CHECK -> MAIN -> ONE VERCEL`

Nie używamy MICRO UI do zmian funkcjonalnych ani infrastrukturalnych.
