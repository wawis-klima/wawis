# WAWIS — Regression Ledger

Ten plik jest trwałym rejestrem potwierdzonych błędów i testów, które mają zapobiegać ich powrotowi.

## Zasada

- Każdy potwierdzony błąd otrzymuje stabilne ID.
- Przed oznaczeniem jako CLOSED musi istnieć wykonywalny test regresyjny odtwarzający mechanizm błędu.
- Test pozostaje w stałych grupach CI również po wdrożeniu poprawki.
- Jeżeli problem wymagał sekwencji zdarzeń, dużego fixture, race condition albo konkretnego stanu UI, reproduktor musi zachować ten warunek.
- Dowód zamknięcia wskazuje konkretny plik testu; samo `assert.match` źródła nie wystarcza dla błędu funkcjonalnego.

## Statusy

- OPEN — błąd potwierdzony, brak kompletnej poprawki/testu.
- FIXED-UNVERIFIED — poprawka istnieje, ale Closure Gate nie potwierdził jeszcze pełnego scenariusza.
- CLOSED — poprawka i trwały test regresyjny przeszły Closure Gate.

## Audyt SMS — zamknięcie 2026-10-06

Dowód wspólny dla poniższych pozycji:
- PR #276, finalny WAWIS PR checks run 755,
- `closure-gate-result.json = GO`,
- profil `critical`, zakres `full`,
- 121/121 komend regresyjnych PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- artefakt `wawis-closure-evidence-276-1`,
- dwusesyjny PostgreSQL normal claim: PID 1233461 wygrał, PID 1233462 bez claimu,
- dwusesyjny PostgreSQL retry: PID 1233472 `ok=true`, PID 1233476 `retry_claim_exists`, dokładnie 1 claim retry,
- syntetyczny fixture po teście: 0 claimów / 0 logów / 0 jobs.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| SMS-01 | P1 | A error → retry B error → następny retry blokowany jako `group_already_sent` | CLOSED | `scripts/smoke-sms-retry-chain-v1257.mjs` + `scripts/smoke-sms-retry-lifecycle-v1257.mjs`; A→B→C retry przechodzi |
| SMS-02 | P1 | różni kontrahenci ze wspólnym numerem docelowym łączeni przez frontend/licznik | CLOSED | `scripts/smoke-sms-customer-identity-pagination-v1257.mjs` + `scripts/smoke-sms-identity-pagination-v1257.mjs`; 2 contractor_id + 1 numer pozostają 2 klientami |
| SMS-03 | P1 | niepełny odczyt `jobs` przy >1000 rekordów | CLOSED | te same testy identity/pagination; 1201 jobs, zakresy 0–499 / 500–999 / 1000–1499 |
| SMS-04 | P2 | komunikat częściowego delete znikał po silent reload | CLOSED | `scripts/smoke-sms-ui-flow-closure-v1257.mjs` + `scripts/smoke-sms-ui-flow-v1257.mjs`; raport jest ustawiany po refreshu |
| SMS-05 | P2 | historia po wysyłce otwierała się bez świeżego pobrania strony | CLOSED | te same testy UI flow; po mutacji `loadFullHistoryPage(1)` wykonuje się po refreshu |
| SMS-06 | P2 | `jobs.last_sms_status` / `last_sms_log_id` mogły opisywać poprzednią próbę lub zostać przejęte przez stary callback | CLOSED | testy retry lifecycle/chain; nowa próba przejmuje wskaźnik, spóźniony callback starej próby go nie odzyskuje |

## Reguła na przyszłość

Każde kolejne potwierdzone znalezisko dopisujemy do tej tabeli lub kolejnej sekcji domenowej. Status CLOSED nadajemy dopiero po zielonym Closure Gate i zapisanym dowodzie CI. Dla race condition w bazie, gdy jest to możliwe i bezpieczne, wymagany jest dodatkowo dowód z dwóch niezależnych sesji PostgreSQL albo równoważny test rzeczywistej konkurencji.


## Końcowy pakiet 12.58 — zamknięcie P2 z audytu końcowego

| ID | Obszar | Status | Trwały dowód |
|---|---|---|---|
| FINAL-SMS-01 | historia po retry/delete z Niewysłane | CLOSED | `scripts/smoke-sms-history-mutations-v1258.mjs` + wspólny `refreshSmsMutationForVisibleHistory` |
| GATE-01 | niekompletne commands/E2E mogły przejść jako GO | CLOSED | `scripts/smoke-closure-evidence-negative-v1258.cjs`; verifier porównuje dokładny expected command set i E2E runs |
| GATE-02 | fresh rebuild kończył się na 12.56 | CLOSED | manifest zawiera migracje 12.57, `migrationCoverageFrom`, a rebuild-rehearsal failuje przy pominięciu |
| GATE-03 | PENDING regex nie egzekwował polityki | CLOSED | `scripts/smoke-release-policy-negative-v1258.cjs` |
| GATE-04 | timestampy migracji repo != produkcja | CLOSED | repo: 20261006051947/054129/054752/055831; read-only produkcja potwierdzona 1:1; `scripts/verify-supabase-migration-history-v1258.mjs` |

