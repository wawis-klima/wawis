# RELEASE RESULT

## Wersja
- 12.00

## Zakres
- mobile: wyszukiwanie kontrahenta po NIP w formularzu montażu
- dokładny 10-cyfrowy NIP automatycznie wybiera jednoznacznego kontrahenta z bazy
- podpowiedzi kontrahentów reagują również na wpisywany NIP
- po trafieniu uzupełniane są nazwa firmy, dane kontaktowe i zapisany adres
- zabezpieczenie przed przypadkowym nadpisaniem NIP wcześniej wybranego kontrahenta

## Kontrola regresji
- smoke: scripts/smoke-job-nip-lookup-v1200.cjs
- smoke: scripts/smoke-job-nip-v1194.cjs
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
