# RELEASE RESULT

## Wersja
- 12.04

## Zakres
- Fakturownia: brak NIP => osoba prywatna
- Fakturownia: NIP obecny => firma
- dla osoby prywatnej przekazywane są first_name i last_name
- aktualizacja istniejącego klienta w Fakturowni również ustawia prawidłowy typ

## Kontrola regresji
- smoke: scripts/smoke-fakturownia-private-person-v1204.cjs
- smoke: scripts/smoke-fakturownia-v1195.cjs
- WAWIS PR checks / targeted-checks: PENDING
- Supabase Edge Function fakturownia-client: PENDING
- Vercel: PENDING
- merge: PENDING
