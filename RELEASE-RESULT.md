# RELEASE RESULT

## Wersja
- 11.96

## Zakres
- mobile: kompaktowe pole NIP
- mobile: ulica i numer przed miejscowością
- mobile: miejscowość i kod pocztowy obok siebie
- desktop: osobne pole kodu pocztowego obok miejscowości
- desktop + mobile: automatyczne wyszukiwanie kodu pocztowego przez GUGiK UUG
- Fakturownia: przekazywanie `post_code` oddzielnie od `city`
- stare adresy: jednorazowy backfill kodów pocztowych na produkcji

## Kontrola regresji
- smoke: scripts/smoke-postal-code-v1196.mjs
- Edge Function: postal-code-lookup ACTIVE v1
- Edge Function: fakturownia-client ACTIVE v2
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