Dowód CI przed ustawieniem READY_FOR_MAIN:
- PR #277, run 774,
- 99/99 komend regresyjnych PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- Closure Gate GO,
- production build PASS,
- artifact `wawis-closure-evidence-277-1`.


## SMS 12.59 — zgłoszenia produkcyjne 2026-10-06

| ID | Obszar | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| SMS-07 | usuwanie z głównej kolejki | `row.id` urządzenia/zlecenia trafiał razem z prawdziwym `sms_log.id` do anulowania; prawidłowy log znikał, a drugi identyfikator dawał fałszywy `NOT_FOUND` | CLOSED | `scripts/smoke-sms-delete-identity-v1259.mjs` + PR #278 run 783 / Closure Gate PASS |
| SMS-08 | prezentacja statusu | `pending_approval` miał zbyt długą etykietę „Oczekuje na zatwierdzenie” | CLOSED | `scripts/smoke-sms-delete-identity-v1259.mjs` + `scripts/test-sms-approval-routing.mjs` + PR #278 run 783 / Closure Gate PASS |


## P1 12.61 — integralność montażów, JW/JZ i paliwa

Dowód przed poprawką:
- PR #281, run 798,
- F03: FAIL — po niejednoznacznym błędzie zapisu retry tworzył 2 rekordy zamiast 1,
- F04: FAIL — brak wspólnej walidacji pary JW/JZ bezpośrednio przy zakończeniu,
- F05: FAIL — pełny widok paliwa kończył się na 1000 rekordach,
- F10: PASS — gotówka już wymagała kwoty > 0, a przelew dopuszczał brak kwoty.

Dowód po poprawce:
- run 809: F03/F04/F05/F10 PASS, pełne regresje PASS, Playwright mobile PASS, Playwright desktop PASS, Closure Gate PASS, production build PASS,
- produkcyjna migracja F03: `20261007062745_job_create_idempotency_v1261`,
- potwierdzone pola `jobs.create_operation_id` i `jobs.create_payload_fingerprint`,
- potwierdzony unikalny indeks `jobs_create_operation_id_uidx`,
- constraint `jobs_create_operation_metadata_consistent` ma `validated=true`.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| F03 | P1 | utrata odpowiedzi po INSERT mogła spowodować drugi montaż przy ponownym zapisie | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs`; stały `create_operation_id` + fingerprint + unikalność w DB |
| F04 | P1 | zakończenie nie ponawiało końcowej kontroli zgodności JW/JZ | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs`; wspólna `validateJobDevicesForCompletion` w desktop/mobile |
| F05 | P1 | administracyjny raport paliwa obcinał historię do 1000 rekordów | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs` + `smoke-fuel-module-v1014.mjs`; paginacja po 500 |
| F10 | P1 | spójność kwoty i metody płatności | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs`; produkcyjny constraint: gotówka > 0, przelew kwota opcjonalna |


## P2 12.62 — domknięcie dzisiejszego audytu Codexa

Dowód przed poprawką:
- PR #282, run 816,
- F06: FAIL — pełne odczyty zdjęć/weryfikacji/job_access nie były stronicowane i mogły zatrzymać się na limicie API,
- F07: FAIL desktop + mobile — UPDATE statusu z wynikiem 0 rekordów był traktowany jak sukces,
- F08: FAIL desktop + mobile — retry usunięcia po utracie odpowiedzi nie miał stabilnego operation_id,
- F09: FAIL — fresh rebuild startował zbyt późno i nie obejmował aktywnych migracji z katalogu current.

Dowód po poprawce:
- run 833: pełne regresje PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- Closure Gate PASS,
- production build PASS,
- fresh rebuild przechodzi dwukrotnie i obejmuje aktywne migracje do 12.62,
- produkcyjne migracje P2:
  - `20261007071004_p2_status_delete_idempotency_v1262`,
  - `20261007071856_p2_restore_snapshot_integrity_v1262`.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| F06 | P2 | niepaginowane odczyty metadanych mogły pominąć rekordy po przekroczeniu limitu API | CLOSED | `scripts/smoke-p2-audit-closure-v1262.mjs`; desktop photos/nameplate/job_access i mobile job_access korzystają z pełnej paginacji |
| F07 | P2 | zmiana statusu mogła wyglądać na sukces przy 0 zmienionych rekordów lub konflikcie innej sesji | CLOSED | `scripts/smoke-p2-audit-closure-v1262.mjs`; `change_job_status_guarded` zwraca changed/already_applied/conflict/not_found |
| F08 | P2 | utrata odpowiedzi po DELETE mogła spowodować niejednoznaczny retry | CLOSED | `scripts/smoke-p2-audit-closure-v1262.mjs`; stabilny `operation_id` + `admin_delete_job_idempotent` |
| F09 | P2 | fresh rebuild nie obejmował pełnego aktualnego schematu i katalogu `migrations/current` | CLOSED | manifest + `scripts/audit-v1089/rebuild-rehearsal.mjs`; run 833, dwukrotny rebuild PASS |
| P2-RESTORE | P2 | późniejsza migracja restore mogła przyjąć uszkodzony nowy snapshot kosza | CLOSED | koperta integralności `_integrity`, validated constraint i fixture legacy/restore w pełnym rebuildzie |
