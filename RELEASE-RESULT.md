# RELEASE RESULT

## Wersja
- 11.86

## Zakres
- desktop: znacznik metody płatności obok Faktura VAT w górnym pasku szczegółów montażu
- Supabase: bez zmian
- mobile: bez zmian funkcjonalnych

## Desktop
- znacznik korzysta z istniejącego pola `jobs.payment_method`, które jest zapisywane przy protokole montażu
- `cash` = Gotówka
- `transfer` = Przelew
- brak metody = Nieokreślono
- istniejące `card` i `blik` są nadal pokazywane zgodnie z zapisanymi danymi
- element jest tylko informacyjny; zmiana metody nadal odbywa się w protokole mobilnym
- Faktura VAT zachowuje dotychczasowe działanie i klikany zapis

## Kontrola regresji
- rozszerzony `scripts/smoke-desktop-vat-invoice-v1184.cjs`
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
