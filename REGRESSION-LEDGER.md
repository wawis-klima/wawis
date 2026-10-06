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
| SMS-01 | P1 | A error → retry B error → następny retry blokowany jako group_already_sent | OPEN | A error → B error → C claim musi być możliwy; historia A/B zachowana |
| SMS-02 | P1 | różni kontrahenci ze wspólnym telefonem łączeni przez frontend/licznik | OPEN | dwa contractor_id + jeden numer; kolejka i licznik muszą zachować 2 niezależne grupy |
| SMS-03 | P1 | frontend pobiera tylko pierwszą stronę jobs | OPEN | >1000 jobs, urządzenie zależne od zlecenia poza pierwszą stroną nadal trafia do kolejki |
| SMS-04 | P2 | częściowy błąd delete znika po silent reload | OPEN | partial delete + real reload; komunikat błędu pozostaje widoczny |
| SMS-05 | P2 | automatyczne otwarcie historii po wysyłce nie pobiera strony historii | OPEN | send → open history → świeży rekord i total bez ręcznego toggle |
| SMS-06 | P2 | jobs.last_sms_status miesza rangę poprzedniej i nowej próby | OPEN | A error → B provider_sent; last_sms_log_id i last_sms_status muszą opisywać B |

Po naprawie każdego punktu wpisujemy nazwę testu i zmieniamy status dopiero po zielonym Closure Gate.
