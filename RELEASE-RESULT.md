# RELEASE RESULT

## Wersja
- 10.85

## Proces
- obowiązkowa bramka GitHub: `WAWIS PR checks / targeted-checks`
- wymagane kontrprzykłady regresyjne, Playwright E2E i produkcyjny build przed merge
- `main` chroniony przez Ruleset: PR, aktualna gałąź, wymagany `targeted-checks`, brak bypassu
- po zielonym PR: merge do `main`, produkcyjny Vercel i kontrola rzeczywistego stanu backendu

## Zakres
- F12/N9: fail-closed Playwright runners, cross-platform uruchamianie na Windows, CRLF-safe testy, produkcyjny build w PR gate, deploy-affecting `scripts/`, `vercel.json` i `.github` uwzględnione w deploy triggerze oraz ZIP bez systemowego programu `zip`
- N1: endpoint OCR/AI nie ufa `user_metadata.role`; rolę administratora potwierdza wyłącznie przez chronione `profiles.role`
- N6: callback SMSAPI wymaga sekretu wyprowadzonego z tokenu SMSAPI, obsługuje rzeczywisty format callbacków, monotoniczne statusy i błędy zapisu DB
- N7-A: repo zawiera idempotentny baseline żywych guardów produkcyjnych oraz kod `send-service-sms` zgodny z produkcją

## Dowody przed produkcją
- finalny kandydat zmian audytowych: `bfc65bfc3de88d8abf9966c2a35b670a2b37ce89`
- `targeted-checks`: SUCCESS
- targeted regression groups: SUCCESS
- wymagane Playwright E2E: SUCCESS
- production build: SUCCESS
- Ruleset `Wawis`: ACTIVE, wymagany PR i `targeted-checks`, strict up-to-date, brak bypassu

## Supabase po wdrożeniu
- migracja `production_security_baseline_v1085` obecna w historii produkcyjnej
- `send-service-sms`: ACTIVE v24
- `smsapi-delivery-webhook`: ACTIVE v4
- read-only verification potwierdził żywe `private.guard_profile_role`, `private.guard_job_fields`, `public.handle_new_user` i ich triggery

## Vercel
- pierwszy deploy po merge 10.85 został prawidłowo odrzucony przez deploy gate, ponieważ `RELEASE-GATE.json` i `RELEASE-RESULT.md` nadal wskazywały 10.84
- finalny kandydat `release/v10.85` aktualizuje te metadane zamiast omijać lub osłabiać bramkę
- zamknięcie wersji wymaga zielonego Vercel dla finalnego SHA `main` i live checku `/app-version.json`
