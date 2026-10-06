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
- PR #276, WAWIS PR checks run 748,
- `closure-gate-result.json = GO`,
- profil `critical`, zakres `full`,
- 121/121 komend regresyjnych PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- artefakt `wawis-closure-evidence-276-1`.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| SMS-01 | P1 | A error → retry B error → następny retry blokowany jako `group_already_sent` | CLOSED | `scripts/smoke-sms-retry-chain-v1257.mjs` + `scripts/smoke-sms-retry-lifecycle-v1257.mjs`; A→B→C retry przechodzi |
| SMS-02 | P1 | różni kontrahenci ze wspólnym numerem docelowym łączeni przez frontend/licznik | CLOSED | `scripts/smoke-sms-customer-identity-pagination-v1257.mjs` + `scripts/smoke-sms-identity-pagination-v1257.mjs`; 2 contractor_id + 1 numer pozostają 2 klientami |
| SMS-03 | P1 | niepełny odczyt `jobs` przy >1000 rekordów | CLOSED | te same testy identity/pagination; 1201 jobs, zakresy 0–499 / 500–999 / 1000–1499 |
| SMS-04 | P2 | komunikat częściowego delete znikał po silent reload | CLOSED | `scripts/smoke-sms-ui-flow-closure-v1257.mjs` + `scripts/smoke-sms-ui-flow-v1257.mjs`; raport jest ustawiany po refreshu |
| SMS-05 | P2 | historia po wysyłce otwierała się bez świeżego pobrania strony | CLOSED | te same testy UI flow; po mutacji `loadFullHistoryPage(1)` wykonuje się po refreshu |
| SMS-06 | P2 | `jobs.last_sms_status` / `last_sms_log_id` mogły opisywać poprzednią próbę lub zostać przejęte przez stary callback | CLOSED | testy retry lifecycle/chain; nowa próba przejmuje wskaźnik, spóźniony callback starej próby go nie odzyskuje |

## Reguła na przyszłość

Każde kolejne potwierdzone znalezisko dopisujemy do tej tabeli lub kolejnej sekcji domenowej. Status CLOSED nadajemy dopiero po zielonym Closure Gate i zapisanym dowodzie CI.
