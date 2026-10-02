# RELEASE RESULT

## Wersja
- 12.18

## Zakres
- SMS Etap 1: ochrona historii `sms_log` przed fizycznym usuwaniem.
- Automatyczny cleanup nie wykonuje już kasowania i nie jest uruchamiany przy zwykłym odczycie modułu ani przez generator kolejki.
- Anulowanie oczekującej pozycji odbywa się atomowo przez `cancel_service_sms_log`.
- Wysłana, doręczona, rozpoczęta lub już zarezerwowana wiadomość nie może zostać oznaczona jako `deleted`.
- Dane klienta, telefonu, treści i terminu istniejącego logu nie są nadpisywane payloadem przeglądarki przy anulowaniu.
- `sms_log.job_id` i `sms_log.device_id` używają `ON DELETE SET NULL`, więc usunięcie montażu lub urządzenia nie usuwa historii.
- Desktop i mobile nie uruchamiają cleanupu podczas odczytu.

## Kontrola regresji
- migracja Supabase: APPLIED (`20261002062031_sms_history_safety_stage1_v1218`)
- produkcyjne FK: VERIFIED — oba `ON DELETE SET NULL`
- trigger `trg_protect_sms_log_history`: VERIFIED — BEFORE UPDATE OR DELETE
- Security Advisor: CHECKED
- Performance Advisor: CHECKED
- smoke `sms-log-cleanup`: PASS w WAWIS PR checks
- WAWIS PR checks / targeted-checks: PASS (release gate, regresja, Playwright E2E, produkcyjny build)
- Edge Functions: DEPLOYED — `send-service-sms` v29 ACTIVE, `generate-service-sms-queue` v19 ACTIVE
- Vercel: PENDING
- merge: PENDING
