# RELEASE RESULT

## Wersja
- 12.03

## Zakres
- desktop: automatyczna weryfikacja, czy po kliknięciu „Wystaw fakturę” rzeczywiście powstała nowa faktura VAT w Fakturowni
- kliknięcie przycisku nadal nie tworzy faktury przez API i samo nie zmienia statusu VAT
- przed otwarciem Fakturowni zapamiętywana jest lista istniejących faktur klienta
- po powrocie do aplikacji wykonywana jest kontrola API; tylko nowa faktura VAT ze statusem wystawiona/wysłana/opłacona/częściowo opłacona ustawia vat_invoice_issued=true
- ręczny przełącznik statusu VAT pozostaje i ma pierwszeństwo nad oczekującą automatyczną kontrolą

## Kontrola regresji
- smoke: scripts/smoke-fakturownia-v1195.cjs
- smoke: scripts/smoke-fakturownia-verify-v1203.cjs
- smoke: scripts/smoke-desktop-vat-invoice-v1184.cjs
- WAWIS PR checks / targeted-checks: PENDING
- Supabase Edge Function fakturownia-client: PENDING
- Vercel: PENDING
- merge: PENDING
