# RELEASE RESULT

## Wersja
- 12.23

## Zakres
- SMS: nowa zakładka „Niewysłane”.
- Ręczne ponowienie przeterminowanych SMS-ów, pojedynczo lub zaznaczonych.
- Stary wpis NIEWYSŁANO pozostaje w historii; retry tworzy nowy log.
- Aktualny numer i zgoda SMS są sprawdzane przed ponowieniem.
- Usunięty mylący tekst o automatycznej wysyłce 7 dni przed terminem.
- Status oczekujący opisany jako „Oczekuje na wysłanie”.

## Produkcja / baza
- migracja: APPLIED — `20261002095320 sms_unsent_manual_retry_v1223`
- snapshot: VERIFIED — unsent=878
- normal retry: PASS / ROLLBACK
- uncertain recovery: PASS / ROLLBACK
- provider rejection: PASS / ROLLBACK
- ACL: VERIFIED
- Security Advisor: CHECKED
- Performance Advisor: CHECKED

## Kontrola regresji
- `test:smoke:sms-stage5`: PENDING CI
- `test:smoke:sms-unsent-retry`: PENDING CI
- Playwright E2E: PENDING CI
- produkcyjny build: PENDING CI
- Edge sender: PENDING
- Vercel: PENDING
- merge: PENDING
