# WAWIS — Release checklist 10.63+

Ta checklista dotyczy aktualnego procesu wydania. Historia zmian należy do `CHANGELOG.md`, a nie do checklisty.

## 1. Start wersji

- [ ] Punktem startowym jest aktualny, poprawny `main`.
- [ ] Utworzono `release/v<WERSJA>`.
- [ ] Domyślny tryb finalnego wydania to `auto`.
- [ ] Sprawdzono `app_diagnostic_events` z ostatnich 24 h.
- [ ] `RELEASE-GATE.json.baseline_diagnostics` ma `checked=true`, `last_24h=true`, czas i `GO`.

## 2. Praca nad zmianą

- [ ] Zmiany robocze pozostają na gałęzi release, nie na `main`.
- [ ] PR do `main` uruchamia `WAWIS PR checks`.
- [ ] `scripts/release-impact.cjs` klasyfikuje zmianę jako `fast-ui`, `targeted` albo `critical`.
- [ ] Pliki wygenerowane wyłącznie przez bump wersji i dokumentacja release nie podnoszą samodzielnie profilu ryzyka.
- [ ] Nowa regresja ma test smoke albo scenariusz E2E, jeśli może wrócić.

## 3. Profile automatyczne

- `FAST UI` — CSS/statyczne assety: `ui-fast-*`, bez Playwrighta.
- `TARGETED` — frontend funkcjonalny: tylko powiązane grupy domenowe + E2E właściwej platformy.
- `CRITICAL` — backend, Supabase, auth/RLS, storage, synchronizacja, push, deployment lub release automation: pełne grupy + E2E mobile i desktop.

Grupy domenowe pozostają zdefiniowane w `scripts/test-groups.cjs`: `core`, `jobs`, `photos`, `protocol`, `roles`, `push`, `fuel`, `nameplates`, `mobile`, `desktop`, `infra` oraz lekkie `ui-fast-*`.

## 4. Pre-deploy i finalny release

- [ ] README pokazuje aktualną wersję i konkretny opis bez placeholdera.
- [ ] CHANGELOG ma konkretną sekcję aktualnej wersji.
- [ ] Ponownie sprawdzono diagnostykę z ostatnich 24 h.
- [ ] `RELEASE-GATE.json.predeploy_diagnostics` ma `GO`.
- [ ] Uruchomiono **WAWIS final release checks** w trybie `auto`, chyba że świadomie wymuszono ręczny zakres.
- [ ] Każda grupa wymagana przez wybrany profil wykonała się jeden raz.
- [ ] Playwright uruchomił się tylko wtedy, gdy profil go wymagał, maksymalnie raz na platformę.
- [ ] `npm run build` przeszedł raz.
- [ ] `npm run verify:bundle` przeszedł raz.
- [ ] `npm run verify:release` przeszedł raz.

## 5. Finalny ZIP i Drive

- [ ] Powstał `releases/klima-app-v<WERSJA>.zip`.
- [ ] `node scripts/verify-release.cjs --require-zip` ma GO.
- [ ] ZIP wysłano do `Aplikacja/Wersje` (folder ID `1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S`).
- [ ] Po uploadzie ponownie odczytano Drive i potwierdzono nazwę, ID i rozmiar > 0.
- [ ] Dane backupu wpisano do `RELEASE-GATE.json.drive_backup`.
- [ ] `main_protection.final_release_run_id` zawiera ID zielonego finalnego workflow.
- [ ] `main_protection.ready_for_main=true` ustawiono dopiero po wszystkich powyższych krokach.

## 6. `main` i produkcja

- [ ] Źródłem merge/pusha jest `release/v<WERSJA>`.
- [ ] `main` nie zawiera dodatkowych roboczych zmian.
- [ ] Vercel przed buildem uruchamia `node scripts/release-policy-gate.cjs --deploy`.
- [ ] Deploy gate potwierdza Drive, release branch i gotowość do `main`.
- [ ] Produkcyjny deployment zakończył się sukcesem.

## 7. Post-deploy

- [ ] Uruchomiono `WAWIS post-deploy checks` albo `scripts/post-deploy-check.mjs`.
- [ ] Produkcyjny `/app-version.json` odpowiada wersji wydania.
- [ ] Produkcyjny `/push-sw.js` zawiera `wawis-app-shell-v<WERSJA>`.
- [ ] Odczytano Supabase diagnostics z ostatnich 24 h.
- [ ] Od chwili deploymentu nie ma nowych błędów/ostrzeżeń blokujących wydanie.
- [ ] Powstał `post-deploy-evidence.json`.
- [ ] `node scripts/release-policy-gate.cjs --post --evidence post-deploy-evidence.json` ma GO.

Dopiero wtedy wersję oznaczamy jako zakończoną.
