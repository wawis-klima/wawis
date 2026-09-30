# RELEASE RESULT

## Wersja
- 11.87

## Zakres
- mobile: tylko Gotówka / Przelew w protokole
- mobile: przelew może być bez kwoty; 0 i puste pole są zapisywane jako brak kwoty
- PDF: przy przelewie bez kwoty pole Kwota nie jest drukowane
- desktop: znacznik płatności bez Karta/BLIK
- Supabase: zmiana constraintu płatności

## Zasady
- Gotówka: kwota > 0 jest wymagana.
- Przelew: kwota jest opcjonalna; dodatnia kwota jest zapisywana, 0 lub puste pole daje NULL.
- Karta/BLIK: niedostępne w interfejsie i niedozwolone dla nowych zapisów.

## Kontrola regresji
- rozszerzony `scripts/test-job-payment-confirmation-v986.mjs`
- `scripts/smoke-mobile-protocol-v979.cjs`
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
