# RELEASE RESULT

## Wersja
- 12.21

## Zakres
- SMS Etap 4: niezawodna ścieżka wysyłki, odpowiedzi API i callbacków.
- Staging claima zapisuje treść i pełny kontekst przed wywołaniem zewnętrznego SMSAPI.
- SMSAPI otrzymuje `idx` oparty na `claim_id` i `check_idx=1`.
- Jednoznaczne odrzucenie operatora i wynik niepewny mają różne ścieżki: tylko pewne odrzucenie zwalnia claim.
- Provider-accepted + błąd zapisu nie może uruchomić ponownej wysyłki; claim pozostaje trwałym śladem do reconciliacji.
- Webhook może odtworzyć brakujący `sms_log` po `idx → claim_id`.
- Frontend odrzuca `{ok:false}` także przy HTTP 200.
- Generator ponawia wyłącznie błędy bez dowodu wysyłki.

## Produkcja / baza
- migracja: APPLIED — `20261002081343_sms_stage4_reliable_delivery_v1221`
- hotfix RPC: APPLIED — `20261002081756_sms_stage4_found_state_fix_v1221`
- acceptance test: PASS / ROLLBACK
- recovery-after-uncertain test: PASS / ROLLBACK
- definite-rejection test: PASS / ROLLBACK
- ACL nowych RPC: service_role only — VERIFIED
- Security Advisor: CHECKED
- Performance Advisor: CHECKED

## Kontrola regresji
- `test:smoke:sms-job-grouping`: PENDING CI
- `test:smoke:sms-durable-groups`: PENDING CI
- `test:smoke:sms-stage3`: PENDING CI
- `test:smoke:sms-stage4`: PENDING CI
- `smoke-smsapi-webhook-security-v1085`: PENDING CI
- `test:smoke:sms-log-cleanup`: PENDING CI
- Playwright E2E: PENDING CI
- produkcyjny build: PENDING CI
- Edge Functions: PENDING
- Vercel: PENDING
- merge: PENDING
