# RELEASE RESULT

## Wersja
- 12.06

## Zakres
- GUS REGON BIR: automatyczne wyszukiwanie podmiotu po 10-cyfrowym NIP-ie
- pierwszeństwo istniejącego kontrahenta z lokalnej bazy WAWIS
- automatyczne uzupełnianie nazwy firmy, kodu pocztowego, miejscowości oraz ulicy z numerem
- integracja w formularzu montażu desktop/mobile oraz module Kontrahenci
- walidacja sumy kontrolnej NIP przed wysłaniem
- klucz GUS wyłącznie jako sekret GUS_BIR_API_KEY po stronie Edge Function
- brak zmian schematu bazy i RLS

## Kontrola regresji
- smoke: scripts/smoke-gus-bir-v1206.cjs
- istniejące smoke NIP/kod pocztowy/kontrahenci pozostają w grupie jobs
- WAWIS PR checks / targeted-checks: PENDING
- Supabase Edge Function gus-bir-lookup: PENDING
- sekret GUS_BIR_API_KEY: PENDING konfiguracji w Supabase
- Vercel: PENDING
- merge: PENDING
