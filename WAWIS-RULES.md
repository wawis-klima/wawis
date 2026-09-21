# WAWIS — stałe zasady projektu i wydania

Ten plik jest nadrzędnym źródłem zasad dla każdej kolejnej wersji aplikacji WAWIS. Szczegóły operacyjne są w `RELEASE-CHECKLIST.md`.

## 1. Źródło prawdy i GAŁĄŹ RELEASE

- Punktem startowym jest ostatni poprawny `main`.
- Dla każdej wersji tworzymy `release/v<WERSJA>` i wszystkie zmiany robocze wykonujemy tam.
- Nie robimy serii roboczych commitów bezpośrednio na `main`.
- GitHub (`main` + historia commitów) jest źródłem prawdy i archiwum każdej wersji.
- Google Drive nie jest używany w procesie release.
- ZIP jest opcjonalny i tworzony wyłącznie na żądanie; brak ZIP-a nie blokuje testów, merge ani wdrożenia.
- Merge do `main` wykonujemy raz dla gotowej wersji i jest on sygnałem produkcyjnego wdrożenia Vercela.

## 2. Automatyczna klasyfikacja zmian

`scripts/release-impact.cjs` porównuje gałąź release z produkcyjnym `main` i wybiera profil ryzyka:

- `FAST UI` — bezpieczna warstwa prezentacji, np. CSS i statyczne assety.
- `TARGETED` — zmiana funkcjonalna frontendu bez obszarów krytycznych.
- `CRITICAL` — backend, Supabase, RLS/uprawnienia, auth, storage, synchronizacja, push, konfiguracja wdrożenia albo automatyka release.

`scripts/micro-ui-policy.cjs` wyodrębnia z `FAST UI` jeszcze węższy profil `MICRO UI`:

- wszystkie istotne pliki muszą być `.css` pod `src/` albo `public/`,
- nie wolno zmieniać JSX/JS/TS, logiki, Supabase, push, konfiguracji runtime ani backendu,
- jeżeli choć jeden istotny plik nie spełnia reguły CSS-only, wydanie wraca do standardowej ścieżki.

Pliki wygenerowane wyłącznie przez podbicie wersji oraz dokumentacja wydania nie podnoszą samodzielnie profilu ryzyka.

## 3. Testy — jedna bramka przed merge

- PR z `release/v<WERSJA>` do `main` uruchamia `.github/workflows/pr-checks.yml`.
- `WAWIS PR checks / targeted-checks` jest podstawową i obowiązkową bramką CI przed merge.
- `scripts/release-impact.cjs` dobiera zakres testów do realnego ryzyka zmian.
- `FAST UI` uruchamia lekkie regresje UI.
- `TARGETED` uruchamia powiązane grupy domenowe i E2E tylko tam, gdzie są potrzebne.
- `CRITICAL` uruchamia rozszerzone grupy dla obszarów krytycznych oraz wymagane E2E.
- Nowy commit anuluje starszy przebieg tego samego PR (`cancel-in-progress`).
- Nie uruchamiamy drugiego obowiązkowego workflow „final release” powtarzającego te same testy.
- Dodatkowy pełny test można uruchomić świadomie przy nietypowej zmianie, ale nie jest standardową zależnością release.

### MICRO UI

- CSS-only,
- jeden szybki `WAWIS PR checks / targeted-checks`,
- jeden merge do `main`,
- jeden produkcyjny Vercel,
- bez Playwrighta, chyba że dana poprawka ma świadomie dodany test wizualny,
- bez ZIP/Drive i bez osobnego workflow archiwizującego.

## 4. Diagnostyka

Diagnostykę sprawdzamy na początku pracy nad wersją jako informacyjny baseline. Nie jest elementem GO/NO-GO i nie blokuje PR, merge, Vercela ani zamknięcia wersji.

Po wdrożeniu diagnostyka może zostać przejrzana jako raport. Realne nowe błędy trafiają do kolejnej poprawki, ale raport nie zatrzymuje już wydanej wersji.

## 5. Bramka GO / NO-GO

Dla standardowego wydania wymagamy:

- spójnej wersji w aktywnych plikach,
- README i CHANGELOG bez placeholderów,
- właściwej gałęzi `release/v<WERSJA>`,
- `main_protection.ready_for_main=true`,
- zielonego `WAWIS PR checks / targeted-checks` przed merge,
- poprawnego produkcyjnego deploy gate Vercela.

Nie wymagamy `final_release_run_id`, ZIP-a, Google Drive ani osobnego dowodu post-deploy.

Dla `MICRO UI` `scripts/micro-ui-deploy-gate.cjs` dodatkowo ponownie potwierdza CSS-only na realnym diffie produkcyjnym.

## 6. Ochrona `main` i produkcji

- `main` jest przeznaczony wyłącznie dla gotowych wydań.
- GitHub Ruleset powinien wymuszać PR do `main`, zielony `WAWIS PR checks / targeted-checks`, blokadę force-push i blokadę usuwania `main`.
- Vercel uruchamia `node scripts/vercel-deploy-guard.cjs`, następnie `scripts/deploy-gate-router.sh`, a dopiero potem build.
- Router wybiera standardowy `release-policy-gate.cjs --deploy` albo `micro-ui-deploy-gate.cjs` na podstawie `RELEASE-GATE.json.release_mode`.
- Automatyczne deploye Vercela dla gałęzi roboczych są wyłączone; produkcję uruchamia `main`.

## 7. Kontrola po wdrożeniu

Po merge wymagany jest zielony deployment Vercela dla commita `main`.

Odczyt `/app-version.json` i cache Service Workera może zostać wykonany jako szybki test pomocniczy, ale nie tworzy drugiej blokującej bramki release. Nie tworzymy per-wersja workflow ani gałęzi tylko po to, żeby powtórzyć kontrolę po poprawnym deployu.

## 8. Stała kolejność

Standard:

`DIAGNOSTYKA STARTOWA (INFO) -> RELEASE BRANCH -> ZMIANA -> PR -> TARGETED PR CHECK -> MAIN -> VERCEL -> OPCJONALNY SZYBKI LIVE CHECK`

MICRO UI:

`RELEASE BRANCH -> CSS ONLY -> VERSION/GATE -> ONE PR CHECK -> MAIN -> ONE VERCEL`

Nie używamy MICRO UI do zmian funkcjonalnych ani infrastrukturalnych.
