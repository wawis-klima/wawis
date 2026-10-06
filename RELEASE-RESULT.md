# WAWIS 12.58 — porządek release + dwusesyjny dowód PostgreSQL

Ta wersja nie wprowadza nowej funkcjonalnej zmiany w module SMS. Jej celem jest uporządkowanie końcowej ewidencji po 12.57 i zapisanie brakującego dowodu konkurencji na dwóch rzeczywistych sesjach PostgreSQL przed końcowym audytem Codexa.

## Zamknięcie 12.57

- PR #276 został zmergowany do `main`.
- Finalny `WAWIS PR checks` run 755 zakończył się SUCCESS.
- Regresje grupowe: PASS.
- Playwright mobile: PASS.
- Playwright desktop: PASS.
- `Verify Closure Gate`: PASS.
- Production build: PASS.
- Vercel: deployment `dpl_6VHW77Esacbqdx8Q1Rvyz4GQ1fHD` ma stan READY, target `production`, commit `d685c45b1a06120ade2db22906c6f626c4e71fbc`.
- W deployowanym commicie `app-version.json` i `public/app-version.json` wskazują 12.57.
- SMS-01…SMS-06 pozostają CLOSED w `REGRESSION-LEDGER.md`.

## Dwusesyjny PostgreSQL — zwykły claim

Dwie niezależne sesje zostały uruchomione równolegle na syntetycznym zleceniu bez wywoływania SMSAPI.

- sesja A: `pg_backend_pid() = 1233461` → otrzymała `claim_id`,
- sesja B: `pg_backend_pid() = 1233462` → `claim_id = NULL`,
- wynik: dokładnie jedna sesja uzyskała prawo do wysyłki.

## Dwusesyjny PostgreSQL — retry

Dwie niezależne sesje równocześnie wywołały retry tego samego syntetycznego wpisu `error`.

- sesja A: `pg_backend_pid() = 1233472` → `ok=true`,
- sesja B: `pg_backend_pid() = 1233476` → `ok=false`, `reason=retry_claim_exists`,
- kontrola bazy: dokładnie 1 `retry_claim`,
- wynik: podwójne retry tej samej grupy nie jest możliwe.

## Sprzątanie fixture

Po teście usunięto wyłącznie zarezerwowane rekordy syntetyczne użyte przez test.

- claims left: 0,
- sms_log fixtures left: 0,
- jobs fixtures left: 0.

Żaden SMS nie został wysłany do SMSAPI ani do klienta.

## Status release

Nie używamy już źródłowego `PENDING` po deployu, które wymuszałoby kolejny commit i kolejny deployment. Końcowy dowód produkcyjny pozostaje w GitHub/Vercel.

**Aktualny status 12.58: WAITING_FINAL_CODEX_AUDIT.**

Po zielonym końcowym audycie SMS ustawiamy `main_protection.ready_for_main=true`, przepuszczamy aktualny HEAD przez Closure Gate i dopiero wtedy mergujemy do `main`.
