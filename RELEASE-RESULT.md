# RELEASE RESULT — WAWIS 14.17

## Zakres
- Codzienne odświeżenie kolejki SMS przez zadanie bazy i powiadomienie push administratora, gdy są SMS-y do zatwierdzenia.
- Funkcja Edge `generate-service-sms-queue` (nowy `daily-run.ts`), migracja `20261103140000` (uruchamia właściciel).

SMS-y nadal wysyła tylko administrator. Frontend bez zmian.
