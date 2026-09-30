# RELEASE RESULT

## Wersja
- 11.99

## Zakres
- mobile: JobFormModal dostaje klienta Supabase
- automatyczny lookup kodu pocztowego może faktycznie wywołać postal-code-lookup
- regresja sprawdza dokładnie przekazanie prop supabase do formularza

## Kontrola regresji
- smoke: scripts/smoke-mobile-postal-wire-v1199.cjs
- smoke: scripts/smoke-mobile-form-v1198.cjs
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
