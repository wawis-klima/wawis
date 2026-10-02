# RELEASE RESULT

## Wersja
- 12.20

## Zakres
- SMS Etap 3: harmonogram liczony osobno dla każdego fizycznego urządzenia przed grupowaniem klienta.
- Nowi klienci nadal mają `sms_consent=true` i `sms_reminder_enabled=true`; baza ma teraz takie same defaulty.
- Brak powiązanej karty klienta nie jest już interpretowany jako zgoda.
- `source_job_id` w formacie `uuid::device-N` jest poprawnie normalizowany.
- Daty serwisowe używają domykania końca miesiąca i dni kalendarzowych; bieżący dzień jest wyznaczany w `Europe/Warsaw`.
- Numer telefonu jest walidowany i normalizowany po stronie generatora oraz bazy.
- Przed wysyłką `claim_service_sms_group_v2` ponownie pobiera aktualny numer, zgodę, włączenie przypomnień, urządzenie/kartę oraz bieżący termin.
- Stary numer i termin z przeglądarki lub oczekującego logu nie są źródłem prawdy.
- Generator może odświeżyć oczekujący log po zmianie numeru/terminu/grupy.

## Produkcja / baza
- migracja: APPLIED — `20261002073753_sms_stage3_current_state_calendar_v1220`
- default `sms_consent`: true
- default `sms_reminder_enabled`: true
- 29/29 ostatnich zleceń: oba pola true
- końce miesiąca / leap year: PASS
- walidacja numeru: PASS
- `uuid::device-N`: PASS
- ACL `claim_service_sms_group_v2`: service_role only — VERIFIED
- kontrolowany podwójny claim: pierwszy PASS, drugi zablokowany — PASS
- Security Advisor: CHECKED — brak nowej ekspozycji Etapu 3
- Performance Advisor: CHECKED — brak nowego problemu Etapu 3

## Kontrola regresji
- `test:smoke:sms-job-grouping`: PENDING CI
- `test:smoke:sms-durable-groups`: PENDING CI
- `test:smoke:sms-stage3`: PENDING CI
- `test:smoke:sms-log-cleanup`: PENDING CI
- domyślne SMS przy nowym zleceniu: PENDING CI
- Playwright E2E: PENDING CI
- produkcyjny build: PENDING CI
- Edge Functions: PENDING — wdrożenie dopiero po zielonym CI
- Vercel: PENDING
- merge: PENDING
