# RELEASE RESULT

## Wersja
- 12.05

## Zakres
- Fakturownia: potwierdzona faktura VAT zostaje trwale oznaczona jako wystawiona
- zapisujemy flagę potwierdzenia oraz identyfikator/numer faktury z Fakturowni
- ręczny status VAT działa tylko przed potwierdzeniem
- po potwierdzeniu UI blokuje przełącznik
- RPC w bazie blokuje próbę cofnięcia statusu również poza UI

## Kontrola regresji
- smoke: scripts/smoke-fakturownia-lock-v1205.cjs
- smoke: scripts/smoke-fakturownia-verify-v1203.cjs
- smoke: scripts/smoke-desktop-vat-invoice-v1184.cjs
- migracja: supabase/migrations/current/20261001071500_vat_invoice_fakturownia_lock_v1205.sql
- WAWIS PR checks / targeted-checks: PENDING
- Supabase migration: PENDING
- Vercel: PENDING
- merge: PENDING
