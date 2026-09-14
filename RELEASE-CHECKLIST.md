# WAWIS — Release checklist 10.61+

Ta checklista dotyczy aktualnego procesu wydania. Historia zmian należy do `CHANGELOG.md`, a nie do checklisty.

## 1. Start wersji

- [ ] Punktem startowym jest aktualny, poprawny `main`.
- [ ] Utworzono `release/v<WERSJA>`.
- [ ] Zakres zapisano jako `mobile`, `desktop` albo `full`.
- [ ] Sprawdzono `app_diagnostic_events` z ostatnich 24 h.
- [ ] `RELEASE-GATE.json.baseline_diagnostics` ma `checked=true`, `last_24h=true`, czas i `GO`.
- [ ] Jeśli baseline zawiera znany stary problem, został opisany w `notes`.

## 2. Praca nad zmianą

- [ ] Zmiany robocze pozostają na gałęzi release, nie na `main`.
- [ ] Nowa regresja ma test smoke albo scenariusz E2E, jeśli może wrócić.
- [ ] Nie dodajemy meta-testu zależnego wyłącznie od literalnego tekstu przycisku lub nazwy scenariusza, chyba że ten tekst jest wymaganiem funkcjonalnym.
- [ ] PR do `main` uruchamia `WAWIS PR checks` i tylko grupy wynikające ze zmienionych plików.

## 3. Grupy regresji

Grupy są zdefiniowane w `scripts/test-groups.cjs`:

- `core` — uruchomienie, wersja, lazy/suspense, synchronizacja, diagnostyka,
- `jobs` — montaże, urządzenia, kontrahenci i wspólna edycja,
- `photos` — prywatność, upload, miniatury, offline i synchronizacja zdjęć,
- `protocol` — zapis, PDF, druk, e-mail, płatność,
- `roles` — admin/pracownik, RLS i GRANT,
- `push` — przypisania, komentarze i niezawodność powiadomień,
- `fuel` — moduł Paliwo,
- `nameplates` — tabliczki, modele, EAN/OCR i weryfikacja,
- `mobile` / `desktop` — regresje specyficzne dla platformy,
- `infra` — automatyka wydania i ograniczenia techniczne.

## 4. Pre-deploy

- [ ] README pokazuje aktualną wersję i konkretny opis bez placeholdera.
- [ ] CHANGELOG ma konkretną sekcję aktualnej wersji.
- [ ] Ponownie sprawdzono diagnostykę z ostatnich 24 h.
- [ ] `RELEASE-GATE.json.predeploy_diagnostics` ma `GO`.
- [ ] Uruchomiono **WAWIS final release checks** dla właściwego scope.
- [ ] Każda grupa regresji wykonała się jeden raz.
- [ ] Playwright mobile wykonał się najwyżej raz, jeśli dotyczy zakresu.
- [ ] Playwright desktop wykonał się najwyżej raz, jeśli dotyczy zakresu.
- [ ] `npm run build` przeszedł raz (poza świadomym `desktop-sandbox`).
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
- [ ] `main` nie zawiera żadnych dodatkowych roboczych zmian.
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

## 8. GitHub `main` — ustawienie jednorazowe

Dodatkowo repozytorium powinno mieć Branch Protection / Ruleset dla `main` zgodnie z `MAIN-PROTECTION.md`:

- [ ] wymagany Pull Request,
- [ ] wymagane zielone kontrole,
- [ ] blokada force-push,
- [ ] blokada kasowania `main`,
- [ ] wymagany Code Owner review, jeśli plan GitHuba na to pozwala.
