# RELEASE RESULT

## Wersja
- 11.95

## Zakres
- desktop: nowy przycisk `Wystaw fakturę` w górnym pasku szczegółów montażu, obok rozliczeń
- tylko administrator może uruchomić integrację
- klient jest synchronizowany do Fakturowni przez `external_id`; dodatkowy fallback używa NIP-u i e-maila
- dane klienta: nazwa, NIP, e-mail, telefon, miasto i ulica
- sekret `FAKTUROWNIA_API_TOKEN` pozostaje wyłącznie po stronie Supabase Edge Function
- Edge Function `fakturownia-client` jest aktywna i wymaga JWT
- samo kliknięcie nie tworzy faktury i nie oznacza jej jako wystawionej; otwierany jest formularz Fakturowni

## Kontrola regresji
- smoke: scripts/smoke-fakturownia-v1195.cjs
- Edge Function: fakturownia-client ACTIVE v1
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
