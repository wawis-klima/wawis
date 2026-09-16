# WAWIS — Release checklist 10.78+

Ta checklista dotyczy aktualnego uproszczonego procesu wydania. Historia zmian należy do `CHANGELOG.md`.

## 1. Start wersji

- [ ] Punktem startowym jest aktualny, poprawny `main`.
- [ ] Utworzono `release/v<WERSJA>`.
- [ ] Określono ścieżkę: standard albo `MICRO UI`.
- [ ] MICRO UI jest dozwolone wyłącznie wtedy, gdy wszystkie istotne zmiany to CSS pod `src/` albo `public/`.
- [ ] Na początku sprawdzono diagnostykę z ostatnich 24 h jako informacyjny baseline; diagnostyka nie blokuje wydania.

## 2. Praca nad zmianą

- [ ] Zmiany robocze pozostają na gałęzi release, nie na `main`.
- [ ] README pokazuje aktualną wersję i konkretny opis bez placeholdera.
- [ ] CHANGELOG ma konkretną sekcję aktualnej wersji.
- [ ] `RELEASE-GATE.json` wskazuje właściwą wersję i gałąź release.
- [ ] `scripts/release-impact.cjs` klasyfikuje zmianę jako `fast-ui`, `targeted` albo `critical`.
- [ ] Dla kandydata MICRO UI `scripts/micro-ui-policy.cjs` potwierdza CSS-only.

## 3. Jedyna obowiązkowa bramka CI

- [ ] Otworzono PR z `release/v<WERSJA>` do `main`.
- [ ] PR uruchomił `WAWIS PR checks / targeted-checks`.
- [ ] Zakres testów został dobrany automatycznie do realnego ryzyka zmian.
- [ ] `FAST UI` uruchomił lekkie regresje UI.
- [ ] `TARGETED` uruchomił powiązane grupy domenowe i potrzebne E2E.
- [ ] `CRITICAL` uruchomił rozszerzone grupy krytyczne i wymagane E2E.
- [ ] `WAWIS PR checks / targeted-checks` jest zielony.
- [ ] Nie uruchamiamy drugiego obowiązkowego workflow powtarzającego te same kontrole.

## 4. Gotowość do `main`

- [ ] `main_protection.ready_for_main=true`.
- [ ] `main_protection.source_branch` wskazuje `release/v<WERSJA>`.
- [ ] Nie wymagamy `final_release_run_id`, ZIP-a ani Google Drive.
- [ ] GitHub `main` + historia commitów są archiwum wersji.
- [ ] Merge do `main` wykonujemy jeden raz.

## 5. MICRO UI — szybka ścieżka

- [ ] Wszystkie istotne pliki są `.css` pod `src/` albo `public/`.
- [ ] Nie ma zmian JS/TS/JSX, Supabase, push, auth, storage ani konfiguracji runtime.
- [ ] Wersja, README/CHANGELOG i `RELEASE-GATE.json` są aktualne.
- [ ] `archive.blocking=false`.
- [ ] Wykonał się jeden zielony `WAWIS PR checks / targeted-checks`.
- [ ] Nie czekamy na ZIP, Drive ani osobny workflow archiwizujący.
- [ ] `micro-ui-deploy-gate.cjs` ponownie potwierdza CSS-only podczas produkcyjnego deployu.

## 6. Produkcja

- [ ] Vercel przed buildem uruchamia `vercel-deploy-guard.cjs` i `deploy-gate-router.sh`.
- [ ] Dla standardu router wybiera `release-policy-gate.cjs --deploy`.
- [ ] Dla MICRO UI router wybiera `micro-ui-deploy-gate.cjs`.
- [ ] Deployment Vercela dla commita `main` zakończył się sukcesem.

## 7. Po wdrożeniu

- [ ] Zielony deployment Vercela zamyka obowiązkową ścieżkę release.
- [ ] Opcjonalny szybki odczyt `/app-version.json` i Service Workera może potwierdzić wersję, ale nie tworzy osobnej bramki.
- [ ] Nie tworzymy per-wersja workflow/gałęzi do post-deploy checku.
- [ ] Diagnostyka pozostaje raportem informacyjnym.
