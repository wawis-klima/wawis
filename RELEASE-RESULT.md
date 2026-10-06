# WAWIS 12.59 — SMS status + poprawne ID przy usuwaniu

Wersja 12.59 naprawia dwa zgłoszenia z produkcyjnego modułu SMS bez zmian w Supabase i Edge Functions.

## Zakres

- Status `pending_approval` jest prezentowany jako „Oczekuje”.
- Główna kolejka SMS nie dokłada już `row.id` urządzenia/zlecenia do listy identyfikatorów `sms_log` przekazywanych do anulowania.
- Zakładka „Niewysłane” zachowuje `row.id`, ponieważ w tym widoku jest to faktyczny identyfikator `sms_log`.
- Dodano behawioralny test regresyjny `scripts/smoke-sms-delete-identity-v1259.mjs`.

## Mechanizm zgłoszonego NOT_FOUND

Pozycja z głównej kolejki zawierała równocześnie prawidłowy identyfikator logu i `row.id` urządzenia/zlecenia. Backend poprawnie anulował log SMS, a dla drugiego identyfikatora zwracał `not_found`, co dawało jednocześnie komunikat sukcesu i fałszywy błąd. Rozdzielenie źródeł identyfikatorów usuwa ten przypadek u źródła.

## Dowody implementacyjne

- PR #278.
- WAWIS PR checks run 783: PASS.
- 94 unikalne komendy regresyjne: PASS.
- Playwright mobile: PASS.
- Playwright desktop: PASS.
- Closure Gate: PASS.
- Production build: PASS.
- Artifact: `wawis-closure-evidence-278-1`.

## Status

**READY_FOR_MAIN**

Finalny HEAD po tym commicie musi jeszcze przejść `WAWIS PR checks / targeted-checks`. Po zielonym wyniku merge do `main` uruchamia jeden produkcyjny deployment Vercela; jego wynik pozostaje dowodem zewnętrznym, bez kolejnego commita statusowego.
