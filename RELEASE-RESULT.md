# RELEASE RESULT

## Wersja
- 11.97

## Zakres
- kod pocztowy po samej znanej miejscowości dzięki fallbackowi do wcześniej uzupełnionych adresów WAWIS
- pełny adres nadal sprawdzany najpierw przez GUGiK UUG
- backfill starych danych zakończony i zweryfikowany
- brak pozostawionych tabel/rozszerzeń technicznych po jednorazowym backfillu

## Kontrola regresji
- smoke: scripts/smoke-postal-code-v1196.mjs
- smoke: scripts/smoke-postal-city-fallback-v1197.cjs
- Edge Function: postal-code-lookup ACTIVE v3
- Edge Function: fakturownia-client ACTIVE v2
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
