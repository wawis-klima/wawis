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

## Kontrola regresji
- `test:smoke:sms-job-grouping`: PENDING CI
- `test:smoke:sms-durable-groups`: PENDING CI
- `test:smoke:sms-log-cleanup`: PENDING CI
- Playwright E2E: PENDING CI
- produkcyjny build: PENDING CI
- Edge Functions: PENDING
- Vercel: PENDING
- merge: PENDING
