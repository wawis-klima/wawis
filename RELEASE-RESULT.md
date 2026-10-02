# RELEASE RESULT

## Wersja
- 12.22

## Zakres
- SMS Etap 5: naprawa pustej listy klientów i „Wysłane w tym miesiącu”.
- Snapshot SMS rozdzielony na kolejkę, bieżący miesiąc i ograniczoną historię.
- Legacy devices bez source_job_id mają jawne zgody SMS na poziomie urządzenia.
- Nowe/uszkodzone powiązania nadal podlegają ścisłej walidacji Etapu 3.
- Historia sms_log pozostaje nienaruszona i append-only.

## Produkcja / baza
- migracja: APPLIED — `20261002090424 sms_stage5_history_legacy_v1222`
- snapshot: VERIFIED — queue=99, sent-month source=17, history=300
- legacy claim: PASS / ROLLBACK
- kolejka po naprawie: VERIFIED — 9 klientów (6 pending + 3 nowe)
- ACL: VERIFIED
- Security Advisor: CHECKED
- Performance Advisor: CHECKED

## Kontrola regresji
- `test:smoke:sms-job-grouping`: PENDING CI
- `test:smoke:sms-durable-groups`: PENDING CI
- `test:smoke:sms-stage3`: PENDING CI
- `test:smoke:sms-stage4`: PENDING CI
- `test:smoke:sms-stage5`: PENDING CI
- `test:smoke:sms-log-cleanup`: PENDING CI
- Playwright E2E: PENDING CI
- produkcyjny build: PENDING CI
- Edge generator: PENDING
- Vercel: PENDING
- merge: PENDING
