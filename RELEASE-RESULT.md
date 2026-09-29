# RELEASE RESULT

## Wersja
- 11.85

## Zakres
- desktop: przeniesienie statusu Faktura VAT do górnego paska szczegółów montażu
- Supabase: bez zmian
- mobile: bez zmian funkcjonalnych

## Desktop
- Faktura VAT nie zajmuje już osobnej karty w sekcji Klient
- status znajduje się w górnym pasku obok statusu zlecenia i daty montażu, przed przyciskami Edytuj/Zamknij
- czerwone oznaczenie = Niewystawiona
- zielone oznaczenie = Wystawiona
- kliknięcie nadal zapisuje zmianę i aktualizuje widok bez pełnego przeładowania

## Kontrola regresji
- rozszerzony `scripts/smoke-desktop-vat-invoice-v1184.cjs`
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
