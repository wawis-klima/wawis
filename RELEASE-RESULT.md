# RELEASE RESULT

## Wersja
- 12.19

## Zakres
- SMS Etap 2: trwałe grupy klienta po znormalizowanym numerze telefonu i zakotwiczonym oknie 62 dni.
- Przypadek A=1, B=60, C=120 daje grupę A+B oraz osobną grupę C; nie ma łączenia łańcuchowego.
- `sms_log` ma `reminder_group_id` i dokładnie jeden kanoniczny wpis `reminder_group_primary` na grupę.
- Generator tworzy/pobiera grupę w bazie przez `ensure_service_sms_group` i nie używa już pairwise `existingCustomerWindows`.
- Wysyłka rezerwuje grupę przez `claim_service_sms_group`; dwa różne montaże lub urządzenia nie mają osobnych claimów, jeśli należą do tej samej grupy.
- Anulowanie rozpoznaje zarówno nowy group claim, jak i starszy legacy claim.
- Snapshot administratora zwraca anchor i koniec trwałego okna; desktop/mobile używają tych danych do grupowania.

## Produkcja / baza
- migracja: APPLIED — `20261002070050_sms_durable_customer_groups_v1219`
- backfill: 1336 logów -> 1154 trwałe grupy
- test anchoru późniejszy→wcześniejszy→poza oknem: PASS
- test podwójnego claimu tej samej grupy: PASS
- ACL nowych RPC: service_role only — VERIFIED
- inwariant grup: 1154 grup / 1336 logów / 1154 primary; duplicate primary groups = 0, duplicate pending primary groups = 0

## Kontrola regresji
- `test:smoke:sms-job-grouping`: PASS
- `test:smoke:sms-durable-groups`: PASS
- `test:smoke:sms-log-cleanup`: PASS
- Playwright E2E: PASS
- produkcyjny build: PASS
- Edge Functions: DEPLOYED — `send-service-sms` v30 ACTIVE, `generate-service-sms-queue` v20 ACTIVE
- Vercel: PENDING
- merge: PENDING
