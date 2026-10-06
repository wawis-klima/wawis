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

## Otwarte znaleziska SMS — audyt 2026-10-06

| ID | Priorytet | Mechanizm | Status | Wymagany trwały reproduktor |
|---|---|---|---|---|
| SMS-01 | P1 | A error → retry B error → następny retry blokowany jako group_already_sent | CLOSED | `scripts/smoke-sms-retry-lifecycle-v1257.mjs`; CI run 719; produkcja: old_rule_blocked=1 → new_rule_blocked=0 |na |
| SMS-02 | P1 | różni kontrahenci ze wspólnym telefonem łączeni przez frontend/licznik | FIXED-UNVERIFIED | `scripts/smoke-sms-identity-pagination-v1257.mjs`: 2 contractor_id + 1 numer = 2 grupy; backend counter używa stable customer key |ntractor_id + jeden numer; kolejka i licznik muszą zachować 2 niezależne grupy |
| SMS-03 | P1 | frontend pobiera tylko pierwszą stronę jobs | FIXED-UNVERIFIED | `scripts/smoke-sms-identity-pagination-v1257.mjs`: 1201 jobs, zakresy 0–499/500–999/1000–1499, job 1201 dociera do kolejki SMS |nie zależne od zlecenia poza pierwszą stroną nadal trafia do kolejki |
| SMS-04 | P2 | częściowy błąd delete znika po silent reload | OPEN | partial delete + real reload; komunikat błędu pozostaje widoczny |
| SMS-05 | P2 | automatyczne otwarcie historii po wysyłce nie pobiera strony historii | OPEN | send → open history → świeży rekord i total bez ręcznego toggle |
| SMS-06 | P2 | jobs.last_sms_status miesza rangę poprzedniej i nowej próby | CLOSED | `scripts/smoke-sms-retry-lifecycle-v1257.mjs`; CI run 719; najnowsza próba zachowuje wskaźnik przy starym callbacku |nt; last_sms_log_id i last_sms_status muszą opisywać B |

Po naprawie każdego punktu wpisujemy nazwę testu i zmieniamy status dopiero po zielonym Closure Gate.
