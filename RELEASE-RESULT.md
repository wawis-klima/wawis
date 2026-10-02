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
- `test:smoke:sms-stage5`: PASS
- `test:smoke:sms-unsent-retry`: PASS
- Playwright E2E: PASS (run #615)
- produkcyjny build: PASS (run #615)
- Edge sender: DEPLOYED — `send-service-sms` v33 ACTIVE
- Vercel: PENDING
- merge: PENDING

## Stan produkcyjny po wdrożeniu sendera
- `send-service-sms` v33 ACTIVE, `verify_jwt=false`
- live source zawiera tryb `retry_not_sent` i RPC `claim_service_sms_not_sent_retry`
- snapshot: queue=100, sent-this-month=17, unsent=878, history=300
- generator pozostaje v24 ACTIVE; webhook pozostaje v10 ACTIVE
