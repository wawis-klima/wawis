# WAWIS — Release checklist 10.63+

Ta checklista dotyczy aktualnego procesu wydania. Historia zmian należy do `CHANGELOG.md`, a nie do checklisty.

## 1. Start wersji

- [ ] Punktem startowym jest aktualny, poprawny `main`.
- [ ] Utworzono `release/v<WERSJA>`.
- [ ] Określono ścieżkę: standard albo `MICRO UI`.
- [ ] MICRO UI jest dozwolone wyłącznie wtedy, gdy wszystkie istotne zmiany to CSS pod `src/` albo `public/`.
- [ ] Na początku sprawdzono diagnostykę z ostatnich 24 h i zapisano ją jako informacyjny baseline. Diagnostyka nie blokuje wydania.

## 2. Praca nad zmianą

- [ ] Zmiany robocze pozostają na gałęzi release, nie na `main`.
- [ ] PR do `main` uruchamia `WAWIS PR checks`.
- [ ] `scripts/release-impact.cjs` klasyfikuje zmianę jako `fast-ui`, `targeted` albo `critical`.
- [ ] Dla kandydata MICRO UI `scripts/micro-ui-policy.cjs` potwierdza CSS-only.
- [ ] Pliki wygenerowane wyłącznie przez bump wersji i dokumentacja release nie podnoszą samodzielnie profilu ryzyka.

## 3. Profile automatyczne

- `MICRO UI` — tylko CSS aplikacji: bez osobnego workflow przygotowawczego, jeden szybki PR check, jeden merge, jeden Vercel.
- `FAST UI` — pozostała bezpieczna prezentacja, np. statyczne assety: lekkie grupy `ui-fast-*`.
- `TARGETED` — frontend funkcjonalny: tylko powiązane grupy domenowe + E2E właściwej platformy.
- `CRITICAL` — backend, Supabase, auth/RLS, storage, synchronizacja, push, deployment lub release automation: pełne grupy + E2E mobile i desktop.

## 4. Standardowy finalny release

Dla wydania innego niż MICRO UI:

- [ ] README pokazuje aktualną wersję i konkretny opis bez placeholdera.
- [ ] CHANGELOG ma konkretną sekcję aktualnej wersji.
- [ ] Uruchomiono **WAWIS final release checks** w trybie `auto`.
- [ ] Każda grupa wymagana przez profil wykonała się jeden raz.
- [ ] Playwright uruchomił się tylko wtedy, gdy profil go wymagał.
- [ ] `npm run build`, `verify:bundle`, `verify:release` przeszły.
- [ ] `main_protection.final_release_run_id` zawiera ID zielonego finalnego workflow.
- [ ] `main_protection.ready_for_main=true` ustawiono po wszystkich powyższych krokach.
- [ ] Diagnostyka nie jest warunkiem `ready_for_main` ani GO/NO-GO.

## 5. MICRO UI — szybka ścieżka

- [ ] Wszystkie istotne pliki są `.css` pod `src/` albo `public/`.
- [ ] Nie tworzymy żadnego per-wersja workflow typu `micro prepare` ani `vXX-micro-prepare.yml`.
- [ ] Wersja, README/CHANGELOG i `RELEASE-GATE.json` są aktualizowane bezpośrednio na `release/v<WERSJA>`.
- [ ] `RELEASE-GATE.json.release_mode` ma `micro-ui`.
- [ ] `RELEASE-GATE.json.micro_ui.css_only=true`.
- [ ] `archive.blocking=false`.
- [ ] README i CHANGELOG opisują nową wersję bez placeholdera.
- [ ] Otworzono PR z `release/v<WERSJA>` do `main`.
- [ ] Wykonał się **jeden** `WAWIS PR checks / targeted-checks` i jest zielony.
- [ ] PR check klasyfikuje efektywny diff, więc automatyczne pliki wersji nie uruchamiają grup `infra` ani `push`.
- [ ] Nie uruchamiamy `WAWIS final release checks` przed merge.
- [ ] Nie czekamy na ZIP ani zewnętrzny backup przed merge.
- [ ] Merge do `main` wykonujemy tylko raz.
- [ ] Vercel wykonuje jeden produkcyjny deploy.
- [ ] `micro-ui-deploy-gate.cjs` ponownie potwierdza CSS-only na realnym diffie produkcyjnym.

## 6. `main` i produkcja

- [ ] Źródłem merge/pusha jest `release/v<WERSJA>`.
- [ ] `main` nie zawiera dodatkowych roboczych zmian.
- [ ] Vercel przed buildem uruchamia `vercel-deploy-guard.cjs` i `deploy-gate-router.sh`.
- [ ] Dla standardu router wybiera `release-policy-gate.cjs --deploy`.
- [ ] Dla MICRO UI router wybiera `micro-ui-deploy-gate.cjs`.
- [ ] Produkcyjny deployment zakończył się sukcesem.

## 7. Po wdrożeniu

- [ ] Deployment Vercela dla commita `main` zakończył się sukcesem.
- [ ] Opcjonalny szybki odczyt `/app-version.json` i Service Workera może potwierdzić wersję, ale nie tworzy osobnej blokującej bramki.
- [ ] Nie tworzymy per-wersja workflow/gałęzi tylko do post-deploy checku.
- [ ] Diagnostyka pozostaje raportem informacyjnym.
