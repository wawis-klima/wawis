# WAWIS — Release checklist 10.63+

Ta checklista dotyczy aktualnego procesu wydania. Historia zmian należy do `CHANGELOG.md`, a nie do checklisty.

## 1. Start wersji

- [ ] Punktem startowym jest aktualny, poprawny `main`.
- [ ] Utworzono `release/v<WERSJA>`.
- [ ] Określono ścieżkę: standard albo `MICRO UI`.
- [ ] MICRO UI jest dozwolone wyłącznie wtedy, gdy wszystkie istotne zmiany to CSS pod `src/` albo `public/`.

## 2. Praca nad zmianą

- [ ] Zmiany robocze pozostają na gałęzi release, nie na `main`.
- [ ] PR do `main` uruchamia `WAWIS PR checks`.
- [ ] `scripts/release-impact.cjs` klasyfikuje zmianę jako `fast-ui`, `targeted` albo `critical`.
- [ ] Dla kandydata MICRO UI `scripts/micro-ui-policy.cjs` potwierdza CSS-only.
- [ ] Pliki wygenerowane wyłącznie przez bump wersji i dokumentacja release nie podnoszą samodzielnie profilu ryzyka.

## 3. Profile automatyczne

- `MICRO UI` — tylko CSS aplikacji: jeden szybki PR check, jeden merge, jeden Vercel, ZIP po merge.
- `FAST UI` — pozostała bezpieczna prezentacja, np. statyczne assety: lekkie grupy `ui-fast-*`.
- `TARGETED` — frontend funkcjonalny: tylko powiązane grupy domenowe + E2E właściwej platformy.
- `CRITICAL` — backend, Supabase, auth/RLS, storage, synchronizacja, push, deployment lub release automation: pełne grupy + E2E mobile i desktop.

## 4. Standardowy pre-deploy i finalny release

Dla wydania innego niż MICRO UI:

- [ ] README pokazuje aktualną wersję i konkretny opis bez placeholdera.
- [ ] CHANGELOG ma konkretną sekcję aktualnej wersji.
- [ ] Sprawdzono diagnostykę z ostatnich 24 h i `RELEASE-GATE.json.predeploy_diagnostics` ma `GO`.
- [ ] Uruchomiono **WAWIS final release checks** w trybie `auto`.
- [ ] Każda grupa wymagana przez profil wykonała się jeden raz.
- [ ] Playwright uruchomił się tylko wtedy, gdy profil go wymagał.
- [ ] `npm run build`, `verify:bundle`, `verify:release` przeszły.
- [ ] Powstał ZIP, został zweryfikowany i wysłany na Drive.
- [ ] `main_protection.final_release_run_id` zawiera ID zielonego finalnego workflow.
- [ ] `main_protection.ready_for_main=true` ustawiono po wszystkich powyższych krokach.

## 5. MICRO UI — szybka ścieżka

- [ ] Wszystkie istotne pliki są `.css` pod `src/` albo `public/`.
- [ ] `RELEASE-GATE.json.release_mode` ma `micro-ui`.
- [ ] `RELEASE-GATE.json.micro_ui.css_only=true`.
- [ ] `drive_backup.required=false` oraz `drive_backup.deferred=true`.
- [ ] README i CHANGELOG opisują nową wersję bez placeholdera.
- [ ] Otworzono PR z `release/v<WERSJA>` do `main`.
- [ ] Wykonał się **jeden** `WAWIS PR checks / targeted-checks` i jest zielony.
- [ ] Nie uruchamiamy `WAWIS final release checks` przed merge.
- [ ] Nie czekamy na ZIP/Drive przed merge.
- [ ] Merge do `main` wykonujemy tylko raz.
- [ ] Vercel wykonuje jeden produkcyjny deploy.
- [ ] `micro-ui-deploy-gate.cjs` ponownie potwierdza CSS-only na realnym diffie produkcyjnym.
- [ ] Po merge `WAWIS micro UI archive` tworzy ZIP jako GitHub Artifact; Drive można uzupełnić później bez kolejnego deployu.

## 6. `main` i produkcja

- [ ] Źródłem merge/pusha jest `release/v<WERSJA>`.
- [ ] `main` nie zawiera dodatkowych roboczych zmian.
- [ ] Vercel przed buildem uruchamia `vercel-deploy-guard.cjs` i `deploy-gate-router.sh`.
- [ ] Dla standardu router wybiera `release-policy-gate.cjs --deploy`.
- [ ] Dla MICRO UI router wybiera `micro-ui-deploy-gate.cjs`.
- [ ] Produkcyjny deployment zakończył się sukcesem.

## 7. Post-deploy

Standardowy release:

- [ ] Uruchomiono `WAWIS post-deploy checks` albo `scripts/post-deploy-check.mjs`.
- [ ] Produkcyjny `/app-version.json` odpowiada wersji wydania.
- [ ] Produkcyjny `/push-sw.js` zawiera `wawis-app-shell-v<WERSJA>`.
- [ ] Od chwili deploymentu nie ma nowych błędów/ostrzeżeń blokujących wydanie.

MICRO UI:

- [ ] Weryfikacja live i diagnostyki może odbyć się asynchronicznie i nie blokuje CSS-only deployu.
- [ ] Odroczony ZIP nie wywołuje kolejnego merge ani Vercela.
